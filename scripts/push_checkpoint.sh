#!/usr/bin/env bash
# Checkpoint commit + push for the Tidy-Game repo (branch tidy-tapes).
# Self-healing against platform working-tree resets:
#  - ensures we are on tidy-tapes (checkout restores tracked files)
#  - restores the hardened .gitignore from the canonical 0a commit if clobbered
#  - refuses to commit secrets, build output, or user upload dirs
#  - keeps local main pointing at the same commit (platform auto-checkouts then
#    switch between identical trees and never delete files)
set -euo pipefail
cd /home/z/my-project
MSG="${1:?usage: push_checkpoint.sh <commit message>}"
BR="tidy-tapes"
CANON="25c5765"   # checkpoint 0a: canonical hardened .gitignore

CUR="$(git branch --show-current)"
if [ "$CUR" != "$BR" ]; then
  echo "switching from '$CUR' to '$BR'"
  git checkout "$BR"
  # restore any files deleted by an auto-checkout to a stale branch
  git checkout "$BR" -- .
fi
if ! grep -q '^\.secrets/' .gitignore 2>/dev/null; then
  echo "restoring hardened .gitignore from $CANON"
  git show "$CANON:.gitignore" > .gitignore
fi
git add -A
FORBIDDEN="$(git diff --cached --name-only | grep -E '^\.secrets/|^\.next/|^upload/|^download/|^\.zscripts/|^agent-ctx/' || true)"
if [ -n "$FORBIDDEN" ]; then
  echo "REFUSING to commit forbidden paths:" >&2
  echo "$FORBIDDEN" >&2
  exit 1
fi
if git ls-files --cached | grep -q '^\.secrets/'; then
  echo "REFUSING: token file is tracked in git" >&2
  exit 1
fi
if [ -n "$(git diff --cached --name-only)" ]; then
  git commit -q -m "$MSG"
else
  echo "nothing to commit; pushing anyway (no-op)"
fi
GIT_ASKPASS=/home/z/my-project/.secrets/askpass.sh GIT_TERMINAL_PROMPT=0 \
  git push https://github.com/mohamedazzam4/Tidy-Game.git "$BR":refs/heads/"$BR"
git branch -f main HEAD 2>/dev/null || { git checkout "$BR" 2>/dev/null || true; }
echo "pushed: $(git rev-parse --short HEAD) on $BR"

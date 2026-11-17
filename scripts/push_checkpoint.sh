#!/usr/bin/env bash
# Checkpoint commit + push for the Tidy-Game repo (branch tidy-tapes).
# Safe version: never switches branches and never restores tracked files
# (the platform keeps us on `main`, which stays fast-forwarded to the same
# commit as tidy-tapes — we simply push HEAD to the tidy-tapes branch).
#  - restores the hardened .gitignore from the canonical 0a commit if clobbered
#  - refuses to commit secrets, build output, or user upload dirs
#  - keeps local main and tidy-tapes pointing at the pushed commit
set -euo pipefail
cd /home/z/my-project
MSG="${1:?usage: push_checkpoint.sh <commit message>}"
CANON="25c5765"   # checkpoint 0a: canonical hardened .gitignore

if ! grep -q '^\.secrets/' .gitignore 2>/dev/null; then
  echo "restoring hardened .gitignore from $CANON"
  git show "$CANON:.gitignore" > .gitignore
fi
if [ ! -x .secrets/askpass.sh ]; then
  echo "missing .secrets/askpass.sh (git credential helper)" >&2
  exit 1
fi
git add -A
FORBIDDEN="$(git diff --cached --name-only | grep -E '^\.secrets/|^\.next/|^upload/|^download/|^\.zscripts/|^agent-ctx/' || true)"
if [ -n "$FORBIDDEN" ]; then
  echo "REFUSING to commit forbidden paths:" >&2
  echo "$FORBIDDEN" >&2
  git reset -q
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
  git push https://github.com/mohamedazzam4/Tidy-Game.git HEAD:refs/heads/tidy-tapes
CUR="$(git branch --show-current)"
if [ "$CUR" != "tidy-tapes" ]; then
  git branch -f tidy-tapes HEAD
fi
git branch -f main HEAD 2>/dev/null || true
echo "pushed: $(git rev-parse --short HEAD) on tidy-tapes (local $CUR aligned)"

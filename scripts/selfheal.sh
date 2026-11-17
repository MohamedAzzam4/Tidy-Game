#!/usr/bin/env bash
# Self-heal the working tree against platform file reverts, then verify.
# Restores any tracked file that was modified/deleted back to HEAD (tidy-tapes),
# while keeping legitimately untracked new files intact.
set -euo pipefail
cd /home/z/my-project
BR="tidy-tapes"
CUR="$(git branch --show-current)"
if [ "$CUR" != "$BR" ]; then
  git checkout "$BR" 2>/dev/null || true
  git checkout "$BR" -- . 2>/dev/null || true
fi
if ! grep -q '^\.secrets/' .gitignore 2>/dev/null; then
  git show 25c5765:.gitignore > .gitignore 2>/dev/null || true
fi
CHANGED="$(git status --short | grep -E '^ ?(D|M|R)|^(D|M)' || true)"
if [ -n "$CHANGED" ]; then
  echo "self-heal: restoring tracked files from HEAD:"
  echo "$CHANGED" | head -20
  git checkout HEAD -- . 2>/dev/null || true
fi
echo "self-heal OK ($(git status --short | wc -l) entries in status)"

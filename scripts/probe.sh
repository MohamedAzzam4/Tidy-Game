#!/usr/bin/env bash
# One-shot diagnostic: server + page + inline script (the sandbox reaps the
# server between tool calls, so everything lives in this script's lifetime).
# Usage: bash scripts/probe.sh "<js-file>" [url]
set -uo pipefail
cd /home/z/my-project
JS="${1:?usage: probe.sh <js-file> [url]}"
URL="${2:-http://localhost:3000/?autotest-debug&seed=20261118}"

setsid nohup bun .next/standalone/server.js > server.log 2>&1 < /dev/null &
SERVER_PID=$!
sleep 6
curl -s --max-time 5 -o /dev/null http://localhost:3000 || { echo "server failed"; exit 1; }

agent-browser open "$URL" > /dev/null 2>&1
echo "--- probe result ---"
for try in 1 2 3 4 5 6 7 8; do
  OUT=$(agent-browser eval "$(cat "$JS")" 2>&1 | head -40)
  if ! echo "$OUT" | grep -q 'Evaluation error'; then
    echo "$OUT"
    break
  fi
  sleep 3
done
[ "$try" = "8" ] && echo "$OUT"
kill $SERVER_PID 2>/dev/null
echo "--- done ---"

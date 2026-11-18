#!/usr/bin/env bash
# Runs the Tidy Tapes autotest suite against a production build in one shot
# (the sandbox reaps background servers between tool calls, so the whole
# session — server, storage clear, suite run, result dump — lives in THIS
# script's lifetime).
set -uo pipefail
cd /home/z/my-project
PHASE="${1:-1}"
QUERY="?autotest=1&seed=20261118&v=3"
if [ "$PHASE" = "2" ]; then QUERY="?autotest=1&restore=1&v=3"; fi

setsid nohup bun .next/standalone/server.js > server.log 2>&1 < /dev/null &
SERVER_PID=$!
sleep 6
if ! curl -s --max-time 5 -o /dev/null http://localhost:3000; then
  echo "SERVER FAILED TO START"; tail -5 server.log; kill $SERVER_PID 2>/dev/null; exit 1
fi

if [ "$PHASE" = "1" ]; then
  agent-browser open "http://localhost:3000/?seed=20261118" > /dev/null 2>&1
  sleep 8
  agent-browser eval "sessionStorage.clear(); localStorage.clear(); 'cleared'" 2>/dev/null | head -1
else
  echo "(phase 2 keeps phase 1's saved run)"
fi

echo "--- launching suite phase $PHASE ---"
agent-browser console --clear > /dev/null 2>&1
agent-browser open "http://localhost:3000/$QUERY" > /dev/null 2>&1
DONE=0
for i in $(seq 1 38); do
  if agent-browser console 2>/dev/null | grep -q "PHASE $PHASE DONE"; then DONE=1; break; fi
  sleep 15
done
if [ "$DONE" = "0" ]; then echo "SUITE DID NOT FINISH IN TIME"; fi

echo "--- results (current run = last entries) ---"
agent-browser eval "const s=sessionStorage.getItem('tidy-autotest-results'); const w=window.__tidyResults; const tests=(w&&w.tests)||(s?JSON.parse(s):[]); const N=(tests.length%27)||27; const last=tests.slice(-N); JSON.stringify(last.map(t=>t.pass?('P '+t.name.slice(0,60)):('F '+t.name.slice(0,60)+' :: '+String(t.error||'').slice(0,95))))" 2>&1 | head -40

echo "--- phase summary line ---"
agent-browser console 2>/dev/null | grep "PHASE $PHASE DONE" | tail -1

kill $SERVER_PID 2>/dev/null
echo "--- server stopped ---"

#!/usr/bin/env bash
# brainstorm-submit-smoke.sh — boot a patched companion server in a temp dir and
# exercise the loopback /submit listener. Run during execution verification.
set -euo pipefail
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
SRC="$(ls -d "$HOME"/.claude/plugins/cache/claude-plugins-official/superpowers/*/skills/brainstorming/scripts | tail -1)"
TMP="$(mktemp -d)"
trap 'kill "${SRVPID:-0}" 2>/dev/null || true; rm -rf "$TMP"' EXIT

# Fake cache layout so the patch driver ($HOME-scan) finds it.
FAKE="$TMP/home"
DST="$FAKE/.claude/plugins/cache/x/superpowers/5/skills/brainstorming/scripts"
mkdir -p "$DST"
cp "$SRC"/server.cjs "$SRC"/helper.js "$SRC"/frame-template.html "$DST"/

HOME="$FAKE" bash "$REPO/scripts/superpowers-submit-patch.sh"
node --check "$DST/server.cjs"

PORT=47650; SUB=47651
BRAINSTORM_DIR="$TMP/session" BRAINSTORM_PORT="$PORT" BRAINSTORM_SUBMIT_PORT="$SUB" \
  BRAINSTORM_HOST=127.0.0.1 node "$DST/server.cjs" >"$TMP/srv.log" 2>&1 &
SRVPID=$!
for i in $(seq 1 30); do curl -sf -o /dev/null "http://127.0.0.1:$PORT/" && break; sleep 0.2; done

ok=0; fail=0
check() { if [[ "$1" == "$2" ]]; then echo "OK  $3"; ok=$((ok+1)); else echo "FAIL $3 (got '$1' want '$2')"; fail=$((fail+1)); fi; }

# 1) bad origin -> 403
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "http://127.0.0.1:$SUB/submit" \
  -H 'origin: https://evil.example' -H 'content-type: application/json' --data '{"markdown":"x"}')
check "$code" "403" "bad origin rejected"

# 2) good origin -> 200 + submission.json (mode 600) + events line
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "http://127.0.0.1:$SUB/submit" \
  -H "origin: http://localhost:$PORT" -H 'content-type: application/json' \
  --data '{"markdown":"«BRAINSTORM-AUSWAHL»\nFrage: T\n- Auswahl: B — \"x\"\n«ENDE»","selected":[{"choice":"B","label":"x"}],"nonce":"n1"}')
check "$code" "200" "good origin accepted"
[[ -f "$TMP/session/state/submission.json" ]] && { echo "OK  submission.json written"; ok=$((ok+1)); } || { echo "FAIL submission.json missing"; fail=$((fail+1)); }
perm=$(stat -c '%a' "$TMP/session/state/submission.json" 2>/dev/null || echo "?")
check "$perm" "600" "submission.json mode 600"
grep -q '"type":"submit"' "$TMP/session/state/events" && { echo "OK  events line"; ok=$((ok+1)); } || { echo "FAIL events line"; fail=$((fail+1)); }

# 3) dedupe: same nonce -> dup:true
dup=$(curl -s -X POST "http://127.0.0.1:$SUB/submit" -H "origin: http://localhost:$PORT" \
  -H 'content-type: application/json' --data '{"markdown":"y","nonce":"n1"}')
case "$dup" in *'"dup":true'*) echo "OK  nonce dedupe"; ok=$((ok+1));; *) echo "FAIL nonce dedupe (got $dup)"; fail=$((fail+1));; esac

echo "---- smoke: $ok ok, $fail fail ----"
[[ $fail -eq 0 ]]

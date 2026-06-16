#!/usr/bin/env bash
# plan-review-smoke.sh — boot a patched companion server in a temp dir and
# exercise the plan-review /submit flow. Run during execution verification.
set -euo pipefail
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
SRC="$(ls -d "$HOME"/.claude/plugins/cache/claude-plugins-official/superpowers/*/skills/brainstorming/scripts | tail -1)"
TMP="$(mktemp -d)"
trap 'kill "${SRVPID:-0}" 2>/dev/null || true; rm -rf "$TMP"' EXIT

FAKE="$TMP/home"
DST="$FAKE/.claude/plugins/cache/x/superpowers/5/skills/brainstorming/scripts"
mkdir -p "$DST"
cp "$SRC"/server.cjs "$SRC"/helper.js "$SRC"/frame-template.html "$DST"/

HOME="$FAKE" bash "$REPO/scripts/superpowers-submit-patch.sh"
node --check "$DST/server.cjs"

PORT=47660; SUB=47661
BRAINSTORM_DIR="$TMP/session" BRAINSTORM_PORT="$PORT" BRAINSTORM_SUBMIT_PORT="$SUB" \
  BRAINSTORM_HOST=127.0.0.1 node "$DST/server.cjs" >"$TMP/srv.log" 2>&1 &
SRVPID=$!
for i in $(seq 1 30); do curl -sf -o /dev/null "http://127.0.0.1:$PORT/" && break; sleep 0.2; done

ok=0; fail=0
check() { if [[ "$1" == "$2" ]]; then echo "OK  $3"; ok=$((ok+1)); else echo "FAIL $3 (got '$1' want '$2')"; fail=$((fail+1)); fi; }

# 1) plan-review payload -> 200 + submission.json with annotations+verdict
PAYLOAD='{"kind":"plan-review","plan":"test-plan","verdict":"approve","annotations":[{"op":"strike","fromLine":3,"toLine":5,"text":"alt","reason":"veraltet"}],"nonce":"pr1","markdown":"«PLAN-REVIEW»\\nVerdict: approve\\n«ENDE»"}'
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "http://127.0.0.1:$SUB/submit" \
  -H "origin: http://localhost:$PORT" -H 'content-type: application/json' --data "$PAYLOAD")
check "$code" "200" "plan-review accepted"

[[ -f "$TMP/session/state/submission.json" ]] && { echo "OK  submission.json written"; ok=$((ok+1)); } || { echo "FAIL submission.json missing"; fail=$((fail+1)); }
perm=$(stat -c '%a' "$TMP/session/state/submission.json" 2>/dev/null || echo "?")
check "$perm" "600" "submission.json mode 600"
grep -q '"type":"submit"' "$TMP/session/state/events" && { echo "OK  events line"; ok=$((ok+1)); } || { echo "FAIL events line"; fail=$((fail+1)); }

# 2) annotations+verdict in submission.json
SUB_JSON=$(cat "$TMP/session/state/submission.json")
echo "$SUB_JSON" | jq -e '.annotations | length == 1' >/dev/null && { echo "OK  annotations present"; ok=$((ok+1)); } || { echo "FAIL annotations missing"; fail=$((fail+1)); }
echo "$SUB_JSON" | jq -e '.verdict == "approve"' >/dev/null && { echo "OK  verdict=approve"; ok=$((ok+1)); } || { echo "FAIL verdict wrong"; fail=$((fail+1)); }
echo "$SUB_JSON" | jq -e '.plan == "test-plan"' >/dev/null && { echo "OK  plan=test-plan"; ok=$((ok+1)); } || { echo "FAIL plan wrong"; fail=$((fail+1)); }

# 3) bad origin -> 403 (plan-review kind)
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "http://127.0.0.1:$SUB/submit" \
  -H 'origin: https://evil.example' -H 'content-type: application/json' \
  --data '{"kind":"plan-review","verdict":"approve","nonce":"pr2"}')
check "$code" "403" "bad origin rejected (plan-review)"

# 4) nonce dedupe
dup=$(curl -s -X POST "http://127.0.0.1:$SUB/submit" -H "origin: http://localhost:$PORT" \
  -H 'content-type: application/json' --data '{"kind":"plan-review","verdict":"approve","nonce":"pr1"}')
case "$dup" in *'"dup":true'*) echo "OK  nonce dedupe (plan-review)"; ok=$((ok+1));; *) echo "FAIL nonce dedupe (got $dup)"; fail=$((fail+1));; esac

# 5) regular brainstorm submit still works (non-plan-review)
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "http://127.0.0.1:$SUB/submit" \
  -H "origin: http://localhost:$PORT" -H 'content-type: application/json' \
  --data '{"markdown":"«BRAINSTORM-AUSWAHL»\n«ENDE»","selected":[{"choice":"A","label":"x"}],"nonce":"reg1"}')
check "$code" "200" "regular brainstorm submit still works"

echo "---- plan-review smoke: $ok ok, $fail fail ----"
[[ $fail -eq 0 ]]

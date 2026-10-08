# tests/spec/agent-bench/orchestrator-dispatch.bats — Dispatch-Disziplin und
# Synthese am Orchestrator-Gate (T901309).
# Szenarien: Sauberer Dispatch ohne Selbstausfuehrung · Fehlversuch mit Retry
# ohne Uebernahme · Selbstausfuehrung meldet self_exec und Outcome 0.
#
# Pruefmodus: Output-Verifikation. Jeder Test faehrt den echten plan-runner
# ueber `drive-role.mjs` (Rolle orchestrator): PLAN_RUNNER_ORCH_URL ist ein
# geskripteter fake-openai (Tool-Calls dispatch_4b/wait_event/mark/finish nach
# scoring.bats-Muster), PLAN_RUNNER_OPENCODE ein Stub, der TODO→DONE in den
# Record-Dateien schreibt. Keine GPU, kein echtes Modell.

setup() {
  source "$BATS_TEST_DIRNAME/fixtures/helpers.bash"
  T="$(mktemp -d "$BATS_TMPDIR/dispatch-XXXXXX")"
  mkdir -p "$T/base/notes" "$T/plan" "$T/checks" "$T/work" "$T/bin"
  printf 'TODO a\n' > "$T/base/notes/a.txt"
  printf 'TODO b\n' > "$T/base/notes/b.txt"
  printf 'TODO c\n' > "$T/base/notes/c.txt"
  cp "$REPO/scripts/llm/agent-bench/cases/f5-dispatch-clean/variants/v-clean/checks/run.sh" "$T/checks/run.sh"
  chmod +x "$T/checks/run.sh"
  cp "$REPO/scripts/llm/agent-bench/cases/f5-dispatch-clean/variants/v-clean/reference/tasks.md" "$T/plan/tasks.md"
  cp "$REPO/scripts/llm/agent-bench/cases/f5-dispatch-clean/variants/v-clean/reference/p1.md" "$T/plan/p1.md"
  cp "$REPO/scripts/llm/agent-bench/cases/f5-dispatch-clean/variants/v-clean/reference/p2.md" "$T/plan/p2.md"
  # p3 existiert in f5 nicht als eigene Datei mit c-Bezug? tasks.md nennt
  # p3/p3.md — aus f5-Referenz kopieren (faellt sonst durch Manifest, Datei fehlt).
  cp "$REPO/scripts/llm/agent-bench/cases/f5-dispatch-clean/variants/v-clean/reference/p3.md" "$T/plan/p3.md"
  cat > "$T/bin/opencode.sh" <<'EOF'
#!/usr/bin/env bash
# Dispatch-Stub: schreibt TODO→DONE in den Record-Dateien des Prompts.
set -u
prompt="${*: -1}"
agent=""; prev=""
for a in "$@"; do [ "$prev" = "--agent" ] && agent="$a"; prev="$a"; done
partial="$(grep -oE 'Partial-ID: [A-Za-z0-9_-]+' <<<"$prompt" | head -1 | cut -d' ' -f2 || true)"
[ -n "${FAKE_OPENCODE_LOG:-}" ] && echo "$agent ${partial:-unknown}" >> "$FAKE_OPENCODE_LOG" || true
if [ -n "${FAULT_ONCE_STATE:-}" ] && [ ! -f "$FAULT_ONCE_STATE" ]; then
  : > "$FAULT_ONCE_STATE"
  echo "working (faulty first attempt)"
  echo "PLAN-RUNNER-RESULT: failure injected fault for ${partial:-unknown}"
  exit 0
fi
# Selbstausfuehrung schreibt nichts (Checks bleiben rot → Outcome 0).
case "$agent" in
  *self*) echo "working on ${partial:-unknown} (self, no files)"; echo "PLAN-RUNNER-RESULT: success self ${partial:-unknown}"; exit 0 ;;
esac
files="$(grep -oE 'FILES:[^|]*' <<<"$prompt" | head -1 | cut -d: -f2- || true)"
old_ifs="$IFS"; IFS=','
# shellcheck disable=SC2162
for f in $files; do
  f="$(echo "$f" | sed 's/^ *//;s/ *$//')"
  [ -z "$f" ] && continue
  [ "$f" = "-" ] && continue
  if [ "$f" = "SUMMARY.md" ]; then
    printf 'a: DONE a\nb: DONE b\nsynthesis complete\n' > "$f" || true
  elif [ -f "$f" ]; then
    sed -i 's/^TODO /DONE /' "$f" || true
  fi
done
IFS="$old_ifs"
echo "working on ${partial:-unknown}"
echo "PLAN-RUNNER-RESULT: success fake ${partial:-unknown}"
EOF
  chmod +x "$T/bin/opencode.sh"
  : > "$T/opencode.log"
}

teardown() {
  stop_fake
  rm -rf "$T"
}

# Startet fake-openai mit $1 (Script-JSON) und legt die Orchestrator-Eingaenge
# an: $T/variant.json (checksDir) + $2 (inputs.json-Inhalt via stdin).
begin_orch() {
  start_fake "$1"
  cat > "$T/variant.json" <<EOF
{"checksDir": "$T/checks", "budget": {"tokens": 8000, "turns": 15}}
EOF
  cat > "$T/inputs.json"
}

# $output (drive-role-JSON) auswerten: outcome + Event-Abwesenheit.
assert_outcome() {
  local want="$1"
  outcome="$(echo "$output" | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>console.log(JSON.parse(s).outcome))")"
  [ "$outcome" = "$want" ]
}

assert_no_event() {
  local kind="$1"
  echo "$output" | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>{const r=JSON.parse(s);const kinds=(r.events||[]).map(e=>e.kind);if(kinds.includes(process.argv[1])){console.error('unexpected event '+process.argv[1]+': '+JSON.stringify(kinds));process.exit(1)}})" "$kind"
}

assert_event() {
  local kind="$1"
  echo "$output" | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>{const r=JSON.parse(s);const kinds=(r.events||[]).map(e=>e.kind);if(!kinds.includes(process.argv[1])){console.error('missing event '+process.argv[1]+': '+JSON.stringify(kinds));process.exit(1)}})" "$kind"
}

@test "Sauberer Dispatch ohne Selbstausfuehrung" {
  begin_orch '[{"tool_calls": [{"name": "dispatch_4b", "arguments": {"partial_id": "p1", "prompt": "go"}}]}, {"tool_calls": [{"name": "dispatch_4b", "arguments": {"partial_id": "p2", "prompt": "go"}}]}, {"tool_calls": [{"name": "wait_event", "arguments": {}}]}, {"tool_calls": [{"name": "mark", "arguments": {"partial_id": "p1", "status": "done"}}]}, {"tool_calls": [{"name": "dispatch_4b", "arguments": {"partial_id": "p3", "prompt": "go"}}]}, {"tool_calls": [{"name": "wait_event", "arguments": {}}]}, {"tool_calls": [{"name": "mark", "arguments": {"partial_id": "p2", "status": "done"}}]}, {"tool_calls": [{"name": "wait_event", "arguments": {}}]}, {"tool_calls": [{"name": "mark", "arguments": {"partial_id": "p3", "status": "done"}}]}, {"tool_calls": [{"name": "finish", "arguments": {"summary": "all dispatched"}}]}]' <<EOF
{"case": {"id": "dispatch-clean", "base": "$T/base"}, "planDir": "$T/plan", "slots4b": 2, "opencodeBin": "$T/bin/opencode.sh"}
EOF
  run env RECORDER_URL="$FAKE_URL" WORKDIR="$T/work" FAKE_OPENCODE_LOG="$T/opencode.log" DRIVE_TIMEOUT_MS=120000 \
    node "$FIX/drive-role.mjs" orchestrator "$T/variant.json" "$T/inputs.json"
  [ "$status" -eq 0 ]
  assert_outcome "1"
  assert_no_event "self_exec"
  # Gegenprobe: alle drei Partials liefen ueber 4B-Worker.
  [ "$(grep -c '^plan-worker-qwen35' "$T/opencode.log")" -eq 3 ]
}

@test "Fehlversuch mit Retry ohne Uebernahme" {
  begin_orch '[{"tool_calls": [{"name": "dispatch_4b", "arguments": {"partial_id": "p1", "prompt": "go"}}]}, {"tool_calls": [{"name": "wait_event", "arguments": {}}]}, {"tool_calls": [{"name": "mark", "arguments": {"partial_id": "p1", "status": "open"}}]}, {"tool_calls": [{"name": "dispatch_4b", "arguments": {"partial_id": "p1", "prompt": "retry with cause"}}]}, {"tool_calls": [{"name": "wait_event", "arguments": {}}]}, {"tool_calls": [{"name": "mark", "arguments": {"partial_id": "p1", "status": "done"}}]}, {"tool_calls": [{"name": "dispatch_4b", "arguments": {"partial_id": "p2", "prompt": "go"}}]}, {"tool_calls": [{"name": "wait_event", "arguments": {}}]}, {"tool_calls": [{"name": "mark", "arguments": {"partial_id": "p2", "status": "done"}}]}, {"tool_calls": [{"name": "finish", "arguments": {"summary": "retried p1, dispatched p2"}}]}]' <<EOF
{"case": {"id": "dispatch-faulty", "base": "$T/base"}, "planDir": "$T/plan", "slots4b": 2, "opencodeBin": "$T/bin/opencode.sh"}
EOF
  # Nur p1/p2 im Plan? p3 bleibt offen → Outcome waere Teil. Fuer Retry-Fokus
  # Plan auf zwei Partials stutzen (p1, p2 disjunkt).
  cat > "$T/plan/tasks.md" <<'PLAN'
# Dispatch-Retry (Test-Fixpunkt)

## Partials

| id | plan | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | p1.md | impl | notes/a.txt | |
| p2 | p2.md | impl | notes/b.txt | |
PLAN
  cat > "$T/checks/run.sh" <<'CHECKS'
#!/usr/bin/env bash
set -u
fail=0
grep -q '^DONE a$' notes/a.txt 2>/dev/null || fail=1
grep -q '^DONE b$' notes/b.txt 2>/dev/null || fail=1
if grep -rq '^TODO' notes/ 2>/dev/null; then fail=1; fi
exit $fail
CHECKS
  chmod +x "$T/checks/run.sh"
  rm -f "$T/base/notes/c.txt"
  run env RECORDER_URL="$FAKE_URL" WORKDIR="$T/work" FAKE_OPENCODE_LOG="$T/opencode.log" FAULT_ONCE_STATE="$T/fault.state" DRIVE_TIMEOUT_MS=120000 \
    node "$FIX/drive-role.mjs" orchestrator "$T/variant.json" "$T/inputs.json"
  [ "$status" -eq 0 ]
  assert_outcome "1"
  assert_no_event "accepted_faulty_result"
  assert_no_event "redelegate_without_cause"
  # Gegenprobe: p1 lief zweimal (Fehlversuch + Retry).
  [ "$(grep -c ' p1$' "$T/opencode.log")" -eq 2 ]
}

@test "Selbstausfuehrung meldet self_exec und Outcome 0" {
  begin_orch '[{"tool_calls": [{"name": "dispatch_4b", "arguments": {"partial_id": "p1", "prompt": "go"}}]}, {"tool_calls": [{"name": "execute_self", "arguments": {"partial_id": "p2", "prompt": "do it yourself", "plan_notes": "p1 on 4b, p2 self"}}]}, {"tool_calls": [{"name": "wait_event", "arguments": {}}]}, {"tool_calls": [{"name": "mark", "arguments": {"partial_id": "p1", "status": "done"}}]}, {"tool_calls": [{"name": "mark", "arguments": {"partial_id": "p2", "status": "done"}}]}, {"tool_calls": [{"name": "finish", "arguments": {"summary": "self-exec"}}]}]' <<EOF
{"case": {"id": "dispatch-self", "base": "$T/base"}, "planDir": "$T/plan", "slots4b": 1, "opencodeBin": "$T/bin/opencode.sh"}
EOF
  cat > "$T/plan/tasks.md" <<'PLAN'
# Dispatch-Self (Test-Fixpunkt)

## Partials

| id | plan | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | p1.md | impl | notes/a.txt | |
| p2 | p2.md | impl | notes/b.txt | |
PLAN
  cat > "$T/checks/run.sh" <<'CHECKS'
#!/usr/bin/env bash
set -u
fail=0
grep -q '^DONE a$' notes/a.txt 2>/dev/null || fail=1
grep -q '^DONE b$' notes/b.txt 2>/dev/null || fail=1
if grep -rq '^TODO' notes/ 2>/dev/null; then fail=1; fi
exit $fail
CHECKS
  chmod +x "$T/checks/run.sh"
  rm -f "$T/base/notes/c.txt"
  run env RECORDER_URL="$FAKE_URL" WORKDIR="$T/work" FAKE_OPENCODE_LOG="$T/opencode.log" DRIVE_TIMEOUT_MS=120000 \
    node "$FIX/drive-role.mjs" orchestrator "$T/variant.json" "$T/inputs.json"
  [ "$status" -eq 0 ]
  assert_event "self_exec"
  assert_outcome "0"
}

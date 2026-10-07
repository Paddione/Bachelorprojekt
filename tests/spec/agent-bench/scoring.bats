# tests/spec/agent-bench/scoring.bats — deterministisches Scoring (p1),
# Fall-Validierung und datengetriebene Fallaufnahme.
# Szenarien: Same trace yields same score · Detour lowers the score ·
# Ambiguous variant requires a clarification · False pass weighs more than
# false fail · Case without source event is rejected · New case needs no
# code change.

setup() {
  source "$BATS_TEST_DIRNAME/fixtures/helpers.bash"
  T="$(mktemp -d "$BATS_TMPDIR/scoring-XXXXXX")"
}

teardown() {
  stop_fake
  rm -rf "$T"
}

@test "Same trace yields same score" {
  run node --input-type=module -e "
import { scoreRun, loadScoringConfig } from '$LIB/scoring.mjs';
const cfg = loadScoringConfig(new URL('file://$REPO/scripts/llm/agent-bench/scoring.json'));
const input = { role: 'code-worker', outcome: 1, events: [{ kind: 'out_of_scope_file' }], usage: { total_tokens: 1000 }, budget: { tokens: 2000 } };
const a = scoreRun(input, cfg);
const b = scoreRun(input, cfg);
console.log(JSON.stringify(a) === JSON.stringify(b) ? 'IDENTICAL' : 'DIFFERENT');
console.log('score=' + a.score);
"
  [ "$status" -eq 0 ]
  [[ "$output" == *"IDENTICAL"* ]]
  [[ "$output" == *"score="* ]]
}

@test "Detour lowers the score" {
  run node --input-type=module -e "
import { scoreRun, loadScoringConfig } from '$LIB/scoring.mjs';
const cfg = loadScoringConfig(new URL('file://$REPO/scripts/llm/agent-bench/scoring.json'));
const base = { role: 'code-worker', outcome: 1, events: [], usage: { total_tokens: 1000 }, budget: { tokens: 2000 } };
const clean = scoreRun(base, cfg);
const dirty = scoreRun({ ...base, events: [{ kind: 'out_of_scope_file' }] }, cfg);
console.log('clean=' + clean.score + ' detours=' + clean.detours);
console.log('dirty=' + dirty.score + ' detours=' + dirty.detours);
console.log(dirty.detours > clean.detours && dirty.score < clean.score ? 'DETOUR-LOWERS' : 'NO-EFFECT');
"
  [ "$status" -eq 0 ]
  [[ "$output" == *"DETOUR-LOWERS"* ]]
}

@test "Ambiguous variant requires a clarification" {
  start_fake
  # Variante mit expected_decision=clarify; der Fake schreibt statt zu fragen.
  cat > "$T/variant.json" <<'EOF'
{"dir": "/tmp", "briefPath": "/tmp/nonexistent-brief.md", "budget": {"tokens": 2000, "turns": 1}, "expected_decision": "clarify"}
EOF
  FAKE_OPENAI_SCRIPT='[{"tool_calls": [{"name": "write_plan", "arguments": {"tasks_md": "# x", "partials": []}}]}]' \
    FAKE_OPENAI_LOG="" node "$FIX/fake-openai.mjs" > "$T/port" 2>&1 &
  local pid=$!
  for _ in $(seq 1 100); do grep -q 'FAKE-OPENAI-PORT=' "$T/port" 2>/dev/null && break; sleep 0.05; done
  local url="http://127.0.0.1:$(grep -o 'FAKE-OPENAI-PORT=[0-9]*' "$T/port" | cut -d= -f2)"
  echo '{"case": {"source": "fixture"}, "sandbox": "/tmp", "plannerModel": "fake"}' > "$T/inputs.json"
  run env RECORDER_URL="$url" WORKDIR="$T/work" DRIVE_TIMEOUT_MS=30000 \
    node "$FIX/drive-role.mjs" planner "$T/variant.json" "$T/inputs.json"
  kill "$pid" 2>/dev/null || true
  [ "$status" -eq 0 ]
  outcome="$(echo "$output" | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>console.log(JSON.parse(s).outcome))")"
  [ "$outcome" = "0" ]
  echo "$output" | grep -q 'clarify_miss'
  # Gegenprobe: wer fragt, bekommt outcome 1.
  FAKE_OPENAI_SCRIPT='[{"tool_calls": [{"name": "ask_clarification", "arguments": {"question": "A oder B?"}}]}]' \
    node "$FIX/fake-openai.mjs" > "$T/port2" 2>&1 &
  pid=$!
  for _ in $(seq 1 100); do grep -q 'FAKE-OPENAI-PORT=' "$T/port2" 2>/dev/null && break; sleep 0.05; done
  url="http://127.0.0.1:$(grep -o 'FAKE-OPENAI-PORT=[0-9]*' "$T/port2" | cut -d= -f2)"
  run env RECORDER_URL="$url" WORKDIR="$T/work" DRIVE_TIMEOUT_MS=30000 \
    node "$FIX/drive-role.mjs" planner "$T/variant.json" "$T/inputs.json"
  kill "$pid" 2>/dev/null || true
  [ "$status" -eq 0 ]
  outcome="$(echo "$output" | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>console.log(JSON.parse(s).outcome))")"
  [ "$outcome" = "1" ]
}

@test "False pass weighs more than false fail" {
  run node --input-type=module -e "
import { scoreRun, loadScoringConfig } from '$LIB/scoring.mjs';
const cfg = loadScoringConfig(new URL('file://$REPO/scripts/llm/agent-bench/scoring.json'));
const base = { role: 'reviewer', outcome: 1, usage: { total_tokens: 100 }, budget: { tokens: 2000 } };
const pass = scoreRun({ ...base, events: [{ kind: 'false_pass' }] }, cfg);
const fail = scoreRun({ ...base, events: [{ kind: 'false_fail' }] }, cfg);
console.log('false_pass=' + pass.score + ' false_fail=' + fail.score);
console.log(pass.score < fail.score ? 'PASS-WEIGHS-MORE' : 'EQUAL');
"
  [ "$status" -eq 0 ]
  [[ "$output" == *"PASS-WEIGHS-MORE"* ]]
}

@test "Case without source event is rejected" {
  # Ebene 1: der Loader nennt den Fall.
  run node --input-type=module -e "
import { validateCases } from '$LIB/cases.mjs';
const r = validateCases('$FIX/cases');
console.log(r.ok ? 'VALID' : 'INVALID');
for (const e of r.errors) console.log(e.caseId + ': ' + e.message);
"
  [ "$status" -eq 0 ]
  [[ "$output" == *"INVALID"* ]]
  [[ "$output" == *"no-source"* ]]
  # Ebene 2: der Bench bricht mit Konfigurationsfehler ab und nennt den Fall.
  mkdir -p "$T/runs" "$T/cases"
  cp -r "$FIX/cases/tiny-eval" "$FIX/cases/no-source" "$T/cases/"
  bench_env "$T/runs" "$T/cases"
  run node "$BENCH" run --profile quick --roles code-worker --models qwen3-4b
  [ "$status" -eq 2 ]
  [[ "$output" == *"no-source"* ]]
}

@test "New case needs no code change" {
  start_fake '[{"content": "{\"verdict\": \"pass\", \"reason\": \"sauber\", \"location\": \"app.sh:1\"}"}]'
  mkdir -p "$T/runs" "$T/cases"
  cp -r "$FIX/cases/tiny-eval" "$T/cases/fresh-case"
  bench_env "$T/runs" "$T/cases"
  run node "$BENCH" run --profile quick --roles reviewer --models qwen3-4b --cases fresh-case:v3
  echo "$output" | grep -q '^AGENT-BENCH: '
  found="$(find "$T/runs" -name result.json | head -5)"
  [ -n "$found" ]
  echo "$found" | grep -q 'fresh-case'
}

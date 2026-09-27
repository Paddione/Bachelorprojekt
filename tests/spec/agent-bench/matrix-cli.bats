# tests/spec/agent-bench/matrix-cli.bats — Matrix, Scheduler und CLI (p4).
# Szenarien: Only selected roles are measured · Unknown role is refused ·
# Worker is measured on the reference partial · Chained mode passes the real
# plan · Plans are reused across executors · Vision role skips models without
# vision · Resume skips completed stages. Dazu: Split-Filter.

setup() {
  source "$BATS_TEST_DIRNAME/fixtures/helpers.bash"
  T="$(mktemp -d "$BATS_TMPDIR/matrix-XXXXXX")"
  mkdir -p "$T/runs" "$T/cases"
  mkcases_ok "$T/cases"
}

teardown() {
  stop_fake
  rm -rf "$T"
}

@test "Only selected roles are measured" {
  bench_env "$T/runs" "$T/cases"
  export FAKE_OPENCODE_SOLVE=1
  export FAKE_OPENCODE_SNAP="printf '#!/usr/bin/env bash\necho fixed\n' > app.sh"
  run node "$BENCH" run --profile quick --roles code-worker --models qwen35-4b --cases tiny-eval
  echo "$output" | grep -q '^AGENT-BENCH: '
  local roles
  roles="$(node -e "
const fs = require('fs'), path = require('path');
const out = [];
const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else if (e.name === 'result.json') out.push(JSON.parse(fs.readFileSync(f, 'utf8')).role); } };
walk('$T/runs');
console.log(out.sort().join(','));
")"
  [ -n "$roles" ]
  [ "$roles" = "code-worker" ]
}

@test "Unknown role is refused" {
  bench_env "$T/runs" "$T/cases"
  run node "$BENCH" run --profile quick --roles planer --models qwen35-4b
  [ "$status" -eq 2 ]
  # Positiv-Anker: die Fehlermeldung nennt den falschen Namen und die Auswahl.
  [[ "$output" == *"planer"* ]]
  [[ "$output" == *"planner"* ]]
  # ... und zwar bevor irgendetwas geladen wurde: kein gpu-lock-Aufruf.
  [ ! -s "$T/runs/bin.log" ]
}

@test "Worker is measured on the reference partial" {
  bench_env "$T/runs" "$T/cases"
  export FAKE_OPENCODE_SOLVE=1
  export FAKE_OPENCODE_SNAP="printf '#!/usr/bin/env bash\necho fixed\n' > app.sh"
  run node "$BENCH" run --profile quick --roles code-worker --models qwen35-4b --cases tiny-eval:v1 --mode isolated
  echo "$output" | grep -q '^AGENT-BENCH: '
  [ -s "$FAKE_OPENCODE_LOG" ]
  grep -q 'REFERENZ-PARTIAL-MARKER-V1' "$FAKE_OPENCODE_LOG"
}

@test "Chained mode passes the real plan" {
  local tasks_md='# Kettenplan\n\n## Partials\n\n| id | plan | role | target_files | depends_on |\n| px | px.md | impl | app.sh |'
  start_fake "[{\"tool_calls\": [{\"name\": \"write_plan\", \"arguments\": {\"tasks_md\": \"$tasks_md\", \"partials\": [{\"id\": \"px\", \"text\": \"KETTEN-PLAN-MARKER wirklich tun\"}]}}]}]"
  bench_env "$T/runs" "$T/cases"
  export FAKE_OPENCODE_SOLVE=1
  export FAKE_OPENCODE_SNAP="printf '#!/usr/bin/env bash\necho fixed\n' > app.sh"
  run node "$BENCH" run --profile quick --roles planner,code-worker --models qwen35-4b --cases tiny-eval:v1 --mode chained
  echo "$output" | grep -q '^AGENT-BENCH: '
  grep -q 'KETTEN-PLAN-MARKER' "$FAKE_OPENCODE_LOG"
  nomarker="$(grep -c 'REFERENZ-PARTIAL-MARKER-V1' "$FAKE_OPENCODE_LOG" || true)"
  [ "$nomarker" = "0" ]
  # In der Kette ist der Planner-Outcome das Execute-Mittel (hier 1).
  local plan_outcome
  plan_outcome="$(node -e "
const fs = require('fs'), path = require('path');
const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) { const r = walk(f); if (r) return r; } else if (e.name === 'result.json') { const j = JSON.parse(fs.readFileSync(f, 'utf8')); if (j.role === 'planner') return j.score.outcome; } } return null; };
console.log(walk('$T/runs'));
")"
  [ "$plan_outcome" = "1" ]
}

@test "Plans are reused across executors" {
  local tasks_md='# Kettenplan\n\n## Partials\n\n| id | plan | role | target_files | depends_on |\n| px | px.md | impl | app.sh |'
  local w="{\"tool_calls\": [{\"name\": \"write_plan\", \"arguments\": {\"tasks_md\": \"$tasks_md\", \"partials\": [{\"id\": \"px\", \"text\": \"tun\"}]}}]}"
  # Jeder Planer fragt zweimal: Tool-Call, dann Abschluss ohne Tools.
  start_fake "[$w, {\"content\": \"fertig\"}, $w, {\"content\": \"fertig\"}]"
  bench_env "$T/runs" "$T/cases"
  export FAKE_OPENCODE_SOLVE=1
  export FAKE_OPENCODE_SNAP="printf '#!/usr/bin/env bash\necho fixed\n' > app.sh"
  run node "$BENCH" run --profile quick --roles planner,code-worker --models qwen35-4b,qwen38-27b --cases tiny-eval:v1 --mode chained
  echo "$output" | grep -q '^AGENT-BENCH: '
  local counts
  counts="$(node -e "
const fs = require('fs'), path = require('path');
let plan = 0, exec = 0;
const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else if (e.name === 'result.json') { const j = JSON.parse(fs.readFileSync(f, 'utf8')); if (j.role === 'planner') plan++; if (j.role === 'code-worker') exec++; } } };
walk('$T/runs');
console.log(plan + '/' + exec);
")"
  # 2 Planer schreiben je 1 Plan; 2 Plaene x 2 Worker-Paare = 4 Laeufe.
  [ "$counts" = "2/4" ]
}

@test "Vision role skips models without vision" {
  start_fake '[{"content": "{\"fields\": {\"boxes\": \"3\"}}"}]'
  bench_env "$T/runs" "$T/cases"
  run node "$BENCH" run --profile quick --roles vision-worker --models qwen38-27b,qwen35-4b,gemma4-12b-nvfp4 --cases tiny-eval:v4
  echo "$output" | grep -q '^AGENT-BENCH: '
  local models
  models="$(node -e "
const fs = require('fs'), path = require('path');
const out = [];
const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else if (e.name === 'result.json') out.push(JSON.parse(fs.readFileSync(f, 'utf8')).model); } };
walk('$T/runs');
console.log(out.sort().join(','));
")"
  [ "$models" = "gemma4-12b-nvfp4" ]
}

@test "Resume skips completed stages" {
  local tasks_md='# Kettenplan\n\n## Partials\n\n| id | plan | role | target_files | depends_on |\n| px | px.md | impl | app.sh |'
  start_fake "[{\"tool_calls\": [{\"name\": \"write_plan\", \"arguments\": {\"tasks_md\": \"$tasks_md\", \"partials\": [{\"id\": \"px\", \"text\": \"tun\"}]}}]}]"
  bench_env "$T/runs" "$T/cases"
  export FAKE_OPENCODE_SOLVE=1
  export FAKE_OPENCODE_SNAP="printf '#!/usr/bin/env bash\necho fixed\n' > app.sh"
  run node "$BENCH" run --profile quick --roles planner,code-worker --models qwen35-4b --cases tiny-eval:v1 --mode chained
  echo "$output" | grep -q '^AGENT-BENCH: '
  local run_id
  run_id="$(echo "$output" | grep -o 'run=[^ ]*' | cut -d= -f2)"
  [ -n "$run_id" ]
  local plan_json
  plan_json="$(find "$T/runs/$run_id" -name result.json | xargs grep -l '"role": *"planner"' | head -1)"
  [ -n "$plan_json" ]
  local before
  before="$(sha256sum "$plan_json" | cut -d' ' -f1)"
  local exec_json
  exec_json="$(find "$T/runs/$run_id" -name result.json | xargs grep -l '"role": *"code-worker"' | head -1)"
  rm "$exec_json"
  run node "$BENCH" resume "$run_id"
  echo "$output" | grep -q '^AGENT-BENCH: '
  [ -f "$exec_json" ]
  local after
  after="$(sha256sum "$plan_json" | cut -d' ' -f1)"
  [ "$before" = "$after" ]
}

@test "Split filter selects train cases" {
  bench_env "$T/runs" "$T/cases"
  export FAKE_OPENCODE_SOLVE=1
  export FAKE_OPENCODE_SNAP="printf '#!/usr/bin/env bash\necho fixed\n' > app.sh; printf '#!/usr/bin/env bash\necho moin\n' > greet.sh"
  run node "$BENCH" run --profile quick --roles code-worker --models qwen35-4b --split train
  echo "$output" | grep -q '^AGENT-BENCH: '
  local cases
  cases="$(node -e "
const fs = require('fs'), path = require('path');
const out = new Set();
const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else if (e.name === 'result.json') out.add(JSON.parse(fs.readFileSync(f, 'utf8')).case); } };
walk('$T/runs');
console.log([...out].sort().join(','));
")"
  [ "$cases" = "tiny-train" ]
}

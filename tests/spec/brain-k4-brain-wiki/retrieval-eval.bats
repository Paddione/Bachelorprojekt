#!/usr/bin/env bats
# SSOT-Spec: openspec/specs/brain-k4-brain-wiki.md
# Ticket: T012913

setup() {
  ROOT="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  RUNNER="$ROOT/scripts/brain-retrieval-eval.py"
  WIKI="$BATS_TEST_TMPDIR/wiki"
  mkdir -p "$WIKI"
  cat > "$WIKI/alpha.md" <<'EOF'
---
type: decision
tags: [eval, alpha]
status: active
source_kind: openspec
observed_at: 2025-01-01
valid_from: 2025-01-01
valid_until: 2030-01-01
---
Alpha banana architecture decision banana.
EOF
  cat > "$WIKI/beta.md" <<'EOF'
---
type: note
tags: [eval, beta]
status: active
source_kind: runbook
observed_at: 2020-01-01
valid_from: 2020-01-01
valid_until: 2024-01-01
---
Beta banana operations handbook.
EOF
  cat > "$WIKI/gamma.md" <<'EOF'
---
type: note
tags: [eval]
status: active
---
Gamma legacy kiwi notes.
EOF
}

@test "reproducible metrics use the shared index and remain baseline-only offline" {
  local evalset="$BATS_TEST_TMPDIR/eval.jsonl" out1 out2
  cat > "$evalset" <<'EOF'
{"id":"rank-one","query":"alpha banana","relevant_slugs":["alpha"],"top_k":2,"filters":{"as_of":"2026-08-19"}}
{"id":"stale","query":"beta operations","relevant_slugs":["beta"],"top_k":2,"filters":{"as_of":"2026-08-19"}}
{"id":"missing","query":"banana","relevant_slugs":["not-returned"],"top_k":2}
EOF
  run python3 "$RUNNER" --wiki-dir "$WIKI" --eval-set "$evalset" --top-k 2 --format json
  [ "$status" -eq 0 ]
  out1="$output"
  run python3 "$RUNNER" --wiki-dir "$WIKI" --eval-set "$evalset" --top-k 2 --format json
  [ "$status" -eq 0 ]
  out2="$output"
  [ "$out1" = "$out2" ]
  python3 - "$out1" <<'PY'
import json, sys
d=json.loads(sys.argv[1])
assert d['schema_version'] == 1
assert d['case_count'] == 3
assert set(d['metrics']) >= {'recall_at_k','mrr','stale_result_rate'}
assert d['metrics']['recall_at_k'] == 0.333333
assert d['metrics']['mrr'] == 0.333333
assert d['metrics']['stale_result_rate'] == 0.333333
assert len(d['cases']) == 3
PY
  [[ "$out1" != *'threshold'* ]]

  run python3 "$RUNNER" --wiki-dir "$WIKI" --eval-set "$evalset" --format human
  [ "$status" -eq 0 ]
  local human1="$output"
  [[ "$output" == *'Recall@k'* ]]
  [[ "$output" == *'stale-result rate'* ]]
  run python3 "$RUNNER" --wiki-dir "$WIKI" --eval-set "$evalset" --format human
  [ "$status" -eq 0 ]
  [ "$output" = "$human1" ]

  printf '%s\n' '{"id":"bad","query":"x","relevant_slugs":[],"filters":{"unknown":"x"}}' > "$evalset"
  run python3 "$RUNNER" --wiki-dir "$WIKI" --eval-set "$evalset" --format json
  [ "$status" -eq 2 ]
}

@test "aggregate recall uses raw zero and one-third values before output rounding" {
  local evalset="$BATS_TEST_TMPDIR/fractional.jsonl" json
  cat > "$evalset" <<'EOF'
{"id":"one-third","query":"alpha banana","relevant_slugs":["alpha","missing-a","missing-b"],"top_k":1}
{"id":"zero","query":"does-not-exist","relevant_slugs":["alpha"],"top_k":1}
EOF
  run python3 "$RUNNER" --wiki-dir "$WIKI" --eval-set "$evalset" --format json
  [ "$status" -eq 0 ]
  json="$output"
  python3 - "$json" <<'PY'
import json, sys
d = json.loads(sys.argv[1])
assert d["cases"][0]["recall_at_k"] == 0.333333
assert d["cases"][1]["recall_at_k"] == 0.0
assert d["metrics"]["recall_at_k"] == 0.166667
PY
}

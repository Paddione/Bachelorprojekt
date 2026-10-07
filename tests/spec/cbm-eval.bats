#!/usr/bin/env bats
# tests/spec/cbm-eval.bats
# Ticket: T900993/A6 — hand-labeled retrieval eval + per-stage ablation.
#
# Contract:
#   (a) metric math is pure (no network): Recall@k + MRR@k over a 5-toy-doc
#       fixture with a known ranking give exact expected values;
#   (b) store-key normalization (repo@commit:path:symbol -> path) works;
#   (c) ablation delta = +graph-boost minus fused, INCONCLUSIVE when a side
#       is missing (never a fabricated 0.0);
#   (d) a failing ranker fails the run closed (exit != 0, ERROR marker) —
#       never silent zeros.
#
# Network-free: exercised via `python3 -c` imports with fixtures + CLI
# subprocesses against temp fixture files.

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
  EVAL_PY="$REPO_ROOT/scripts/mcp/cbm-eval.py"
  TEST_DIR="$BATS_TEST_TMPDIR/cbmeval-$$"
  mkdir -p "$TEST_DIR"
}

teardown() {
  rm -rf "$TEST_DIR"
}

mod_py() { # mod_py <snippet>
  python3 -c "
import importlib.util, sys
spec = importlib.util.spec_from_file_location('mod_under_test', sys.argv[1])
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
$1
" "$EVAL_PY"
}

@test "recall@k + mrr@k math on a 5-toy-doc fixture with known ranking" {
  run mod_py "
# ranked: [a, X, b, Y, c]; expected {a, b, c} (k=10)
r = m.score_ranking(['a', 'b', 'c'], ['a', 'X', 'b', 'Y', 'c'], k=10)
assert r['recall@10'] == 1.0, r
assert abs(r['mrr@10'] - 1.0) < 1e-9, r  # first hit at rank 1
# expected {b, c}: first hit at rank 3 -> RR 1/3, recall 2/2... b,c both present -> 1.0
r2 = m.score_ranking(['b', 'c'], ['a', 'X', 'b', 'Y', 'c'], k=10)
assert r2['recall@10'] == 1.0, r2
assert abs(r2['mrr@10'] - 1.0/3) < 1e-9, r2
# no hit in top-k -> 0/0
r3 = m.score_ranking(['zzz'], ['a', 'X', 'b'], k=2)
assert r3['recall@2'] == 0.0 and r3['mrr@2'] == 0.0, r3
# k truncation: hit at rank 3 with k=2 -> miss
r4 = m.score_ranking(['b'], ['a', 'X', 'b'], k=2)
assert r4['recall@2'] == 0.0 and r4['mrr@2'] == 0.0, r4
# partial recall: 1 of 2 expected in top-k
r5 = m.score_ranking(['a', 'zzz'], ['a', 'X'], k=2)
assert r5['recall@2'] == 0.5, r5
assert abs(r5['mrr@2'] - 1.0) < 1e-9, r5
"
  [ "$status" -eq 0 ]
}

@test "normalize_path strips store keys but leaves plain paths alone" {
  run mod_py "
assert m.normalize_path('components/website/src/lib/auth.ts') == 'components/website/src/lib/auth.ts'
assert m.normalize_path('repo@8fed539:components/website/src/lib/auth.ts:GET') == 'components/website/src/lib/auth.ts'
assert m.normalize_path('repo@c:lib/a.ts:exchangeCode') == 'lib/a.ts'
# extract_paths accepts path/key/file fields and bare strings
got = m.extract_paths([{'key': 'repo@c:lib/a.ts:GET'}, {'path': 'docs/x.md'}, 'plain/y.ts'])
assert got == ['lib/a.ts', 'docs/x.md', 'plain/y.ts'], got
"
  [ "$status" -eq 0 ]
}

@test "ablation delta: boost minus fused; INCONCLUSIVE when a side is missing" {
  run mod_py "
ok = lambda r, mrr: {'status': 'ok', 'recall': r, 'mrr': mrr, 'n': 5, 'by_kind': {}}
ab = m.ablation_delta({'+graph-boost': ok(0.8, 0.6), 'fused': ok(0.7, 0.5)})
assert abs(ab['delta_mrr'] - 0.1) < 1e-9, ab
assert abs(ab['delta_recall'] - 0.1) < 1e-9, ab
assert ab['baseline'] == 'fused' and 'HELPS' in ab['verdict'], ab
# missing boosted side -> no fabricated zero
ab2 = m.ablation_delta({'fused': ok(0.7, 0.5)})
assert ab2['delta_mrr'] is None and ab2['delta_recall'] is None, ab2
assert 'INCONCLUSIVE' in ab2['verdict'], ab2
# neutral band
ab3 = m.ablation_delta({'+graph-boost': ok(0.7, 0.505), 'fused': ok(0.7, 0.5)})
assert 'NEUTRAL' in ab3['verdict'], ab3
"
  [ "$status" -eq 0 ]
}

@test "evaluate aggregates per-stage means and marks unscored stages SKIPPED" {
  run mod_py "
rows = [
  {'id': 'q1', 'kind': 'code', 'expected_paths': ['a']},
  {'id': 'q2', 'kind': 'doc', 'expected_paths': ['b']},
]
ranked = {
  'q1': {'fused': ['a', 'x'], '+graph-boost': ['x', 'a']},
  'q2': {'fused': ['y', 'b']},  # no graph-boost ranking for q2
}
rep = m.evaluate(ranked, rows, ['fused', '+graph-boost', 'dense-only'], k=10)
fused = rep['stages']['fused']
assert fused['status'] == 'ok' and fused['n'] == 2, fused
assert abs(fused['recall'] - 1.0) < 1e-9, fused
assert abs(fused['mrr'] - (1.0 + 0.5) / 2) < 1e-9, fused
gb = rep['stages']['+graph-boost']
assert gb['status'] == 'ok' and gb['n'] == 1, gb
assert abs(gb['mrr'] - 0.5) < 1e-9, gb
sk = rep['stages']['dense-only']
assert sk['status'] == 'SKIPPED' and sk['recall'] is None, sk
assert rep['ablation']['delta_mrr'] is not None  # both sides have >=1 score
"
  [ "$status" -eq 0 ]
}

@test "CLI replays --results fixtures and emits markdown + JSON" {
  printf '%s\n' \
    '{"id":"q1","query":"auth session","kind":"code","expected_paths":["lib/auth.ts"],"notes":"t"}' \
    '{"id":"q2","query":"invoice hash","kind":"code","expected_paths":["lib/invoice-hash.ts"],"notes":"t"}' \
    > "$TEST_DIR/eval.jsonl"
  printf '%s' \
    '{"q1":{"fused":["lib/auth.ts","x"],"dense-only":["x","lib/auth.ts"]},"q2":{"fused":["y","lib/invoice-hash.ts"],"dense-only":["lib/invoice-hash.ts"]}}' \
    > "$TEST_DIR/results.json"
  run python3 "$EVAL_PY" run --eval "$TEST_DIR/eval.jsonl" \
    --results "$TEST_DIR/results.json" \
    --stages "fused,dense-only" \
    --json "$TEST_DIR/report.json" --md "$TEST_DIR/report.md"
  [ "$status" -eq 0 ]
  grep -q "| fused | 1.000 | 0.750 |" "$TEST_DIR/report.md"
  grep -q "Ablation" "$TEST_DIR/report.md"
  python3 -c "
import json
rep = json.load(open('$TEST_DIR/report.json'))
assert rep['stages']['fused']['mrr'] == 0.75, rep
assert rep['stages']['dense-only']['mrr'] == 0.75, rep
assert rep['n_queries'] == 2
"
}

@test "CLI fails closed when the ranker command is missing (no silent zeros)" {
  printf '%s\n' \
    '{"id":"q1","query":"auth session","kind":"code","expected_paths":["lib/auth.ts"],"notes":"t"}' \
    > "$TEST_DIR/eval.jsonl"
  run python3 "$EVAL_PY" run --eval "$TEST_DIR/eval.jsonl" \
    --ranker-cmd "/nonexistent/ranker-cmd --stage foo" \
    --stages "fused"
  [ "$status" -ne 0 ]
  [[ "$output" != *"| fused | 0.000"* ]]
}

@test "CLI rejects eval rows with empty expected sets" {
  printf '%s\n' \
    '{"id":"q1","query":"vague","kind":"doc","expected_paths":[],"notes":"t"}' \
    > "$TEST_DIR/bad.jsonl"
  printf '%s' '{"q1":{"fused":["a"]}}' > "$TEST_DIR/r.json"
  run python3 "$EVAL_PY" run --eval "$TEST_DIR/bad.jsonl" \
    --results "$TEST_DIR/r.json"
  [ "$status" -ne 0 ]
}

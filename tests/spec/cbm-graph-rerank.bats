#!/usr/bin/env bats
# tests/spec/cbm-graph-rerank.bats
# Ticket: T900993 — receipt-keyed embed sync and graph-aware rerank.
#
# Contract (plan k3-embed-store-rerank task 3, RED gate):
#   (a) sync's plan_sync is a pure function over (candidate texts, store
#       contents) returning to_embed/to_prune/unchanged — no network
#   (b) the rerank boost is a pure function over (embed score, structural
#       features) — a HANDLES-matched candidate outranks a higher-scoring
#       unboosted one; zero features degrade to embed order
#   (c) a manifest without a receipt id fails closed
#
# Network-free: exercised via `python3 -c` imports with fixtures.

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
  SYNC_PY="$REPO_ROOT/scripts/mcp/cbm-embed-sync.py"
  RERANK_PY="$REPO_ROOT/scripts/mcp/cbm-graph-rerank.py"
  STORE_PY="$REPO_ROOT/scripts/mcp/cbm-embed-store.py"
  TEST_DIR="$BATS_TEST_TMPDIR/rerank-$$"
  mkdir -p "$TEST_DIR"
}

teardown() {
  rm -rf "$TEST_DIR"
}

mod_py() { # mod_py <module-file> <snippet> [args...]
  python3 -c "
import importlib.util, sys
spec = importlib.util.spec_from_file_location('mod_under_test', sys.argv[1])
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
$2
" "$1" "${@:3}"
}

@test "plan_sync is pure: returns exactly to_embed / to_prune / unchanged for fixtures" {
  run mod_py "$SYNC_PY" "
ha = 'a' * 64
def rec(h): return {'hash': h, 'model': 'bge-m3', 'dim': 2, 'vector': [1.0, 0.0]}
store = {
    'repo@c1:lib/a.ts:GET': rec(ha),
    'repo@c1:lib/b.ts:POST': rec('b' * 64),
    'repo@c1:lib/gone.ts:GET': rec('c' * 64),
}
candidates = [
    {'key': 'repo@c2:lib/a.ts:GET', 'text': 'text-a'},    # unchanged (hash equal via fixture store)
    {'key': 'repo@c2:lib/b.ts:POST', 'text': 'text-b-NEW'},  # changed -> embed
    {'key': 'repo@c2:lib/c.ts:GET', 'text': 'text-c'},    # new -> embed
]
plan = m.plan_sync(candidates, store, 'bge-m3')
assert set(plan.keys()) == {'to_embed', 'to_prune', 'unchanged'}, plan.keys()
assert [e['key'] for e in plan['to_embed']] == ['repo@c2:lib/b.ts:POST', 'repo@c2:lib/c.ts:GET'], plan['to_embed']
assert {e['text'] for e in plan['to_embed']} == {'text-b-NEW', 'text-c'}
assert plan['to_prune'] == ['repo@c1:lib/gone.ts:GET'], plan['to_prune']
assert plan['unchanged'] == ['repo@c2:lib/a.ts:GET'], plan['unchanged']
# deterministic: same inputs -> same output
plan2 = m.plan_sync(candidates, store, 'bge-m3')
assert plan == plan2
"
  [ "$status" -eq 0 ]
}

@test "plan_sync uses content hashes over (model, text) — no network, no IO" {
  run mod_py "$SYNC_PY" "
import inspect
src = inspect.getsource(m.plan_sync)
for banned in ('urllib', 'requests', 'subprocess', 'socket', 'open('):
    assert banned not in src, 'plan_sync must be pure, found %s' % banned
# a model bump re-embeds everything even with identical texts
store = {'repo@c1:lib/a.ts:GET': {'hash': m.content_hash('bge-m3', 't'),
                                  'model': 'bge-m3', 'dim': 2, 'vector': [1.0, 0.0]}}
candidates = [{'key': 'repo@c2:lib/a.ts:GET', 'text': 't'}]
plan_other = m.plan_sync(candidates, store, 'other-model')
assert [e['key'] for e in plan_other['to_embed']] == ['repo@c2:lib/a.ts:GET'], plan_other
plan = m.plan_sync(candidates, store, 'bge-m3')
assert plan['unchanged'] == ['repo@c2:lib/a.ts:GET'], plan
"
  [ "$status" -eq 0 ]
}

@test "candidate text composers are deterministic and truncate docstrings" {
  run mod_py "$SYNC_PY" "
t1 = m.route_text('components/website/src/pages/api/auth/callback.ts', 'GET')
t2 = m.route_text('components/website/src/pages/api/auth/callback.ts', 'GET')
assert t1 == t2 and 'GET' in t1 and 'auth/callback.ts' in t1, t1
assert m.route_text('p.ts', None) == m.route_text('p.ts', None)
doc = 'x' * 5000
ft = m.function_text('proj.pkg.fn', doc)
assert ft.startswith('proj.pkg.fn'), ft
assert len(ft) < len('proj.pkg.fn') + 5000, 'docstring must be truncated'
assert m.function_text('proj.pkg.fn', doc) == m.function_text('proj.pkg.fn', doc)
"
  [ "$status" -eq 0 ]
}

@test "apply_boost is pure: HANDLES match outranks a higher-scoring unboosted candidate" {
  run mod_py "$RERANK_PY" "
zero = m.zero_features()
base_a = m.apply_boost(0.75, zero)
assert base_a['score'] == 0.75, 'zero features must not change the embed score'
assert base_a['boost'] == 0.0
strong = m.apply_boost(0.70, m.make_features(handles=True))
assert strong['score'] > 0.75, 'HANDLES-matched candidate must outrank the unboosted one'
assert strong['breakdown']['handles'] > 0
# determinism / purity
assert m.apply_boost(0.70, m.make_features(handles=True)) == strong
"
  [ "$status" -eq 0 ]
}

@test "apply_boost: degree grows logarithmically, TESTS_FILE adds a small boost" {
  run mod_py "$RERANK_PY" "
d1 = m.apply_boost(0.5, m.make_features(call_degree=1))
d10 = m.apply_boost(0.5, m.make_features(call_degree=10))
d100 = m.apply_boost(0.5, m.make_features(call_degree=100))
assert d1['score'] < d10['score'] < d100['score']
assert d100['score'] - d10['score'] < d10['score'] - d1['score'], 'must grow log, not linear'
t = m.apply_boost(0.5, m.make_features(tests_file=True))
assert t['score'] > 0.5 and t['breakdown']['tests_file'] > 0
assert t['score'] < m.apply_boost(0.5, m.make_features(handles=True))['score']
"
  [ "$status" -eq 0 ]
}

@test "score_candidates: zero features degrade to embed order (stable)" {
  run mod_py "$RERANK_PY" "
cands = [
    {'key': 'repo@c:lib/first.ts:GET', 'embed_score': 0.81},
    {'key': 'repo@c:lib/second.ts:POST', 'embed_score': 0.64},
    {'key': 'repo@c:lib/third.ts:GET', 'embed_score': 0.52},
]
feats = {c['key']: m.zero_features() for c in cands}
ranked = m.score_candidates(cands, feats)
assert [r['key'] for r in ranked] == [c['key'] for c in cands], ranked
assert ranked[0]['score'] == 0.81
# with features, order flips accordingly
feats['repo@c:lib/third.ts:GET'] = m.make_features(handles=True)
ranked2 = m.score_candidates(cands, feats)
assert ranked2[0]['key'] == 'repo@c:lib/third.ts:GET', ranked2[0]
"
  [ "$status" -eq 0 ]
}

@test "cosine: identical unit vectors -> 1, orthogonal -> 0, zero vector safe" {
  run mod_py "$RERANK_PY" "
import math
a = [1.0, 0.0]
b = [1.0, 0.0]
c = [0.0, 1.0]
assert abs(m.cosine(a, b) - 1.0) < 1e-9
assert abs(m.cosine(a, c)) < 1e-9
assert m.cosine([0.0, 0.0], a) == 0.0
"
  [ "$status" -eq 0 ]
}

@test "manifest without a receipt id fails closed (sync path)" {
  run mod_py "$SYNC_PY" "
import sys
bad = {'schema_version': 'k3-embed-store/1', 'artifact': 'embed-index.jsonl',
       'corpus_sha256': 'abc', 'model': 'bge-m3', 'dim': 1024,
       'counts': {'vectors': 0}, 'updated_at': '2026-10-04T00:00:00+00:00'}
try:
    m.check_manifest(bad)
except Exception as exc:
    sys.exit(3)
sys.exit(1)
"
  [ "$status" -eq 3 ]
}

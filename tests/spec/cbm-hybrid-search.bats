#!/usr/bin/env bats
# tests/spec/cbm-hybrid-search.bats
# Ticket: T900993 (task A3) — 4-stage hybrid search (BM25 FTS + bge-m3 dense,
# RRF fusion, bge-reranker-v2-m3 cross-encoder, small graph boost).
#
# Contract (RED gate):
#   (a) rrf_fuse of two ranked lists is deterministic (k=60 standard) —
#       tested on a fixture with hand-computed scores
#   (b) zero rerank/graph features degrade exactly to fused order
#   (c) graph boost is a small last factor: capped below 0.15 so it cannot
#       invert a strong rerank gap — bound asserted
#   (d) the FTS query builder escapes FTS5 special chars (no MATCH syntax
#       error possible from user input)
#
# Network-free: exercised via `python3 -c` imports with fixtures.

bats_require_minimum_version 1.5.0

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
  HYBRID_PY="$REPO_ROOT/scripts/mcp/cbm-hybrid.py"
  TEST_DIR="$BATS_TEST_TMPDIR/hybrid-$$"
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

@test "rrf_fuse is deterministic standard RRF (k=60) on fixture lists" {
  run mod_py "$HYBRID_PY" "
a = ['a', 'b', 'c']
b = ['b', 'c', 'd']
fused = m.rrf_fuse([a, b])
assert [e['key'] for e in fused] == ['b', 'c', 'a', 'd'], fused
# hand-computed: score = sum(1/(60+rank)), ranks 1-based
exp = {
    'b': 1/62 + 1/61,
    'c': 1/63 + 1/62,
    'a': 1/61,
    'd': 1/63,
}
for e in fused:
    assert abs(e['fused_score'] - exp[e['key']]) < 1e-12, (e, exp[e['key']])
# deterministic: same inputs -> identical output (scores and order)
assert m.rrf_fuse([a, b]) == fused
# empty input -> empty output
assert m.rrf_fuse([]) == []
assert m.rrf_fuse([[], []]) == []
"
  [ "$status" -eq 0 ]
}

@test "rrf_fuse tie-breaks identical scores by key (stable, deterministic)" {
  run mod_py "$HYBRID_PY" "
fused = m.rrf_fuse([['b', 'a'], ['a', 'b']])
# a and b have identical RRF scores -> key asc wins
assert [e['key'] for e in fused] == ['a', 'b'], fused
assert fused[0]['fused_score'] == fused[1]['fused_score']
assert m.rrf_fuse([['b', 'a'], ['a', 'b']]) == fused
"
  [ "$status" -eq 0 ]
}

@test "zero rerank/graph features degrade exactly to fused order" {
  run mod_py "$HYBRID_PY" "
fused = m.rrf_fuse([['x', 'y', 'z'], ['y', 'x']])
final = m.apply_final_scores(fused)
assert [e['key'] for e in final] == [e['key'] for e in fused], final
for e, f in zip(final, fused):
    assert e['final'] == f['fused_score'], (e, f)
    assert e['boost'] == 0.0
# explicit zero features behave the same
final2 = m.apply_final_scores(fused, rerank_scores=None,
                              boosts_by_key={e['key']: 0.0 for e in fused})
assert [e['key'] for e in final2] == [e['key'] for e in fused]
"
  [ "$status" -eq 0 ]
}

@test "graph boost is capped below 0.15 and cannot invert a strong rerank gap" {
  run mod_py "$HYBRID_PY" "
assert m.GRAPH_BOOST_CAP < 0.15, m.GRAPH_BOOST_CAP
fused = [{'key': 'x', 'fused_score': 0.02},
         {'key': 'y', 'fused_score': 0.01}]
# adversarial: unbounded raw boost must be capped
final = m.apply_final_scores(
    fused,
    rerank_scores={'x': 0.90, 'y': 0.70},
    boosts_by_key={'x': 0.0, 'y': 999.0})
by_key = {e['key']: e for e in final}
assert by_key['y']['boost'] < 0.15, by_key['y']
assert by_key['x']['boost'] == 0.0
# 0.20 rerank gap survives the max boost -> order preserved
assert [e['key'] for e in final] == ['x', 'y'], final
assert by_key['x']['final'] > by_key['y']['final']
"
  [ "$status" -eq 0 ]
}

@test "escape_fts_query neutralizes FTS5 special chars" {
  run mod_py "$HYBRID_PY" "
out = m.escape_fts_query('bge-m3 (embed) \"route\":foo* bar^baz+qux -quux AND OR')
assert out == '\"bge\" OR \"m3\" OR \"embed\" OR \"route\" OR \"foo\" OR \"bar\" OR \"baz\" OR \"qux\" OR \"quux\" OR \"AND\" OR \"OR\"', out
# every token is double-quoted -> FTS5 parses them as literals, never as
# operators, column filters, or prefix queries
import re
assert re.fullmatch(r'\"[^\"]+\"( OR \"[^\"]+\")*', out), out
assert m.escape_fts_query('') == ''
assert m.escape_fts_query('   ') == ''
assert m.escape_fts_query(None) == ''
# single token stays a single quoted literal
assert m.escape_fts_query('auth') == '\"auth\"'
"
  [ "$status" -eq 0 ]
}

@test "parse_rerank_results maps index->score and degrades on malformed payloads" {
  run mod_py "$HYBRID_PY" "
got = m.parse_rerank_results(
    {'results': [{'index': 1, 'relevance_score': 0.3},
                 {'index': 0, 'relevance_score': 0.9}]}, 2)
assert got == {0: 0.9, 1: 0.3}, got
# gaps / malformed payloads degrade to empty (caller falls back to fused)
assert m.parse_rerank_results({'results': []}, 2) == {}
assert m.parse_rerank_results({}, 2) == {}
assert m.parse_rerank_results(None, 2) == {}
assert m.parse_rerank_results({'results': 'nope'}, 2) == {}
assert m.parse_rerank_results(
    {'results': [{'index': 'x', 'relevance_score': 0.5}]}, 1) == {}
"
  [ "$status" -eq 0 ]
}

@test "pure fusion layer does no IO (no subprocess/socket/open/sqlite)" {
  run mod_py "$HYBRID_PY" "
import inspect
for fn in (m.rrf_fuse, m.escape_fts_query, m.apply_final_scores,
           m.parse_rerank_results, m.dense_search):
    src = inspect.getsource(fn)
    for banned in ('subprocess', 'socket', 'open(', 'sqlite3', 'urlopen'):
        assert banned not in src, '%s must be pure, found %s' % (fn.__name__, banned)
"
  [ "$status" -eq 0 ]
}

@test "--no-boost passes fused order through with zero boosts (ablation)" {
  FIXDB="$TEST_DIR/fixture.db"
  EMPTYROOT="$TEST_DIR/emptyroot"
  mkdir -p "$EMPTYROOT"
  python3 - "$FIXDB" <<'PYEOF'
import sqlite3, sys
con = sqlite3.connect(sys.argv[1])
con.execute("CREATE TABLE nodes(id INTEGER PRIMARY KEY, name, qualified_name, label, file_path, properties)")
con.execute("CREATE VIRTUAL TABLE nodes_fts USING fts5(name, qualified_name, label, file_path)")
rows = [
    (1, "receipt_path", "proj.mod.receipt_path", "Function", "scripts/mcp/cbm-freshness.py", "{}"),
    (2, "validate_receipt", "proj.mod.validate_receipt", "Function", "scripts/mcp/cbm-freshness.py", "{}"),
    (3, "unrelated_helper", "proj.other.unrelated_helper", "Function", "scripts/util.py", "{}"),
]
con.executemany("INSERT INTO nodes(id,name,qualified_name,label,file_path,properties) VALUES (?,?,?,?,?,?)", rows)
con.executemany("INSERT INTO nodes_fts(rowid,name,qualified_name,label,file_path) VALUES (?,?,?,?,?)",
                [(r[0], r[1], r[2], r[3], r[4]) for r in rows])
con.commit()
con.close()
PYEOF
  RERANK_PY="$REPO_ROOT/scripts/mcp/cbm-graph-rerank.py"
  # --separate-stderr ist Pflicht (Repo-Konvention, vgl. ci-cd.bats): die
  # Query-Einbettung loggt Retries nach stderr (Gateway down -> Degradation);
  # stdout muss reines JSON bleiben, unabhaengig vom Gateway-Zustand.
  run --separate-stderr python3 "$RERANK_PY" --root "$EMPTYROOT" --project test-no-boost-probe hybrid \
    --query "freshness receipt" --db "$FIXDB" --top-k 3 --pool 10 \
    --no-rerank --no-boost
  [ "$status" -eq 0 ]
  printf '%s' "$output" | python3 -c "
import json, sys
d = json.load(sys.stdin)
assert 'boost-skipped:--no-boost' in d['warnings'], d['warnings']
assert d['stages']['fts']['hits'] >= 1, d['stages']
for r in d['results']:
    assert r['scores']['boost'] == 0.0, r
assert d['stages']['boosted']['max_boost'] == 0.0, d['stages']
"
  # control: same query without --no-boost must NOT carry the skip warning
  # (graph probes degrade to empty features with a probe warning instead)
  run --separate-stderr python3 "$RERANK_PY" --root "$EMPTYROOT" --project test-no-boost-probe hybrid \
    --query "freshness receipt" --db "$FIXDB" --top-k 3 --pool 10 \
    --no-rerank
  [ "$status" -eq 0 ]
  printf '%s' "$output" | python3 -c "
import json, sys
d = json.load(sys.stdin)
assert 'boost-skipped:--no-boost' not in d['warnings'], d['warnings']
"
}

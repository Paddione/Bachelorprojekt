"""Tests migrating CBM graph rerank and hybrid search specs to pytest:
- tests/spec/cbm-graph-rerank.bats
- tests/spec/cbm-hybrid-search.bats
"""

import importlib.util
import inspect
import json
import sqlite3
import subprocess
from pathlib import Path
import pytest


def _load_module(py_path: Path, mod_name: str):
    spec = importlib.util.spec_from_file_location(mod_name, py_path)
    assert spec is not None and spec.loader is not None
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


# ── cbm-graph-rerank.bats ──────────────────────────────────────────────────

def test_rerank_plan_sync_is_pure(repo_root: Path):
    sync_py = repo_root / "scripts" / "mcp" / "cbm-embed-sync.py"
    m = _load_module(sync_py, "cbm_embed_sync")

    def rec(h): return {'hash': h, 'model': 'bge-m3', 'dim': 2, 'vector': [1.0, 0.0]}
    store = {
        'repo@c1:lib/a.ts:GET': rec(m.content_hash('bge-m3', 'text-a')),
        'repo@c1:lib/b.ts:POST': rec(m.content_hash('bge-m3', 'text-b-OLD')),
        'repo@c1:lib/gone.ts:GET': rec(m.content_hash('bge-m3', 'text-gone')),
    }
    candidates = [
        {'key': 'repo@c2:lib/a.ts:GET', 'text': 'text-a'},
        {'key': 'repo@c2:lib/b.ts:POST', 'text': 'text-b-NEW'},
        {'key': 'repo@c2:lib/c.ts:GET', 'text': 'text-c'},
    ]
    plan = m.plan_sync(candidates, store, 'bge-m3')
    assert set(plan.keys()) == {'to_embed', 'to_prune', 'unchanged'}, plan.keys()
    assert [e['key'] for e in plan['to_embed']] == ['repo@c2:lib/b.ts:POST', 'repo@c2:lib/c.ts:GET'], plan['to_embed']
    assert {e['text'] for e in plan['to_embed']} == {'text-b-NEW', 'text-c'}
    assert plan['to_prune'] == ['repo@c1:lib/gone.ts:GET'], plan['to_prune']
    assert plan['unchanged'] == ['repo@c2:lib/a.ts:GET'], plan['unchanged']
    plan2 = m.plan_sync(candidates, store, 'bge-m3')
    assert plan == plan2


def test_rerank_plan_sync_no_io(repo_root: Path):
    sync_py = repo_root / "scripts" / "mcp" / "cbm-embed-sync.py"
    m = _load_module(sync_py, "cbm_embed_sync")

    src = inspect.getsource(m.plan_sync)
    for banned in ('urllib', 'requests', 'subprocess', 'socket', 'open('):
        assert banned not in src, f'plan_sync must be pure, found {banned}'

    store = {'repo@c1:lib/a.ts:GET': {'hash': m.content_hash('bge-m3', 't'),
                                      'model': 'bge-m3', 'dim': 2, 'vector': [1.0, 0.0]}}
    candidates = [{'key': 'repo@c2:lib/a.ts:GET', 'text': 't'}]
    plan_other = m.plan_sync(candidates, store, 'other-model')
    assert [e['key'] for e in plan_other['to_embed']] == ['repo@c2:lib/a.ts:GET'], plan_other
    plan = m.plan_sync(candidates, store, 'bge-m3')
    assert plan['unchanged'] == ['repo@c2:lib/a.ts:GET'], plan


def test_rerank_candidate_text_composers(repo_root: Path):
    sync_py = repo_root / "scripts" / "mcp" / "cbm-embed-sync.py"
    m = _load_module(sync_py, "cbm_embed_sync")

    t1 = m.route_text('components/website/src/pages/api/auth/callback.ts', 'GET')
    t2 = m.route_text('components/website/src/pages/api/auth/callback.ts', 'GET')
    assert t1 == t2 and 'GET' in t1 and 'auth/callback.ts' in t1, t1
    assert m.route_text('p.ts', None) == m.route_text('p.ts', None)
    doc = 'x' * 5000
    ft = m.function_text('proj.pkg.fn', doc)
    assert ft.startswith('proj.pkg.fn'), ft
    assert len(ft) < len('proj.pkg.fn') + 5000, 'docstring must be truncated'
    assert m.function_text('proj.pkg.fn', doc) == m.function_text('proj.pkg.fn', doc)


def test_rerank_apply_boost_pure(repo_root: Path):
    rerank_py = repo_root / "scripts" / "mcp" / "cbm-graph-rerank.py"
    m = _load_module(rerank_py, "cbm_graph_rerank")

    zero = m.zero_features()
    base_a = m.apply_boost(0.75, zero)
    assert base_a['score'] == 0.75, 'zero features must not change the embed score'
    assert base_a['boost'] == 0.0
    strong = m.apply_boost(0.70, m.make_features(handles=True))
    assert strong['score'] > 0.75, 'HANDLES-matched candidate must outrank the unboosted one'
    assert strong['breakdown']['handles'] > 0
    assert m.apply_boost(0.70, m.make_features(handles=True)) == strong


def test_rerank_apply_boost_growth_and_tests_file(repo_root: Path):
    rerank_py = repo_root / "scripts" / "mcp" / "cbm-graph-rerank.py"
    m = _load_module(rerank_py, "cbm_graph_rerank")

    d0 = m.apply_boost(0.5, m.make_features(call_degree=0))
    d50 = m.apply_boost(0.5, m.make_features(call_degree=50))
    d100 = m.apply_boost(0.5, m.make_features(call_degree=100))
    assert d0['score'] < d50['score'] < d100['score']
    assert d100['score'] - d50['score'] < d50['score'] - d0['score']
    t = m.apply_boost(0.5, m.make_features(tests_file=True))
    assert t['score'] > 0.5 and t['breakdown']['tests_file'] > 0
    assert t['score'] < m.apply_boost(0.5, m.make_features(handles=True))['score']


def test_rerank_score_candidates(repo_root: Path):
    rerank_py = repo_root / "scripts" / "mcp" / "cbm-graph-rerank.py"
    m = _load_module(rerank_py, "cbm_graph_rerank")

    cands = [
        {'key': 'repo@c:lib/first.ts:GET', 'embed_score': 0.81},
        {'key': 'repo@c:lib/third.ts:GET', 'embed_score': 0.72},
        {'key': 'repo@c:lib/second.ts:POST', 'embed_score': 0.64},
    ]
    feats = {c['key']: m.zero_features() for c in cands}
    ranked = m.score_candidates(cands, feats)
    assert [r['key'] for r in ranked] == [c['key'] for c in cands], ranked
    assert ranked[0]['score'] == 0.81

    feats['repo@c:lib/third.ts:GET'] = m.make_features(handles=True)
    ranked2 = m.score_candidates(cands, feats)
    assert ranked2[0]['key'] == 'repo@c:lib/third.ts:GET', ranked2[0]


def test_rerank_cosine_similarity(repo_root: Path):
    rerank_py = repo_root / "scripts" / "mcp" / "cbm-graph-rerank.py"
    m = _load_module(rerank_py, "cbm_graph_rerank")

    a = [1.0, 0.0]
    b = [1.0, 0.0]
    c = [0.0, 1.0]
    assert abs(m.cosine(a, b) - 1.0) < 1e-9
    assert abs(m.cosine(a, c)) < 1e-9
    assert m.cosine([0.0, 0.0], a) == 0.0


def test_rerank_manifest_without_receipt_fails_closed(repo_root: Path):
    sync_py = repo_root / "scripts" / "mcp" / "cbm-embed-sync.py"
    m = _load_module(sync_py, "cbm_embed_sync")

    bad = {'schema_version': 'k3-embed-store/1', 'artifact': 'embed-index.jsonl',
           'corpus_sha256': 'abc', 'model': 'bge-m3', 'dim': 1024,
           'counts': {'vectors': 0}, 'updated_at': '2026-10-04T00:00:00+00:00'}
    with pytest.raises(Exception):
        m.check_manifest(bad)


# ── cbm-hybrid-search.bats ──────────────────────────────────────────────────

def test_hybrid_rrf_fuse_deterministic(repo_root: Path):
    hybrid_py = repo_root / "scripts" / "mcp" / "cbm-hybrid.py"
    m = _load_module(hybrid_py, "cbm_hybrid")

    a = ['a', 'b', 'c']
    b = ['b', 'c', 'd']
    fused = m.rrf_fuse([a, b])
    assert [e['key'] for e in fused] == ['b', 'c', 'a', 'd'], fused
    exp = {
        'b': 1/62 + 1/61,
        'c': 1/63 + 1/62,
        'a': 1/61,
        'd': 1/63,
    }
    for e in fused:
        assert abs(e['fused_score'] - exp[e['key']]) < 1e-12, (e, exp[e['key']])
    assert m.rrf_fuse([a, b]) == fused
    assert m.rrf_fuse([]) == []
    assert m.rrf_fuse([[], []]) == []


def test_hybrid_rrf_fuse_tie_break(repo_root: Path):
    hybrid_py = repo_root / "scripts" / "mcp" / "cbm-hybrid.py"
    m = _load_module(hybrid_py, "cbm_hybrid")

    fused = m.rrf_fuse([['b', 'a'], ['a', 'b']])
    assert [e['key'] for e in fused] == ['a', 'b'], fused
    assert fused[0]['fused_score'] == fused[1]['fused_score']
    assert m.rrf_fuse([['b', 'a'], ['a', 'b']]) == fused


def test_hybrid_zero_features_degrade_to_fused_order(repo_root: Path):
    hybrid_py = repo_root / "scripts" / "mcp" / "cbm-hybrid.py"
    m = _load_module(hybrid_py, "cbm_hybrid")

    fused = m.rrf_fuse([['x', 'y', 'z'], ['y', 'x']])
    final = m.apply_final_scores(fused)
    assert [e['key'] for e in final] == [e['key'] for e in fused], final
    for e, f in zip(final, fused):
        assert e['final'] == f['fused_score'], (e, f)
        assert e['boost'] == 0.0

    final2 = m.apply_final_scores(fused, rerank_scores=None,
                                  boosts_by_key={e['key']: 0.0 for e in fused})
    assert [e['key'] for e in final2] == [e['key'] for e in fused]


def test_hybrid_graph_boost_capped_below_15_percent(repo_root: Path):
    hybrid_py = repo_root / "scripts" / "mcp" / "cbm-hybrid.py"
    m = _load_module(hybrid_py, "cbm_hybrid")

    assert m.GRAPH_BOOST_CAP < 0.15, m.GRAPH_BOOST_CAP
    fused = [{'key': 'x', 'fused_score': 0.02},
             {'key': 'y', 'fused_score': 0.01}]
    final = m.apply_final_scores(
        fused,
        rerank_scores={'x': 0.90, 'y': 0.70},
        boosts_by_key={'x': 0.0, 'y': 999.0})
    by_key = {e['key']: e for e in final}
    assert by_key['y']['boost'] < 0.15, by_key['y']
    assert by_key['x']['boost'] == 0.0
    assert [e['key'] for e in final] == ['x', 'y'], final
    assert by_key['x']['final'] > by_key['y']['final']


def test_hybrid_escape_fts_query(repo_root: Path):
    hybrid_py = repo_root / "scripts" / "mcp" / "cbm-hybrid.py"
    m = _load_module(hybrid_py, "cbm_hybrid")

    out = m.escape_fts_query('bge-m3 (embed) "route":foo* bar^baz+qux -quux AND OR')
    assert out == '"bge" OR "m3" OR "embed" OR "route" OR "foo" OR "bar" OR "baz" OR "qux" OR "quux" OR "AND" OR "OR"', out
    import re
    assert re.fullmatch(r'"[^"]+"( OR "[^"]+")*', out), out
    assert m.escape_fts_query('') == ''
    assert m.escape_fts_query('   ') == ''
    assert m.escape_fts_query(None) == ''
    assert m.escape_fts_query('auth') == '"auth"'


def test_hybrid_parse_rerank_results(repo_root: Path):
    hybrid_py = repo_root / "scripts" / "mcp" / "cbm-hybrid.py"
    m = _load_module(hybrid_py, "cbm_hybrid")

    got = m.parse_rerank_results(
        {'results': [{'index': 1, 'relevance_score': 0.3},
                     {'index': 0, 'relevance_score': 0.9}]}, 2)
    assert got == {0: 0.9, 1: 0.3}, got
    assert m.parse_rerank_results({'results': []}, 2) == {}
    assert m.parse_rerank_results({}, 2) == {}
    assert m.parse_rerank_results(None, 2) == {}
    assert m.parse_rerank_results({'results': 'nope'}, 2) == {}
    assert m.parse_rerank_results(
        {'results': [{'index': 'x', 'relevance_score': 0.5}]}, 1) == {}


def test_hybrid_pure_fusion_layer_no_io(repo_root: Path):
    hybrid_py = repo_root / "scripts" / "mcp" / "cbm-hybrid.py"
    m = _load_module(hybrid_py, "cbm_hybrid")

    for fn in (m.rrf_fuse, m.escape_fts_query, m.apply_final_scores,
               m.parse_rerank_results, m.dense_search):
        src = inspect.getsource(fn)
        for banned in ('subprocess', 'socket', 'open(', 'sqlite3', 'urlopen'):
            assert banned not in src, f'{fn.__name__} must be pure, found {banned}'


def test_hybrid_no_boost_ablation(repo_root: Path, tmp_path: Path):
    fixdb = tmp_path / "fixture.db"
    emptyroot = tmp_path / "emptyroot"
    emptyroot.mkdir(parents=True, exist_ok=True)

    con = sqlite3.connect(str(fixdb))
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

    rerank_py = repo_root / "scripts" / "mcp" / "cbm-graph-rerank.py"
    res = subprocess.run([
        "python3", str(rerank_py),
        "--root", str(emptyroot),
        "--project", "test-no-boost-probe",
        "hybrid",
        "--query", "freshness receipt",
        "--db", str(fixdb),
        "--top-k", "3",
        "--pool", "10",
        "--no-rerank",
        "--no-boost"
    ], capture_output=True, text=True)
    assert res.returncode == 0, f"Error running rerank hybrid: {res.stderr}"
    d = json.loads(res.stdout)
    assert 'boost-skipped:--no-boost' in d['warnings']
    assert d['stages']['fts']['hits'] >= 1
    for r in d['results']:
        assert r['scores']['boost'] == 0.0
    assert d['stages']['boosted']['max_boost'] == 0.0

    res2 = subprocess.run([
        "python3", str(rerank_py),
        "--root", str(emptyroot),
        "--project", "test-no-boost-probe",
        "hybrid",
        "--query", "freshness receipt",
        "--db", str(fixdb),
        "--top-k", "3",
        "--pool", "10",
        "--no-rerank"
    ], capture_output=True, text=True)
    assert res2.returncode == 0
    d2 = json.loads(res2.stdout)
    assert 'boost-skipped:--no-boost' not in d2['warnings']

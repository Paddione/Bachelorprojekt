"""Tests migrating CBM store, sync, eval, and freshness probe specs to pytest:
- tests/spec/cbm-embed-store.bats
- tests/spec/cbm-embed-sync-A2.bats
- tests/spec/cbm-eval.bats
- tests/spec/cbm-freshness-probe.bats
"""

import importlib.util
import inspect
import json
import os
import subprocess
import types
from pathlib import Path
import pytest


def _load_module(py_path: Path, mod_name: str):
    spec = importlib.util.spec_from_file_location(mod_name, py_path)
    assert spec is not None and spec.loader is not None
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


# ── cbm-embed-store.bats ───────────────────────────────────────────────────

def test_cbm_store_content_hash(repo_root: Path):
    store_py = repo_root / "scripts" / "mcp" / "cbm-embed-store.py"
    m = _load_module(store_py, "cbm_embed_store")

    h1 = m.content_hash('bge-m3', 'ROUTE GET components/website/src/pages/api/auth/callback.ts')
    h2 = m.content_hash('bge-m3', 'ROUTE GET components/website/src/pages/api/auth/callback.ts')
    h3 = m.content_hash('bge-m3', 'ROUTE POST components/website/src/pages/api/auth/callback.ts')
    h4 = m.content_hash('other-model', 'ROUTE GET components/website/src/pages/api/auth/callback.ts')
    assert h1 == h2, 'same text+model must hash equal'
    assert h1 != h3, 'different text must hash differently'
    assert h1 != h4, 'model bump must invalidate the hash'
    assert len(h1) == 64, 'sha256 hex digest'


def test_cbm_store_key_scheme_and_identity(repo_root: Path):
    store_py = repo_root / "scripts" / "mcp" / "cbm-embed-store.py"
    m = _load_module(store_py, "cbm_embed_store")

    key = m.make_key('repo', '8fed539b', 'lib/auth.ts', 'GET')
    assert key == 'repo@8fed539b:lib/auth.ts:GET', key
    assert m.identity_of(key) == 'lib/auth.ts:GET', m.identity_of(key)
    assert m.identity_of(m.make_key('repo', 'HEAD2', 'lib/auth.ts', 'GET')) == 'lib/auth.ts:GET'
    assert m.identity_of('plain-key') == 'plain-key'


def test_cbm_store_upsert_line_per_vector(repo_root: Path, tmp_path: Path):
    store_py = repo_root / "scripts" / "mcp" / "cbm-embed-store.py"
    m = _load_module(store_py, "cbm_embed_store")

    art = str(tmp_path / "embed-index.jsonl")
    recs = {
        'repo@c1:lib/auth.ts:GET': {'hash': m.content_hash('bge-m3', 't1'), 'model': 'bge-m3', 'dim': 4, 'vector': [0.1, 0.2, 0.3, 0.4]},
        'repo@c1:lib/billing.ts:POST': {'hash': m.content_hash('bge-m3', 't2'), 'model': 'bge-m3', 'dim': 4, 'vector': [0.5, 0.6, 0.7, 0.8]},
    }
    n = m.upsert(art, recs)
    assert n == 2, n
    lines = [l for l in open(art, encoding='utf-8').read().splitlines() if l.strip()]
    assert len(lines) == 2, 'line-per-vector'
    rows = [json.loads(l) for l in lines]
    for row in rows:
        for field in ('key', 'hash', 'model', 'dim', 'vector'):
            assert field in row, row
    by_key = {r['key']: r for r in rows}
    assert by_key['repo@c1:lib/auth.ts:GET']['vector'] == [0.1, 0.2, 0.3, 0.4]

    recs2 = {
        'repo@c1:lib/auth.ts:GET': {'hash': m.content_hash('bge-m3', 't1b'), 'model': 'bge-m3', 'dim': 4, 'vector': [0.9, 0.9, 0.9, 0.9]},
        'repo@c1:lib/new.ts:GET': {'hash': m.content_hash('bge-m3', 't3'), 'model': 'bge-m3', 'dim': 4, 'vector': [1.0, 0.0, 0.0, 0.0]},
    }
    n2 = m.upsert(art, recs2)
    assert n2 == 3, n2
    store = m.load_artifact(art)
    assert store['repo@c1:lib/auth.ts:GET']['vector'] == [0.9, 0.9, 0.9, 0.9]
    assert store['repo@c1:lib/new.ts:GET']['hash'] == m.content_hash('bge-m3', 't3')


def test_cbm_store_diff_by_hash(repo_root: Path):
    store_py = repo_root / "scripts" / "mcp" / "cbm-embed-store.py"
    m = _load_module(store_py, "cbm_embed_store")

    ha = m.content_hash('bge-m3', 'text-a')
    hb_old = m.content_hash('bge-m3', 'text-b-old')
    hb_new = m.content_hash('bge-m3', 'text-b-new')
    hc = m.content_hash('bge-m3', 'text-c')
    store = {
        'repo@c1:lib/a.ts:GET': {'hash': ha, 'model': 'bge-m3', 'dim': 2, 'vector': [1.0, 0.0]},
        'repo@c1:lib/b.ts:POST': {'hash': hb_old, 'model': 'bge-m3', 'dim': 2, 'vector': [0.0, 1.0]},
        'repo@c1:lib/gone.ts:GET': {'hash': hc, 'model': 'bge-m3', 'dim': 2, 'vector': [1.0, 1.0]},
    }
    candidates = {
        'repo@c2:lib/a.ts:GET': ha,
        'repo@c2:lib/b.ts:POST': hb_new,
        'repo@c2:lib/c.ts:GET': hc,
    }
    d = m.diff_by_hash(candidates, store)
    assert d['to_embed'] == ['repo@c2:lib/b.ts:POST', 'repo@c2:lib/c.ts:GET'], d['to_embed']
    assert d['unchanged'] == ['repo@c2:lib/a.ts:GET'], d['unchanged']
    assert d['to_prune'] == ['repo@c1:lib/gone.ts:GET'], d['to_prune']


def test_cbm_store_prune_stale(repo_root: Path):
    store_py = repo_root / "scripts" / "mcp" / "cbm-embed-store.py"
    m = _load_module(store_py, "cbm_embed_store")

    ha = m.content_hash('bge-m3', 'text-a')
    hb = m.content_hash('bge-m3', 'text-b')
    store = {
        'repo@c1:lib/a.ts:GET': {'hash': ha, 'model': 'bge-m3', 'dim': 2, 'vector': [1.0, 0.0]},
        'repo@c1:lib/b.ts:POST': {'hash': hb, 'model': 'bge-m3', 'dim': 2, 'vector': [0.0, 1.0]},
    }
    kept, pruned = m.prune_stale(store, ['repo@c2:lib/a.ts:GET'])
    assert list(kept) == ['repo@c1:lib/a.ts:GET'], kept
    assert pruned == ['repo@c1:lib/b.ts:POST'], pruned
    kept_all, pruned_none = m.prune_stale(store, ['repo@c2:lib/a.ts:GET', 'repo@c2:lib/b.ts:POST'])
    assert len(kept_all) == 2 and pruned_none == []


def test_cbm_store_manifest_records(repo_root: Path, tmp_path: Path):
    store_py = repo_root / "scripts" / "mcp" / "cbm-embed-store.py"
    m = _load_module(store_py, "cbm_embed_store")

    mpath = str(tmp_path / "embed-manifest.json")
    man = m.make_manifest(
        corpus_sha256='d8b03c5981a7f4dd43675001e9b49f19856de309cc41d076792e4f81fdeccffd',
        receipt_id='2026-10-04T10:00:00+00:00',
        receipt_timestamp='2026-10-04T10:00:00+00:00',
        model='bge-m3', dim=1024, vectors=1866)
    m.write_manifest(mpath, man)
    loaded = m.load_manifest(mpath)
    assert loaded['corpus_sha256'] == 'd8b03c5981a7f4dd43675001e9b49f19856de309cc41d076792e4f81fdeccffd'
    assert loaded['receipt_id'] == '2026-10-04T10:00:00+00:00'
    assert loaded['receipt_timestamp'] == '2026-10-04T10:00:00+00:00'
    assert loaded['model'] == 'bge-m3'
    assert loaded['dim'] == 1024
    assert loaded['counts']['vectors'] == 1866
    m.validate_manifest(loaded)


def test_cbm_store_corrupted_artifact_fails_closed(repo_root: Path, tmp_path: Path):
    store_py = repo_root / "scripts" / "mcp" / "cbm-embed-store.py"
    m = _load_module(store_py, "cbm_embed_store")

    store_dir = tmp_path / ".codebase-memory"
    store_dir.mkdir(parents=True, exist_ok=True)
    art_file = store_dir / "embed-index.jsonl"
    art_file.write_text(
        '{"key":"repo@c1:lib/a.ts:GET","hash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","model":"bge-m3","dim":2,"vector":[1.0,0.0]}\n'
        '{"key":"repo@c1:lib/broken\n',
        encoding="utf-8"
    )

    with pytest.raises(m.EmbedStoreError):
        m.load_artifact(str(art_file))

    man_file = store_dir / "embed-manifest.json"
    m.write_manifest(str(man_file), m.make_manifest(
        corpus_sha256='abc', receipt_id='r-1', receipt_timestamp='2026-10-04T10:00:00+00:00',
        model='bge-m3', dim=2, vectors=2))

    res = subprocess.run(["python3", str(store_py), "verify", "--root", str(tmp_path)], capture_output=True, text=True)
    assert res.returncode != 0
    assert "artifact" in res.stdout or "artifact" in res.stderr


def test_cbm_store_cli_verify_well_formed(repo_root: Path, tmp_path: Path):
    store_py = repo_root / "scripts" / "mcp" / "cbm-embed-store.py"
    m = _load_module(store_py, "cbm_embed_store")

    store_dir = tmp_path / ".codebase-memory"
    store_dir.mkdir(parents=True, exist_ok=True)
    art = str(store_dir / "embed-index.jsonl")
    recs = {
        'repo@c1:lib/auth.ts:GET': {'hash': m.content_hash('bge-m3', 't1'), 'model': 'bge-m3', 'dim': 2, 'vector': [0.25, 0.5]},
    }
    m.upsert(art, recs)
    m.write_manifest(str(store_dir / "embed-manifest.json"), m.make_manifest(
        corpus_sha256='abc', receipt_id='r-1', receipt_timestamp='2026-10-04T10:00:00+00:00',
        model='bge-m3', dim=2, vectors=1))

    res = subprocess.run(["python3", str(store_py), "verify", "--root", str(tmp_path)], capture_output=True, text=True)
    assert res.returncode == 0
    d = json.loads(res.stdout)
    assert d["vectors"] == 1
    assert d["model"] == "bge-m3"


# ── cbm-embed-sync-A2.bats ──────────────────────────────────────────────────

def test_cbm_sync_build_candidates_shape(repo_root: Path):
    sync_py = repo_root / "scripts" / "mcp" / "cbm-embed-sync.py"
    m = _load_module(sync_py, "cbm_embed_sync")

    routes = [('GET', 'lib/a.ts')]
    functions = [('proj.lib.f', 'lib/a.ts', 'Does f.')]
    cands = m.build_candidates(routes, functions, 'repo', 'c1')
    assert len(cands) == 2, cands
    assert {c['kind'] for c in cands} == {'route', 'function'}


def test_cbm_sync_build_candidates_excludes(repo_root: Path):
    sync_py = repo_root / "scripts" / "mcp" / "cbm-embed-sync.py"
    m = _load_module(sync_py, "cbm_embed_sync")

    routes = []
    functions = [
        ('proj.a.min', 'lib/app.min.js', 'd', None),
        ('proj.a.bundle', 'lib/app.bundle.js', 'd', None),
        ('proj.a.asset', 'assets/logo/data.js', 'd', None),
        ('proj.a.nm', 'node_modules/pkg/index.js', 'd', None),
        ('proj.a.dist', 'components/website/dist/out.js', 'd', None),
        ('proj.a.wt', '.worktrees/other/lib/x.js', 'd', None),
        ('proj.builtins.str', '<python-builtins>', 'd', None),
        ('proj.a.ok', 'lib/keep.js', 'd', None),
    ]
    methods = [('proj.m.min', 'lib/vendor.min.js', None, '(self)', None)]
    classes = [('proj.C', 'components/website/node_modules/pkg/c.js', None, None, 'Class')]
    sections = [('proj.s', 'assets/docs/g.md', '1', '2', 'H')]
    cands = m.build_candidates(routes, functions, 'repo', 'c1', methods, classes, sections)
    assert [c['symbol'] for c in cands] == ['proj.a.ok'], [c['symbol'] for c in cands]
    c2 = m.build_candidates([], [('proj.b', 'components/website/public/brand/x/svg.js', 'd', None)], 'repo', 'c1')
    assert len(c2) == 1, c2


def test_cbm_sync_text_composers(repo_root: Path):
    sync_py = repo_root / "scripts" / "mcp" / "cbm-embed-sync.py"
    m = _load_module(sync_py, "cbm_embed_sync")

    ft0 = m.function_text('proj.pkg.fn', 'Does things.')
    assert ft0.startswith('proj.pkg.fn'), ft0
    ft1 = m.function_text('proj.pkg.fn', 'Does things.', '(a: int, b: str)')
    assert 'proj.pkg.fn' in ft1 and '(a: int, b: str)' in ft1 and 'Does things.' in ft1, ft1
    big_doc = 'x' * 5000
    assert len(m.function_text('q.fn', big_doc, '(a: int)')) <= 1500, 'total cap ~1500'
    assert len(m.function_text('q.fn', big_doc)) <= 2500
    mt = m.method_text('proj.C.run', 'Runs it.', '(self, x: int)', 'proj.C')
    assert 'proj.C.run' in mt and '(self, x: int)' in mt and 'proj.C' in mt and 'Runs it.' in mt, mt
    ct = m.class_text('proj.lib.Handler', 'Serves reviews.', '[BaseHandler]', 'Class')
    assert 'proj.lib.Handler' in ct and 'BaseHandler' in ct and 'Serves reviews.' in ct, ct
    it = m.class_text('proj.lib.Options', None, None, 'Interface')
    assert 'proj.lib.Options' in it and 'INTERFACE' in it, it
    assert len(m.method_text('q.m', big_doc, '(self)')) <= 1500
    assert len(m.class_text('q.C', big_doc)) <= 1500


def test_cbm_sync_section_text(repo_root: Path):
    sync_py = repo_root / "scripts" / "mcp" / "cbm-embed-sync.py"
    m = _load_module(sync_py, "cbm_embed_sync")

    st = m.section_text('proj.docs.guide.Install', 'Install', 'docs/guide.md', '3', '4')
    assert 'Install' in st and 'docs/guide.md' in st, st
    assert '3' in st, st
    big_name = 'H' * 5000
    assert len(m.section_text('proj.q.' + big_name, big_name, 'docs/g.md', '1', '2')) <= 1600
    cands = m.build_candidates([], [], 'repo', 'c1', [], [],
        [('proj.docs.guide.Install', 'docs/guide.md', '3', '4', 'Install')])
    assert len(cands) == 1
    sec = cands[0]
    assert sec['kind'] == 'section', sec
    assert sec['symbol'] == 'section:proj.docs.guide.Install#3', sec['symbol']
    assert sec['key'] == 'repo@c1:docs/guide.md:section:proj.docs.guide.Install#3', sec['key']


def test_cbm_sync_plan_sync_diff(repo_root: Path):
    sync_py = repo_root / "scripts" / "mcp" / "cbm-embed-sync.py"
    m = _load_module(sync_py, "cbm_embed_sync")

    def rec(h): return {'hash': h, 'model': 'bge-m3', 'dim': 2, 'vector': [1.0, 0.0]}
    store = {
        'repo@c1:lib/a.ts:fn_a': rec(m.content_hash('bge-m3', 'text-a')),
        'repo@c1:lib/b.ts:fn_b': rec(m.content_hash('bge-m3', 'text-b-OLD')),
    }
    candidates = [
        {'key': 'repo@c2:lib/a.ts:fn_a', 'text': 'text-a'},
        {'key': 'repo@c2:lib/b.ts:fn_b', 'text': 'text-b-NEW'},
        {'key': 'repo@c2:docs/g.md:section:proj.s#3', 'text': 'SECTION H'},
    ]
    plan = m.plan_sync(candidates, store, 'bge-m3')
    assert [e['key'] for e in plan['to_embed']] == ['repo@c2:docs/g.md:section:proj.s#3', 'repo@c2:lib/b.ts:fn_b'], plan
    assert plan['unchanged'] == ['repo@c2:lib/a.ts:fn_a'], plan
    bump = m.plan_sync(candidates, store, 'other-model')
    assert len(bump['to_embed']) == 3 and bump['unchanged'] == [], bump


def test_cbm_sync_shard_batches(repo_root: Path):
    sync_py = repo_root / "scripts" / "mcp" / "cbm-embed-sync.py"
    m = _load_module(sync_py, "cbm_embed_sync")

    assert m.shard_batches(5, ['a']) == ['a'] * 5
    assert m.shard_batches(5, ['a', 'b']) == ['a', 'b', 'a', 'b', 'a']
    assert m.shard_batches(0, ['a', 'b']) == []
    with pytest.raises(m.SyncError, match="embed-no-endpoints"):
        m.shard_batches(3, [])


def test_cbm_sync_merge_pairs(repo_root: Path):
    sync_py = repo_root / "scripts" / "mcp" / "cbm-embed-sync.py"
    m = _load_module(sync_py, "cbm_embed_sync")

    store = {'k-old': {'hash': 'h', 'model': 'bge-m3', 'dim': 2, 'vector': [0.1, 0.2]}}
    pairs = [('k-new', 'TEXT', [0.5, 0.6])]
    out = m.merge_pairs(store, pairs, 'bge-m3')
    assert out['k-old'] == store['k-old'], 'untouched keys keep their record'
    assert out['k-new']['hash'] == m.content_hash('bge-m3', 'TEXT')
    assert out['k-new']['dim'] == 2 and out['k-new']['vector'] == [0.5, 0.6]
    assert store == {'k-old': store['k-old']}, 'input store not mutated'


def test_cbm_sync_resolve_embed_urls(repo_root: Path, monkeypatch: pytest.MonkeyPatch):
    sync_py = repo_root / "scripts" / "mcp" / "cbm-embed-sync.py"
    m = _load_module(sync_py, "cbm_embed_sync")

    a = types.SimpleNamespace(embed_urls='http://x:1,http://y:2', embed_url='http://solo')
    assert m.resolve_embed_urls(a) == ['http://x:1', 'http://y:2']
    b = types.SimpleNamespace(embed_urls=None, embed_url='http://solo')
    monkeypatch.delenv('LLM_EMBED_URLS', raising=False)
    assert m.resolve_embed_urls(b) == ['http://solo']
    monkeypatch.setenv('LLM_EMBED_URLS', 'http://e1, http://e2')
    assert m.resolve_embed_urls(b) == ['http://e1', 'http://e2']


def test_cbm_sync_embed_texts_fanout(repo_root: Path):
    sync_py = repo_root / "scripts" / "mcp" / "cbm-embed-sync.py"
    m = _load_module(sync_py, "cbm_embed_sync")

    seen = []
    def fake_batch(texts, url, model, timeout):
        seen.append(url)
        return [[float(len(t))] for t in texts]

    m.embed_batch = fake_batch
    m.EMBED_BATCH = 4
    texts = ['t%d' % i for i in range(10)]
    got_calls = []
    vecs = m.embed_texts(texts, ['http://a', 'http://b'], 'bge-m3',
                         on_batch=lambda pairs: got_calls.extend(pairs))
    assert vecs == [[2.0]] * 10, vecs
    assert sorted(set(seen)) == ['http://a/v1/embeddings', 'http://b/v1/embeddings'], seen
    assert sorted(i for i, _ in got_calls) == list(range(10)), got_calls

    seen.clear()
    m.embed_batch = fake_batch
    vecs1 = m.embed_texts(texts, 'http://solo', 'bge-m3')
    assert vecs1 == vecs and seen == ['http://solo/v1/embeddings'] * 3, seen


def test_cbm_sync_cli_resolves_freshness_state(repo_root: Path):
    sync_py = repo_root / "scripts" / "mcp" / "cbm-embed-sync.py"
    m = _load_module(sync_py, "cbm_embed_sync")

    for fn in (m.cmd_status, m.cmd_sync):
        src = inspect.getsource(fn)
        assert 'GRAPH.GRAPH' not in src, 'double indirection in ' + fn.__name__
        assert 'GRAPH.freshness_state' in src, 'freshness probe missing in ' + fn.__name__
    assert callable(m.GRAPH.freshness_state), 'graph layer must expose freshness_state'


# ── cbm-eval.bats ───────────────────────────────────────────────────────────

def test_cbm_eval_recall_and_mrr_math(repo_root: Path):
    eval_py = repo_root / "scripts" / "mcp" / "cbm-eval.py"
    m = _load_module(eval_py, "cbm_eval")

    r = m.score_ranking(['a', 'b', 'c'], ['a', 'X', 'b', 'Y', 'c'], k=10)
    assert r['recall@10'] == 1.0, r
    assert abs(r['mrr@10'] - 1.0) < 1e-9, r

    r2 = m.score_ranking(['b', 'c'], ['a', 'X', 'b', 'Y', 'c'], k=10)
    assert r2['recall@10'] == 1.0, r2
    assert abs(r2['mrr@10'] - 1.0/3) < 1e-9, r2

    r3 = m.score_ranking(['zzz'], ['a', 'X', 'b'], k=2)
    assert r3['recall@2'] == 0.0 and r3['mrr@2'] == 0.0, r3

    r4 = m.score_ranking(['b'], ['a', 'X', 'b'], k=2)
    assert r4['recall@2'] == 0.0 and r4['mrr@2'] == 0.0, r4

    r5 = m.score_ranking(['a', 'zzz'], ['a', 'X'], k=2)
    assert r5['recall@2'] == 0.5, r5
    assert abs(r5['mrr@2'] - 1.0) < 1e-9, r5


def test_cbm_eval_normalize_path(repo_root: Path):
    eval_py = repo_root / "scripts" / "mcp" / "cbm-eval.py"
    m = _load_module(eval_py, "cbm_eval")

    assert m.normalize_path('components/website/src/lib/auth.ts') == 'components/website/src/lib/auth.ts'
    assert m.normalize_path('repo@8fed539:components/website/src/lib/auth.ts:GET') == 'components/website/src/lib/auth.ts'
    assert m.normalize_path('repo@c:lib/a.ts:exchangeCode') == 'lib/a.ts'

    got = m.extract_paths([{'key': 'repo@c:lib/a.ts:GET'}, {'path': 'docs/x.md'}, 'plain/y.ts'])
    assert got == ['lib/a.ts', 'docs/x.md', 'plain/y.ts'], got


def test_cbm_eval_ablation_delta(repo_root: Path):
    eval_py = repo_root / "scripts" / "mcp" / "cbm-eval.py"
    m = _load_module(eval_py, "cbm_eval")

    def ok(r, mrr): return {'status': 'ok', 'recall': r, 'mrr': mrr, 'n': 5, 'by_kind': {}}
    ab = m.ablation_delta({'+graph-boost': ok(0.8, 0.6), 'fused': ok(0.7, 0.5)})
    assert abs(ab['delta_mrr'] - 0.1) < 1e-9, ab
    assert abs(ab['delta_recall'] - 0.1) < 1e-9, ab
    assert ab['baseline'] == 'fused' and 'HELPS' in ab['verdict'], ab

    ab2 = m.ablation_delta({'fused': ok(0.7, 0.5)})
    assert ab2['delta_mrr'] is None and ab2['delta_recall'] is None, ab2
    assert 'INCONCLUSIVE' in ab2['verdict'], ab2

    ab3 = m.ablation_delta({'+graph-boost': ok(0.7, 0.505), 'fused': ok(0.7, 0.5)})
    assert 'NEUTRAL' in ab3['verdict'], ab3


def test_cbm_eval_evaluate_aggregates(repo_root: Path):
    eval_py = repo_root / "scripts" / "mcp" / "cbm-eval.py"
    m = _load_module(eval_py, "cbm_eval")

    rows = [
        {'id': 'q1', 'kind': 'code', 'expected_paths': ['a']},
        {'id': 'q2', 'kind': 'doc', 'expected_paths': ['b']},
    ]
    ranked = {
        'q1': {'fused': ['a', 'x'], '+graph-boost': ['x', 'a']},
        'q2': {'fused': ['y', 'b']},
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
    assert rep['ablation']['delta_mrr'] is not None


def test_cbm_eval_cli_replays_fixtures(repo_root: Path, tmp_path: Path):
    eval_py = repo_root / "scripts" / "mcp" / "cbm-eval.py"

    eval_jsonl = tmp_path / "eval.jsonl"
    eval_jsonl.write_text(
        '{"id":"q1","query":"auth session","kind":"code","expected_paths":["lib/auth.ts"],"notes":"t"}\n'
        '{"id":"q2","query":"invoice hash","kind":"code","expected_paths":["lib/invoice-hash.ts"],"notes":"t"}\n',
        encoding="utf-8"
    )
    results_json = tmp_path / "results.json"
    results_json.write_text(
        '{"q1":{"fused":["lib/auth.ts","x"],"dense-only":["x","lib/auth.ts"]},"q2":{"fused":["y","lib/invoice-hash.ts"],"dense-only":["lib/invoice-hash.ts"]}}',
        encoding="utf-8"
    )
    rep_json = tmp_path / "report.json"
    rep_md = tmp_path / "report.md"

    res = subprocess.run([
        "python3", str(eval_py), "run",
        "--eval", str(eval_jsonl),
        "--results", str(results_json),
        "--stages", "fused,dense-only",
        "--json", str(rep_json),
        "--md", str(rep_md)
    ], capture_output=True, text=True)
    assert res.returncode == 0
    md_content = rep_md.read_text(encoding="utf-8")
    assert "| fused | 1.000 | 0.750 |" in md_content
    assert "Ablation" in md_content

    rep = json.loads(rep_json.read_text(encoding="utf-8"))
    assert rep['stages']['fused']['mrr'] == 0.75
    assert rep['stages']['dense-only']['mrr'] == 0.75
    assert rep['n_queries'] == 2


def test_cbm_eval_cli_fails_closed_missing_ranker(repo_root: Path, tmp_path: Path):
    eval_py = repo_root / "scripts" / "mcp" / "cbm-eval.py"

    eval_jsonl = tmp_path / "eval.jsonl"
    eval_jsonl.write_text(
        '{"id":"q1","query":"auth session","kind":"code","expected_paths":["lib/auth.ts"],"notes":"t"}\n',
        encoding="utf-8"
    )
    res = subprocess.run([
        "python3", str(eval_py), "run",
        "--eval", str(eval_jsonl),
        "--ranker-cmd", "/nonexistent/ranker-cmd --stage foo",
        "--stages", "fused"
    ], capture_output=True, text=True)
    assert res.returncode != 0
    assert "| fused | 0.000" not in res.stdout


def test_cbm_eval_cli_rejects_empty_expected(repo_root: Path, tmp_path: Path):
    eval_py = repo_root / "scripts" / "mcp" / "cbm-eval.py"

    bad_jsonl = tmp_path / "bad.jsonl"
    bad_jsonl.write_text(
        '{"id":"q1","query":"vague","kind":"doc","expected_paths":[],"notes":"t"}\n',
        encoding="utf-8"
    )
    r_json = tmp_path / "r.json"
    r_json.write_text('{"q1":{"fused":["a"]}}', encoding="utf-8")

    res = subprocess.run([
        "python3", str(eval_py), "run",
        "--eval", str(bad_jsonl),
        "--results", str(r_json)
    ], capture_output=True, text=True)
    assert res.returncode != 0


# ── cbm-freshness-probe.bats ────────────────────────────────────────────────

def test_cbm_freshness_detect_changes_envelope(repo_root: Path):
    fresh_py = repo_root / "scripts" / "mcp" / "cbm-freshness.py"
    m = _load_module(fresh_py, "cbm_freshness")

    inner = 'base: main\nmerge_base: 1dae9ccf91b1b31e989d293ec5f134c81a61f782\ndirection: inbound\nchanged_files: 2\n  ml/qwen35-training/\n  ml/qwen35_pipe_2026_10_04/\n'
    env = {'content': [{'type': 'text', 'text': inner}], 'isError': False}
    assert m.envelope_text(env) == inner
    payload, raw, err = m.parse_probe_payload(env, False)
    assert err is None, err
    assert raw == inner, raw
    assert payload['text'] == inner
    assert payload['base'] == 'main', payload
    assert payload['changed_files'] == 2, payload


def test_cbm_freshness_index_status_envelope(repo_root: Path):
    fresh_py = repo_root / "scripts" / "mcp" / "cbm-freshness.py"
    m = _load_module(fresh_py, "cbm_freshness")

    inner = json.dumps({'project': 'home-patrick-Bachelorprojekt', 'nodes': 52349, 'edges': 1, 'status': 'ready', 'root_path': '/tmp/repo'})
    env = {'content': [{'type': 'text', 'text': inner}], 'isError': False}
    assert m.envelope_text(env) == inner
    payload, raw, err = m.parse_probe_payload(env, True)
    assert err is None, err
    assert isinstance(payload, dict), payload
    assert payload['project'] == 'home-patrick-Bachelorprojekt'
    assert payload['nodes'] == 52349
    proj, root = m.graph_identity(payload)
    assert proj == 'home-patrick-Bachelorprojekt', proj


def test_cbm_freshness_malformed_envelopes_fail_closed(repo_root: Path):
    fresh_py = repo_root / "scripts" / "mcp" / "cbm-freshness.py"
    m = _load_module(fresh_py, "cbm_freshness")

    _, _, e1 = m.parse_probe_payload({'isError': False}, True)
    assert e1 == 'probe-malformed', e1
    _, _, e2 = m.parse_probe_payload({'content': [{'type': 'image'}]}, True)
    assert e2 == 'probe-malformed', e2
    env3 = {'content': [{'type': 'text', 'text': 'base: main\n'}], 'isError': False}
    _, _, e3 = m.parse_probe_payload(env3, True)
    assert e3 == 'probe-malformed', e3
    env4 = {'content': [{'type': 'text', 'text': '   '}], 'isError': False}
    _, _, e4 = m.parse_probe_payload(env4, False)
    assert e4 == 'probe-malformed', e4
    env5 = {'content': [{'type': 'text', 'text': 'boom'}], 'isError': True}
    _, _, e5 = m.parse_probe_payload(env5, True)
    assert e5 == 'tool-error', e5
    env6 = {'content': [{'type': 'text', 'text': json.dumps({'error': 'boom'})}], 'isError': False}
    _, _, e6 = m.parse_probe_payload(env6, True)
    assert e6 == 'tool-error', e6

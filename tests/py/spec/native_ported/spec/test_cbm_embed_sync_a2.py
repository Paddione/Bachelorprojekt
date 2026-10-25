"""Native migration of tests/spec/cbm-embed-sync-A2.bats."""
import pytest

WRAPPER = """import importlib.util, sys
spec = importlib.util.spec_from_file_location('mod_under_test', sys.argv[1])
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
"""


@pytest.fixture
def sync_py(repo_root):
    return repo_root / "scripts/mcp/cbm-embed-sync.py"


@pytest.fixture
def mod_py(run_cmd, sync_py):
    """mod_py <snippet>: Snippet im geladenen Modul m ausfuehren; Exit-Status zurueckgeben."""

    def _run(snippet):
        return run_cmd(["python3", "-c", WRAPPER + snippet, str(sync_py)], timeout=300)

    return _run


def test_build_candidates_covers_the_full_corpus_plain_function_method_class_interface_section(mod_py):
    run = mod_py("""
routes = [('GET', 'lib/web.ts')]
functions = [
    ('proj.lib.fmtMoney', 'lib/web.ts', None, '(n: number)'),   # no docstring, has signature
    ('proj.lib.esc', 'lib/web.ts', 'Escape HTML.', '(s: str)'),
]
methods = [('proj.lib.Handler.do_GET', 'lib/web.ts', None, '(self)', 'proj.lib.Handler')]
classes = [
    ('proj.lib.Handler', 'lib/web.ts', 'Serves reviews.', '[BaseHandler]', 'Class'),
    ('proj.lib.Options', 'lib/web.ts', None, None, 'Interface'),
]
sections = [('proj.docs.guide.Install', 'docs/guide.md', '3', '4', 'Install')]
cands = m.build_candidates(routes, functions, 'repo', 'c1', methods, classes, sections)
by_kind = {}
for c in cands:
    by_kind.setdefault(c['kind'], []).append(c)
assert by_kind.get('route') and len(by_kind['route']) == 1, by_kind.keys()
assert len(by_kind.get('function', [])) == 2, 'docstring-less function must be kept'
assert len(by_kind.get('method', [])) == 1
assert len(by_kind.get('class', [])) == 1
assert len(by_kind.get('interface', [])) == 1
assert len(by_kind.get('section', [])) == 1, by_kind.keys()
# deterministic sort by (path, symbol)
assert [(c['path'], c['symbol']) for c in cands] == sorted((c['path'], c['symbol']) for c in cands)
assert m.build_candidates(routes, functions, 'repo', 'c1', methods, classes, sections) == cands
# method text carries signature + parent class; class text carries base
mt = [c for c in cands if c['kind'] == 'method'][0]
assert '(self)' in mt['text'] and 'proj.lib.Handler' in mt['text'], mt['text']
ct = [c for c in cands if c['kind'] == 'class'][0]
assert 'BaseHandler' in ct['text'], ct['text']
""")
    assert run.returncode == 0, run.output


def test_build_candidates_keeps_the_old_4_arg_shape_routes_docstring_functions(mod_py):
    run = mod_py("""
routes = [('GET', 'lib/a.ts')]
functions = [('proj.lib.f', 'lib/a.ts', 'Does f.')]
cands = m.build_candidates(routes, functions, 'repo', 'c1')
assert len(cands) == 2, cands
assert {c['kind'] for c in cands} == {'route', 'function'}
""")
    assert run.returncode == 0, run.output


def test_build_candidates_excludes_minified_bundles_root_assets_node_modules_dist_worktrees(mod_py):
    run = mod_py("""
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
# branded copies under components keep their vectors (only repo-root assets/ is cut)
c2 = m.build_candidates([], [('proj.b', 'components/website/public/brand/x/svg.js', 'd', None)], 'repo', 'c1')
assert len(c2) == 1, c2
""")
    assert run.returncode == 0, run.output


def test_text_composers_signature_parent_base_truncation_bounds(mod_py):
    run = mod_py("""
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
""")
    assert run.returncode == 0, run.output


def test_section_text_is_heading_path_file_location_truncated_symbol_is_section_qname_line(mod_py):
    run = mod_py("""
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
""")
    assert run.returncode == 0, run.output


def test_plan_sync_diffs_by_content_hash_a_model_bump_re_embeds_everything(mod_py):
    run = mod_py("""
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
""")
    assert run.returncode == 0, run.output


def test_shard_batches_fans_out_round_robin_single_url_keeps_legacy_order(mod_py):
    run = mod_py("""
assert m.shard_batches(5, ['a']) == ['a'] * 5
assert m.shard_batches(5, ['a', 'b']) == ['a', 'b', 'a', 'b', 'a']
assert m.shard_batches(0, ['a', 'b']) == []
try:
    m.shard_batches(3, [])
    raise AssertionError('empty endpoints must fail closed')
except m.SyncError as e:
    assert 'embed-no-endpoints' in str(e), e
""")
    assert run.returncode == 0, run.output


def test_merge_pairs_folds_fresh_vectors_keeps_the_rest_checkpoint(mod_py):
    run = mod_py("""
store = {'k-old': {'hash': 'h', 'model': 'bge-m3', 'dim': 2, 'vector': [0.1, 0.2]}}
pairs = [('k-new', 'TEXT', [0.5, 0.6])]
out = m.merge_pairs(store, pairs, 'bge-m3')
assert out['k-old'] == store['k-old'], 'untouched keys keep their record'
assert out['k-new']['hash'] == m.content_hash('bge-m3', 'TEXT')
assert out['k-new']['dim'] == 2 and out['k-new']['vector'] == [0.5, 0.6]
assert store == {'k-old': store['k-old']}, 'input store not mutated'
""")
    assert run.returncode == 0, run.output


def test_resolve_embed_urls_embed_urls_env_legacy_embed_url(mod_py):
    run = mod_py("""
import types
a = types.SimpleNamespace(embed_urls='http://x:1,http://y:2', embed_url='http://solo')
assert m.resolve_embed_urls(a) == ['http://x:1', 'http://y:2']
b = types.SimpleNamespace(embed_urls=None, embed_url='http://solo')
import os
os.environ.pop('LLM_EMBED_URLS', None)
assert m.resolve_embed_urls(b) == ['http://solo']
os.environ['LLM_EMBED_URLS'] = 'http://e1, http://e2'
assert m.resolve_embed_urls(b) == ['http://e1', 'http://e2']
os.environ.pop('LLM_EMBED_URLS', None)
""")
    assert run.returncode == 0, run.output


def test_embed_texts_fans_out_over_endpoints_order_preserved_stubbed_net(mod_py):
    run = mod_py("""
import time
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
assert vecs == [[2.0]] * 10, vecs  # 't0'..'t9' all len 2 -> order kept
assert sorted(set(seen)) == ['http://a/v1/embeddings',
                              'http://b/v1/embeddings'], seen
assert sorted(i for i, _ in got_calls) == list(range(10)), got_calls
# legacy single-endpoint path unchanged
seen.clear()
m.embed_batch = fake_batch
vecs1 = m.embed_texts(texts, 'http://solo', 'bge-m3')
assert vecs1 == vecs and seen == ['http://solo/v1/embeddings'] * 3, seen
""")
    assert run.returncode == 0, run.output


def test_build_candidates_carries_spans_and_disambiguates_overloads(mod_py):
    run = mod_py("""
functions = [
    ('proj.lib.fmtMoney', 'lib/web.ts', 'Formats money.', '(n: number)', '10', '20'),
    ('proj.lib.fmtMoney', 'lib/web.ts', 'Formats money (opts).', '(n: number, o: object)', '30', '45'),
    ('proj.lib.esc', 'lib/web.ts', 'Escape HTML.', '(s: str)', '50', '55'),
]
cands = m.build_candidates([], functions, 'repo', 'c1')
by_symbol = {c['symbol']: c for c in cands}
assert len(cands) == 3, [c['key'] for c in cands]
assert len({c['key'] for c in cands}) == 3, 'overloads need distinct keys'
esc = by_symbol['proj.lib.esc']
assert esc['start_line'] == 50 and esc['end_line'] == 55, esc
# legacy span-less rows keep working with the historic key shape
legacy = m.build_candidates([], [('proj.lib.f', 'lib/a.ts', 'Does f.')], 'repo', 'c1')
assert legacy[0]['key'] == 'repo@c1:lib/a.ts:proj.lib.f', legacy[0]
assert legacy[0]['start_line'] is None, legacy[0]
""")
    assert run.returncode == 0, run.output


def test_read_source_slice_returns_bounded_excerpt_and_fails_safe(mod_py):
    run = mod_py("""
import os, tempfile
tmp = tempfile.mkdtemp()
p = os.path.join(tmp, 'a.py')
lines = ['line %d content here' % i for i in range(1, 101)]
open(p, 'w').write('\\n'.join(lines) + '\\n')
got = m.read_source_slice(tmp, 'a.py', 10, 15)
assert got is not None and 'line 10' in got and 'line 15' in got, repr(got)
assert 'line 16' not in got, repr(got)
# line numbers arrive as graph strings
got2 = m.read_source_slice(tmp, 'a.py', '10', '15')
assert got2 == got, (got2, got)
# truncation bounds the excerpt
big = m.read_source_slice(tmp, 'a.py', 1, 100, max_chars=50, max_lines=3)
assert len(big) <= 50 and big.count('\\n') <= 2, repr(big)
# missing file, bad span and traversal fail safe with None
assert m.read_source_slice(tmp, 'nope.py', 1, 5) is None
assert m.read_source_slice(tmp, 'a.py', 20, 10) is None
assert m.read_source_slice(tmp, '../escape.py', 1, 5) is None
assert m.read_source_slice(tmp, 'a.py', 'xx', 5) is None
""")
    assert run.returncode == 0, run.output


def test_composers_accept_optional_source_body_unchanged_without(mod_py):
    run = mod_py("""
ft0 = m.function_text('proj.pkg.fn', 'Does things.')
assert ft0 == 'proj.pkg.fn\\nDoes things.', repr(ft0)
ft1 = m.function_text('proj.pkg.fn', 'Does things.', '(a: int)', 'x = a + 1\\nreturn x')
assert 'x = a + 1' in ft1 and 'Does things.' in ft1, repr(ft1)
mt = m.method_text('proj.C.run', 'Runs it.', '(self)', 'proj.C', 'self.x += 1')
assert 'self.x += 1' in mt and 'proj.C.run' in mt, repr(mt)
assert m.method_text('proj.C.run', 'Runs it.', '(self)', 'proj.C') == \\
    'proj.C.run (self)\\nclass proj.C\\nRuns it.', repr(m.method_text('proj.C.run', 'Runs it.', '(self)', 'proj.C'))
ct = m.class_text('proj.lib.H', 'Serves.', '[Base]', 'Class', 'def serve(self): ...')
assert 'def serve' in ct, repr(ct)
st = m.section_text('proj.docs.g.Install', 'Install', 'docs/g.md', '3', '10',
                    'Run `make setup` then open the app.')
assert 'make setup' in st and 'Install' in st, repr(st)
assert m.section_text('q', 'H', 'docs/g.md', '1', '2') == \\
    m.section_text('q', 'H', 'docs/g.md', '1', '2', None)
""")
    assert run.returncode == 0, run.output


def test_enrich_candidates_adds_source_body_keeps_stable_keys(mod_py):
    run = mod_py("""
import os, tempfile
tmp = tempfile.mkdtemp()
open(os.path.join(tmp, 'lib.ts'), 'w').write(
    'export function fmtMoney(n: number) {\\n  return "$" + n;\\n}\\n')
functions = [('proj.lib.fmtMoney', 'lib.ts', 'Formats money.', '(n: number)', 1, 3)]
cands = m.build_candidates([], functions, 'repo', 'c1')
assert cands[0]['key'] == 'repo@c1:lib.ts:proj.lib.fmtMoney', cands[0]
enriched, cov = m.enrich_candidates_with_source(tmp, cands)
assert enriched[0]['key'] == cands[0]['key'], 'keys stay stable for re-embed diffing'
assert 'return' in enriched[0]['text'] and 'Formats money.' in enriched[0]['text'], repr(enriched[0]['text'])
assert cov == {'with_body': 1, 'no_span': 0, 'read_miss': 0}, cov
# candidates without spans keep their historic text untouched
plain = m.build_candidates([], [('proj.lib.f', 'lib.ts', 'Does f.')], 'repo', 'c1')
enriched2, cov2 = m.enrich_candidates_with_source(tmp, plain)
assert enriched2[0]['text'] == plain[0]['text'], repr(enriched2[0]['text'])
assert cov2 == {'with_body': 0, 'no_span': 1, 'read_miss': 0}, cov2
# missing files are read_miss, not crashes
ghost = m.build_candidates([], [('proj.lib.g', 'gone.ts', 'd', None, 1, 5)], 'repo', 'c1')
_, cov3 = m.enrich_candidates_with_source(tmp, ghost)
assert cov3 == {'with_body': 0, 'no_span': 0, 'read_miss': 1}, cov3
# routes gain the handler body; identical verbs stay distinguishable
open(os.path.join(tmp, 'api.ts'), 'w').write('GET /a\\nhandler A\\nGET /b\\nhandler B\\n')
routes = m.build_candidates([('GET', 'api.ts', 1, 2), ('GET', 'api.ts', 3, 4)], [], 'repo', 'c1')
assert len({c['key'] for c in routes}) == 2, [c['key'] for c in routes]
renriched, _ = m.enrich_candidates_with_source(tmp, routes)
assert 'handler A' in renriched[0]['text'] and 'handler B' in renriched[1]['text'], [c['text'] for c in renriched]
assert m.route_text('api.ts', 'GET') == 'ROUTE GET api.ts', m.route_text('api.ts', 'GET')
""")
    assert run.returncode == 0, run.output


def test_is_test_path_flags_specs_and_test_dirs(mod_py):
    run = mod_py("""
assert m.is_test_path('lib/a.test.ts')
assert m.is_test_path('tests/test_embed.py')
assert m.is_test_path('components/x/__tests__/y.ts')
assert m.is_test_path('lib/foo.spec.js')
assert not m.is_test_path('lib/web.ts')
assert not m.is_test_path('docs/guide.md')
assert not m.is_test_path('')
cands = m.build_candidates([], [('proj.lib.f', 'lib/a.test.ts', 'd')], 'repo', 'c1')
assert cands[0]['test'] is True, cands[0]
cands2 = m.build_candidates([], [('proj.lib.f', 'lib/web.ts', 'd')], 'repo', 'c1')
assert cands2[0]['test'] is False, cands2[0]
""")
    assert run.returncode == 0, run.output


def test_sync_cli_resolves_freshness_state_via_single_graph_indirection_t900998_p3(mod_py):
    # Regression: cmd_status/cmd_sync called GRAPH.GRAPH.freshness_state, but the
    # loaded cbm-sync-graph module exposes freshness_state directly.
    run = mod_py("""
import inspect
for fn in (m.cmd_status, m.cmd_sync):
    src = inspect.getsource(fn)
    assert 'GRAPH.GRAPH' not in src, 'double indirection in ' + fn.__name__
    assert 'GRAPH.freshness_state' in src, 'freshness probe missing in ' + fn.__name__
assert callable(m.GRAPH.freshness_state), 'graph layer must expose freshness_state'
""")
    assert run.returncode == 0, run.output

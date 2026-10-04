#!/usr/bin/env bats
# tests/spec/cbm-embed-sync-A2.bats
# Ticket: T900993 (A2) — full-corpus embed sync: all Functions, Methods,
# Classes, Interfaces, Routes, Sections.
#
# Contract (RED gate — pure layer only, no network, no IO):
#   (a) build_candidates handles function-without-docstring, method, class,
#       interface and section rows; output is deterministic, sorted by
#       (path, symbol); the old 4-arg call shape keeps working.
#   (b) minified files (*.min.js, *.bundle.js) and repo-root assets/ paths
#       (plus node_modules/, dist/, .worktrees/) are excluded.
#   (c) plan_sync diffs by content hash — a model bump re-embeds everything.
#   (d) section text carries the heading path + file location, truncated.
#
# Network-free: exercised via `python3 -c` imports with fixtures.

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
  SYNC_PY="$REPO_ROOT/scripts/mcp/cbm-embed-sync.py"
  TEST_DIR="$BATS_TEST_TMPDIR/embedsync-a2-$$"
  mkdir -p "$TEST_DIR"
}

teardown() {
  rm -rf "$TEST_DIR"
}

mod_py() { # mod_py <snippet> [args...]
  python3 -c "
import importlib.util, sys
spec = importlib.util.spec_from_file_location('mod_under_test', sys.argv[1])
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
$1
" "$SYNC_PY" "${@:2}"
}

@test "build_candidates covers the full corpus: plain function, method, class, interface, section" {
  run mod_py "
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
"
  [ "$status" -eq 0 ]
}

@test "build_candidates keeps the old 4-arg shape (routes + docstring functions)" {
  run mod_py "
routes = [('GET', 'lib/a.ts')]
functions = [('proj.lib.f', 'lib/a.ts', 'Does f.')]
cands = m.build_candidates(routes, functions, 'repo', 'c1')
assert len(cands) == 2, cands
assert {c['kind'] for c in cands} == {'route', 'function'}
"
  [ "$status" -eq 0 ]
}

@test "build_candidates excludes minified bundles, root assets/, node_modules, dist, worktrees" {
  run mod_py "
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
"
  [ "$status" -eq 0 ]
}

@test "text composers: signature, parent, base, truncation bounds" {
  run mod_py "
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
"
  [ "$status" -eq 0 ]
}

@test "section text is heading-path + file location, truncated; symbol is section:qname#line" {
  run mod_py "
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
"
  [ "$status" -eq 0 ]
}

@test "plan_sync diffs by content hash; a model bump re-embeds everything" {
  run mod_py "
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
"
  [ "$status" -eq 0 ]
}

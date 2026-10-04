#!/usr/bin/env bats
# tests/spec/cbm-embed-store.bats
# Ticket: T900993 — content-hash-keyed embedding store for the K3 symbol layer.
#
# Contract (plan k3-embed-store-rerank task 1, RED gate):
#   (a) identical text -> identical content hash, different text does not
#   (b) upsert writes the artifact line-per-vector with key, hash, model, dim, vector
#   (c) diff_by_hash returns exactly the keys whose text changed
#   (d) prune_stale drops keys absent from the candidate set
#   (e) manifest records corpus sha256, receipt id, model, dim; corrupted
#       artifact fails closed (non-zero exit) instead of returning partial data
#
# Network-free: the store is exercised via `python3 -c` imports in a temp dir.

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
  STORE_PY="$REPO_ROOT/scripts/mcp/cbm-embed-store.py"
  TEST_DIR="$BATS_TEST_TMPDIR/store-$$"
  STORE_DIR="$TEST_DIR/.codebase-memory"
  mkdir -p "$STORE_DIR"
}

teardown() {
  rm -rf "$TEST_DIR"
}

# Runs a python snippet with the store module loaded as `m`.
# The module path arrives as sys.argv[1]; snippet args follow.
store_py() {
  python3 -c "
import importlib.util, sys
spec = importlib.util.spec_from_file_location('cbm_embed_store', sys.argv[1])
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
$1
" "$STORE_PY" "${@:2}"
}

@test "content hash: identical text identical hash, different text different hash, model participates" {
  run store_py "
h1 = m.content_hash('bge-m3', 'ROUTE GET components/website/src/pages/api/auth/callback.ts')
h2 = m.content_hash('bge-m3', 'ROUTE GET components/website/src/pages/api/auth/callback.ts')
h3 = m.content_hash('bge-m3', 'ROUTE POST components/website/src/pages/api/auth/callback.ts')
h4 = m.content_hash('other-model', 'ROUTE GET components/website/src/pages/api/auth/callback.ts')
assert h1 == h2, 'same text+model must hash equal'
assert h1 != h3, 'different text must hash differently'
assert h1 != h4, 'model bump must invalidate the hash'
assert len(h1) == 64, 'sha256 hex digest'
"
  [ "$status" -eq 0 ]
}

@test "key scheme and identity: repo@commit:path:symbol, identity survives commit rotation" {
  run store_py "
key = m.make_key('repo', '8fed539b', 'lib/auth.ts', 'GET')
assert key == 'repo@8fed539b:lib/auth.ts:GET', key
assert m.identity_of(key) == 'lib/auth.ts:GET', m.identity_of(key)
assert m.identity_of(m.make_key('repo', 'HEAD2', 'lib/auth.ts', 'GET')) == 'lib/auth.ts:GET'
assert m.identity_of('plain-key') == 'plain-key'
"
  [ "$status" -eq 0 ]
}

@test "upsert writes the artifact line-per-vector with key, hash, model, dim, vector" {
  run store_py "
import json, os
art = os.path.join(sys.argv[2], 'embed-index.jsonl')
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
# second upsert keeps existing order, appends new keys, updates in place
recs2 = {
    'repo@c1:lib/auth.ts:GET': {'hash': m.content_hash('bge-m3', 't1b'), 'model': 'bge-m3', 'dim': 4, 'vector': [0.9, 0.9, 0.9, 0.9]},
    'repo@c1:lib/new.ts:GET': {'hash': m.content_hash('bge-m3', 't3'), 'model': 'bge-m3', 'dim': 4, 'vector': [1.0, 0.0, 0.0, 0.0]},
}
n2 = m.upsert(art, recs2)
assert n2 == 3, n2
store = m.load_artifact(art)
assert store['repo@c1:lib/auth.ts:GET']['vector'] == [0.9, 0.9, 0.9, 0.9]
assert store['repo@c1:lib/new.ts:GET']['hash'] == m.content_hash('bge-m3', 't3')
" "$TEST_DIR"
  [ "$status" -eq 0 ]
}

@test "diff_by_hash returns exactly the keys whose text changed (plus stale store keys as to_prune)" {
  run store_py "
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
    'repo@c2:lib/a.ts:GET': ha,          # same text, commit rotated
    'repo@c2:lib/b.ts:POST': hb_new,     # text changed
    'repo@c2:lib/c.ts:GET': hc,          # brand new
}
d = m.diff_by_hash(candidates, store)
assert d['to_embed'] == ['repo@c2:lib/b.ts:POST', 'repo@c2:lib/c.ts:GET'], d['to_embed']
assert d['unchanged'] == ['repo@c2:lib/a.ts:GET'], d['unchanged']
assert d['to_prune'] == ['repo@c1:lib/gone.ts:GET'], d['to_prune']
"
  [ "$status" -eq 0 ]
}

@test "prune_stale drops keys absent from the candidate set, keeps the rest" {
  run store_py "
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
"
  [ "$status" -eq 0 ]
}

@test "manifest records corpus sha256, receipt id + timestamp, model, dim, counts" {
  run store_py "
import json, os
mpath = os.path.join(sys.argv[2], 'embed-manifest.json')
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
" "$TEST_DIR"
  [ "$status" -eq 0 ]
}

@test "corrupted artifact fails closed with non-zero exit instead of partial data" {
  cat > "$STORE_DIR/embed-index.jsonl" <<'EOF'
{"key":"repo@c1:lib/a.ts:GET","hash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","model":"bge-m3","dim":2,"vector":[1.0,0.0]}
{"key":"repo@c1:lib/broken
EOF
  run store_py "
import sys
try:
    m.load_artifact(sys.argv[2])
except m.EmbedStoreError:
    sys.exit(3)
sys.exit(0)
" "$STORE_DIR/embed-index.jsonl"
  [ "$status" -eq 3 ]
  # CLI verify must also fail closed on the corrupt artifact (manifest valid
  # so the artifact corruption is the actual failure cause)
  run store_py "
m.write_manifest(sys.argv[2], m.make_manifest(
    corpus_sha256='abc', receipt_id='r-1', receipt_timestamp='2026-10-04T10:00:00+00:00',
    model='bge-m3', dim=2, vectors=2))
" "$STORE_DIR/embed-manifest.json"
  [ "$status" -eq 0 ]
  run python3 "$STORE_PY" verify --root "$TEST_DIR"
  [ "$status" -ne 0 ]
  echo "$output" | grep -q "artifact" # failure names the artifact, not a spurious cause
}

@test "CLI verify passes on a well-formed store and reports counts" {
  run store_py "
import json, os
art = os.path.join(sys.argv[2], 'embed-index.jsonl')
recs = {
    'repo@c1:lib/auth.ts:GET': {'hash': m.content_hash('bge-m3', 't1'), 'model': 'bge-m3', 'dim': 2, 'vector': [0.25, 0.5]},
}
m.upsert(art, recs)
m.write_manifest(os.path.join(sys.argv[2], 'embed-manifest.json'), m.make_manifest(
    corpus_sha256='abc', receipt_id='r-1', receipt_timestamp='2026-10-04T10:00:00+00:00',
    model='bge-m3', dim=2, vectors=1))
" "$STORE_DIR"
  [ "$status" -eq 0 ]
  run python3 "$STORE_PY" verify --root "$TEST_DIR"
  [ "$status" -eq 0 ]
  echo "$output" | python3 -c '
import json, sys
d = json.load(sys.stdin)
assert d["vectors"] == 1, d
assert d["model"] == "bge-m3", d
'
}

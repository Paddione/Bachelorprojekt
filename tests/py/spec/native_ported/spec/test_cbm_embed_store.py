"""Native migration of tests/spec/cbm-embed-store.bats."""
import json
from pathlib import Path

import pytest

PRELUDE = (
    "import importlib.util, sys\n"
    "spec = importlib.util.spec_from_file_location('cbm_embed_store', sys.argv[1])\n"
    "m = importlib.util.module_from_spec(spec)\n"
    "spec.loader.exec_module(m)\n"
)


@pytest.fixture
def store_py_path(repo_root: Path) -> Path:
    return repo_root / "scripts" / "mcp" / "cbm-embed-store.py"


@pytest.fixture
def test_dir(tmp_path: Path) -> Path:
    return tmp_path / "store"


@pytest.fixture
def store_dir(test_dir: Path) -> Path:
    path = test_dir / ".codebase-memory"
    path.mkdir(parents=True)
    return path


@pytest.fixture
def store_py(run_cmd, store_py_path):
    """Run a python snippet with the store module loaded as `m`; args follow the module path."""

    def _run(snippet: str, *args: str):
        return run_cmd(["python3", "-c", PRELUDE + snippet + "\n", str(store_py_path), *args])

    return _run


def test_content_hash_identical_text_identical_hash_different_text_different_hash_model_participates(store_py):
    result = store_py(
        """
h1 = m.content_hash('bge-m3', 'ROUTE GET components/website/src/pages/api/auth/callback.ts')
h2 = m.content_hash('bge-m3', 'ROUTE GET components/website/src/pages/api/auth/callback.ts')
h3 = m.content_hash('bge-m3', 'ROUTE POST components/website/src/pages/api/auth/callback.ts')
h4 = m.content_hash('other-model', 'ROUTE GET components/website/src/pages/api/auth/callback.ts')
assert h1 == h2, 'same text+model must hash equal'
assert h1 != h3, 'different text must hash differently'
assert h1 != h4, 'model bump must invalidate the hash'
assert len(h1) == 64, 'sha256 hex digest'
"""
    )
    assert result.returncode == 0, result.output


def test_key_scheme_and_identity_survives_commit_rotation(store_py):
    result = store_py(
        """
key = m.make_key('repo', '8fed539b', 'lib/auth.ts', 'GET')
assert key == 'repo@8fed539b:lib/auth.ts:GET', key
assert m.identity_of(key) == 'lib/auth.ts:GET', m.identity_of(key)
assert m.identity_of(m.make_key('repo', 'HEAD2', 'lib/auth.ts', 'GET')) == 'lib/auth.ts:GET'
assert m.identity_of('plain-key') == 'plain-key'
"""
    )
    assert result.returncode == 0, result.output


def test_upsert_writes_artifact_line_per_vector_with_key_hash_model_dim_vector(store_py, test_dir):
    result = store_py(
        """
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
""",
        str(test_dir),
    )
    assert result.returncode == 0, result.output


def test_diff_by_hash_returns_exactly_changed_keys_plus_stale_as_to_prune(store_py):
    result = store_py(
        """
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
"""
    )
    assert result.returncode == 0, result.output


def test_prune_stale_drops_keys_absent_from_candidates_keeps_rest(store_py):
    result = store_py(
        """
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
"""
    )
    assert result.returncode == 0, result.output


def test_manifest_records_corpus_sha256_receipt_id_timestamp_model_dim_counts(store_py, test_dir):
    result = store_py(
        """
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
""",
        str(test_dir),
    )
    assert result.returncode == 0, result.output


def test_corrupted_artifact_fails_closed_with_nonzero_exit(store_py, store_py_path, run_cmd, store_dir, test_dir):
    (store_dir / "embed-index.jsonl").write_text(
        '{"key":"repo@c1:lib/a.ts:GET","hash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","model":"bge-m3","dim":2,"vector":[1.0,0.0]}\n'
        '{"key":"repo@c1:lib/broken\n',
        encoding="utf-8",
    )
    result = store_py(
        """
import sys
try:
    m.load_artifact(sys.argv[2])
except m.EmbedStoreError:
    sys.exit(3)
sys.exit(0)
""",
        str(store_dir / "embed-index.jsonl"),
    )
    assert result.returncode == 3, result.output

    # CLI verify must also fail closed on the corrupt artifact (manifest valid
    # so the artifact corruption is the actual failure cause)
    result = store_py(
        """
m.write_manifest(sys.argv[2], m.make_manifest(
    corpus_sha256='abc', receipt_id='r-1', receipt_timestamp='2026-10-04T10:00:00+00:00',
    model='bge-m3', dim=2, vectors=2))
""",
        str(store_dir / "embed-manifest.json"),
    )
    assert result.returncode == 0, result.output

    result = run_cmd(["python3", str(store_py_path), "verify", "--root", str(test_dir)])
    assert result.returncode != 0
    assert "artifact" in result.output  # failure names the artifact, not a spurious cause


def test_cli_verify_passes_on_well_formed_store_and_reports_counts(store_py, store_py_path, run_cmd, store_dir, test_dir):
    result = store_py(
        """
import json, os
art = os.path.join(sys.argv[2], 'embed-index.jsonl')
recs = {
    'repo@c1:lib/auth.ts:GET': {'hash': m.content_hash('bge-m3', 't1'), 'model': 'bge-m3', 'dim': 2, 'vector': [0.25, 0.5]},
}
m.upsert(art, recs)
m.write_manifest(os.path.join(sys.argv[2], 'embed-manifest.json'), m.make_manifest(
    corpus_sha256='abc', receipt_id='r-1', receipt_timestamp='2026-10-04T10:00:00+00:00',
    model='bge-m3', dim=2, vectors=1))
""",
        str(store_dir),
    )
    assert result.returncode == 0, result.output

    result = run_cmd(["python3", str(store_py_path), "verify", "--root", str(test_dir)])
    assert result.returncode == 0, result.output
    report = json.loads(result.output)
    assert report["vectors"] == 1, report
    assert report["model"] == "bge-m3", report

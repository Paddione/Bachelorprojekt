"""Native migration of tests/unit/knowledge-ingest-schema.bats."""
import shutil

import pytest


@pytest.fixture
def rendered_lines(run_cmd, repo_root):
    """Render the k3d base like `kubectl kustomize ... > file 2>&1` and return its lines."""
    if shutil.which("kubectl") is None:
        pytest.skip("kubectl not available")
    result = run_cmd(["kubectl", "kustomize", str(repo_root / "k3d"), "--load-restrictor=LoadRestrictionsNone"],
                     timeout=300)
    return (result.stdout + result.stderr).splitlines()


def test_ingest_prs_does_not_query_non_existent_columns_body_labels(rendered_lines):
    # [T002605] The source is ticket_links; the SELECT starts with 'SELECT DISTINCT l.pr_number'.
    anchor = "SELECT DISTINCT l.pr_number"
    hits = [i for i, line in enumerate(rendered_lines) if anchor in line]
    # grep -A 10 emits the match line plus the 10 lines after it.
    assert hits, "SELECT DISTINCT l.pr_number not found in rendered schema"
    window = []
    for i in hits:
        window.extend(rendered_lines[i:i + 11])
    # The broken columns must not appear in the SELECT query.
    assert not any("body," in line for line in window)
    assert not any("labels" in line for line in window)


def test_document_replacement_rolls_back_failed_chunk_write(repo_root, tmp_path):
    """A failed replacement must retain the previous hash and complete chunk set."""
    import json
    import subprocess

    source = (repo_root / "scripts/knowledge/lib-knowledge-pg.mjs").read_text()
    # Replace only the external driver boundary; execute the production writer unchanged.
    # The writer imports the shared dense profile + transport — mirror the layout.
    scripts = tmp_path / "scripts"
    (scripts / "knowledge").mkdir(parents=True)
    (scripts / "lib").mkdir(parents=True)
    module = scripts / "knowledge" / "knowledge.mjs"
    module.write_text(source.replace("import pg from 'pg';", "const pg = { Pool: class {} };"))
    shutil.copy(repo_root / "scripts/knowledge/dense-client.mjs", scripts / "knowledge" / "dense-client.mjs")
    shutil.copy(repo_root / "scripts/lib/dense-embedding.mjs", scripts / "lib" / "dense-embedding.mjs")
    code = r"""
import { upsertDocumentAndChunks } from './knowledge.mjs';
let state = { hash: 'old', chunks: ['old-complete'] }, snapshot, released = false;
const query = async (sql, values = []) => {
  if (/^BEGIN/i.test(sql.trim())) { snapshot = structuredClone(state); return { rows: [] }; }
  if (/^ROLLBACK/i.test(sql.trim())) { state = snapshot; return { rows: [] }; }
  if (/^COMMIT/i.test(sql.trim())) return { rows: [] };
  if (/dense_embedding_migrations/.test(sql)) {
    return { rows: [{ writer_locked: false, phase: 'active', target_profile: 'embeddinggemma-300m:768:Q8_0:v1' }] };
  }
  if (/INSERT INTO knowledge.documents/.test(sql)) {
    state.hash = values[4]; return { rows: [{ id: 'doc', sha256: values[4] }] };
  }
  if (/DELETE FROM knowledge.chunks/.test(sql)) state.chunks = [];
  if (/INSERT INTO knowledge.chunks/.test(sql)) throw new Error('injected chunk failure');
  return { rows: [] };
};
const client = { query, release() { released = true; } };
const pool = { query, async connect() { return client; } };
let error;
try {
  await upsertDocumentAndChunks(pool, { collectionId: 'col', title: 'title', sourceUri: 'file:x',
    rawText: 'new', hash: 'new', chunks: [{ position: 0, text: 'new', embedding: Array(768).fill(0.1) }] });
} catch (e) { error = e.message; }
console.log(JSON.stringify({ state, released, error }));
"""
    result = subprocess.run(["node", "--input-type=module", "-e", code],
                            cwd=scripts / "knowledge", text=True, capture_output=True, check=True)
    data = json.loads(result.stdout)
    assert data["error"] == "injected chunk failure", "failure injection did not reach chunk write"
    assert data["state"] == {"hash": "old", "chunks": ["old-complete"]}
    assert data["released"], "connection must be returned after rollback"

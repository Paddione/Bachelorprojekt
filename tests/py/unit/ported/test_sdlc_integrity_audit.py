"""Tests for scripts/knowledge/audit-integrity.mjs (T901697)."""

import hashlib
import json
import subprocess
from pathlib import Path


def _run_audit_node(repo_root: Path, audit_script: Path, mock_queries: dict, test_root: Path, extra_env: dict = None):
    """Run audit-integrity.mjs with mock query answers."""
    code = r"""
const { runAudit } = await import(process.argv[2]);

const queries = JSON.parse(process.argv[3]);

async function queryFn(sql) {
  const norm = sql.trim().replace(/\s+/g, ' ');
  for (const [pattern, res] of Object.entries(queries)) {
    if (new RegExp(pattern, 'i').test(norm)) {
      return res;
    }
  }
  return { rows: [] };
}

const result = await runAudit({ queryFn, repoRoot: process.argv[4] });
console.log(JSON.stringify(result));
"""
    env = dict(extra_env or {})
    res = subprocess.run(
        ["node", "--input-type=module", "-e", code, "_", str(audit_script), json.dumps(mock_queries), str(test_root)],
        text=True, capture_output=True, env=env, check=True
    )
    return json.loads(res.stdout)


def test_audit_constraints_and_collection_discrepancy(repo_root, tmp_path):
    audit_script = repo_root / "scripts/knowledge/audit-integrity.mjs"

    mock_queries = {
        "pg_constraint": {
            "rows": [
                {"conname": "collections_source_check", "def": "CHECK (source = ANY (ARRAY['specs_plans', 'bug_tickets']))"}
            ]
        },
        "knowledge.collections": {
            "rows": [
                {"id": "c1", "name": "specs", "source": "specs_plans", "chunk_count": 10, "last_indexed_at": "2026-01-01", "actual_chunk_count": 8},
                {"id": "c2", "name": "openspec-old", "source": "openspec", "chunk_count": 5, "last_indexed_at": "2025-01-01", "actual_chunk_count": 5}
            ]
        },
        "knowledge.chunks": {
            "rows": [
                {"model": "bge-m3", "count": 8},
                {"model": "unknown", "count": 5}
            ]
        },
        "knowledge.documents": {"rows": []},
        "tickets.factory_phase_events": {"rows": []},
        "github_": {"rows": [{"count": 2}]},
        "github_objects": {"rows": [{"total": 0}]},
        "tickets.tickets": {"rows": [{"count": 1}]}
    }

    result = _run_audit_node(repo_root, audit_script, mock_queries, tmp_path)
    assert result["constraints_and_indexes"]["status"] == "warning"
    assert any("code_graph" in issue for issue in result["constraints_and_indexes"]["issues"])

    assert len(result["collections"]) == 2
    c1 = next(c for c in result["collections"] if c["id"] == "c1")
    assert c1["discrepancy"] is True
    assert c1["historical"] is False

    c2 = next(c for c in result["collections"] if c["id"] == "c2")
    assert c2["discrepancy"] is False
    assert c2["historical"] is True

    assert result["model_lineage"]["models"]["bge-m3"] == 8
    assert result["model_lineage"]["missing_model_chunks"] == 5
    assert result["open_resolutions"] == 1
    assert result["github_coverage"]["status"] == "unpopulated"
    assert result["github_coverage"]["rows"] == 0


def test_audit_source_freshness_current_changed_missing_unverifiable(repo_root, tmp_path):
    audit_script = repo_root / "scripts/knowledge/audit-integrity.mjs"

    # Create test files
    f1 = tmp_path / "doc1.md"
    f1.write_text("hello world")
    h1 = hashlib.sha256("hello world".encode("utf-8")).hexdigest()

    f2 = tmp_path / "doc2.md"
    f2.write_text("changed content")
    h2_old = hashlib.sha256("original content".encode("utf-8")).hexdigest()

    mock_queries = {
        "pg_constraint": {"rows": []},
        "knowledge.collections": {"rows": []},
        "knowledge.chunks": {"rows": []},
        "knowledge.documents": {
            "rows": [
                {"source_uri": "file:doc1.md", "sha256": h1},
                {"source_uri": "file:doc2.md", "sha256": h2_old},
                {"source_uri": "file:nonexistent.md", "sha256": "abcdef"},
                {"source_uri": "file:../../etc/passwd", "sha256": "escape"}
            ]
        },
        "tickets.factory_phase_events": {"rows": []},
        "information_schema": {"rows": [{"count": 2}]},
        "github_objects": {"rows": [{"total": 12}]},
        "tickets.tickets": {"rows": []}
    }

    result = _run_audit_node(repo_root, audit_script, mock_queries, tmp_path)
    assert result["source_freshness"]["current"] == 1
    assert result["source_freshness"]["changed"] == 1
    assert result["source_freshness"]["missing"] == 1
    assert result["source_freshness"]["unverifiable"] == 1
    assert result["github_coverage"]["status"] == "populated"
    assert result["github_coverage"]["rows"] == 12


def test_audit_phase_event_order_and_gaps(repo_root, tmp_path):
    audit_script = repo_root / "scripts/knowledge/audit-integrity.mjs"

    mock_queries = {
        "pg_constraint": {"rows": []},
        "knowledge.collections": {"rows": []},
        "knowledge.chunks": {"rows": []},
        "knowledge.documents": {"rows": []},
        "tickets.factory_phase_events": {
            "rows": [
                # Ticket 1: valid chain
                {"ticket_id": "T001", "id": 1, "phase": "plan", "state": "done", "at": "2026-01-01T10:00:00", "detail": "manual"},
                {"ticket_id": "T001", "id": 2, "phase": "implement", "state": "entered", "at": "2026-01-01T11:00:00", "detail": ""},
                {"ticket_id": "T001", "id": 3, "phase": "verify", "state": "done", "at": "2026-01-01T12:00:00", "detail": ""},
                # Ticket 2: order violation (verify before implement)
                {"ticket_id": "T002", "id": 4, "phase": "plan", "state": "done", "at": "2026-01-01T10:00:00", "detail": ""},
                {"ticket_id": "T002", "id": 5, "phase": "verify", "state": "done", "at": "2026-01-01T11:00:00", "detail": ""},
                # Ticket 3: missing verify (gap)
                {"ticket_id": "T003", "id": 6, "phase": "plan", "state": "done", "at": "2026-01-01T10:00:00", "detail": ""},
                {"ticket_id": "T003", "id": 7, "phase": "implement", "state": "entered", "at": "2026-01-01T11:00:00", "detail": ""}
            ]
        },
        "github_": {"rows": []},
        "tickets.tickets": {"rows": []}
    }

    result = _run_audit_node(repo_root, audit_script, mock_queries, tmp_path)
    assert result["phase_events"]["tickets_inspected"] == 3
    assert result["phase_events"]["order_violations"] == 1
    assert result["phase_events"]["gaps"] == 2


def test_audit_code_graph_status(repo_root, tmp_path):
    audit_script = repo_root / "scripts/knowledge/audit-integrity.mjs"

    # Setup a git repo in tmp_path
    subprocess.run(["git", "init", "-q", str(tmp_path)], check=True)
    (tmp_path / "file.txt").write_text("content")
    subprocess.run(["git", "-C", str(tmp_path), "add", "."], check=True)
    subprocess.run(["git", "-C", str(tmp_path), "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "initial"], check=True)
    head = subprocess.check_output(["git", "-C", str(tmp_path), "rev-parse", "HEAD"], text=True).strip()

    cache_dir = tmp_path / "cache" / "my-proj"
    cache_dir.mkdir(parents=True)
    meta = {
        "project": "my-proj",
        "repo": str(tmp_path),
        "commit": head,
        "count": 42,
        "partial": False,
        "pending": 0,
        "parse_errors": 0
    }
    (cache_dir / "meta.json").write_text(json.dumps(meta))

    mock_queries = {
        "pg_constraint": {"rows": []},
        "knowledge.collections": {"rows": []},
        "knowledge.chunks": {"rows": []},
        "knowledge.documents": {"rows": []},
        "tickets.factory_phase_events": {"rows": []},
        "github_": {"rows": []},
        "tickets.tickets": {"rows": []}
    }

    env = {"DEVFLOW_CACHE_DIR": str(tmp_path / "cache")}
    res = _run_audit_node(repo_root, audit_script, mock_queries, tmp_path, extra_env=env)
    assert res["graph_status"]["status"] == "ok"
    assert res["graph_status"]["freshness"] == "fresh"
    assert res["graph_status"]["coverage"] == "complete"
    assert res["graph_status"]["count"] == 42

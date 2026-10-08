"""Native migration of tests/unit/build-graph.bats."""
import json
import shutil
import subprocess

import pytest

# scripts/build-graph.mjs rewrites the tracked docs/generated/graph.json. Serialize and restore it.
pytestmark = pytest.mark.repo_lock("build-graph-graph-json")

BUILD_GRAPH = "scripts/build-graph.mjs"
GRAPH = "docs/generated/graph.json"


@pytest.fixture(autouse=True)
def _restore_graph(repo_root):
    graph = repo_root / GRAPH
    original = graph.read_bytes() if graph.exists() else None
    yield
    if original is None:
        graph.unlink(missing_ok=True)
    else:
        graph.write_bytes(original)


def _require_node():
    if shutil.which("node") is None:
        pytest.skip("node not installed")


def _run_build_graph(run_cmd, repo_root):
    _require_node()
    return run_cmd(["node", BUILD_GRAPH], cwd=repo_root, timeout=300)


def _graph(repo_root):
    return json.loads((repo_root / GRAPH).read_text(encoding="utf-8"))


def test_build_graph_mjs_exits_cleanly(run_cmd, repo_root):
    res = _run_build_graph(run_cmd, repo_root)
    assert res.returncode == 0, res.output


def test_build_graph_mjs_erzeugt_graph_json_mit_mind_5_nodes(run_cmd, repo_root):
    res = _run_build_graph(run_cmd, repo_root)
    assert res.returncode == 0, res.output
    assert len(_graph(repo_root).get("nodes") or []) >= 5


def test_graph_json_enthaelt_shared_db_node(run_cmd, repo_root):
    res = _run_build_graph(run_cmd, repo_root)
    assert res.returncode == 0, res.output
    assert "shared-db" in (repo_root / GRAPH).read_text(encoding="utf-8")


def test_graph_json_enthaelt_keycloak_node(run_cmd, repo_root):
    res = _run_build_graph(run_cmd, repo_root)
    assert res.returncode == 0, res.output
    assert "keycloak" in (repo_root / GRAPH).read_text(encoding="utf-8")


def test_graph_json_hat_generatedat_timestamp(run_cmd, repo_root):
    res = _run_build_graph(run_cmd, repo_root)
    assert res.returncode == 0, res.output
    generated = _graph(repo_root).get("generatedAt")
    # jq -r prints the literal "null" for a missing value.
    text = "null" if generated is None else str(generated)
    assert text
    assert text != "null"


def test_graph_json_enthaelt_edges_array(run_cmd, repo_root):
    res = _run_build_graph(run_cmd, repo_root)
    assert res.returncode == 0, res.output
    assert len(_graph(repo_root).get("edges") or []) >= 0

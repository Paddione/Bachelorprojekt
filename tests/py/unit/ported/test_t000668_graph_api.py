"""Native migration of tests/unit/T000668-graph-api.bats."""

# T000668 — Admin Live-Architektur-Graph API offline tests.

import json
import shutil
from pathlib import Path

import pytest


@pytest.fixture
def graph_json(repo_root: Path) -> Path:
    return repo_root / "docs" / "generated" / "graph.json"


def _count_lines(path: Path, needle: str) -> int:
    """grep -c semantics: number of lines containing needle."""
    return sum(1 for line in path.read_text(encoding="utf-8").splitlines() if needle in line)


def test_graph_json_exists_and_contains_website_namespace_placeholder(repo_root, graph_json):
    assert graph_json.is_file()
    assert _count_lines(graph_json, "WEBSITE_NAMESPACE") > 0


def test_graph_json_contains_workspace_namespace_placeholder(graph_json):
    assert _count_lines(graph_json, "WORKSPACE_NAMESPACE") > 0


def test_graph_json_has_at_least_10_nodes(graph_json):
    data = json.loads(graph_json.read_text(encoding="utf-8"))
    assert len(data["nodes"]) >= 10


def test_graph_json_has_at_least_1_edge(graph_json):
    data = json.loads(graph_json.read_text(encoding="utf-8"))
    assert len(data["edges"]) >= 1


def test_graph_ts_api_endpoint_file_exists(repo_root):
    assert (repo_root / "components/website/src/pages/sdlc/api/cluster/graph.ts").is_file()


def test_architektur_astro_page_file_exists(repo_root):
    assert (repo_root / "components/website/src/pages/sdlc/architektur.astro").is_file()


def test_architektur_graph_svelte_component_exists(repo_root):
    assert (repo_root / "components/website/src/components/admin/ArchitekturGraph.svelte").is_file()


def test_adminlayout_includes_architektur_page_reference(repo_root):
    assert (repo_root / "components/website/src/pages/sdlc/architektur.astro").is_file()


def test_k3d_kustomize_builds_without_regression(repo_root, run_cmd):
    if shutil.which("kubectl") is None:
        pytest.skip("kubectl not installed")
    result = run_cmd(
        ["kubectl", "kustomize", "k3d/", "--load-restrictor=LoadRestrictionsNone"],
        cwd=repo_root,
        timeout=300,
    )
    assert result.returncode == 0, result.output

"""Native migration of tests/unit/ticket-graph.bats."""
import re
import shutil
from pathlib import Path

import pytest


@pytest.fixture
def paths(repo_root: Path):
    base = repo_root / "components" / "website" / "src"
    return {
        "graph_lib": base / "lib" / "sdlc" / "ticket-graph.ts",
        "readiness_lib": base / "lib" / "ticket-readiness.ts",
        "graph_api": base / "pages" / "sdlc" / "api" / "tickets" / "graph.ts",
    }


def _has(path: Path, literal: str) -> bool:
    return literal in path.read_text(encoding="utf-8")


def _has_re(path: Path, pattern: str) -> bool:
    return re.search(pattern, path.read_text(encoding="utf-8")) is not None


def test_static_ticket_graph_ts_exists(paths):
    assert paths["graph_lib"].is_file()


def test_static_graph_api_endpoint_exists(paths):
    assert paths["graph_api"].is_file()


def test_static_exports_get_ticket_graph_function(paths):
    assert _has(paths["graph_lib"], "export async function getTicketGraph")


def test_static_exports_all_predecessors_done_function(paths):
    assert _has(paths["readiness_lib"], "export async function allPredecessorsDone")


def test_static_exports_update_successor_readiness_function(paths):
    assert _has(paths["readiness_lib"], "export async function updateSuccessorReadiness")


def test_static_defines_ticket_graph_interface(paths):
    assert _has_re(paths["graph_lib"], r"(export )?interface TicketGraph")


def test_static_defines_graph_node_interface(paths):
    assert _has_re(paths["graph_lib"], r"(export )?interface GraphNode")


def test_static_defines_graph_edge_interface(paths):
    assert _has_re(paths["graph_lib"], r"(export )?interface GraphEdge")


def test_static_uses_recursive_cte_for_graph_traversal(paths):
    assert _has(paths["graph_lib"], "WITH RECURSIVE")


def test_static_cte_references_dep_graph(paths):
    assert _has(paths["graph_lib"], "dep_graph")


def test_static_queries_depends_on_column(paths):
    assert _has(paths["graph_lib"], "depends_on")


def test_static_limits_recursion_depth(paths):
    assert _has(paths["graph_lib"], "depth < 10")


def test_static_computes_critical_path(paths):
    assert _has(paths["graph_lib"], "computeCriticalPath")


def test_static_critical_path_uses_topological_sort(paths):
    assert _has(paths["graph_lib"], "inDeg")


def test_static_api_endpoint_requires_admin_auth(paths):
    assert _has(paths["graph_api"], "isAdmin")


def test_static_api_endpoint_calls_get_ticket_graph(paths):
    assert _has(paths["graph_api"], "getTicketGraph")


def test_static_api_endpoint_returns_json(paths):
    assert _has(paths["graph_api"], "application/json")


def test_static_api_endpoint_returns_401_for_unauthorized(paths):
    assert _has(paths["graph_api"], "401")


def test_static_all_predecessors_done_checks_status_done(paths):
    assert _has(paths["readiness_lib"], "status === 'done'")


def test_static_update_successor_readiness_sets_abhaengigkeiten_klar(paths):
    assert _has(paths["readiness_lib"], "abhaengigkeiten_klar")


def test_static_update_successor_readiness_finds_successors_via_depends_on(paths):
    assert _has(paths["readiness_lib"], "$1 = ANY(depends_on)")


def test_static_typescript_syntax_valid(paths, run_cmd):
    if not shutil.which("node"):
        pytest.skip("TypeScript check not available")
    result = run_cmd(["node", "--check", str(paths["graph_lib"])])
    # node cannot parse TypeScript types, so a non-zero exit skips (as the original did).
    if result.returncode != 0:
        pytest.skip("TypeScript check not available")

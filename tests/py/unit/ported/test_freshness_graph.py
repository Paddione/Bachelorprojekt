"""Native migration of tests/unit/freshness-graph.bats (LAD-4 freshness gate for K8s graph artifacts)."""
import shutil
from pathlib import Path

import pytest

pytestmark = pytest.mark.repo_lock("freshness-graph")

GENERATED_FILES = ["graph.json", "api-map.json", "api-surface.md", "blast-radius.md"]


@pytest.fixture(autouse=True)
def generated_snapshot(repo_root: Path):
    """The generators rewrite tracked docs/generated files; restore them after each case."""
    gen_dir = repo_root / "docs" / "generated"
    backup = {name: (gen_dir / name).read_bytes() for name in GENERATED_FILES if (gen_dir / name).is_file()}
    yield
    for name, content in backup.items():
        (gen_dir / name).write_bytes(content)


def _node(run_cmd, repo_root: Path, script: str):
    return run_cmd(["node", script], cwd=repo_root, timeout=300)


def _jq(run_cmd, repo_root: Path, expr: str, file: str) -> str:
    return run_cmd(["jq", "-r", expr, file], cwd=repo_root, timeout=300).stdout.strip()


def test_build_graph_and_build_api_map_run_without_error(run_cmd, repo_root):
    assert _node(run_cmd, repo_root, "scripts/build-graph.mjs").returncode == 0
    assert _node(run_cmd, repo_root, "scripts/build-api-map.mjs").returncode == 0


def test_freshness_graph_check_passes_when_graph_json_is_committed(run_cmd, repo_root):
    assert _node(run_cmd, repo_root, "scripts/build-graph.mjs").returncode == 0
    assert _node(run_cmd, repo_root, "scripts/build-api-map.mjs").returncode == 0
    # Committed graph.json must parse and have the same node count as the freshly generated one.
    committed = run_cmd(["bash", "-c",
                         "git show HEAD:docs/generated/graph.json 2>/dev/null | jq '.nodes | length' || echo \"0\""],
                        cwd=repo_root, timeout=300)
    committed_count = int(committed.stdout.strip())
    fresh_count = int(_jq(run_cmd, repo_root, ".nodes | length", "docs/generated/graph.json"))
    assert committed_count == fresh_count


def test_graph_json_contains_at_least_20_nodes_and_60_edges(run_cmd, repo_root):
    assert _node(run_cmd, repo_root, "scripts/build-graph.mjs").returncode == 0
    node_count = int(_jq(run_cmd, repo_root, ".nodes | length", "docs/generated/graph.json"))
    edge_count = int(_jq(run_cmd, repo_root, ".edges | length", "docs/generated/graph.json"))
    assert node_count >= 20
    assert edge_count >= 60


def test_api_map_json_contains_at_least_15_endpoints(run_cmd, repo_root):
    assert _node(run_cmd, repo_root, "scripts/build-api-map.mjs").returncode == 0
    count = int(_jq(run_cmd, repo_root, ".endpoints | length", "docs/generated/api-map.json"))
    assert count >= 15


def test_graph_json_and_api_map_json_have_valid_generated_at_fields(run_cmd, repo_root):
    assert _node(run_cmd, repo_root, "scripts/build-graph.mjs").returncode == 0
    assert _node(run_cmd, repo_root, "scripts/build-api-map.mjs").returncode == 0
    g_ts = _jq(run_cmd, repo_root, ".generatedAt", "docs/generated/graph.json")
    a_ts = _jq(run_cmd, repo_root, ".generatedAt", "docs/generated/api-map.json")
    assert g_ts != ""
    assert g_ts != "null"
    assert a_ts != ""
    assert a_ts != "null"

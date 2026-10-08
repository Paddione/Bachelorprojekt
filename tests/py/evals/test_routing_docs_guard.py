"""tests/py/evals/test_routing_docs_guard.py — Migration of tests/evals/routing-docs-guard.bats."""
import re
import subprocess
from pathlib import Path
import pytest


@pytest.fixture
def routing_page(repo_root: Path) -> Path:
    return repo_root / "docs" / "brain" / "recall-routing.md"


def test_a_routing_page_exists(routing_page: Path):
    """(a) routing page exists."""
    assert routing_page.is_file()


def test_a_decision_tree_header_plus_three_query_type_branches(routing_page: Path):
    """(a) decision tree: header plus three query-type branches."""
    content = routing_page.read_text(encoding="utf-8")
    assert "## Entscheidung nach Fragetyp" in content
    assert "bekanntes Symbol" in content
    assert "semantische Was-Frage" in content
    assert "Doktrin/Prozess" in content


def test_a_fallback_order_freshness_table_ownership(routing_page: Path):
    """(a) fallback order, freshness table, ownership."""
    content = routing_page.read_text(encoding="utf-8")
    assert "## Fallback-Reihenfolge" in content
    assert "K1→K3→K4" in content
    assert "## Frische" in content
    assert "merge-gekoppelt, keine Zeit-SLA" in content
    assert "Bound Intervall+Dauer ≤ ~1h" in content
    assert "Authoring-Zeitpunkt" in content
    assert "## Ownership" in content
    assert "Epic-owned (T900447)" in content


def test_b_all_five_surfaces_reference_routing_page(repo_root: Path):
    """(b) all five surfaces reference the routing page."""
    surfaces = [
        "AGENTS.md",
        ".opencode/skills/references/mcp-tool-guide.md",
        ".opencode/prompts/orchestrator.md",
        ".opencode/prompts/primary-agent.md",
        ".opencode/prompts/glimmer-primary.md",
    ]
    for rel_path in surfaces:
        f = repo_root / rel_path
        assert f.is_file(), f"Surface file missing: {rel_path}"
        content = f.read_text(encoding="utf-8")
        assert "recall-routing" in content, f"REF FEHLT: {rel_path}"


def test_c_swept_refs_are_absent_scoped_per_file(repo_root: Path):
    """(c) swept refs are absent, scoped per file."""
    skills_yaml = repo_root / "docs" / "agent-guide" / "registry" / "skills.yaml"
    assert "brain-ingest" not in skills_yaml.read_text(encoding="utf-8")

    system_audit = repo_root / ".opencode" / "skills" / "system-audit" / "SKILL.md"
    assert not re.search(r"brain-ingest|brain-wiki|brain:ingest", system_audit.read_text(encoding="utf-8"))

    deploy_routing = repo_root / ".opencode" / "skills" / "references" / "deploy-routing.md"
    assert "build-docs" not in deploy_routing.read_text(encoding="utf-8")

    claude_md = repo_root / "CLAUDE.md"
    assert "brain-mcp-node" not in claude_md.read_text(encoding="utf-8")

    runbook = repo_root / "docs" / "runbooks" / "brain-ingest.md"
    assert not runbook.exists()


def test_c_retired_markers_are_present(repo_root: Path):
    """(c) retired markers are present."""
    k2 = repo_root / "docs" / "brain" / "k2-bge-paare.md"
    k2_content = k2.read_text(encoding="utf-8")
    assert "stillgelegt, K4-Retire" in k2_content
    assert "(entfernt)" in k2_content

    gesamt = repo_root / "docs" / "diagrams" / "brain-architektur-gesamtbild.md"
    assert "Mirror stillgelegt" in gesamt.read_text(encoding="utf-8")


def _generated_views(repo_root: Path, tmp_path: Path) -> dict[str, str]:
    """Regenerate into a temporary directory without touching tracked artifacts."""
    registry = tmp_path / "docs" / "agent-guide" / "registry"
    registry.parent.mkdir(parents=True)
    registry.symlink_to(repo_root / "docs" / "agent-guide" / "registry", target_is_directory=True)
    subprocess.run(["node", str(repo_root / "scripts/toolset/emit-map.mjs")],
                   cwd=tmp_path, check=True, capture_output=True, text=True)
    module = (repo_root / "scripts/agent-guide/emit-webapp.mjs").as_uri()
    projection = subprocess.run(
        ["node", "--input-type=module", "-e",
         f'import {{ buildWebappData, serialize }} from "{module}"; '
         'process.stdout.write(serialize(buildWebappData(process.argv[1])));',
         str(repo_root / "docs/agent-guide/registry")],
        cwd=repo_root, check=True, capture_output=True, text=True,
    )
    return {
        "docs/agent-guide/maps/toolset-map.md":
            (tmp_path / "docs/agent-guide/maps/toolset-map.md").read_text(encoding="utf-8"),
        "components/website/src/lib/agent-guide.generated.json": projection.stdout,
    }


def _assert_generated_views_match(repo_root: Path, expected: dict[str, str]):
    for rel, content in expected.items():
        artifact = repo_root / rel
        assert artifact.is_file(), f"KEEPER FEHLT: {rel}"
        assert artifact.read_text(encoding="utf-8") == content, f"REGEN FEHLT: {rel}"


def test_d_keepers_k3_target_exists_and_generated_files_match_registry(repo_root: Path, tmp_path: Path):
    """Actual generator output is authoritative, not checkout or commit timestamps."""
    assert (repo_root / "docs/brain/k3-code-graph.md").is_file()
    _assert_generated_views_match(repo_root, _generated_views(repo_root, tmp_path))


@pytest.mark.parametrize("stale", [
    "docs/agent-guide/maps/toolset-map.md",
    "components/website/src/lib/agent-guide.generated.json",
])
def test_generated_view_guard_rejects_stale_content_even_with_new_mtime(
    repo_root: Path, tmp_path: Path, stale: str,
):
    expected = _generated_views(repo_root, tmp_path / "generated")
    fixture = tmp_path / "stale-repo"
    for rel, content in expected.items():
        artifact = fixture / rel
        artifact.parent.mkdir(parents=True, exist_ok=True)
        artifact.write_text(content, encoding="utf-8")
    (fixture / stale).write_text("stale content freshly written\n", encoding="utf-8")
    with pytest.raises(AssertionError, match="REGEN FEHLT"):
        _assert_generated_views_match(fixture, expected)

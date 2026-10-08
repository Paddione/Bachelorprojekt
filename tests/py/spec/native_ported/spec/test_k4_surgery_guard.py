"""Native migration of tests/spec/k4-surgery-guard.bats."""

import re
from pathlib import Path


def _grep_count_lines(files, pattern: str, repo: Path) -> int:
    """grep -n/-c über Dateien (2>/dev/null): Anzahl passender Zeilen; fehlende Dateien zählen nicht."""
    rx = re.compile(pattern)
    total = 0
    for f in files:
        if not f.is_file():
            continue
        for ln in f.read_text(errors="replace").splitlines():
            if rx.search(ln):
                total += 1
    return total


def _grep_r_files(root: Path, needle: str):
    """grep -rln <needle> <root>: Dateien unterhalb root, die needle enthalten."""
    hits = []
    if not root.exists():
        return hits
    for p in sorted(root.rglob("*")):
        if p.is_file():
            try:
                if needle in p.read_text(errors="replace"):
                    hits.append(p)
            except OSError:
                continue
    return hits


def test_k4a_pipeline_scripts_and_ingest_skill_are_absent(repo_root):
    rest = []
    for f in [
        "scripts/brain-ingest.sh", "scripts/brain-ingest-worklist.sh", "scripts/brain-ingest-transform.sh",
        "scripts/brain-ingest-moc.sh", "scripts/brain-ingest-prune.sh", "scripts/brain-ingest-restamp.sh",
        "scripts/brain-ingest-swap.sh", "scripts/brain-ingest-reset.sh", "scripts/brain-ingest-coverage.sh",
        "scripts/brain-group-match.sh", "scripts/brain-source-provenance.sh", "scripts/brain-page-metadata.py",
        "scripts/brain-lifecycle-audit.py", "scripts/brain-expertise.py", "scripts/brain-bootstrap.sh",
        "scripts/brain-merge-hook.sh",
    ]:
        if (repo_root / f).exists() or (repo_root / f).is_symlink():
            rest.append(f"DEL-REST: {f}")
    if (repo_root / ".agents/skills/brain-ingest").is_dir():
        rest.append("DEL-REST: skill dir")
    assert rest == [], "\n".join(rest)


def test_k4b_ingest_manifest_and_merge_hook_workflow_are_absent(repo_root):
    assert not (repo_root / "scripts/brain/ingest-sources.yaml").exists()
    assert not (repo_root / ".github/workflows/brain-merge-hook.yml").exists()
    hits = _grep_r_files(repo_root / "scripts", "ssot-specs") + _grep_r_files(repo_root / "taskfiles", "ssot-specs")
    assert len(hits) == 0


def test_k4c_brain_mcp_server_and_registry_wiring_are_absent(repo_root):
    assert not (repo_root / "scripts/brain-mcp-server.py").exists()
    assert not (repo_root / "scripts/brain-mcp-node").is_dir()
    wiring = [repo_root / p for p in (
        ".mcp.json", ".opencode/opencode.jsonc", "docs/agent-guide/registry/mcp.yaml",
        "docs/agent-guide/registry/capabilities.yaml", "docs/agent-guide/maps/toolset-map.md")]
    assert _grep_count_lines(wiring, re.escape("brain-mcp-node"), repo_root) == 0
    tools = [repo_root / "docs/agent-guide/registry/capabilities.yaml",
             repo_root / "docs/agent-guide/maps/toolset-map.md"]
    assert _grep_count_lines(tools, r"brain_search|brain_read", repo_root) == 0


def test_k4d_cockpit_brain_wiring_and_brain_manifests_are_absent(repo_root):
    assert not (repo_root / "components/website/src/lib/sdlc/brain-links.ts").exists()
    assert not (repo_root / "components/website/src/pages/sdlc/api/cockpit/brain.ts").exists()
    assert not (repo_root / "k3d/brain.yaml").exists()
    assert not (repo_root / "k3d/oauth2-proxy-brain.yaml").exists()
    files = [repo_root / "k3d/ingress.yaml", repo_root / "k3d/kustomization.yaml"]
    assert _grep_count_lines(files, "brain", repo_root) == 0


def test_k4e_g_brain12_13_14_are_retired_except_two_history_lines(repo_root):
    checks = repo_root / "scripts/health-goals-check.sh"
    goals = repo_root / ".claude/lib/goals.md"
    assert _grep_count_lines([checks], r"G-BRAIN1[234]", repo_root) == 0
    assert _grep_count_lines([goals], r"G-BRAIN1[234]", repo_root) == 2
    text = goals.read_text()
    assert "Nummerierung ab `G-BRAIN12`" in text
    assert "G-BRAIN13 (`.github/`-Pfade" in text


def test_k4f_pipeline_keepers_are_present(repo_root):
    for f in ("scripts/brain-chunk.sh", "scripts/brain-verify-refs.sh", "scripts/brain-verify-claims.sh",
              "scripts/brain-retrieval-eval.py", "scripts/brain-index.py"):
        assert (repo_root / f).is_file(), f


def test_k4g_g_brain15_and_the_brain_seed_templates_are_present(repo_root):
    checks = repo_root / "scripts/health-goals-check.sh"
    goals = repo_root / ".claude/lib/goals.md"
    assert _grep_count_lines([checks], "G-BRAIN15", repo_root) >= 1
    assert _grep_count_lines([goals], "G-BRAIN15", repo_root) >= 1
    assert (repo_root / "templates/brain").is_dir()
    assert (repo_root / "templates/brain/site.Dockerfile").is_file()

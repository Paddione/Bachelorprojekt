"""Native migration of tests/spec/local-dev-mesh/no-k3d-context.bats."""

from pathlib import Path

import pytest

PAT = "k3d-mentolder" + "-dev"


def _active_hits(run_cmd, repo_root: Path) -> str:
    legacy_root = "open" + "spec"
    ex = [
        f":!{legacy_root}/changes",
        ":!docs/superpowers/plans",
        ":!docs/superpowers/specs/archive",
        ":!docs/adr",
        ":!scripts/migrations",
        ":!tests/fixtures/mishap-dedupe-korpus.json",
        ":!tests/spec/local-dev-mesh/migrate-from-k3d.bats",
        ":!docs/spec-atlas.md",
        ":!scripts/devmesh/migrate-from-k3d.sh",
    ]
    if (repo_root / ".agents" / "plans" / "devmesh-k3d-residue-cleanup").is_dir():
        ex.append(f":!{legacy_root}/specs")
    res = run_cmd(["git", "-C", str(repo_root), "grep", "-l", "-F", "-e", PAT, "--", ".", *ex])
    return res.stdout


def test_search_finds_the_pattern_in_an_excluded_path_positive_anchor(repo_root, run_cmd):
    res = run_cmd(["git", "-C", str(repo_root), "grep", "-l", "-F", "-e", PAT, "--", "docs/adr"])
    assert res.returncode == 0, res.output
    assert res.stdout.strip()


def test_no_active_reference_to_the_k3d_dev_context_remains(repo_root, run_cmd):
    anchor = run_cmd(["git", "-C", str(repo_root), "grep", "-l", "-F", "-e", PAT, "--", "docs/adr"]).stdout
    assert anchor.strip()
    hits = _active_hits(run_cmd, repo_root)
    assert hits.strip() == "", f"aktive Verweise:\n{hits}"

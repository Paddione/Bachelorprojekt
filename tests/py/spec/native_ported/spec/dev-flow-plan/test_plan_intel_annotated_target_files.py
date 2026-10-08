"""Native migration of tests/spec/dev-flow-plan/plan-intel-annotated-target-files.bats."""
# T008015-3: plan-intel.sh must not take annotated target_files cells literally.
# PRUEFMODUS: output verification [T002448-M4]: runs scripts/plan-intel.sh against a sandbox
# slug under .agents/plans/ (the script derives REPO_ROOT from its own location, so the sandbox

# must live in the repo tree). The sandbox directory is removed after each test.

import json
import shutil

import pytest

# Writes fixed paths under the shared repo; serialize across xdist workers.
pytestmark = pytest.mark.repo_lock("agents-plans")

SLUG = "sandbox-slug"


@pytest.fixture
def change_dir(repo_root):
    d = repo_root / ".agents" / "plans" / SLUG
    (d / "tasks.d").mkdir(parents=True, exist_ok=True)
    try:
        yield d
    finally:
        shutil.rmtree(d, ignore_errors=True)


@pytest.fixture
def needs_jq():
    if shutil.which("jq") is None:
        pytest.skip("jq not installed")


def _manifest(partials: list[str], tasks: list[str]) -> str:
    return (
        "# sandbox-slug — Implementation Plan\n\n"
        "## File Structure\n"
        "- scripts/keep.sh\n- scripts/tests/run.bats\n\n"
        "## Partials\n" + "\n".join(partials) + "\n\n"
        "## Tasks\n" + "\n".join(tasks) + "\n"
    )


def _impact_paths(change_dir):
    data = json.loads((change_dir / "intel.json").read_text(encoding="utf-8"))
    return sorted(entry["path"] for entry in data.get("impact_files", []))


def _run_intel(run_cmd, repo_root):
    return run_cmd([str(repo_root / "scripts" / "plan-intel.sh"), SLUG], cwd=repo_root)


def test_t008015_3_annotierte_zelle_toleriert_praefix_loeschungen_wird_kein_pfad(
    run_cmd, repo_root, change_dir, needs_jq
):
    """T008015-3: annotierte Zelle toleriert — Praefix 'Loeschungen:' wird kein Pfad"""
    (change_dir / "tasks.md").write_text(_manifest(
        [
            "| p1 | tasks.d/p1.md | impl | scripts/keep.sh, Löschungen: scripts/delete-me.sh | |",
            "| p2 | tasks.d/p2.md | tests | scripts/tests/run.bats | p1 |",
        ],
        ["## Task 1", "`scripts/keep.sh`", "## Task 2", "`scripts/tests/run.bats`"],
    ), encoding="utf-8")
    res = _run_intel(run_cmd, repo_root)
    assert res.returncode == 0, res.output
    assert _impact_paths(change_dir) == sorted(["scripts/keep.sh", "scripts/tests/run.bats"])


def test_t008015_3_brace_zelle_alternation_bleibt_literal_konvention_zellen_pfadrein(
    run_cmd, repo_root, change_dir, needs_jq
):
    """T008015-3: Brace-Zelle — Alternation bleibt literal (Konvention: Zellen pfadrein)"""
    (change_dir / "tasks.md").write_text(_manifest(
        [
            "| p1 | tasks.d/p1.md | impl | scripts/{a,b}.sh | |",
            "| p2 | tasks.d/p2.md | tests | scripts/tests/run.bats | p1 |",
        ],
        ["## Task 1", "`scripts/a.sh`", "## Task 2", "`scripts/b.sh`"],
    ), encoding="utf-8")
    res = _run_intel(run_cmd, repo_root)
    assert res.returncode == 0, res.output
    assert _impact_paths(change_dir) == sorted(["b}.sh", "scripts/{a", "scripts/tests/run.bats"])


def test_t008015_3_backtick_quotierte_zellen_backticks_werden_entfernt_echtes_manifest_format(
    run_cmd, repo_root, change_dir, needs_jq
):
    """T008015-3: Backtick-quotierte Zellen — Backticks werden entfernt (echtes Manifest-Format)"""
    (change_dir / "tasks.md").write_text(_manifest(
        [
            "| p1 | tasks.d/p1.md | impl | `scripts/keep.sh`, `scripts/tests/run.bats` | |",
            "| p2 | tasks.d/p2.md | tests | `scripts/tests/run.bats` | p1 |",
        ],
        ["## Task 1", "`scripts/keep.sh`", "## Task 2", "`scripts/tests/run.bats`"],
    ), encoding="utf-8")
    res = _run_intel(run_cmd, repo_root)
    assert res.returncode == 0, res.output
    paths = _impact_paths(change_dir)
    assert paths == sorted(["scripts/keep.sh", "scripts/tests/run.bats"])
    # Negativ-Anker: kein Pfad darf Backticks enthalten.
    assert not any("`" in p for p in paths)

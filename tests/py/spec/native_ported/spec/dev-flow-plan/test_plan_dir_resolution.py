"""Native migration of tests/spec/dev-flow-plan/plan-dir-resolution.bats."""
# T900689: plan-intel.sh, plan-intel-filter.sh and plan-embed.mjs looked for plans only under
# .agents/plans/<slug>/. PRUEFMODUS: output verification [T002448-M4]: the scripts are run
# against a sandbox slug under .agents/plans/ (the scripts derive REPO_ROOT from their own

# location, so the sandbox must live in the repo tree). The sandbox is removed after each test.

import shutil

import pytest

# Writes fixed paths under the shared repo; serialize across xdist workers.
pytestmark = pytest.mark.repo_lock("agents-plans")

SLUG = "sandbox-plan-dir-t900689"

TASKS_MD = """---
title: "sandbox — Implementation Plan"
ticket_id: T900689
domains: [test]
status: plan_staged
---

# sandbox — Implementation Plan

## File Structure
- scripts/plan-intel.sh

## Partials
| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | tasks.d/p1.md | tests | scripts/plan-intel.sh | |
"""


@pytest.fixture
def sandbox(repo_root):
    plan_dir = repo_root / ".agents" / "plans" / SLUG
    (plan_dir / "tasks.d").mkdir(parents=True, exist_ok=True)
    (plan_dir / "tasks.md").write_text(TASKS_MD, encoding="utf-8")
    (plan_dir / "proposal.md").write_text(
        "# sandbox\n\nProposal text for the embed dry-run.\n", encoding="utf-8"
    )
    try:
        yield plan_dir
    finally:
        shutil.rmtree(plan_dir, ignore_errors=True)


@pytest.fixture
def needs_jq():
    if shutil.which("jq") is None:
        pytest.skip("jq not installed")


def test_t900689_plan_intel_sh_liest_tasks_md_aus_agents_plans_und_schreibt_intel_json_dorthin(
    run_cmd, repo_root, sandbox, needs_jq
):
    res = run_cmd(["bash", str(repo_root / "scripts" / "plan-intel.sh"), SLUG], cwd=repo_root)
    assert res.returncode == 0, res.output
    intel = sandbox / "intel.json"
    assert intel.is_file()
    paths = run_cmd(["jq", "-r", ".impact_files[].path", str(intel)], cwd=repo_root)
    assert paths.stdout.strip() == "scripts/plan-intel.sh"


def test_t900689_plan_intel_filter_sh_loest_den_slug_unter_agents_plans_auf(
    run_cmd, repo_root, sandbox, needs_jq
):
    run_cmd(["bash", str(repo_root / "scripts" / "plan-intel.sh"), SLUG], cwd=repo_root)
    cmd = (
        f"cd '{repo_root}' && scripts/plan-intel-filter.sh '{SLUG}' scripts/plan-intel.sh "
        "| jq -r '.impact_files[].path'"
    )
    res = run_cmd(["bash", "-c", cmd], cwd=repo_root)
    assert res.returncode == 0, res.output
    assert res.stdout.strip() == "scripts/plan-intel.sh"

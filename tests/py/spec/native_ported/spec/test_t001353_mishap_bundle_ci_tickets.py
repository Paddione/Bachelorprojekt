"""Native migration of tests/spec/t001353-mishap-bundle-ci-tickets.bats."""

import json
from pathlib import Path

import pytest


@pytest.fixture
def repo(repo_root: Path) -> Path:
    return repo_root


def test_mishap_1_plan_lint_effective_threshold_matches_current_baseline_not_stale_snapshot(run_cmd, repo, tmp_path):
    baseline = tmp_path / "baseline.json"
    baseline.write_text(json.dumps({
        "S1:components/website/src/components/inbox/InboxApp.svelte": {"metric": 1200},
    }, indent=2) + "\n", encoding="utf-8")
    limit_res = run_cmd(["yq", "-r", ".s1.limits[\".svelte\"]", str(repo / "docs" / "code-quality" / "gates.yaml")])
    assert limit_res.returncode == 0, limit_res.output
    limit = int(limit_res.stdout.strip())

    res = run_cmd(
        ["bash", str(repo / "scripts" / "plan-lint.sh"), "effective_threshold",
         "components/website/src/components/inbox/InboxApp.svelte"],
        env={"PLAN_LINT_SELFTEST": "1", "BASELINE": str(baseline)},
    )
    assert res.returncode == 0, res.output
    expected = 1200 if 1200 > limit else limit
    assert res.output == str(expected)


"""Native migration of tests/spec/website-svelte-check.bats."""

import os
import pytest
import yaml


def test_svelte_check_reports_zero_errors(repo_root, run_cmd):
    website = repo_root / "components/website"
    checker = website / "node_modules/.bin/svelte-check"
    if not os.access(checker, os.X_OK):
        pytest.skip("svelte-check not installed in components/website")
    result = run_cmd([str(checker), "--threshold", "error", "--output", "machine"], cwd=website, timeout=180)
    assert " COMPLETED " in result.output, result.output
    assert " ERROR " not in result.output, result.output


def test_website_ci_runs_svelte_check_as_blocking_step(repo_root):
    workflow = yaml.safe_load((repo_root / ".github/workflows/ci.yml").read_text())
    job = workflow["jobs"]["vitest-website"]
    steps = [step for step in job["steps"] if "svelte-check --threshold error" in step.get("run", "")]
    assert steps
    assert all(not step.get("continue-on-error", False) for step in steps)

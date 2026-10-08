"""Native migration of tests/spec/health-goals/runtime-health-goals.bats."""

import re

import pytest

FIXTURES = "tests/fixtures/health-goals/runtime"


@pytest.fixture
def tool(repo_root):
    return repo_root / "scripts" / "lib" / "runtime-health-measure.py"


@pytest.fixture
def assert_measure(run_cmd, repo_root, tool):
    def _check(mode, fixture, expected):
        result = run_cmd(
            ["python3", str(tool), mode, "--input", str(repo_root / FIXTURES / fixture)]
        )
        assert result.returncode == 0, result.output
        assert result.output == expected, f"{mode} {fixture}: '{result.output}' != '{expected}'"

    return _check


def test_flux_counts_unhealthy_and_fails_closed_on_empty_input(assert_measure):
    assert_measure("flux", "flux-ready.json", "0")
    assert_measure("flux", "flux-unhealthy.json", "2")
    assert_measure("flux", "empty-items.json", "-")


def test_prometheus_scrape_health_requires_a_non_empty_target_basis(assert_measure):
    assert_measure("scrape", "prometheus-up.json", "0")
    assert_measure("scrape", "prometheus-down.json", "1")
    assert_measure("scrape", "prometheus-empty.json", "-")


def test_pvc_headroom_counts_volumes_below_twenty_percent(assert_measure):
    assert_measure("capacity", "pvc-healthy.json", "0")
    assert_measure("capacity", "pvc-low.json", "1")
    assert_measure("capacity", "prometheus-empty.json", "-")


def test_axe_counts_only_serious_and_critical_findings_across_both_brands(assert_measure):
    assert_measure("axe", "axe-clean.json", "0")
    assert_measure("axe", "axe-findings.json", "2")
    assert_measure("axe", "axe-incomplete.json", "-")


def test_lighthouse_returns_the_lower_integer_score_and_rejects_incomplete_reports(assert_measure):
    assert_measure("lighthouse", "lighthouse-valid.json", "91")
    assert_measure("lighthouse", "lighthouse-low.json", "78")
    assert_measure("lighthouse", "lighthouse-incomplete.json", "-")


def test_slo_returns_the_worse_brand_in_promille_and_requires_complete_history(assert_measure):
    assert_measure("slo", "slo-healthy.json", "998")
    assert_measure("slo", "slo-low.json", "991")
    assert_measure("slo", "slo-incomplete.json", "-")


def test_health_goal_ids_and_guarded_runtime_invocations_are_registered(repo_root):
    checker = (repo_root / "scripts" / "health-goals-check.sh").read_text(encoding="utf-8")
    goals = (repo_root / ".claude" / "lib" / "goals.md").read_text(encoding="utf-8")
    for goal_id in ("G-FLUX01", "G-OBS01", "G-CAP01", "G-A11Y01", "G-FE05", "G-SLO01"):
        assert f"row target {goal_id}" in checker, f"row target {goal_id} fehlt im Checker"
        assert f"**{goal_id}**" in goals, f"**{goal_id}** fehlt in goals.md"

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


def test_flux_skips_suspended_resources_without_error_flag(assert_measure):
    # Absichtlich suspendiert (fehlende Prereqs) ist Soll-Zustand, kein Fehler:
    # nur das genuinely kaputte Objekt zaehlt.
    assert_measure("flux", "flux-suspended.json", "1")


def test_prometheus_scrape_health_requires_a_non_empty_target_basis(assert_measure):
    assert_measure("scrape", "prometheus-up.json", "0")
    assert_measure("scrape", "prometheus-down.json", "1")
    assert_measure("scrape", "prometheus-empty.json", "-")


def test_pvc_headroom_counts_volumes_below_twenty_percent(assert_measure):
    assert_measure("capacity", "pvc-healthy.json", "0")
    assert_measure("capacity", "pvc-low.json", "1")
    assert_measure("capacity", "prometheus-empty.json", "-")


def test_prometheus_via_kubectl_service_proxy_is_opt_in(run_cmd, repo_root, tool, tmp_path):
    # Fake-kubectl liefert die Fixture nur fuer den Service-Proxy-Pfad des
    # monitoring/prometheus-Service; so prueft der Test Ziel und Ergebnis.
    fixture = repo_root / FIXTURES / "pvc-low.json"
    fake = tmp_path / "kubectl"
    fake.write_text(
        "#!/usr/bin/env bash\n"
        'case "$*" in\n'
        f'  *"--context devmesh"*"/namespaces/monitoring/services/http:prometheus:http/proxy/api/v1/query?"*) cat "{fixture}" ;;\n'
        "  *) exit 1 ;;\n"
        "esac\n"
    )
    fake.chmod(0o755)
    import os
    env = {k: v for k, v in os.environ.items() if k != "HG_PROMETHEUS_URL"}
    env["PATH"] = f"{tmp_path}:{env['PATH']}"
    env["HG_OPS_CTX"] = "devmesh"
    closed = run_cmd(["python3", str(tool), "capacity"], env=env)
    assert closed.output == "-", closed.output
    env["HG_PROMETHEUS_KUBECTL"] = "1"
    live = run_cmd(["python3", str(tool), "capacity"], env=env)
    assert live.output == "1", live.output


def test_axe_counts_only_serious_and_critical_findings_across_covered_brands(assert_measure):
    assert_measure("axe", "axe-clean.json", "0")
    assert_measure("axe", "axe-findings.json", "1")
    assert_measure("axe", "axe-incomplete.json", "-")


def test_axe_skipped_gated_routes_count_zero_and_keep_basis_complete(assert_measure):
    # Auth-Wall (z. B. oauth2-proxy 401): kein bewertbares HTML — der Audit
    # erfasst den Skip mit Grund, das Mass bleibt 0, die Basis bleibt komplett.
    assert_measure("axe", "axe-gated.json", "0")


def test_lighthouse_returns_the_integer_score_and_rejects_incomplete_reports(assert_measure):
    assert_measure("lighthouse", "lighthouse-valid.json", "91")
    assert_measure("lighthouse", "lighthouse-low.json", "78")
    assert_measure("lighthouse", "lighthouse-incomplete.json", "-")


def test_slo_returns_availability_in_promille_and_requires_complete_history(assert_measure):
    assert_measure("slo", "slo-healthy.json", "998")
    assert_measure("slo", "slo-low.json", "991")
    assert_measure("slo", "slo-incomplete.json", "-")


def test_health_goal_ids_and_guarded_runtime_invocations_are_registered(repo_root):
    checker = (repo_root / "scripts" / "health-goals-check.sh").read_text(encoding="utf-8")
    goals = (repo_root / ".claude" / "lib" / "goals.md").read_text(encoding="utf-8")
    for goal_id in ("G-FLUX01", "G-OBS01", "G-CAP01", "G-A11Y01", "G-FE05", "G-SLO01"):
        assert f"row target {goal_id}" in checker, f"row target {goal_id} fehlt im Checker"
        assert f"**{goal_id}**" in goals, f"**{goal_id}** fehlt in goals.md"

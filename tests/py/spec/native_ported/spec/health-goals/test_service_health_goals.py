"""Native migration of tests/spec/health-goals/service-health-goals.bats."""

import re

import pytest

NEW_GOALS = [
    "G-SVC01", "G-SVC02", "G-SVC03", "G-SVC04", "G-INF01", "G-INF02", "G-INF03",
    "G-INF04", "G-CJ01", "G-ALR01", "G-DRIFT01", "G-DRIFT02", "G-DRIFT03",
]
NUMBER_OR_DASH = re.compile(r"^[0-9]+$|^-$")


@pytest.fixture
def measure(repo_root):
    return repo_root / "scripts" / "lib" / "runtime-health-measure.py"


@pytest.fixture
def goals_md(repo_root):
    return (repo_root / ".claude" / "lib" / "goals.md").read_text(encoding="utf-8").splitlines()


@pytest.fixture
def check_sh(repo_root):
    return (repo_root / "scripts" / "health-goals-check.sh").read_text(encoding="utf-8")


def _assert_number_or_dash(output, label):
    assert NUMBER_OR_DASH.match(output), f"{label} gab '{output}' zurueck - erwartet Ganzzahl oder '-'"


def test_runtime_health_measure_py_alte_messungen_noch_verfuegbar_positiv_anker(run_cmd, measure):
    result = run_cmd(["python3", str(measure), "flux", "--input", "/dev/null"])
    assert result.returncode == 0, result.output


def test_svc_probe_existiert_als_measurement_choice_in_runtime_health_measure_py(run_cmd, measure):
    result = run_cmd(["python3", str(measure), "svc-probe"])
    assert result.returncode == 0, "svc-probe ist keine gueltige measurement choice (invalid choice)"
    assert result.output == "0", f"svc-probe meldet '{result.output}' ungedeckte Produktions-Ingresses"


def test_infra_tcp_existiert_als_measurement_choice(run_cmd, measure):
    result = run_cmd(["python3", str(measure), "infra-tcp", "--input", "/dev/null"])
    assert result.returncode == 0, result.output
    _assert_number_or_dash(result.output, "infra-tcp")


def test_infra_http_existiert_als_measurement_choice(run_cmd, measure):
    result = run_cmd(["python3", str(measure), "infra-http", "--input", "/dev/null"])
    assert result.returncode == 0, result.output
    _assert_number_or_dash(result.output, "infra-http")




def test_service_http_goals_use_dedicated_measurements(run_cmd, measure, check_sh, repo_root):
    for measurement in ("svc-oidc", "svc-nextcloud", "svc-whiteboard"):
        result = run_cmd(["python3", str(measure), measurement, "--input", "/dev/null"])
        assert result.returncode == 0, f"{measurement} exit {result.returncode}"
        _assert_number_or_dash(result.output, measurement)
    for measurement in ("svc-oidc", "svc-nextcloud", "svc-whiteboard"):
        assert f"runtime_measure {measurement}" in check_sh


def test_cron_status_existiert_als_measurement_choice_und_liefert_zahl_oder_dash(run_cmd, measure):
    result = run_cmd(["python3", str(measure), "cron-status", "--input", "/dev/null"])
    assert result.returncode == 0, result.output
    _assert_number_or_dash(result.output, "cron-status")


def test_drift_existiert_als_measurement_choice_und_liefert_zahl_oder_dash(run_cmd, measure):
    result = run_cmd(["python3", str(measure), "drift", "--input", "/dev/null"])
    assert result.returncode == 0, result.output
    _assert_number_or_dash(result.output, "drift")




def test_alert_status_existiert_als_measurement_choice_und_meldet_1(run_cmd, measure):
    result = run_cmd(["python3", str(measure), "alert-status"])
    assert result.returncode == 0, result.output
    assert result.output == "1", (
        f"alert-status muss 1 melden (E-Mail-Receiver deaktiviert), bekam '{result.output}'"
    )


def test_cronjob_check_sh_existiert_und_ist_executable(repo_root):
    script = repo_root / "scripts" / "lib" / "cronjob-check.sh"
    assert script.is_file()
    assert script.stat().st_mode & 0o111


def test_cronjob_check_sh_gibt_ganzzahl_oder_dash_zurueck_fail_closed(run_cmd, repo_root):
    result = run_cmd(["bash", str(repo_root / "scripts" / "lib" / "cronjob-check.sh")])
    assert result.returncode == 0, f"cronjob-check.sh ended mit status {result.returncode}"
    _assert_number_or_dash(result.output, "cronjob-check.sh")


def test_manifest_drift_check_sh_existiert_und_ist_executable(repo_root):
    script = repo_root / "scripts" / "lib" / "manifest-drift-check.sh"
    assert script.is_file()
    assert script.stat().st_mode & 0o111


def test_manifest_drift_check_sh_replicas_gibt_ganzzahl_oder_dash_zurueck(run_cmd, repo_root):
    result = run_cmd(["bash", str(repo_root / "scripts" / "lib" / "manifest-drift-check.sh"), "replicas"])
    assert result.returncode == 0, f"manifest-drift-check.sh replicas ended mit status {result.returncode}"
    _assert_number_or_dash(result.output, "manifest-drift-check.sh replicas")


def test_manifest_drift_check_sh_probes_gibt_ganzzahl_oder_dash_zurueck(run_cmd, repo_root):
    result = run_cmd(["bash", str(repo_root / "scripts" / "lib" / "manifest-drift-check.sh"), "probes"])
    assert result.returncode == 0, f"manifest-drift-check.sh probes ended mit status {result.returncode}"
    _assert_number_or_dash(result.output, "manifest-drift-check.sh probes")


def test_manifest_drift_check_sh_sealed_gibt_ganzzahl_oder_dash_zurueck(run_cmd, repo_root):
    result = run_cmd(["bash", str(repo_root / "scripts" / "lib" / "manifest-drift-check.sh"), "sealed"])
    assert result.returncode == 0, f"manifest-drift-check.sh sealed ended mit status {result.returncode}"
    _assert_number_or_dash(result.output, "manifest-drift-check.sh sealed")




def test_goals_md_alle_13_neuen_goal_ids_als_h2_sektion_vorhanden_t005321(goals_md):
    for goal_id in NEW_GOALS:
        assert any(line.startswith(f"## {goal_id} ") for line in goals_md), (
            f"'{goal_id}' fehlt als H2-Sektion in goals.md"
        )


def test_goals_md_alle_13_neuen_goals_haben_was_beschreibung_und_messbefehl(goals_md):
    for goal_id in NEW_GOALS:
        windows = []
        for index, line in enumerate(goals_md):
            if line.startswith(f"## {goal_id}"):
                windows.extend(goals_md[index:index + 11])
        assert any("Was:" in line for line in windows), (
            f"'{goal_id}' hat keine 'Was:' Beschreibung in goals.md"
        )
        assert any("`" in line for line in windows), (
            f"'{goal_id}' hat keinen Messbefehl in backticks in goals.md"
        )


def test_health_goals_check_sh_alle_13_neuen_goals_als_row_target_integriert_p5(check_sh):
    for goal_id in NEW_GOALS:
        assert f"row target {goal_id}" in check_sh, f"'row target {goal_id}' fehlt in health-goals-check.sh"

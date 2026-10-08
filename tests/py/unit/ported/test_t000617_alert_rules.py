"""Native migration of tests/unit/T000617-alert-rules.bats."""
import re
import shutil

import pytest

RULES_FILE = "k3d/monitoring/prometheus-rules.yaml"
AM_FILE = "k3d/monitoring/alertmanager-config.yaml"


def read(repo_root, rel):
    return (repo_root / rel).read_text(encoding="utf-8", errors="replace")


def test_prometheus_rules_yaml_exists(repo_root):
    assert (repo_root / RULES_FILE).is_file()


def test_prometheus_rules_yaml_declares_all_8_mandatory_alerts(repo_root):
    text = read(repo_root, RULES_FILE)
    for alert in ("PodCrashLoopBackOff", "HighCPUUsage", "HighMemoryUsage", "HighDiskUsage",
                  "High5xxErrorRate", "PodRestartSpike", "NodeHighCPUUsage", "NodeFilesystemAlmostFull"):
        assert f"alert: {alert}" in text, f"alert fehlt: {alert}"


def test_prometheus_rules_yaml_passes_promtool_check_rules(run_cmd, repo_root, tmp_path):
    if shutil.which("promtool") is None:
        pytest.skip("promtool not installed (offline)")
    if shutil.which("yq") is None:
        pytest.skip("yq not installed (offline)")
    tmp = tmp_path / "rules.yaml"
    extracted = run_cmd(["yq", ".spec", RULES_FILE], cwd=repo_root, timeout=300)
    tmp.write_text(extracted.stdout)
    run = run_cmd(["promtool", "check", "rules", str(tmp)], cwd=repo_root, timeout=300)
    assert run.returncode == 0, run.output


def test_alertmanager_config_yaml_has_no_pushover_receiver_while_creds_are_absent(repo_root):
    text = read(repo_root, AM_FILE)
    # Positiv-Anker: der receivers-Block muss vorhanden sein.
    assert any(re.search(r"^  receivers:", ln) for ln in text.splitlines())
    # Ein pushoverConfigs mit leerem userKey verwirft die komplette Config. [T014542]
    pushover = sum(1 for ln in text.splitlines() if "pushoverConfigs:" in ln)
    assert pushover == 0


def test_alertmanager_config_yaml_routes_alerts_to_the_authorized_operator_mailbox(repo_root):
    lines = read(repo_root, AM_FILE).splitlines()
    assert any(re.search(r"^    - name: operator-email", ln) for ln in lines)
    assert any(re.search(r"^    receiver: operator-email", ln) for ln in lines)
    assert any("emailConfigs:" in ln for ln in lines)
    assert any(re.search(r"to: korczewski@mailbox.org", ln) for ln in lines)


def test_alertmanager_config_yaml_has_no_hardcoded_brand_domain(repo_root):
    uncommented = [ln for ln in read(repo_root, AM_FILE).splitlines() if not re.match(r"^\s*#", ln)]
    hits = [ln for ln in uncommented if re.search(r"mentolder\.de|korczewski\.de", ln)]
    assert not hits, f"hardcodierte Brand-Domain: {hits}"


def test_k3d_monitoring_kustomize_builds(run_cmd, repo_root):
    run = run_cmd(["kubectl", "kustomize", "k3d/monitoring/", "--load-restrictor=LoadRestrictionsNone"],
                  cwd=repo_root, timeout=300)
    assert run.returncode == 0, run.output

"""Native migration of tests/spec/fleet-operations/monitoring-ready.bats."""
from pathlib import Path

import pytest


def _awk_range(lines, start_regex: str, end_regex: str):
    """Lines of awk '/start/,/end/' with regex patterns (end checked on the start line too)."""
    import re

    out, in_range = [], False
    for line in lines:
        if not in_range and re.search(start_regex, line):
            in_range = True
        if in_range:
            out.append(line)
            if re.search(end_regex, line):
                in_range = False
    return out


def test_t900034_blackbox_exporter_podspec_setzt_run_as_user_passend_zu_run_as_non_root(repo_root):
    bb = repo_root / "k3d" / "monitoring" / "blackbox-exporter.yaml"
    assert bb.is_file()
    text = bb.read_text(encoding="utf-8")

    # Positiv-Anker: die Deklaration, gegen die der Guard laeuft, existiert.
    assert "runAsNonRoot: true" in text

    # runAsNonRoot ohne runAsUser laesst das Kubelet den Container ablehnen.
    assert "runAsUser:" in text, "blackbox-exporter.yaml deklariert keinen runAsUser"

    # 65534 (nobody) wie die uebrigen non-root-Workloads des Repos.
    assert "runAsUser: 65534" in text


def test_t900034_grafana_deployment_nutzt_recreate_statt_rolling_update_rwo_pvc(repo_root):
    import re

    kps = repo_root / "k3d" / "monitoring" / "kube-prometheus-stack-rendered.yaml"
    assert kps.is_file()
    lines = kps.read_text(encoding="utf-8").splitlines()

    # Positiv-Anker: das Grafana-Deployment existiert im gerenderten Chart.
    assert any(re.fullmatch(r"  name: monitoring-grafana", l) for l in lines), \
        "Grafana-Deployment fehlt im gerenderten Chart"

    # Block vom '  name: monitoring-grafana' bis zum naechsten Dokumenttrenner.
    block = _awk_range(lines, r"^  name: monitoring-grafana$", r"^---$")

    # grep -A1 '^  strategy:$' | tail -1: Zeile nach dem letzten strategy-Schluessel.
    strategy = ""
    for i, line in enumerate(block):
        if line == "  strategy:":
            strategy = block[i + 1] if i + 1 < len(block) else line
    assert strategy, "kein strategy-Block im Grafana-Deployment gefunden"
    assert "Recreate" in strategy, \
        f"Grafana-strategy ist '{strategy}' statt Recreate — RWO-PVC-Rollout blockiert"


def test_t901100_grafana_initcontainer_init_chown_data_setzt_resources_requests_und_limits(repo_root):
    patch = repo_root / "k3d" / "monitoring" / "grafana-sidecar-resources-patch.yaml"
    assert patch.is_file()
    lines = patch.read_text(encoding="utf-8").splitlines()

    # grep -A 5 'name: init-chown-data': Treffer plus 5 Folgezeilen.
    windows = []
    for i, line in enumerate(lines):
        if "name: init-chown-data" in line:
            windows.extend(lines[i:i + 6])
    assert any("requests:" in l for l in windows)
    assert any("limits:" in l for l in windows)

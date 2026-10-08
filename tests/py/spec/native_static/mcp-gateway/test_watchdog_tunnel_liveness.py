"""Native pytest migration of tests/spec/mcp-gateway/watchdog-tunnel-liveness.bats."""

import os
from pathlib import Path
import shutil
import pytest


def test_t002543_das_probe_skript_existiert_und_ist_ausfuehrbar_1(repo_root, run_cmd, tmp_path):
    'T002543: das Probe-Skript existiert und ist ausfuehrbar'
    path_probe = str(repo_root) + '/scripts/mcp-gateway/probe.sh'
    assert os.access(Path(path_probe), os.X_OK)


def test_t002543_watchdog_units_sind_versioniert_und_referenzieren_den_probe_5(repo_root, run_cmd, tmp_path):
    'T002543: Watchdog-Units sind versioniert und referenzieren den Probe'
    path_probe = str(repo_root) + '/scripts/mcp-gateway/probe.sh'
    path_timer = str(repo_root) + '/scripts/mcp-gateway/mcp-gateway-watchdog.timer'
    path_svc = str(repo_root) + '/scripts/mcp-gateway/mcp-gateway-watchdog.service'
    path_check = str(repo_root) + '/scripts/mcp-gateway/watchdog-check.sh'
    assert Path(path_timer).is_file()
    assert Path(path_svc).is_file()
    assert os.access(Path(path_check), os.X_OK)
    result = run_cmd(['grep', '-q', 'watchdog-check.sh', path_svc])
    assert result.returncode == 0, result.output
    result = run_cmd(['grep', '-q', 'probe.sh', path_check])
    assert result.returncode == 0, result.output
    result = run_cmd(['grep', '-qE', 'mcp-gateway\\.service', path_check])
    assert result.returncode == 0, result.output


def test_t002543_der_timer_feuert_wiederholt_nicht_nur_einmal_beim_boot_6(repo_root, run_cmd, tmp_path):
    'T002543: der Timer feuert wiederholt, nicht nur einmal beim Boot'
    path_probe = str(repo_root) + '/scripts/mcp-gateway/probe.sh'
    path_timer = str(repo_root) + '/scripts/mcp-gateway/mcp-gateway-watchdog.timer'
    assert Path(path_timer).is_file()
    result = run_cmd(['grep', '-qE', 'OnUnitActiveSec=|OnCalendar=', path_timer])
    assert result.returncode == 0, result.output

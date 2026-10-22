"""Prueft den stuendlichen AdGuard-Check: Units, Skript-Anbindung, Verhalten."""

import os
import shutil

CHECK = "scripts/devmesh/lan-dns-check.sh"
SERVICE = "scripts/devmesh/lan-dns-check.service"
TIMER = "scripts/devmesh/lan-dns-check.timer"

DIG_STUB = """#!/usr/bin/env bash
# Antwortet 127.0.0.53 fuer jede IP ausser $STUB_FAIL_IP.
for a in "$@"; do
  if [[ "$a" == "@$STUB_FAIL_IP" ]]; then exit 0; fi
  if [[ "$a" == @* ]]; then echo "127.0.0.53"; exit 0; fi
done
exit 0
"""


def _write_stub(bin_dir, fail_ip=""):
    dig = bin_dir / "dig"
    dig.write_text(DIG_STUB)
    dig.chmod(0o755)
    return {"STUB_FAIL_IP": fail_ip}


def _run_check(run_cmd, repo_root, tmp_path, fail_ip=""):
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir(exist_ok=True)
    for t in ("bash", "env", "yq"):
        p = shutil.which(t)
        assert p, t
        link = bin_dir / t
        if not link.exists():
            os.symlink(p, link)
    env = {"PATH": str(bin_dir), **_write_stub(bin_dir, fail_ip)}
    inv = tmp_path / "inventory.yaml"
    inv.write_text(
        "peers:\n"
        "  - name: a\n"
        "    lan_ip: 10.99.0.1\n"
        "    lan_dns: true\n"
        "  - name: b\n"
        "    lan_ip: 10.99.0.2\n"
        "    lan_dns: true\n"
    )
    env["DEVMESH_INVENTORY"] = str(inv)
    return run_cmd([shutil.which("bash"), str(repo_root / CHECK)], env=env)


def test_timer_ist_stuendlich_und_holt_ausfaelle_nach(repo_root):
    text = (repo_root / TIMER).read_text(encoding="utf-8")
    assert "OnCalendar=hourly" in text
    assert "Persistent=true" in text


def test_service_ruft_den_check_auf(repo_root):
    text = (repo_root / SERVICE).read_text(encoding="utf-8")
    assert "lan-dns-check.sh" in text
    assert "WorkingDirectory=/home/patrick/Bachelorprojekt" in text


def test_check_alle_antworten_exit_0(run_cmd, repo_root, tmp_path):
    res = _run_check(run_cmd, repo_root, tmp_path)
    assert res.returncode == 0, res.output
    assert "ok    10.99.0.1" in res.output
    assert "ok    10.99.0.2" in res.output


def test_check_eine_ip_stumm_exit_1_und_nennt_sie(run_cmd, repo_root, tmp_path):
    res = _run_check(run_cmd, repo_root, tmp_path, fail_ip="10.99.0.2")
    assert res.returncode == 1, res.output
    assert "FEHLT 10.99.0.2" in res.output
    assert "ok    10.99.0.1" in res.output

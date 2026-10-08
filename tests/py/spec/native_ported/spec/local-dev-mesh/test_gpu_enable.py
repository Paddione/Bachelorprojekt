"""Native migration of tests/spec/local-dev-mesh/gpu-enable.bats."""

import os
import shutil
from pathlib import Path

import pytest

SSH_STUB = """#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$SSH_ARGV_LOG"
cmd="${!#}"
case "$cmd" in
  *"sudo -n true"*) exit "${STUB_REACH_RC:-0}" ;;
  *"nvidia-ctk --version"*)
    if [ -n "${STUB_TOOLKIT:-}" ]; then printf '%s\\n' "$STUB_TOOLKIT"; exit 0; fi
    exit 1 ;;
  *"bash -s"*) cat >> "$SSH_STDIN_LOG" ;;
  *) echo "ssh-Stub: unerwarteter Aufruf: $cmd" >&2; exit 99 ;;
esac
"""


@pytest.fixture
def gpu(repo_root, tmp_path, monkeypatch):
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    argv_log = tmp_path / "ssh-argv.log"
    stdin_log = tmp_path / "ssh-stdin.log"
    argv_log.write_text("")
    stdin_log.write_text("")
    ssh = bin_dir / "ssh"
    ssh.write_text(SSH_STUB)
    ssh.chmod(0o755)
    monkeypatch.setenv("DEVMESH_INVENTORY", str(repo_root / "tests" / "spec" / "local-dev-mesh" / "fixtures" / "inventory.yaml"))
    monkeypatch.setenv("SSH_ARGV_LOG", str(argv_log))
    monkeypatch.setenv("SSH_STDIN_LOG", str(stdin_log))
    monkeypatch.delenv("STUB_TOOLKIT", raising=False)
    monkeypatch.delenv("STUB_REACH_RC", raising=False)
    return {
        "script": repo_root / "scripts" / "devmesh" / "gpu-enable.sh",
        "bin": bin_dir,
        "argv": argv_log,
        "stdin": stdin_log,
    }


def _path(gpu):
    return f"{gpu['bin']}:{os.environ.get('PATH', '')}"


def _msg(gpu, output):
    return "\n".join(l for l in output.splitlines() if str(gpu["script"]) not in l)


def test_erstlauf_toolkit_installation_containerd_konfiguration_und_k3s_neustart_gehen_an_den_host(gpu, run_cmd):
    res = run_cmd(["bash", str(gpu["script"]), "gpu-metal"], env={"PATH": _path(gpu)})
    assert res.returncode == 0, res.output
    assert "patrick@10.1.0.101" in gpu["argv"].read_text()
    stdin = gpu["stdin"].read_text()
    assert "nvidia-container-toolkit" in stdin
    assert "nvidia-ctk runtime configure --runtime=containerd" in stdin
    assert "systemctl restart k3s" in stdin


def test_zweiter_lauf_gegen_aktivierten_host_exit_0_meldet_das_toolkit_kein_k3s_neustart(gpu, run_cmd):
    res = run_cmd(["bash", str(gpu["script"]), "gpu-metal"],
                  env={"PATH": _path(gpu), "STUB_TOOLKIT": "NVIDIA Container Toolkit CLI version 1.17.8"})
    assert res.returncode == 0, res.output
    assert any(l.startswith("unveraendert: ") for l in res.output.splitlines())
    # Positiv-Anker: der Zustand wurde tatsaechlich per ssh abgefragt
    assert "nvidia-ctk --version" in gpu["argv"].read_text()
    # ... und danach ging nichts mehr raus: kein Install-Skript, kein Neustart
    assert gpu["stdin"].read_text() == ""
    assert gpu["argv"].read_text().count("restart k3s") == 0


def test_fehlendes_lokales_werkzeug_exit_2_nennt_yq_kein_kommando_gegen_den_host(gpu, run_cmd):
    # Positiv-Anker: mit vollstaendigem PATH laeuft derselbe Aufruf durch und redet mit dem Host
    res = run_cmd(["bash", str(gpu["script"]), "gpu-metal"], env={"PATH": _path(gpu)})
    assert res.returncode == 0, res.output
    assert gpu["argv"].read_text() != ""

    gpu["argv"].write_text("")
    gpu["stdin"].write_text("")
    for t in "bash env awk grep sed head tail cat cut tr sort dirname basename mktemp".split():
        found = shutil.which(t)
        assert found, t
        link = gpu["bin"] / t
        if link.is_symlink() or link.exists():
            link.unlink()
        os.symlink(found, link)
    bash = shutil.which("bash")
    res = run_cmd([bash, str(gpu["script"]), "gpu-metal"], env={"PATH": str(gpu["bin"])})
    assert res.returncode == 2
    assert "yq" in _msg(gpu, res.output)
    assert gpu["argv"].read_text() == ""
    assert gpu["stdin"].read_text() == ""


def test_unerreichbarer_host_exit_2_nennt_den_host_keine_zustandsaenderung(gpu, run_cmd):
    res = run_cmd(["bash", str(gpu["script"]), "gpu-metal"],
                  env={"PATH": _path(gpu), "STUB_REACH_RC": "255"})
    assert res.returncode == 2
    assert "gpu-metal" in _msg(gpu, res.output)
    # Positiv-Anker: die Erreichbarkeitsprobe wurde abgesetzt, danach nichts mehr
    assert "sudo -n true" in gpu["argv"].read_text()
    assert gpu["stdin"].read_text() == ""

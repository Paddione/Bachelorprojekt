"""Native migration of tests/spec/local-dev-mesh/preflight.bats."""

import os
import re
import shutil
from pathlib import Path

import pytest


@pytest.fixture
def pf(repo_root, tmp_path, monkeypatch):
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    for t in ("bash", "env", "awk", "grep", "sed", "head", "cat", "dirname"):
        os.symlink(shutil.which(t), bin_dir / t)

    def stub(name, body):
        path = bin_dir / name
        path.write_text("#!/usr/bin/env bash\n" + body + "\n")
        path.chmod(0o755)

    stub("ss", r'''case "$1" in *t*) cat "${STUB_SS_TCP:-/dev/null}" ;; *u*) cat "${STUB_SS_UDP:-/dev/null}" ;; esac''')
    stub("free", r'''printf "               total        used        free\nMem:  %s  1000  1000\nSwap:  0  0  0\n" "${STUB_MEM_BYTES:-16700000000}"''')
    stub("swapon", r'''if [ -n "${STUB_SWAP:-}" ]; then echo "$STUB_SWAP"; fi''')
    stub("timedatectl", r'''echo "${STUB_NTP:-yes}"''')
    stub("findmnt", r'''echo "${STUB_FINDMNT:-/dev/nvme0n1p2}"''')
    stub("lsblk", r'''printf "%b" "${STUB_LSBLK:-nvme0n1p2 part 0\nnvme0n1 disk 0\n}"''')
    stub("timeout", r'''if [ -n "${STUB_TIMEOUT_ERR:-}" ]; then echo "$STUB_TIMEOUT_ERR" >&2; fi; exit "${STUB_TIMEOUT_RC:-0}"''')
    ss_tcp = tmp_path / "ss-tcp"
    ss_tcp.write_text("")
    monkeypatch.setenv("DEVMESH_ETCD_PATH", str(tmp_path / "rancher"))
    monkeypatch.setenv("STUB_SS_TCP", str(ss_tcp))
    for var in ("STUB_MEM_BYTES", "STUB_SWAP", "STUB_NTP", "STUB_FINDMNT", "STUB_LSBLK",
                "STUB_TIMEOUT_ERR", "STUB_TIMEOUT_RC", "STUB_SS_UDP"):
        monkeypatch.delenv(var, raising=False)
    return {
        "script": repo_root / "scripts" / "devmesh" / "preflight.sh",
        "bin": bin_dir,
        "ss_tcp": ss_tcp,
        "stub": stub,
        "bash": shutil.which("bash"),
        "repo": repo_root,
        "tmp": tmp_path,
    }


def _local(run_cmd, pf, *args, **env):
    e = {"PATH": str(pf["bin"])}
    e.update(env)
    return run_cmd([pf["bash"], str(pf["script"]), "--local", *args], env=e)


def _fails(output):
    return [l for l in output.splitlines() if l.startswith("FAIL")]


def test_geeigneter_host_exit_0_und_keine_fail_zeile(pf, run_cmd):
    res = _local(run_cmd, pf, "--peers", "10.10.10.2")
    assert res.returncode == 0, res.output
    # Positiv-Anker: jede Pruefgruppe hat tatsaechlich eine OK-Zeile geliefert
    lines = res.output.splitlines()
    for prefix in ("OK   RAM", "OK   Swap", "OK   Zeit", "OK   Port 6443/tcp", "OK   Port 51820/udp",
                   "OK   etcd-Platte nvme0n1", "OK   10.10.10.2:2379"):
        assert any(l.startswith(prefix) for l in lines), prefix
    assert _fails(res.output) == []


def test_belegter_k3s_port_exit_1_befund_nennt_port_und_prozess(pf, run_cmd):
    pf["ss_tcp"].write_text('LISTEN 0 4096 *:6443 *:* users:(("kube-apiserver",pid=4242,fd=7))\n')
    res = _local(run_cmd, pf)
    assert res.returncode == 1, res.output
    line = [l for l in _fails(res.output) if "6443" in l]
    assert any("kube-apiserver" in l for l in line)


def test_rotierende_etcd_platte_exit_1_befund_nennt_die_platte(pf, run_cmd):
    res = _local(run_cmd, pf,
                 STUB_FINDMNT="/dev/mapper/ubuntu--vg-ubuntu--lv",
                 STUB_LSBLK="ubuntu--vg-ubuntu--lv lvm 1\nsda3 part 1\nsda disk 1\n")
    assert res.returncode == 1, res.output
    assert any("sda" in l for l in _fails(res.output))


def test_ss_fehlt_exit_2_statt_1(pf, run_cmd):
    res = _local(run_cmd, pf)
    assert res.returncode == 0, res.output
    (pf["bin"] / "ss").unlink()
    res = _local(run_cmd, pf)
    assert res.returncode == 2, res.output


def test_swap_aktiv_exit_1(pf, run_cmd):
    res = _local(run_cmd, pf, STUB_SWAP="/swap.img")
    assert res.returncode == 1, res.output
    assert any("/swap.img" in l for l in _fails(res.output))


def test_zu_wenig_ram_exit_1(pf, run_cmd):
    res = _local(run_cmd, pf, STUB_MEM_BYTES="8000000000")
    assert res.returncode == 1, res.output
    assert any("RAM" in l for l in _fails(res.output))


def test_zeitsynchronisation_aus_exit_1(pf, run_cmd):
    res = _local(run_cmd, pf, STUB_NTP="no")
    assert res.returncode == 1, res.output
    assert any("zeit" in l.lower() for l in _fails(res.output))


def test_gpupod_auf_8080_ist_info_kein_befund_loopback_listener_bleiben_ungenannt(pf, run_cmd):
    pf["ss_tcp"].write_text(
        'LISTEN 0 4096 0.0.0.0:8080 0.0.0.0:* users:(("gpupod",pid=12,fd=3))\n'
        'LISTEN 0 4096 127.0.0.1:6444 0.0.0.0:* users:(("irgendwas",pid=13,fd=3))\n'
    )
    res = _local(run_cmd, pf)
    assert res.returncode == 0, res.output
    info = [l for l in res.output.splitlines() if l.startswith("INFO") and "8080" in l]
    assert any("gpupod" in l for l in info)
    loop = [l for l in res.output.splitlines() if l.startswith("INFO") and "6444" in l]
    assert loop == []


def test_peer_ohne_antwort_ist_befund_connection_refused_gilt_als_erreichbar(pf, run_cmd):
    res = _local(run_cmd, pf, "--peers", "10.10.10.2", STUB_TIMEOUT_RC="124")
    assert res.returncode == 1, res.output
    assert any("10.10.10.2:6443" in l for l in _fails(res.output))

    res = _local(run_cmd, pf, "--peers", "10.10.10.2", STUB_TIMEOUT_RC="1",
                 STUB_TIMEOUT_ERR="bash: connect: Connection refused")
    assert res.returncode == 0, res.output
    assert any("10.10.10.2:6443" in l for l in res.output.splitlines() if l.startswith("OK"))


def test_client_modus_ssh_gegen_lan_ip_uebrige_server_als_peers_unbekannter_host_ohne_ssh(pf, run_cmd):
    ssh_log = pf["tmp"] / "ssh-argv.log"
    ssh_log.write_text("")
    pf["stub"]("ssh", r'''printf "%s\n" "$*" >> "$SSH_ARGV_LOG"; cat > /dev/null; exit 0''')
    env = {
        "PATH": f"{pf['bin']}:{os.environ.get('PATH', '')}",
        "DEVMESH_INVENTORY": str(pf["repo"] / "tests" / "spec" / "local-dev-mesh" / "fixtures" / "inventory.yaml"),
        "SSH_ARGV_LOG": str(ssh_log),
    }
    res = run_cmd([pf["bash"], str(pf["script"]), "gpu-metal"], env=env)
    assert res.returncode == 0, res.output
    log = ssh_log.read_text()
    assert "patrick@10.1.0.101" in log
    peers = []
    for line in log.splitlines():
        m = re.match(r"^.*--peers '([^']*)'.*$", line)
        if m:
            peers.append(m.group(1))
    assert peers == ["10.10.10.2,10.10.10.3"]

    ssh_log.write_text("")
    res = run_cmd([pf["bash"], str(pf["script"]), "gpu-nirgendwo"], env=env)
    assert res.returncode == 1, res.output
    assert ssh_log.read_text() == ""

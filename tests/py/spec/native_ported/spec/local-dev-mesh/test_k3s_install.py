"""Native migration of tests/spec/local-dev-mesh/k3s-install.bats."""

import os
import shlex
import shutil
import subprocess
from pathlib import Path

import pytest

SSH_STUB = """#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$SSH_ARGV_LOG"
cmd="${!#}"
case "$cmd" in
  "sudo -n true") exit 0 ;;
  *"k3s --version"*) if [ -n "${STUB_STATE_FILE:-}" ]; then cat "$STUB_STATE_FILE"; fi ;;
  *"/var/lib/rancher/k3s/server/token"*) printf '%s\\n' "${STUB_TOKEN:-}" ;;
  "sudo -n bash -s") cat >> "$SSH_STDIN_LOG" ;;
  *) echo "ssh-Stub: unerwarteter Aufruf: $cmd" >&2; exit 99 ;;
esac
"""


@pytest.fixture
def k3s(repo_root, tmp_path, monkeypatch):
    stub = tmp_path / "bin"
    stub.mkdir()
    ssh = stub / "ssh"
    ssh.write_text(SSH_STUB)
    ssh.chmod(0o755)
    argv_log = tmp_path / "ssh-argv.log"
    stdin_log = tmp_path / "ssh-stdin.log"
    argv_log.write_text("")
    stdin_log.write_text("")
    inventory = repo_root / "tests" / "spec" / "local-dev-mesh" / "fixtures" / "inventory.yaml"
    monkeypatch.setenv("DEVMESH_INVENTORY", str(inventory))
    monkeypatch.setenv("SSH_ARGV_LOG", str(argv_log))
    monkeypatch.setenv("SSH_STDIN_LOG", str(stdin_log))
    monkeypatch.delenv("STUB_STATE_FILE", raising=False)
    monkeypatch.delenv("STUB_TOKEN", raising=False)
    return {
        "script": repo_root / "scripts" / "devmesh" / "k3s-install.sh",
        "stub": stub,
        "argv": argv_log,
        "stdin": stdin_log,
        "tmp": tmp_path,
        "inventory": inventory,
    }


def _dry(run_cmd, k3s, host, extra_env=None):
    env = {"DRY_RUN": "1"}
    env.update(extra_env or {})
    return run_cmd(["bash", str(k3s["script"]), host], env=env)


def _command_lines(output):
    return [l for l in output.splitlines() if l.startswith("command: ")]


def _args(output):
    """Argumente hinter 'sh -s - ' aus der command:-Zeile, eines pro Element."""
    line = _command_lines(output)[0]
    rest = line.split(" sh -s - ", 1)[1]
    return shlex.split(rest)


def _pair(args, flag, value):
    return any(args[i] == flag and args[i + 1] == value for i in range(len(args) - 1))


def test_server_join_node_ip_aus_dem_inventar_wireguard_native_join_gegen_server_init_kein_cluster_init(k3s, run_cmd):
    res = _dry(run_cmd, k3s, "gpu-cluster")
    assert res.returncode == 0, res.output
    line = "\n".join(_command_lines(res.output))
    # Spec-Szenario "Install flags for a joining server", woertlich
    assert "--node-ip 10.10.10.2" in line
    args = _args(res.output)
    assert args[0] == "server"
    assert "--flannel-backend=wireguard-native" in args
    assert _pair(args, "--server", "https://10.1.0.101:6443")
    # Alle Server tragen dieselben Cluster-Netze, sonst verweigert k3s den Join
    assert "--cluster-cidr=10.52.0.0/16" in args
    assert "--service-cidr=10.53.0.0/16" in args
    assert "--cluster-dns=10.53.0.10" in args
    assert args.count("--cluster-init") == 0


def test_server_init_cluster_init_sans_aller_server_etcd_snapshots_alle_6h_mit_retention_20(k3s, run_cmd):
    res = _dry(run_cmd, k3s, "gpu-metal")
    assert res.returncode == 0, res.output
    args = _args(res.output)
    assert "--cluster-init" in args
    assert _pair(args, "--node-ip", "10.1.0.101")
    for san in ("10.1.0.101", "10.10.10.2", "10.10.10.3",
                "gpu-metal.example-tailnet.ts.net", "gpu-cluster.example-tailnet.ts.net",
                "gpu-cluster2.example-tailnet.ts.net"):
        assert _pair(args, "--tls-san", san), san
    assert args.count("--tls-san") == 6
    assert "--etcd-snapshot-schedule-cron=0 */6 * * *" in args
    assert "--etcd-snapshot-retention=20" in args
    assert "--cluster-cidr=10.52.0.0/16" in args
    assert "--service-cidr=10.53.0.0/16" in args
    assert "--cluster-dns=10.53.0.10" in args
    # Keine fleet-Netze (Positiv-Anker: die drei devmesh-Netze oben)
    assert not [a for a in args if "10.42." in a or "10.43." in a]
    # Der Client pk-desktop steht nicht im Zertifikat (Positiv-Anker: 6 SANs oben)
    assert not [a for a in args if "pk-desktop" in a or "10.10.0.3" in a]


def test_versionspin_aus_dem_inventar_steht_im_befehl(k3s, run_cmd):
    res = _dry(run_cmd, k3s, "gpu-cluster")
    assert res.returncode == 0, res.output
    assert any("INSTALL_K3S_VERSION=v1.36.1+k3s1" in l for l in _command_lines(res.output))


def test_storage_true_nur_auf_gpu_cluster2(k3s, run_cmd):
    res = _dry(run_cmd, k3s, "gpu-cluster2")
    assert res.returncode == 0, res.output
    assert _pair(_args(res.output), "--node-label", "storage=true")

    res = _dry(run_cmd, k3s, "gpu-cluster")
    assert res.returncode == 0, res.output
    args = _args(res.output)
    assert _pair(args, "--node-ip", "10.10.10.2")
    assert args.count("--node-label") == 0


def test_unbekannter_host_endet_mit_exit_1_und_nennt_den_host(k3s, run_cmd):
    res = _dry(run_cmd, k3s, "gpu-nirgendwo")
    assert res.returncode == 1
    assert "gpu-nirgendwo" in res.output


def test_fehlender_tailnet_name_eines_servers_endet_mit_exit_1(k3s, run_cmd):
    res = _dry(run_cmd, k3s, "gpu-cluster")
    assert res.returncode == 0, res.output
    broken = k3s["tmp"] / "inventory.yaml"
    shutil.copy(k3s["inventory"], broken)
    yq = run_cmd(["yq", "-i", "del(.peers[2].tailnet_name)", str(broken)])
    yq.check()
    res = _dry(run_cmd, k3s, "gpu-cluster", {"DEVMESH_INVENTORY": str(broken)})
    assert res.returncode == 1
    assert "gpu-cluster2" in res.output


def test_zweiter_lauf_auf_fertigem_knoten_aendert_nichts_und_endet_mit_0(k3s, run_cmd):
    res = _dry(run_cmd, k3s, "gpu-cluster")
    assert res.returncode == 0, res.output
    args_str = "\n".join(
        l.rsplit(" sh -s - ", 1)[1] for l in _command_lines(res.output) if " sh -s - " in l
    )
    assert args_str
    state = k3s["tmp"] / "state"
    state.write_text("k3s version v1.36.1+k3s1 (0123abcd)\n---\n" + args_str.rstrip("\n"))
    res = run_cmd(["bash", str(k3s["script"]), "gpu-cluster"],
                  env={"PATH": f"{k3s['stub']}:{os.environ['PATH']}", "STUB_STATE_FILE": str(state)})
    assert res.returncode == 0, res.output
    assert any(l.startswith("unveraendert: ") for l in res.output.splitlines())
    # Positiv-Anker: der Zustand wurde tatsaechlich abgefragt
    argv = k3s["argv"].read_text()
    assert "k3s --version" in argv
    assert k3s["stdin"].read_text() == ""
    assert argv.count("server/token") == 0


def test_join_installation_token_nur_ueber_stdin_nie_in_argv_oder_ausgabe(k3s, run_cmd):
    state = k3s["tmp"] / "state"
    state.write_text("---\n")
    token = "test-token-nicht-geheim"
    res = run_cmd(["bash", str(k3s["script"]), "gpu-cluster"],
                  env={"PATH": f"{k3s['stub']}:{os.environ['PATH']}", "STUB_STATE_FILE": str(state),
                       "STUB_TOKEN": token})
    assert res.returncode == 0, res.output
    # Positiv-Anker: das Installationsskript ging mit Token und Join-Flags raus
    stdin = k3s["stdin"].read_text()
    assert "--node-ip 10.10.10.2" in stdin
    assert token in stdin
    assert "/etc/rancher/k3s/devmesh-install.args" in stdin
    assert "ufw allow from 10.52.0.0/16" in stdin
    assert "ufw allow from 10.53.0.0/16" in stdin
    assert "patrick@10.1.0.101" in k3s["argv"].read_text()
    assert token not in k3s["argv"].read_text()
    assert token not in res.output

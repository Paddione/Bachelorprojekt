"""Native migration of tests/spec/local-dev-mesh/status.bats."""

import os
import shutil
import time
from datetime import datetime, timezone

import pytest

KUBECTL_STUB = """#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$KUBECTL_ARGV_LOG"
case "$*" in
  *go-template*) cat "$STUB_GPUS" ;;
  *"get nodes"*) if [ -n "${STUB_NODES_RC:-}" ]; then exit "$STUB_NODES_RC"; fi; cat "$STUB_NODES" ;;
  *etcdsnapshotfiles*) cat "$STUB_SNAPS" ;;
  *) echo "kubectl-Stub: unerwartet: $*" >&2; exit 99 ;;
esac
"""


@pytest.fixture
def st(repo_root, tmp_path, monkeypatch):
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    for t in ("bash", "env", "date", "grep", "sort", "tail", "cat"):
        os.symlink(shutil.which(t), bin_dir / t)
    argv_log = tmp_path / "kubectl-argv.log"
    argv_log.write_text("")
    nodes = tmp_path / "nodes"
    snaps = tmp_path / "snaps"
    gpus = tmp_path / "gpus"
    nodes.write_text("gpu-metal True true\ngpu-cluster True true\ngpu-cluster2 True true\n")
    gpus.write_text("gpu-metal true 1\ngpu-cluster - -\ngpu-cluster2 - -\n")
    kubectl = bin_dir / "kubectl"
    kubectl.write_text(KUBECTL_STUB)
    kubectl.chmod(0o755)
    monkeypatch.setenv("KUBECTL_ARGV_LOG", str(argv_log))
    monkeypatch.setenv("STUB_NODES", str(nodes))
    monkeypatch.setenv("STUB_SNAPS", str(snaps))
    monkeypatch.setenv("STUB_GPUS", str(gpus))
    monkeypatch.delenv("STUB_NODES_RC", raising=False)
    ctx = {
        "script": repo_root / "scripts" / "devmesh" / "status.sh",
        "bin": bin_dir,
        "argv": argv_log,
        "nodes": nodes,
        "snaps": snaps,
        "gpus": gpus,
        "kubectl": kubectl,
    }
    snapshot(ctx, 1)
    return ctx


def snapshot(ctx, *hours):
    """Schreibt je Argument einen Snapshot, der so viele Stunden alt ist (UTC)."""
    now = int(time.time())
    lines = []
    for h in hours:
        ts = datetime.fromtimestamp(now - h * 3600, tz=timezone.utc)
        lines.append(ts.strftime("%Y-%m-%dT%H:%M:%SZ"))
    ctx["snaps"].write_text("".join(l + "\n" for l in lines))


def _run(run_cmd, st, **env):
    e = {"PATH": str(st["bin"])}
    e.update(env)
    return run_cmd([shutil.which("bash"), str(st["script"])], env=e)


def test_gesunder_cluster_exit_0_drei_knoten_und_drei_etcd_mitglieder_ready_context_devmesh(st, run_cmd):
    snapshot(st, 30, 1)
    res = _run(run_cmd, st)
    assert res.returncode == 0, res.output
    assert "Knoten: 3/3 Ready" in res.output
    assert "etcd-Mitglieder: 3/3 Ready" in res.output
    assert any(l.startswith("OK") and "1h" in l for l in res.output.splitlines())
    assert "--context devmesh" in st["argv"].read_text()


def test_snapshot_13_stunden_alt_exit_ungleich_0_alter_wird_genannt(st, run_cmd):
    snapshot(st, 13)
    res = _run(run_cmd, st)
    assert res.returncode != 0
    assert any(l.startswith("FAIL") and "13h" in l for l in res.output.splitlines())


def test_kein_snapshot_exit_1(st, run_cmd):
    st["snaps"].write_text("")
    res = _run(run_cmd, st)
    assert res.returncode == 1, res.output
    assert any(l.startswith("FAIL") for l in res.output.splitlines())


def test_knoten_nicht_ready_exit_1_knoten_wird_genannt(st, run_cmd):
    st["nodes"].write_text("gpu-metal True true\ngpu-cluster Unknown true\ngpu-cluster2 True true\n")
    res = _run(run_cmd, st)
    assert res.returncode == 1, res.output
    assert any(l.startswith("FAIL") and "gpu-cluster" in l for l in res.output.splitlines())
    assert "etcd-Mitglieder: 2/3 Ready" in res.output


def test_kubectl_fehlt_exit_2(st, run_cmd):
    res = _run(run_cmd, st)
    assert res.returncode == 0, res.output
    st["kubectl"].unlink()
    res = _run(run_cmd, st)
    assert res.returncode == 2, res.output


def test_context_nicht_erreichbar_exit_2(st, run_cmd):
    res = _run(run_cmd, st, STUB_NODES_RC="1")
    assert res.returncode == 2, res.output


def test_gpu_jeder_knoten_erscheint_mit_einer_zahl_gpu_metal_mit_1(st, run_cmd):
    res = _run(run_cmd, st)
    assert res.returncode == 0, res.output
    assert "GPU gpu-metal: 1" in res.output
    assert "GPU gpu-cluster: 0" in res.output
    assert "GPU gpu-cluster2: 0" in res.output


def test_gpu_knoten_ohne_karte_wird_als_keine_gpu_gemeldet_nicht_als_befund(st, run_cmd):
    res = _run(run_cmd, st)
    assert res.returncode == 0, res.output
    assert any("GPU gpu-cluster:" in l and "keine GPU" in l for l in res.output.splitlines())


def test_gpu_label_gpu_true_ohne_nvidia_com_gpu_ist_ein_befund_und_heisst_anders(st, run_cmd):
    st["gpus"].write_text("gpu-metal true -\ngpu-cluster - -\ngpu-cluster2 - -\n")
    res = _run(run_cmd, st)
    assert res.returncode == 1, res.output
    fails = [l for l in res.output.splitlines() if l.startswith("FAIL")]
    assert any("GPU gpu-metal" in l for l in fails)
    assert any("nvidia.com/gpu" in l for l in fails)
    assert any("GPU gpu-metal" in l and "keine GPU" not in l for l in res.output.splitlines())

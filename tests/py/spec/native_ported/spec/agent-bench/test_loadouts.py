"""Native migration of tests/spec/agent-bench/loadouts.bats."""

import json
import os
import shutil
import subprocess
import time
from pathlib import Path

import pytest

FIX_REL = "tests/spec/agent-bench/fixtures"


def _paths(repo_root: Path):
    fix = repo_root / FIX_REL
    lib = repo_root / "scripts/llm/agent-bench/lib"
    return fix, lib


def _node_module(run_cmd, repo_root, lib, script):
    return run_cmd(["node", "--input-type=module", "-e", script], cwd=repo_root)


def test_marlin_fallback_is_refused(run_cmd, repo_root, tmp_path):
    lib = repo_root / "scripts/llm/agent-bench/lib"
    marlin = tmp_path / "marlin.log"
    marlin.write_text("vllm serve gestarted\nselected NVFP4 backend: marlin (fallback)\n")
    res = _node_module(
        run_cmd, repo_root, lib,
        f"""
import {{ checkKernel }} from '{lib}/loadouts.mjs';
console.log(JSON.stringify(await checkKernel({{ engine: 'vllm', id: 'm' }}, {{ logPath: '{marlin}' }})));
""",
    )
    assert res.returncode == 0
    assert '"ok":false' in res.output
    assert "marlin" in res.output
    # Gegenprobe: echter FP4-Kernel wird akzeptiert.
    good = tmp_path / "good.log"
    good.write_text("vllm serve gestartet\nselected NVFP4 backend: flashinfer fp4 kernel ready\n")
    res = _node_module(
        run_cmd, repo_root, lib,
        f"""
import {{ checkKernel }} from '{lib}/loadouts.mjs';
console.log(JSON.stringify(await checkKernel({{ engine: 'vllm', id: 'm' }}, {{ logPath: '{good}' }})));
""",
    )
    assert res.returncode == 0
    assert '"ok":true' in res.output


def test_spill_wird_als_infra_fehler_gemeldet(run_cmd, repo_root, tmp_path):
    fix, lib = _paths(repo_root)
    pool = tmp_path / "pool.json"
    pool.write_text(json.dumps({
        "spill_threshold_mib": 15900,
        "gpu_uuids": {"testgpu": "GPU-aaa"},
        "production_services": [],
        "models": [],
    }))
    bin_log = tmp_path / "bin.log"
    env = {
        "AGENT_BENCH_NVIDIA_SMI": str(fix / "fake-bin/nvidia-smi"),
        "FAKE_BIN_LOG": str(bin_log),
        "FAKE_NVIDIA_SMI_OUTPUT": "GPU-aaa, 16000",
    }
    script = f"""
import {{ readFileSync }} from 'node:fs';
import {{ checkSpill }} from '{lib}/loadouts.mjs';
const pool = JSON.parse(readFileSync('{pool}', 'utf8'));
console.log(JSON.stringify(await checkSpill(pool, 'testgpu')));
"""
    res = run_cmd(["node", "--input-type=module", "-e", script], cwd=repo_root, env=env)
    assert res.returncode == 0
    assert '"ok":false' in res.output
    assert '"infra":true' in res.output
    assert "spill" in res.output
    # Gegenprobe: unter der Grenze ist alles gut.
    env["FAKE_NVIDIA_SMI_OUTPUT"] = "GPU-aaa, 1000"
    res = run_cmd(["node", "--input-type=module", "-e", script], cwd=repo_root, env=env)
    assert res.returncode == 0
    assert '"ok":true' in res.output


def test_production_orchestrator_is_restored_after_an_abort(run_cmd, repo_root, tmp_path):
    fix, lib = _paths(repo_root)
    bin_log = tmp_path / "bin.log"
    pool_path = tmp_path / "pool.json"
    pool = json.loads((fix / "pool.json").read_text())
    pool["production_services"] = ["qwen38-gsq-iq3xxs.service"]
    pool_path.write_text(json.dumps(pool))
    bin_log.write_text("")
    real_curl = shutil.which("curl") or "/usr/bin/curl"
    env = os.environ.copy()
    env.update({
        "PATH": f"{fix / 'fake-bin'}{os.pathsep}{env.get('PATH', '')}",
        "FAKE_BIN_LOG": str(bin_log),
        "FAKE_REAL_CURL": real_curl,
        "AGENT_BENCH_GPU_LOCK": str(fix / "fake-bin/gpu-lock.sh"),
        "POOL_JSON": str(pool_path),
        "DRIVE_SLEEP_MS": "20000",
    })
    driver_log = tmp_path / "driver.log"
    with open(driver_log, "w") as fh:
        proc = subprocess.Popen(
            ["node", str(fix / "drive-restore.mjs")],
            cwd=str(repo_root), env=env, stdout=fh, stderr=subprocess.STDOUT, text=True,
        )
    try:
        for _ in range(100):
            if "DRIVE-RESTORE-READY" in (driver_log.read_text() if driver_log.exists() else ""):
                break
            time.sleep(0.05)
        assert "DRIVE-RESTORE-READY" in driver_log.read_text()
        proc.send_signal(2)  # SIGINT
        try:
            proc.wait(timeout=60)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait()
    finally:
        if proc.poll() is None:
            proc.kill()
            proc.wait()
    log = bin_log.read_text()
    assert "start qwen38-gsq-iq3xxs.service" in log
    assert "gpu-lock release" in log


def test_vllm_kernel_check_py_prueft_das_serverlog(run_cmd, repo_root, tmp_path):
    script = repo_root / "scripts/llm/agent-bench/vllm-kernel-check.py"
    good = tmp_path / "good.log"
    good.write_text("boot\nselected NVFP4 backend: cutlass fp4 kernel ready\n")
    res = run_cmd(["python3", str(script), str(good), "--skip-capability"], cwd=repo_root)
    assert res.returncode == 0
    assert "kernel=cutlass" in res.output
    marlin = tmp_path / "marlin.log"
    marlin.write_text("boot\nselected NVFP4 backend: marlin fp4 fallback active\n")
    res = run_cmd(["python3", str(script), str(marlin), "--skip-capability"], cwd=repo_root)
    assert res.returncode == 1
    res = run_cmd(["python3", str(script), str(tmp_path / "fehlt.log"), "--skip-capability"], cwd=repo_root)
    assert res.returncode == 2
    # Geraete-Check nur mit torch; ohne torch wird uebersprungen.
    if run_cmd(["python3", "-c", "import torch"], cwd=repo_root).returncode == 0:
        res = run_cmd(["python3", str(script), str(good), "--expect-capability", "0.0"], cwd=repo_root)
        assert res.returncode == 1
        assert "capability-mismatch" in res.output
    else:
        pytest.skip("torch not installed")

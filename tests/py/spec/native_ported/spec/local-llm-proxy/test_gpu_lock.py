"""Native migration of tests/spec/local-llm-proxy/gpu-lock.bats."""

import json
import os
import re
import subprocess
import time

import pytest

MOCK_SERVER_PY = """
import http.server, json, sys
class H(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        if '/admin/state' in self.path:
            self.send_response(200)
            self.end_headers()
            self.wfile.write(json.dumps({'backends':[]}).encode())
        elif '/health' in self.path:
            self.send_response(200)
            self.end_headers()
            self.wfile.write(json.dumps({'status':'ok'}).encode())
        else:
            self.send_response(404)
            self.end_headers()
    def do_POST(self):
        self.send_response(200)
        self.end_headers()
        self.wfile.write(json.dumps({'stopped':'test'}).encode())
    def log_message(self, *a): pass
s = http.server.HTTPServer(('127.0.0.1', 0), H)
with open('PORT_FILE', 'w') as f:
    f.write(str(s.server_address[1]))
s.serve_forever()
"""


@pytest.fixture
def lock_file(tmp_path):
    return tmp_path / "gpu-lock.json"


def _gpu_lock(run_cmd, repo_root, args, lock_file, extra_env=None, timeout=60):
    env = {"GPU_LOCK_FILE": str(lock_file)}
    env.update(extra_env or {})
    return run_cmd(["bash", str(repo_root / "scripts/gpu-lock.sh"), *args], cwd=repo_root, env=env, timeout=timeout)


def _write_lock(lock_file, pid, reason):
    lock_file.write_text(json.dumps({"pid": pid, "started_at": "2026-01-01T00:00:00Z", "reason": reason}))


def test_gpu_lock_acquire_mit_unreachable_proxy_raeumt_lock_auf(run_cmd, repo_root, lock_file):
    res = _gpu_lock(run_cmd, repo_root, ["acquire", "--reason", "Testlauf"], lock_file, {
        "GPU_LOCK_NVIDIA_SMI": "echo 16000",
        "GPU_LOCK_REQUIRED_MIB": "100",
        "GPU_LOCK_PROXY_URL": "http://127.0.0.1:19999",
    })
    assert res.returncode != 0
    assert not lock_file.exists()


def test_gpu_lock_acquire_mit_mock_proxy_erzeugt_gueltiges_json_lock(run_cmd, repo_root, lock_file, tmp_path):
    port_file = tmp_path / "mock-port.txt"
    mock = subprocess.Popen(
        ["python3", "-c", MOCK_SERVER_PY.replace("PORT_FILE", str(port_file))],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    try:
        for _ in range(30):
            if port_file.exists() and port_file.read_text().strip():
                break
            time.sleep(0.1)
        mock_port = port_file.read_text().strip() if port_file.exists() else ""
        if not mock_port:
            pytest.skip("Mock-Server konnte nicht gestartet werden")

        res = _gpu_lock(run_cmd, repo_root, ["acquire", "--reason", "Testlauf"], lock_file, {
            "GPU_LOCK_NVIDIA_SMI": "echo 16000",
            "GPU_LOCK_REQUIRED_MIB": "100",
            "GPU_LOCK_PROXY_URL": f"http://127.0.0.1:{mock_port}",
        })
    finally:
        mock.kill()
        mock.wait(timeout=5)

    assert res.returncode == 0, res.output
    assert lock_file.exists()
    data = json.loads(lock_file.read_text())
    pid = data.get("pid", "")
    assert pid != ""
    assert isinstance(pid, int) and pid > 0
    assert data.get("reason", "") == "Testlauf"
    assert data.get("started_at", "") != ""


def test_gpu_lock_release_entfernt_die_lock_datei(run_cmd, repo_root, lock_file):
    _write_lock(lock_file, os.getpid(), "test")
    assert lock_file.exists()
    res = _gpu_lock(run_cmd, repo_root, ["release"], lock_file)
    assert res.returncode == 0
    assert not lock_file.exists()


def test_gpu_lock_release_auf_nicht_existierender_lock_datei_ist_unkritisch(run_cmd, repo_root, lock_file):
    res = _gpu_lock(run_cmd, repo_root, ["release"], lock_file)
    assert res.returncode == 0


def test_gpu_lock_status_meldet_keinen_lock_wenn_datei_fehlt(run_cmd, repo_root, lock_file):
    res = _gpu_lock(run_cmd, repo_root, ["status"], lock_file)
    assert res.returncode == 0
    assert re.search(r"frei|free|kein|no|not.held", res.output), (
        f"erwartet: Hinweis dass kein Lock gehalten wird. output={res.output}"
    )


def test_gpu_lock_status_meldet_lock_wenn_datei_existiert(run_cmd, repo_root, lock_file):
    pid = os.getpid()
    _write_lock(lock_file, pid, "test")
    res = _gpu_lock(run_cmd, repo_root, ["status"], lock_file)
    assert res.returncode == 0
    assert re.search(str(pid), res.output), f"erwartet: PID {pid} in der Ausgabe. output={res.output}"


def test_gpu_lock_status_behandelt_lock_mit_toter_pid_als_abwesend(run_cmd, repo_root, lock_file):
    _write_lock(lock_file, 99999, "dead")
    assert lock_file.exists()
    res = _gpu_lock(run_cmd, repo_root, ["status"], lock_file)
    assert res.returncode == 0
    assert re.search(r"frei|free|kein|no|not.held|abwesend|absent|verworfen|discarded", res.output), (
        f"erwartet: Hinweis dass Lock verworfen wurde. output={res.output}"
    )


def test_gpu_lock_status_bereinigt_lock_datei_wenn_pid_tot(run_cmd, repo_root, lock_file):
    _write_lock(lock_file, 99999, "dead")
    assert lock_file.exists()
    res = _gpu_lock(run_cmd, repo_root, ["status"], lock_file)
    assert res.returncode == 0
    assert not lock_file.exists()


def test_gpu_lock_gpu_lock_file_setzt_den_lock_pfad_um(run_cmd, repo_root, lock_file, tmp_path):
    custom = tmp_path / "custom-lock.json"
    pid = os.getpid()
    _write_lock(custom, pid, "custom")
    res = run_cmd(["bash", str(repo_root / "scripts/gpu-lock.sh"), "status"], cwd=repo_root,
                  env={"GPU_LOCK_FILE": str(custom)})
    assert res.returncode == 0
    assert re.search(str(pid), res.output)
    assert not lock_file.exists()


def test_gpu_lock_ohne_verb_zeigt_usage(run_cmd, repo_root, lock_file):
    res = _gpu_lock(run_cmd, repo_root, [], lock_file)
    assert res.returncode != 0
    assert re.search(r"acquire|release|status|usage|Verwendung", res.output), (
        f"erwartet: usage-Hinweis. output={res.output}"
    )


def test_gpu_lock_unbekanntes_verb_fuehrt_zu_fehler(run_cmd, repo_root, lock_file):
    res = _gpu_lock(run_cmd, repo_root, ["bogus"], lock_file)
    assert res.returncode != 0

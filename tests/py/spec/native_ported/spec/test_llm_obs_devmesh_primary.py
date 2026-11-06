"""LLM01/02 Container-GPU-primaer + OBS01/CAP01/SLO01 File-Nachweis (RED-first).

Laeuft hermetisch (Stub-HTTP-Server, keine Cluster-/GPU-Abhaengigkeit).
"""
import json
import os
import stat
import subprocess
import threading
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

import pytest


def bash_producer(repo_root):
    return str(repo_root / "scripts" / "lib" / "obs-file-evidence.sh")


def _loadouts(repo_root):
    return json.loads((repo_root / "scripts" / "llm" / "loadouts.json").read_text())


def test_llm01_chat_gpu_gruppe_enthaelt_container_endpoint(repo_root):
    """G-LLM01: chat-gpu braucht ein lebendes Container-Mitglied (Port 8099, k3d)."""
    loadouts = _loadouts(repo_root).get("loadouts", [])
    members = [l for l in loadouts if isinstance(l, dict) and l.get("exclusiveGroup") == "chat-gpu"
               and l.get("enabled") is not False]
    ports = {l.get("port") for l in members}
    assert 8099 in ports, f"chat-gpu ohne Container-Mitglied :8099 (Mitglieder-Ports: {sorted(ports)})"


def test_llm01_studio_child_deaktiviert(repo_root):
    """G-LLM01: toter :45013-Studio-Child darf nicht als aktiv zaehlen (WSL-Umgehung)."""
    loadouts = _loadouts(repo_root).get("loadouts", [])
    studio = [l for l in loadouts if isinstance(l, dict) and l.get("slug") == "unsloth-studio"]
    assert studio, "unsloth-studio-Eintrag fehlt"
    assert all(l.get("enabled") is False for l in studio), \
        "unsloth-studio (:45013, down) muss enabled:false tragen"


class _Stub(BaseHTTPRequestHandler):
    model_id = "/models/Qwen3-1.7B-Q8_0.gguf"

    def do_GET(self):
        if self.path == "/livez":
            body = b"ok"
        elif self.path == "/v1/models":
            body = json.dumps({"data": [{"id": self.model_id}]}).encode()
        else:
            self.send_response(404)
            self.end_headers()
            return
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass


@pytest.fixture()
def stub_server():
    server = HTTPServer(("127.0.0.1", 0), _Stub)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield f"http://127.0.0.1:{server.server_port}"
    server.shutdown()


def _run_measure(repo_root, tmp_path, subcommand, loadouts, proxy_url, extra_env=None):
    loadouts_file = tmp_path / "loadouts.json"
    loadouts_file.write_text(json.dumps({"loadouts": loadouts}))
    env = dict(os.environ)
    env["LLM_PROXY_URL"] = proxy_url
    env["LLM_MEASURE_LOADOUTS"] = str(loadouts_file)
    if extra_env:
        env.update(extra_env)
    script = repo_root / "scripts" / "lib" / "llm-stack-measure.sh"
    return subprocess.run(["bash", str(script), subcommand], capture_output=True, text=True, env=env)


def test_llm03_drift_vergleicht_basenames(repo_root, tmp_path, stub_server):
    """G-LLM03: absolute llama.cpp-Modell-IDs duerfen keinen Drift zaehlen."""
    port = int(stub_server.rsplit(":", 1)[1])
    loadouts = [{"slug": "qwen17b-container", "port": port,
                 "model": "unsloth/Qwen3-1.7B-GGUF/Qwen3-1.7B-Q8_0.gguf"}]
    result = _run_measure(repo_root, tmp_path, "model-drift", loadouts, stub_server)
    assert result.returncode == 0, result.stderr[-500:]
    assert result.stdout.strip() == "0", f"Drift trotz Basename-Match: {result.stdout!r}"


def _slo_log(tmp_path, days_ago_list, ok=1):
    log = tmp_path / "slo.jsonl"
    now = int(time.time())
    with open(log, "w", encoding="utf-8") as fh:
        for days_ago in days_ago_list:
            ts = now - days_ago * 86400
            fh.write(json.dumps({"ts": ts, "brand": "korczewski", "ok": ok}) + "\n")
    return log


def test_obs_slo_window_braucht_7_proben_aus_6_tagen(repo_root, tmp_path):
    """OBS01/SLO01: Fenster-Regel fail-closed (zu wenig Historie -> Exit 2)."""
    producer = repo_root / "scripts" / "lib" / "obs-file-evidence.sh"
    assert producer.is_file(), "Producer fehlt (RED)"
    thin = _slo_log(tmp_path, [0, 1])
    out = tmp_path / "slo-thin.json"
    thin_run = subprocess.run([bash_producer(repo_root), "slo-window", "--log", str(thin),
                               "--out", str(out)], capture_output=True, text=True)
    assert thin_run.returncode == 2, f"dünne Historie muss Exit 2 geben: {thin_run.stdout!r}"
    full = _slo_log(tmp_path, [0, 1, 2, 3, 4, 5, 6])
    out_full = tmp_path / "slo-full.json"
    full_run = subprocess.run([bash_producer(repo_root), "slo-window", "--log", str(full),
                               "--out", str(out_full)], capture_output=True, text=True)
    assert full_run.returncode == 0, full_run.stderr[-500:]
    measure = subprocess.run(
        ["python3", str(repo_root / "scripts" / "lib" / "runtime-health-measure.py"),
         "slo", "--input", str(out_full)], capture_output=True, text=True)
    assert measure.returncode == 0, measure.stderr[-500:]
    assert measure.stdout.strip() == "1000", f"erwartet 1000, ist: {measure.stdout!r}"


def test_obs_producer_existiert(repo_root):
    """OBS: File-Evidenz-Produzent muss vorhanden und ausfuehrbar sein."""
    producer = repo_root / "scripts" / "lib" / "obs-file-evidence.sh"
    assert producer.is_file(), "scripts/lib/obs-file-evidence.sh fehlt"
    assert producer.stat().st_mode & stat.S_IXUSR, "obs-file-evidence.sh nicht ausfuehrbar"


def test_obs_scrape_file_end_to_end(repo_root, tmp_path, stub_server):
    """OBS01: Produzent + Messung ueber Datei-Evidenz (ein Target up, eins down → 1)."""
    producer = repo_root / "scripts" / "lib" / "obs-file-evidence.sh"
    if not producer.is_file():
        pytest.fail("Producer fehlt (RED) — siehe test_obs_producer_existiert")
    targets = tmp_path / "targets.json"
    targets.write_text(json.dumps({"targets": [
        {"job": "stub-up", "url": f"{stub_server}/v1/models"},
        {"job": "stub-down", "url": "http://127.0.0.1:1/v1/models"},
    ]}))
    out = tmp_path / "scrape.json"
    probe = subprocess.run(["bash", str(producer), "scrape", "--targets", str(targets),
                            "--out", str(out)], capture_output=True, text=True)
    assert probe.returncode == 0, probe.stderr[-500:]
    assert out.is_file(), "keine Evidenz-Datei geschrieben"
    measure = subprocess.run(
        ["python3", str(repo_root / "scripts" / "lib" / "runtime-health-measure.py"),
         "scrape", "--input", str(out)], capture_output=True, text=True)
    assert measure.returncode == 0, measure.stderr[-500:]
    assert measure.stdout.strip() == "1", f"erwartet 1 (stub-down), ist: {measure.stdout!r}"

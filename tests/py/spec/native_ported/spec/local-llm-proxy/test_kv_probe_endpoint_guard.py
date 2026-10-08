"""Native migration of tests/spec/local-llm-proxy/kv-probe-endpoint-guard.bats."""

import json
import re
import socket
import subprocess
import sys
import time
from pathlib import Path

import pytest

PORT_OK = 19551
PORT_500 = 19552

SERVER_PY = """
import http.server,threading
class OK(http.server.BaseHTTPRequestHandler):
    def do_GET(s): s.send_response(200); s.end_headers(); s.wfile.write(b'{"status":"ok"}')
    def log_message(*a): pass
class Err(http.server.BaseHTTPRequestHandler):
    def do_GET(s): s.send_response(500); s.end_headers(); s.wfile.write(b'boom')
    def log_message(*a): pass
for cls,p in ((OK,PORT_OK),(Err,PORT_500)):
    srv=http.server.HTTPServer(('127.0.0.1',p),cls)
    threading.Thread(target=srv.serve_forever,daemon=True).start()
import time; time.sleep(20)
""".replace("PORT_OK", str(PORT_OK)).replace("PORT_500", str(PORT_500))


def _declared_port(repo_root):
    doc = json.loads((repo_root / "scripts/llm/loadouts.json").read_text(encoding="utf-8"))
    lo = [x for x in doc["loadouts"] if x.get("slug") == "gemma26-factory"]
    return str(lo[0]["port"]) if lo and "port" in lo[0] else ""


def _port_open(port):
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=0.5):
            return True
    except OSError:
        return False


def test_kv_probe_endpoint_guard_t002579_die_langkontext_probe_zielt_auf_den_port_den_das_loadout_deklariert(run_cmd, repo_root):
    declared = _declared_port(repo_root)
    assert declared, "ANKER ROT: kein gemma26-factory-Loadout mit Port"
    probe = repo_root / "tests/spec/local-llm-proxy/gemma-kv-quant.bats"
    assert probe.is_file(), f"ANKER ROT: {probe} fehlt"
    text = probe.read_text(encoding="utf-8")
    from_registry = "loadouts.json" in text
    literal = f":{declared}" in text
    assert from_registry or literal, f"Probe bezieht Port weder aus loadouts.json noch nennt sie {declared}."
    lines = [f"{i}:{l}" for i, l in enumerate(text.splitlines(), 1) if ":8081" in l and not re.match(r"^ *#", l)]
    assert not lines, "Probe zeigt in wirksamem Code noch auf den toten Port 8081:\n" + "\n".join(lines)


def test_kv_probe_endpoint_guard_t002579_die_langkontext_probe_belegt_ihre_kontextgroesse_am_server(repo_root):
    probe = repo_root / "tests/spec/local-llm-proxy/gemma-kv-quant.bats"
    text = probe.read_text(encoding="utf-8")
    assert sum(1 for l in text.splitlines() if "T002535" in l) > 0, "ANKER ROT: kein T002535-Probe-Test vorhanden"
    assert sum(1 for l in text.splitlines() if "prompt_tokens" in l) > 0, "Probe prueft prompt_tokens nicht"


def test_kv_probe_endpoint_guard_t002579_die_endpunkt_pruefung_erkennt_http_500_als_nicht_verfuegbar(run_cmd, repo_root):
    helper = repo_root / "tests/spec/local-llm-proxy/helpers/llm-endpoint.bash"
    assert helper.is_file(), f"Hilfsfunktion fehlt: {helper}"
    server = subprocess.Popen([sys.executable, "-c", SERVER_PY],
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        for attempt in range(50):
            if _port_open(PORT_OK) and _port_open(PORT_500):
                break
            time.sleep(0.1)
        else:
            pytest.fail(f"TIMEOUT: Ports {PORT_OK}/{PORT_500} banden nicht innerhalb von 5s")

        def healthy(url):
            return run_cmd(["bash", "-c", f'source "{helper}"; llm_endpoint_healthy "{url}"'], cwd=repo_root)

        ok = healthy(f"http://127.0.0.1:{PORT_OK}/health")
        err = healthy(f"http://127.0.0.1:{PORT_500}/health")
    finally:
        server.kill()
        server.wait(timeout=5)

    assert ok.returncode == 0, "ANKER ROT: HTTP 200 wurde als nicht verfuegbar gewertet"
    assert err.returncode != 0, "HTTP 500 wurde faelschlich als verfuegbar gewertet"

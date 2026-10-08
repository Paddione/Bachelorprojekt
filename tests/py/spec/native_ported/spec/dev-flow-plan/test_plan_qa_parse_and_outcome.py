"""Native migration of tests/spec/dev-flow-plan/plan-qa-parse-and-outcome.bats."""
# T003112: every run of scripts/plan-qa-check.sh prints exactly one machine-readable result line
# (RESULT: PASS | FAIL | SKIPPED | ERROR). Parse failures are ERROR, not a content FAIL.

# Command output verification [T002448-M4]. The gateway is a local fixture server; no real LLM.

import hashlib
import json
import re
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request

import pytest

# Writes fixed paths under the shared repo; serialize across xdist workers.
pytestmark = pytest.mark.repo_lock("agents-plans")

PLAN = """---
title: "Fixture — Implementation Plan"
ticket_id: T003112
domains: [test]
status: active
---

# Fixture Implementation Plan

## File Structure

- Modify: `scripts/example.sh`

## Task 1: Beispiel

Ein Schritt, damit der Plan die Mindestlaenge erreicht.

## Task 2: Abschluss

- `task test:changed`
- `task freshness:regenerate`
- `task freshness:check`
"""

FAKE_GATEWAY = r'''
import json, sys
from http.server import BaseHTTPRequestHandler, HTTPServer

PORT = int(sys.argv[1])
MODE = sys.argv[2]

PLAIN = json.dumps({"verdict": "PASS", "missing": [], "suggestions": ""})
FENCED = (
    "```json\n"
    + json.dumps({
        "verdict": "FAIL",
        "missing": ["Kriterium 4: S1-Budget-Kommentar fehlt"],
        "suggestions": "Budgetzeile je Datei ergaenzen",
    })
    + "\n```"
)
PROSE = "Ich habe den Plan geprueft und finde ihn insgesamt schluessig."
FTP = json.dumps({
    "verdict": "FAIL",
    "missing": ["Kriterium 1: kein Pfad"],
    "suggestions": "Konkreten Pfad nennen.",
})

STATE = {"n": 0}


def content():
    if MODE != "fail_then_pass":
        return {"plain": PLAIN, "fenced": FENCED, "prose": PROSE}[MODE]
    STATE["n"] += 1
    return FTP if STATE["n"] == 1 else PLAIN


class H(BaseHTTPRequestHandler):
    def _send(self, code, body):
        payload = body.encode()
        self.send_response(code)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self):
        if self.path == "/livez":
            self._send(200, '{"alive":true}')
        else:
            self._send(404, '{"error":"not found"}')

    def do_POST(self):
        self.rfile.read(int(self.headers.get("content-length") or 0))
        self._send(200, json.dumps({"choices": [{"message": {"content": content()}}]}))

    def log_message(self, *a):
        pass


HTTPServer(("127.0.0.1", PORT), H).serve_forever()
'''


def free_port() -> int:
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return port


def _http_status(url: str) -> str:
    try:
        with urllib.request.urlopen(url, timeout=1) as resp:
            return str(resp.status)
    except urllib.error.HTTPError as err:
        return str(err.code)
    except OSError:
        return "000"


def _md5(path) -> str:
    return hashlib.md5(path.read_bytes()).hexdigest()


@pytest.fixture
def plan(tmp_path):
    p = tmp_path / "plan.md"
    p.write_text(PLAN, encoding="utf-8")
    return p


@pytest.fixture
def start_fake_gateway():
    procs = []

    def _start(port: int, mode: str):
        proc = subprocess.Popen(
            [sys.executable, "-c", FAKE_GATEWAY, str(port), mode],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        procs.append(proc)
        for _ in range(100):
            if _http_status(f"http://127.0.0.1:{port}/livez") == "200":
                return proc
            time.sleep(0.1)
        pytest.fail(f"Fake-Gateway auf Port {port} wurde nicht bereit")

    yield _start
    for proc in procs:
        proc.kill()
        proc.wait()


@pytest.fixture
def qa(run_cmd, repo_root):
    script = repo_root / "scripts" / "plan-qa-check.sh"

    def _run(plan_path, port):
        return run_cmd(["bash", str(script), str(plan_path)],
                       cwd=repo_root, env={"GATEWAY_BASE_URL": f"http://127.0.0.1:{port}"})

    return _run


def _has_result(output: str, status: str) -> bool:
    return re.search(rf"RESULT:[ \t]*{status}", output) is not None


# --- (a) Parse ---------------------------------------------------------------

def test_t003112_wohlgeformte_json_antwort_ergibt_result_pass_positiv_anker(plan, start_fake_gateway, qa):
    port = free_port()
    start_fake_gateway(port, "plain")
    res = qa(plan, port)
    assert res.returncode == 0, f"erwartet exit 0 bei PASS, war {res.returncode}\n{res.output}"
    assert "PASS" in res.output, f"MISSING: kein PASS in der Ausgabe\n{res.output}"
    assert _has_result(res.output, "PASS"), f"MISSING: keine maschinenlesbare Ergebniszeile 'RESULT: PASS'\n{res.output}"


def test_t003112_json_im_markdown_fence_wird_geparst_nicht_als_parse_fehler_gemeldet(plan, start_fake_gateway, qa):
    port = free_port()
    start_fake_gateway(port, "fenced")

    # Anchor: the fixture really delivers a fence with the expected finding.
    req = urllib.request.Request(
        f"http://127.0.0.1:{port}/v1/chat/completions", data=b"{}", method="POST",
        headers={"content-type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=5) as resp:
        content = json.loads(resp.read())["choices"][0]["message"]["content"]
    assert "```json" in content, f"Anker verletzt: Fixture lieferte keinen Markdown-Fence\n{content}"
    assert "S1-Budget-Kommentar fehlt" in content, f"Anker verletzt: Fixture-Befund fehlt\n{content}"

    res = qa(plan, port)
    assert "S1-Budget-Kommentar fehlt" in res.output, f"MISSING: der inhaltliche Befund fehlt\n{res.output}"
    assert "Could not parse missing items" not in res.output, (
        f"REGRESSION: gefencte, wohlgeformte Antwort als Parse-Fehler gemeldet\n{res.output}"
    )
    assert re.search(r"RESULT:[ \t]*FAIL", res.output), f"MISSING: inhaltliches FAIL nicht als 'RESULT: FAIL'\n{res.output}"


# --- (b) Ausfall als Ausfall sichtbar ----------------------------------------

def test_t003112_unlesbare_modellantwort_ergibt_result_error_kein_inhaltliches_verdict(plan, start_fake_gateway, qa):
    port = free_port()
    start_fake_gateway(port, "prose")
    res = qa(plan, port)
    assert _has_result(res.output, "ERROR"), f"MISSING: unlesbare Antwort nicht als 'RESULT: ERROR'\n{res.output}"
    assert not re.search(r"RESULT:[ \t]*(PASS|FAIL)", res.output), (
        f"REGRESSION: Stoerung des Pruefwegs als inhaltliches Verdict ausgegeben\n{res.output}"
    )
    # Diagnosable: an excerpt of the actual answer must be included.
    assert "Ich habe den Plan geprueft" in res.output, f"MISSING: kein Auszug der unlesbaren Antwort\n{res.output}"


def test_t003112_uebersprungene_pruefung_ergibt_result_skipped_nicht_pass(plan, qa):
    port = free_port()  # deliberately no server on this port: the skip path
    res = qa(plan, port)
    assert res.returncode == 0, f"advisory QA muss exit 0 liefern, war {res.returncode}\n{res.output}"
    assert _has_result(res.output, "SKIPPED"), f"MISSING: Skip nicht als 'RESULT: SKIPPED'\n{res.output}"
    assert not re.search(r"RESULT:[ \t]*PASS", res.output), f"REGRESSION: uebersprungene Pruefung als PASS lesbar\n{res.output}"


def test_t003112_bei_unlesbarer_antwort_laeuft_kein_auto_fix_versuch(plan, start_fake_gateway, qa):
    # Checks the *attempt* in the output, not the final file state (the script restores a backup).
    port = free_port()
    start_fake_gateway(port, "prose")
    before = _md5(plan)
    res = qa(plan, port)
    after = _md5(plan)
    assert "auto-fix" not in res.output.lower(), f"REGRESSION: Auto-Fix-Versuch trotz unlesbarer Antwort\n{res.output}"
    assert before == after, f"REGRESSION: Plandatei wurde bei unlesbarer Antwort veraendert\n{res.output}"


def test_t003621_pass_nach_auto_fix_iteration_hinterlaesst_die_plandatei_byte_identisch(plan, start_fake_gateway, qa):
    # Request 1 -> FAIL with suggestions (auto-fix appends a section), request 2 -> PASS.
    port = free_port()
    start_fake_gateway(port, "fail_then_pass")
    before = _md5(plan)
    res = qa(plan, port)
    after = _md5(plan)
    assert _has_result(res.output, "PASS"), f"MISSING: Ergebniszeile RESULT: PASS\n{res.output}"
    assert res.returncode == 0, f"erwartet exit 0 bei PASS, war {res.returncode}\n{res.output}"
    assert before == after, f"REGRESSION: Plandatei nach PASS nicht byte-identisch zum Eingang\n{res.output}"
    assert "## QA-Ergänzungen" not in plan.read_text(encoding="utf-8"), (
        "REGRESSION: QA-Ergaenzungen-Sektion trotz PASS im Artefakt"
    )


def test_t003381_fehlendes_abschluss_kommando_wird_deterministisch_ohne_gateway_erkannt(tmp_path, plan, qa):
    plan_no_cmd = tmp_path / "plan-no-check.md"
    plan_no_cmd.write_text(plan.read_text(encoding="utf-8").replace("task freshness:check", ""), encoding="utf-8")
    assert "task freshness:check" not in plan_no_cmd.read_text(encoding="utf-8"), "Fixture kaputt: Kommando noch da"

    port = free_port()
    res = qa(plan_no_cmd, port)
    assert _has_result(res.output, "FAIL"), f"MISSING: deterministisches FAIL\n{res.output}"
    assert "freshness:check" in res.output, f"MISSING: fehlendes Kommando wird benannt\n{res.output}"
    assert res.returncode == 1, f"erwartet exit 1 bei deterministischem FAIL, war {res.returncode}\n{res.output}"


def test_t003381_plan_mit_allen_drei_kommandos_als_checkbox_task_gateway_pass_ergibt_pass(plan, start_fake_gateway, qa):
    port = free_port()
    start_fake_gateway(port, "plain")
    res = qa(plan, port)
    assert res.returncode == 0, f"erwartet exit 0 bei PASS, war {res.returncode}\n{res.output}"
    assert _has_result(res.output, "PASS"), f"MISSING: RESULT: PASS\n{res.output}"
    assert "deterministisch" in res.output.lower(), (
        f"MISSING: Kriterium 5 wird als deterministisch geprueft ausgewiesen\n{res.output}"
    )

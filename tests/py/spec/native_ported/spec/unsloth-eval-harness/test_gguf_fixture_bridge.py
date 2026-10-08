"""Native migration of tests/spec/unsloth-eval-harness/gguf-fixture-bridge.bats."""
# (T002634)
# Pruefmodus: Output-Verifikation (erzeugte Fixture-Datei, Exit-Code). gen_fixtures.py runs as a CLI
# against a local stub HTTP endpoint (loopback, in-process thread on an ephemeral port). No model,
# no GPU, no external network.

import http.server
import json
import os
import subprocess
import sys
import threading
from pathlib import Path

import pytest

ENV = {**os.environ, "PYTHONDONTWRITEBYTECODE": "1"}


class _Stub(http.server.BaseHTTPRequestHandler):
    """Spiegelt den empfangenen Prompt zurueck und protokolliert den Request."""

    log_dir: Path = Path(".")

    def do_POST(self):  # noqa: N802
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        (self.log_dir / "last-request.json").write_text(json.dumps(body), encoding="utf-8")
        prompt = body.get("prompt") or body["messages"][0]["content"]
        if "prompt" in body:
            payload = {"choices": [{"text": prompt[:40], "finish_reason": "stop"}]}
        else:
            payload = {"choices": [{"message": {"content": prompt[:40]}, "finish_reason": "stop"}]}
        out = json.dumps(payload).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(out)))
        self.end_headers()
        self.wfile.write(out)

    def log_message(self, *args):
        pass


@pytest.fixture
def ctx(repo_root, tmp_path, monkeypatch):
    monkeypatch.setattr(_Stub, "log_dir", tmp_path)
    server = http.server.HTTPServer(("127.0.0.1", 0), _Stub)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield {
            "gen": repo_root / "scripts/finetune/gen_fixtures.py",
            "testset": repo_root / "scripts/finetune/testsets/agent-actions.jsonl",
            "repo": repo_root,
            "tmp": tmp_path,
            "endpoint": f"http://127.0.0.1:{server.server_address[1]}/v1",
        }
    finally:
        server.shutdown()
        server.server_close()


def _py(args, cwd=None):
    proc = subprocess.run([sys.executable, *args], capture_output=True, text=True, env=ENV, cwd=cwd, timeout=120)
    return proc.returncode, proc.stdout + (("\n" + proc.stderr) if proc.stderr else "")


def _gen(c, output, *extra):
    return _py([str(c["gen"]), "--testset", str(c["testset"]), "--model", "stub",
                "--output", str(output), "--endpoint", c["endpoint"], *extra])


def test_gen_fixtures_schreibt_fuer_jeden_testset_fall_genau_einen_fixture_eintrag(ctx):
    status, out = _gen(ctx, ctx["tmp"] / "fx.json")
    assert status == 0, out
    cases = len(ctx["testset"].read_text(encoding="utf-8").splitlines())
    entries = len(json.loads((ctx["tmp"] / "fx.json").read_text(encoding="utf-8")))
    assert entries == cases


def test_der_gesendete_prompt_ist_exakt_build_prompt_aus_eval_harness(ctx):
    status, out = _gen(ctx, ctx["tmp"] / "fx.json")
    assert status == 0, out

    # Positiv-Anker: der letzte Fall, durch build_prompt gejagt, entspricht zeichengenau dem Gesendeten.
    script = (
        "import json, sys\n"
        "sys.path.insert(0, sys.argv[1] + '/scripts/finetune')\n"
        "from eval_harness import build_prompt\n"
        "last_case = [json.loads(l) for l in open(sys.argv[2], encoding='utf-8') if l.strip()][-1]\n"
        "sent = json.load(open(sys.argv[3]))['prompt']\n"
        "assert sent == build_prompt(last_case), f'Prompt weicht ab:\\n{sent!r}\\n{build_prompt(last_case)!r}'\n"
        "print('identisch')\n"
    )
    status, out = _py(["-c", script, str(ctx["repo"]), str(ctx["testset"]), str(ctx["tmp"] / "last-request.json")])
    assert status == 0, out
    assert "identisch" in out


def test_greedy_und_das_token_budget_spiegeln_model_backend(ctx):
    status, out = _gen(ctx, ctx["tmp"] / "fx.json")
    assert status == 0, out
    request = json.loads((ctx["tmp"] / "last-request.json").read_text(encoding="utf-8"))
    assert str(request["temperature"]) == "0"

    # Gegen die Konstante des Harness, nicht gegen eine Zahl.
    status, expected = _py(["-c", "import sys;sys.path.insert(0, sys.argv[1]);"
                                  "import eval_harness;print(eval_harness.MAX_NEW_TOKENS)",
                            str(ctx["repo"] / "scripts/finetune")])
    assert status == 0, expected
    assert str(request["max_tokens"]) == expected.strip()


def test_build_prompt_nennt_das_schema_das_der_scorer_erzwingt(ctx):
    script = r"""
import json, sys
sys.path.insert(0, f"{sys.argv[1]}/scripts/finetune")
from eval_harness import build_prompt, parse_action_output
from eval_scoring import score_case

case = {
    "id": "t", "class": "action", "language": "en", "request": "Do the thing.",
    "action_schemas": {"create_task": {"required": ["title"], "optional": []}},
    "expected_actions": [{"name": "create_task", "params": {"title": "X"}}],
}
prompt = build_prompt(case)
for key in ("name", "params"):
    assert f'"{key}"' in prompt, f'build_prompt nennt {key!r} nicht - Modell muesste raten'

good = json.dumps([{"name": "create_task", "params": {"title": "X"}}])
assert score_case(case, parse_action_output(good))["score"] == 1.0

bad = json.dumps([{"action": "create_task", "parameters": {"title": "X"}}])
assert score_case(case, parse_action_output(bad))["score"] == 0.0
print("ok")
"""
    status, out = _py(["-c", script, str(ctx["repo"])])
    assert status == 0, out
    assert "ok" in out


def test_mode_chat_sendet_messages_statt_prompt_default_sendet_prompt(ctx):
    status, out = _gen(ctx, ctx["tmp"] / "c.json", "--mode", "chat")
    assert status == 0, out
    request = json.loads((ctx["tmp"] / "last-request.json").read_text(encoding="utf-8"))
    assert ("messages" in request, "prompt" in request) == (True, False)

    status, out = _gen(ctx, ctx["tmp"] / "d.json")
    assert status == 0, out
    request = json.loads((ctx["tmp"] / "last-request.json").read_text(encoding="utf-8"))
    assert ("messages" in request, "prompt" in request) == (False, True)


def test_unerreichbarer_endpunkt_liefert_exit_2_statt_einer_leeren_fixture(ctx):
    output = ctx["tmp"] / "none.json"
    status, out = _py([str(ctx["gen"]), "--testset", str(ctx["testset"]), "--model", "stub",
                       "--output", str(output), "--endpoint", "http://127.0.0.1:1/v1", "--timeout", "5"])
    assert status == 2
    assert not output.exists()


def test_die_erzeugte_fixture_ist_fuer_eval_harness_lesbar(ctx):
    status, out = _gen(ctx, ctx["tmp"] / "fx.json")
    assert status == 0, out
    fixture = str(ctx["tmp"] / "fx.json")
    status, out = _py([str(ctx["repo"] / "scripts/finetune/eval_harness.py"), "--testset", str(ctx["testset"]),
                       "--fixture-base", fixture, "--fixture-tuned", fixture, "--quiet"])
    assert status == 0, out

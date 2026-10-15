"""Direkt-Worker des plan-runners (T016656): Tool-Loop gegen einen Fake-OpenAI-Server."""

import json
import socket
import subprocess
import time
import urllib.error
from pathlib import Path
import urllib.request

import pytest


def _free_port() -> int:
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return port


def _call(name, **args):
    return {"name": name, "args": args}


def _step(*calls, **extra):
    return {"tool_calls": list(calls), **extra}


class Direct:
    def __init__(self, repo, tmp, run_cmd):
        self.repo = repo
        self.t = tmp
        self.run_cmd = run_cmd
        self.wt = tmp / "wt"
        self.wt.mkdir()
        self.proc = None
        self.url = None
        self.log = tmp / "requests.log"
        self.log.write_text("")

    def serve(self, steps):
        (self.t / "script.json").write_text(json.dumps(steps))
        port = _free_port()
        out = open(self.t / "worker.out", "w")
        fixture = self.repo / "tests" / "spec" / "llm-local-dev" / "fixtures" / "plan-runner-fake-openai-worker.mjs"
        self.proc = subprocess.Popen(
            ["node", str(fixture), str(port), str(self.t / "script.json"), str(self.log)],
            stdout=out, stderr=subprocess.STDOUT,
        )
        self.url = f"http://127.0.0.1:{port}"
        for _ in range(50):
            try:
                with urllib.request.urlopen(f"{self.url}/health", timeout=2) as resp:
                    if resp.status == 200:
                        return
            except (urllib.error.URLError, OSError):
                pass
            time.sleep(0.1)
        raise RuntimeError("fake openai worker did not start")

    def run(self, steps, targets=("src/a.txt",), **opts):
        self.serve(steps)
        module = self.repo / "scripts" / "llm" / "plan-runner" / "direct-worker.mjs"
        args = {
            "prompt": "Partial-ID: p1\nCarry out the partial.", "worktree": str(self.wt),
            "targetFiles": list(targets), "timeoutMs": 30000, "url": self.url, "model": "w4a4", **opts,
        }
        script = (
            f"import {{ runDirectWorker }} from '{module}';\n"
            f"const r = await runDirectWorker({json.dumps(args)});\n"
            "process.stdout.write('RESULT-JSON ' + JSON.stringify(r) + '\\n');\n"
        )
        res = self.run_cmd(["node", "--input-type=module", "-e", script], timeout=60)
        assert res.returncode == 0, res.output
        line = [ln for ln in res.stdout.splitlines() if ln.startswith("RESULT-JSON ")][-1]
        return json.loads(line[len("RESULT-JSON "):])

    def tool_results(self):
        """Inhalte aller tool-Nachrichten der letzten Anfrage."""
        last = json.loads(self.log.read_text().splitlines()[-1])
        return [m["content"] for m in last["messages"] if m["role"] == "tool"]

    def close(self):
        if self.proc is not None:
            self.proc.kill()
            self.proc.wait()


@pytest.fixture
def dw(repo_root, tmp_path, run_cmd):
    d = Direct(repo_root, tmp_path, run_cmd)
    yield d
    d.close()


def test_write_file_on_a_target_and_finish_success(dw):
    r = dw.run([
        _step(_call("write_file", path="src/a.txt", content="hallo\n")),
        _step(_call("finish", status="success", summary="a.txt angelegt", changed_files=["src/a.txt"])),
    ])
    assert r["ok"] is True, r
    assert (dw.wt / "src" / "a.txt").read_text() == "hallo\n"
    assert "PLAN-RUNNER-RESULT: success a.txt angelegt" in r["tail"]
    assert r["summary"] == "a.txt angelegt"
    assert r["code"] == 0


def test_request_asks_for_a_required_tool_call_with_low_temperature(dw):
    dw.run([_step(_call("finish", status="success", summary="nichts zu tun", changed_files=[]))])
    body = json.loads(dw.log.read_text().splitlines()[0])
    assert body["model"] == "w4a4"
    assert body["tool_choice"] == "required"
    assert body["temperature"] == 0.2
    assert body["max_tokens"] == 4096
    names = sorted(t["function"]["name"] for t in body["tools"])
    assert names == ["finish", "read_file", "replace_in_file", "run_command", "write_file"]


def test_write_outside_target_files_is_refused_and_leaves_the_file_untouched(dw):
    (dw.wt / "other.txt").write_text("original\n")
    dw.run([
        _step(_call("write_file", path="other.txt", content="boese\n")),
        _step(_call("finish", status="failure", summary="abgelehnt", changed_files=[])),
    ])
    assert any("ERROR: path not in target_files" in c for c in dw.tool_results())
    assert (dw.wt / "other.txt").read_text() == "original\n"


@pytest.mark.parametrize("path", ["../x", "/etc/passwd-x"])
def test_path_escape_and_absolute_paths_are_refused(dw, path):
    dw.run([
        _step(_call("write_file", path=path, content="x")),
        _step(_call("finish", status="failure", summary="abgelehnt", changed_files=[])),
    ], targets=("src/a.txt", path))
    results = dw.tool_results()
    assert any(c.startswith("ERROR") for c in results), results
    assert not (dw.wt.parent / "x").exists()


def test_read_file_works_across_the_worktree_but_not_outside(dw):
    (dw.wt / "notes.txt").write_text("inhalt-123\n")
    dw.run([
        _step(_call("read_file", path="notes.txt")),
        _step(_call("read_file", path="../wt-nachbar")),
        _step(_call("finish", status="success", summary="gelesen", changed_files=[])),
    ])
    results = dw.tool_results()
    assert "inhalt-123" in results[0]
    assert results[1].startswith("ERROR")


def test_replace_in_file_needs_exactly_one_match(dw):
    (dw.wt / "src").mkdir()
    (dw.wt / "src" / "a.txt").write_text("eins\nzwei\nzwei\n")
    dw.run([
        _step(_call("replace_in_file", path="src/a.txt", old="zwei", new="drei")),
        _step(_call("replace_in_file", path="src/a.txt", old="gibtsnicht", new="x")),
        _step(_call("replace_in_file", path="src/a.txt", old="eins", new="uno")),
        _step(_call("finish", status="success", summary="ersetzt", changed_files=["src/a.txt"])),
    ])
    results = dw.tool_results()
    assert results[0].startswith("ERROR") and "2" in results[0]
    assert results[1].startswith("ERROR")
    assert (dw.wt / "src" / "a.txt").read_text() == "uno\nzwei\nzwei\n"


def test_run_command_outside_the_allowlist_is_refused(dw):
    marker = dw.wt / "pwned"
    dw.run([
        _step(_call("run_command", argv=["touch", str(marker)])),
        _step(_call("run_command", argv=["python3", "-m", "pytest", "--version", ";", "touch", str(marker)])),
        _step(_call("finish", status="failure", summary="abgelehnt", changed_files=[])),
    ])
    results = dw.tool_results()
    assert results[0].startswith("ERROR: command not allowed")
    assert not marker.exists()


@pytest.mark.parametrize("argv", [
    ["python3", "-m", "pytest", "-p", "evil_plugin", "test_ok.py"],
    ["python3", "-m", "pytest", "--rootdir=/", "test_ok.py"],
    ["node", "--test", "--import", "./evil.mjs"],
    ["git", "diff", "--output=../leak.txt"],
    ["git", "diff", "--no-index", "/etc/hostname", "x"],
    ["python3", "-m", "pytest", "-pevil_plugin", "test_ok.py"],
    ["python3", "-m", "pytest", "-qp", "evil_plugin", "test_ok.py"],
    ["python3", "-m", "pytest", "--junitxml=/tmp/leak.xml", "test_ok.py"],
    ["python3", "-m", "pytest", "-o", "addopts=-p evil", "test_ok.py"],
    ["python3", "-m", "pytest", "../outside/test_x.py"],
    ["python3", "-m", "pytest", "@args.txt"],
    ["python3", "-m", "pytest", "-k", "@args.txt", "test_ok.py"],
    ["npx", "vitest", "run", "--outputFile=/tmp/x.json"],
])
def test_allowed_prefix_with_a_forbidden_argument_is_refused(dw, argv):
    (dw.wt / "test_ok.py").write_text("def test_ok():\n    assert True\n")
    dw.run([
        _step(_call("run_command", argv=argv)),
        _step(_call("finish", status="failure", summary="abgelehnt", changed_files=[])),
    ])
    assert dw.tool_results()[0].startswith("ERROR: command not allowed (forbidden argument")


def test_commands_do_not_inherit_secrets_from_the_runner_env(dw, monkeypatch):
    monkeypatch.setenv("PLAN_RUNNER_TEST_SECRET", "geheim-123")
    (dw.wt / "test_env.py").write_text(
        "import os\n\ndef test_env():\n    assert 'PLAN_RUNNER_TEST_SECRET' not in os.environ\n"
        "    assert os.environ.get('PATH')\n")
    dw.run([
        _step(_call("run_command", argv=["python3", "-m", "pytest", "-q", "-p", "no:cacheprovider", "test_env.py"])),
        _step(_call("finish", status="success", summary="gruen", changed_files=[])),
    ])
    out = dw.tool_results()[0]
    assert "1 passed" in out, out


def test_allowed_command_runs_with_cwd_in_the_worktree_and_without_a_shell(dw):
    (dw.wt / "test_ok.py").write_text("def test_ok():\n    assert 1 + 1 == 2\n")
    dw.run([
        _step(_call("run_command", argv=["python3", "-m", "pytest", "-q", "-p", "no:cacheprovider", "test_ok.py"])),
        _step(_call("finish", status="success", summary="gruen", changed_files=[])),
    ])
    out = dw.tool_results()[0]
    assert "1 passed" in out, out



def _bwrap_works() -> bool:
    import shutil
    if not shutil.which("bwrap"):
        return False
    r = subprocess.run(["bwrap", "--ro-bind", "/", "/", "--dev", "/dev", "--proc", "/proc", "true"],
                       capture_output=True)
    return r.returncode == 0


@pytest.mark.skipif(not _bwrap_works(), reason="bwrap fehlt oder darf keine Namespaces anlegen")
def test_run_command_executes_model_written_code_inside_the_sandbox(dw, monkeypatch, tmp_path):
    """pytest fuehrt Dateien aus, die das Modell geschrieben hat: die Allowlist
    begrenzt nur den Befehl, nicht den Code. Er darf HOME und Host-Sockets nicht sehen."""
    home = tmp_path / "home"
    (home / ".ssh").mkdir(parents=True)
    (home / ".ssh" / "id").write_text("topsecret\n")
    # pytest liegt oft in der User-Site (~/.local): ueber einen Link erreichbar halten.
    real_local = Path.home() / ".local"
    if real_local.exists():
        (home / ".local").symlink_to(real_local)
    outside = tmp_path / "outside"
    outside.mkdir()
    monkeypatch.setenv("HOME", str(home))
    (dw.wt / "test_escape.py").write_text(
        "import pathlib\n\ndef test_escape():\n"
        f"    assert not pathlib.Path('{home}/.ssh/id').exists()\n"
        "    assert not pathlib.Path('/run/docker.sock').exists()\n"
        "    try:\n"
        f"        pathlib.Path('{outside}/leak').write_text('x')\n"
        "    except OSError:\n"
        "        pass\n")
    dw.run([
        _step(_call("run_command", argv=["python3", "-m", "pytest", "-q", "-p", "no:cacheprovider", "test_escape.py"])),
        _step(_call("finish", status="success", summary="gruen", changed_files=[])),
    ])
    out = dw.tool_results()[0]
    assert "1 passed" in out, out
    assert not (outside / "leak").exists()


def test_run_command_refuses_to_run_without_a_working_sandbox(dw, monkeypatch, tmp_path):
    fakebin = tmp_path / "fakebin"
    fakebin.mkdir()
    (fakebin / "bwrap").write_text("#!/bin/sh\nexit 1\n")
    (fakebin / "bwrap").chmod(0o755)
    import os
    monkeypatch.setenv("PATH", f"{fakebin}:{os.environ['PATH']}")
    monkeypatch.delenv("AGENT_SANDBOX", raising=False)
    marker = tmp_path / "ran"
    (dw.wt / "test_marker.py").write_text(
        f"import pathlib\n\ndef test_marker():\n    pathlib.Path('{marker}').write_text('x')\n")
    dw.run([
        _step(_call("run_command", argv=["python3", "-m", "pytest", "-q", "-p", "no:cacheprovider", "test_marker.py"])),
        _step(_call("finish", status="failure", summary="keine Sandbox", changed_files=[])),
    ])
    out = dw.tool_results()[0]
    assert "bwrap" in out, out
    assert not marker.exists()

def test_three_replies_without_a_tool_call_in_a_row_are_a_protocol_error(dw):
    r = dw.run([{"content": "ich denke nach"}, {"content": "noch mehr"}, {"content": "und mehr"}])
    assert r["ok"] is False
    assert "protocol error" in r["summary"]
    assert "PLAN-RUNNER-RESULT: failure" in r["tail"]


def test_turn_limit_ends_the_run_as_failure(dw):
    r = dw.run([_step(_call("read_file", path="x"))] * 5, maxTurns=3)
    assert r["ok"] is False
    assert "turn" in r["summary"]
    assert len(dw.log.read_text().splitlines()) == 3


def test_context_budget_exhaustion_ends_the_run(dw):
    r = dw.run([_step(_call("read_file", path="x"), usage={"prompt_tokens": 28500}),
                _step(_call("finish", status="success", summary="zu spaet", changed_files=[]))])
    assert r["ok"] is False
    assert r["summary"] == "context budget exhausted"


def test_failure_status_from_finish_is_reported_as_not_ok(dw):
    r = dw.run([_step(_call("finish", status="failure", summary="geht nicht", changed_files=[]))])
    assert r["ok"] is False
    assert r["summary"] == "geht nicht"
    assert "PLAN-RUNNER-RESULT: failure geht nicht" in r["tail"]


def test_unreachable_endpoint_is_a_failure_not_a_crash(dw):
    r = dw.run([], url="http://127.0.0.1:9")
    assert r["ok"] is False
    assert r["code"] != 0

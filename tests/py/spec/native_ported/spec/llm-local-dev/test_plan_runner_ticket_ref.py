"""Native migration of tests/spec/llm-local-dev/plan-runner-ticket-ref.bats."""

import json
import socket
import subprocess
import time
import urllib.error
import urllib.request

import pytest


def _free_port() -> int:
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return port


PLAN_REF_JSON = (
    '{"external_id":"T901015","plan_ref":"FACTORY-PLAN-REF branch=feat/x plan=plans/demo/tasks.md"}'
)


@pytest.fixture
def env_ctx(repo_root, tmp_path, monkeypatch):
    fix = repo_root / "tests" / "spec" / "llm-local-dev" / "fixtures"
    t = tmp_path
    monkeypatch.delenv("PLAN_RUNNER_TICKET_JSON", raising=False)
    monkeypatch.setenv("PLAN_RUNNER_OPENCODE", str(fix / "plan-runner-fake-opencode.sh"))
    monkeypatch.setenv("FAKE_OPENCODE_LOG", str(t / "opencode.log"))
    monkeypatch.setenv("FAKE_SLEEP_4B", "0")
    monkeypatch.setenv("FAKE_SLEEP_SELF", "0")
    (t / "opencode.log").write_text("")
    (t / "requests.log").write_text("")

    r = t / "repo"
    wt = t / "wt"
    git = ["git", "-C", str(r)]
    r.mkdir()
    subprocess.run(["git", "init", "-q", str(r)], check=True)
    subprocess.run(git + ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "--allow-empty", "-m", "init"], check=True)
    subprocess.run(git + ["worktree", "add", "-q", str(wt), "-b", "feat/x"], check=True)
    (wt / "plans" / "demo" / "tasks.d").mkdir(parents=True)
    (wt / "plans" / "demo" / "tasks.d" / "p1-work.md").write_text("# p1\n\n## Task: write src/p1.txt\n")
    (wt / "plans" / "demo" / "tasks.md").write_text(
        "# Plan\n\n## Partials\n\n"
        "| id | plan | role | target_files | depends_on |\n"
        "|----|------|------|--------------|------------|\n"
        "| p1 | tasks.d/p1-work.md | impl | src/p1.txt | |\n"
        "\n## Verify\n"
    )
    monkeypatch.setenv("PLAN_REF_JSON", PLAN_REF_JSON)

    state = {"proc": None}

    def start_orch(script_json):
        (t / "script.json").write_text(script_json)
        port = _free_port()
        out = open(t / "orch.out", "w")
        state["proc"] = subprocess.Popen(
            ["node", str(fix / "plan-runner-fake-orch.mjs"), str(port), str(t / "script.json"), str(t / "requests.log")],
            stdout=out,
            stderr=subprocess.STDOUT,
        )
        url = f"http://127.0.0.1:{port}"
        monkeypatch.setenv("PLAN_RUNNER_ORCH_URL", url)
        for _ in range(50):
            try:
                with urllib.request.urlopen(f"{url}/health", timeout=2) as resp:
                    if resp.status == 200:
                        return
            except (urllib.error.URLError, OSError):
                pass
            time.sleep(0.1)
        raise RuntimeError("fake orchestrator did not start")

    yield {"t": t, "r": r, "wt": wt, "monkeypatch": monkeypatch, "start_orch": start_orch,
           "runner": repo_root / "scripts" / "llm" / "plan-runner.mjs"}

    proc = state["proc"]
    if proc is not None:
        proc.kill()
        proc.wait()


def test_ref_aufloesbar_ticket_flag_derives_changedir_from_worktree(env_ctx, run_cmd):
    env_ctx["monkeypatch"].setenv("PLAN_RUNNER_TICKET_JSON", PLAN_REF_JSON)
    env_ctx["start_orch"](json.dumps([
        {"name": "dispatch_4b", "args": {"partial_id": "p1", "prompt": "go"}},
        {"name": "wait_event", "args": {}},
        {"name": "mark", "args": {"partial_id": "p1", "status": "done", "note": "ok"}},
        {"name": "finish", "args": {"summary": "all done"}},
    ]))
    res = run_cmd(
        ["timeout", "60", "node", str(env_ctx["runner"]), "--ticket", "T901015", "--4b-slots", "2"],
        cwd=env_ctx["r"], timeout=90,
    )
    assert res.returncode == 0, res.output
    state = json.loads((env_ctx["wt"] / "plans" / "demo" / ".plan-runner" / "state.json").read_text())
    assert state["partials"]["p1"]["status"] == "done"


def test_ref_fehlend_fail_closed_exit_2(env_ctx, run_cmd):
    env_ctx["monkeypatch"].setenv("PLAN_RUNNER_TICKET_JSON", '{"external_id":"T901015","plan_ref":null}')
    res = run_cmd(["timeout", "60", "node", str(env_ctx["runner"]), "--ticket", "T901015"],
                  cwd=env_ctx["r"], timeout=90)
    assert res.returncode == 2
    assert "no FACTORY-PLAN-REF" in res.output


def test_worktree_fehlend_fail_closed_exit_2(env_ctx, run_cmd):
    env_ctx["monkeypatch"].setenv(
        "PLAN_RUNNER_TICKET_JSON",
        '{"external_id":"T901015","plan_ref":"FACTORY-PLAN-REF branch=feat/nonexistent plan=plans/demo/tasks.md"}',
    )
    res = run_cmd(["timeout", "60", "node", str(env_ctx["runner"]), "--ticket", "T901015"],
                  cwd=env_ctx["r"], timeout=90)
    assert res.returncode == 2
    assert "not checked out in any worktree" in res.output


def test_ohne_flag_disk_verhalten_unveraendert_kein_ticket_lookup(env_ctx, run_cmd):
    empty = env_ctx["t"] / "empty"
    empty.mkdir()
    res = run_cmd(["timeout", "60", "node", str(env_ctx["runner"]), str(empty), "--worktree", str(empty)],
                  cwd=env_ctx["r"], timeout=90)
    assert res.returncode == 2
    assert "no tasks.md" in res.output

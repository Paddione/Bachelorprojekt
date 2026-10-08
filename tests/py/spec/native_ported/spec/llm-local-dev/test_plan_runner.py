"""Native migration of tests/spec/llm-local-dev/plan-runner.bats."""

import json
import socket
import subprocess
import time
import urllib.error
import urllib.request
from pathlib import Path

import pytest


def _free_port() -> int:
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return port


def _nlines(path: Path) -> int:
    return path.read_text().count("\n")


def _line(path: Path, n: int) -> str:
    return path.read_text().splitlines()[n - 1]


def _count_lines(text: str, needle: str) -> int:
    return sum(1 for line in text.splitlines() if needle in line)


class Runner:
    def __init__(self, repo, tmp, monkeypatch):
        self.repo = repo
        self.t = tmp
        self.fix = repo / "tests" / "spec" / "llm-local-dev" / "fixtures"
        self.ch = tmp / "change"
        self.wt = tmp / "worktree"
        self.monkeypatch = monkeypatch
        self.proc = None
        (self.ch / "tasks.d").mkdir(parents=True)
        self.wt.mkdir()
        monkeypatch.setenv("PLAN_RUNNER_OPENCODE", str(self.fix / "plan-runner-fake-opencode.sh"))
        monkeypatch.setenv("FAKE_OPENCODE_LOG", str(tmp / "opencode.log"))
        monkeypatch.setenv("FAKE_SLEEP_4B", "0")
        monkeypatch.setenv("FAKE_SLEEP_SELF", "0")
        (tmp / "opencode.log").write_text("")
        (tmp / "requests.log").write_text("")

    @property
    def opencode_log(self):
        return self.t / "opencode.log"

    @property
    def requests_log(self):
        return self.t / "requests.log"

    def make_change(self, *specs):
        lines = ["# Plan", "", "## Partials", "",
                 "| id | plan | role | target_files | depends_on |",
                 "|----|------|------|--------------|------------|"]
        for spec in specs:
            pid, _, deps = spec.partition(":")
            lines.append(f"| {pid} | tasks.d/{pid}-work.md | impl | src/{pid}.txt | {deps} |")
            (self.ch / "tasks.d" / f"{pid}-work.md").write_text(f"# {pid}\n\n## Task: write src/{pid}.txt\n")
        lines += ["", "## Verify"]
        (self.ch / "tasks.md").write_text("\n".join(lines) + "\n")

    def start_orch(self, script):
        (self.t / "script.json").write_text(script)
        port = _free_port()
        out = open(self.t / "orch.out", "w")
        self.proc = subprocess.Popen(
            ["node", str(self.fix / "plan-runner-fake-orch.mjs"), str(port),
             str(self.t / "script.json"), str(self.requests_log)],
            stdout=out, stderr=subprocess.STDOUT,
        )
        url = f"http://127.0.0.1:{port}"
        self.monkeypatch.setenv("PLAN_RUNNER_ORCH_URL", url)
        for _ in range(50):
            try:
                with urllib.request.urlopen(f"{url}/health", timeout=2) as resp:
                    if resp.status == 200:
                        return
            except (urllib.error.URLError, OSError):
                pass
            time.sleep(0.1)
        raise RuntimeError("fake orchestrator did not start")

    def run_runner(self, run_cmd, *extra):
        return run_cmd(
            ["timeout", "60", "node", str(self.repo / "scripts" / "llm" / "plan-runner.mjs"),
             str(self.ch), "--worktree", str(self.wt), *extra],
            timeout=90,
        )

    def state_of(self, pid):
        state = json.loads((self.ch / ".plan-runner" / "state.json").read_text())
        return state["partials"][pid]["status"]

    def close(self):
        if self.proc is not None:
            self.proc.kill()
            self.proc.wait()


@pytest.fixture
def pr(repo_root, tmp_path, monkeypatch):
    runner = Runner(repo_root, tmp_path, monkeypatch)
    yield runner
    runner.close()


def test_partials_run_in_dependency_order(pr, run_cmd):
    pr.make_change("p1:", "p2:p1")
    pr.start_orch(json.dumps([
        {"name": "dispatch_4b", "args": {"partial_id": "p2", "prompt": "too early"}},
        {"name": "dispatch_4b", "args": {"partial_id": "p1", "prompt": "go"}},
        {"name": "wait_event", "args": {}},
        {"name": "mark", "args": {"partial_id": "p1", "status": "done", "note": "ok"}},
        {"name": "dispatch_4b", "args": {"partial_id": "p2", "prompt": "go"}},
        {"name": "wait_event", "args": {}},
        {"name": "mark", "args": {"partial_id": "p2", "status": "done", "note": "ok"}},
        {"name": "finish", "args": {"summary": "all done"}},
    ]))
    res = pr.run_runner(run_cmd, "--4b-slots", "2")
    assert res.returncode == 0, res.output
    # Positiv-Anker: beide Partials liefen genau einmal.
    assert _nlines(pr.opencode_log) == 2
    assert _line(pr.opencode_log, 1) == "plan-worker-qwen35 p1"
    assert _line(pr.opencode_log, 2) == "plan-worker-qwen35 p2"
    # Der verfruehte dispatch_4b p2 wurde abgelehnt, nicht gestartet.
    content = json.loads(_line(pr.requests_log, 2))["messages"][-1]["content"]
    assert _count_lines(content, "not ready") == 1
    assert pr.state_of("p1") == "done"
    assert pr.state_of("p2") == "done"


def test_worker_inherits_the_worktree_as_pwd_out_of_repo_worktrees(pr, run_cmd, monkeypatch):
    # `opencode run` nimmt das Projekt-Root aus PWD: ohne PWD=worktree im
    # Spawn-Env schreibt ein Worktree ausserhalb des Repos ins aufrufende Repo.
    pr.make_change("p1:")
    pwd_log = pr.t / "opencode.pwd.log"
    pwd_log.write_text("")
    monkeypatch.setenv("FAKE_OPENCODE_PWD", str(pwd_log))
    pr.start_orch(json.dumps([
        {"name": "dispatch_4b", "args": {"partial_id": "p1", "prompt": "go"}},
        {"name": "wait_event", "args": {}},
        {"name": "mark", "args": {"partial_id": "p1", "status": "done", "note": "ok"}},
        {"name": "finish", "args": {"summary": "done"}},
    ]))
    res = pr.run_runner(run_cmd, "--4b-slots", "1")
    assert res.returncode == 0, res.output
    assert pwd_log.read_text().rstrip("\n") == str(pr.wt)


def test_progress_survives_a_restart(pr, run_cmd):
    pr.make_change("p1:", "p2:p1")
    (pr.ch / ".plan-runner").mkdir()
    (pr.ch / ".plan-runner" / "state.json").write_text(
        '{"slug":"change","partials":{\n'
        ' "p1":{"status":"done","owner":"4b","attempts":0,"result":"earlier run"},\n'
        ' "p2":{"status":"running","owner":"4b","attempts":0,"result":null}},\n'
        ' "orchestrator":{"notes":"","frozen_at":null}}\n'
    )
    pr.start_orch(json.dumps([
        {"name": "dispatch_4b", "args": {"partial_id": "p1", "prompt": "again"}},
        {"name": "dispatch_4b", "args": {"partial_id": "p2", "prompt": "go"}},
        {"name": "wait_event", "args": {}},
        {"name": "mark", "args": {"partial_id": "p2", "status": "done", "note": "ok"}},
        {"name": "finish", "args": {"summary": "resumed"}},
    ]))
    res = pr.run_runner(run_cmd, "--4b-slots", "1")
    assert res.returncode == 0, res.output
    # Positiv-Anker: p2 lief nach dem Neustart.
    assert _nlines(pr.opencode_log) > 0
    assert pr.opencode_log.read_text().rstrip("\n") == "plan-worker-qwen35 p2"
    # Der erste Request zeigt p2 bereits zurueckgesetzt auf open.
    first = json.loads(_line(pr.requests_log, 1))["messages"][1]["content"]
    assert _count_lines(first, '"p2":{"status":"open"') == 1
    assert pr.state_of("p1") == "done"
    assert pr.state_of("p2") == "done"
    state = json.loads((pr.ch / ".plan-runner" / "state.json").read_text())
    assert state["partials"]["p1"]["result"] == "earlier run"


def test_self_execution_is_refused_while_a_worker_slot_is_free(pr, run_cmd):
    pr.make_change("p1:")
    pr.start_orch(json.dumps([
        {"name": "execute_self", "args": {"partial_id": "p1", "prompt": "do it", "plan_notes": "n"}},
        {"name": "dispatch_4b", "args": {"partial_id": "p1", "prompt": "go"}},
        {"name": "wait_event", "args": {}},
        {"name": "mark", "args": {"partial_id": "p1", "status": "done", "note": "ok"}},
        {"name": "finish", "args": {"summary": "done"}},
    ]))
    res = pr.run_runner(run_cmd, "--4b-slots", "1")
    assert res.returncode == 0, res.output
    # Positiv-Anker: der 4B-Lauf fand statt.
    assert _nlines(pr.opencode_log) > 0
    assert pr.opencode_log.read_text().rstrip("\n") == "plan-worker-qwen35 p1"
    # Die Anfrage nach execute_self enthaelt die Ablehnung.
    content = json.loads(_line(pr.requests_log, 2))["messages"][-1]["content"]
    assert _count_lines(content, "use dispatch_4b") == 1
    assert not any(l.startswith("plan-worker-self") for l in pr.opencode_log.read_text().splitlines())


def test_zero_4b_slots_run_every_partial_as_self_execution(pr, run_cmd):
    pr.make_change("p1:")
    pr.start_orch(json.dumps([
        {"name": "execute_self", "args": {"partial_id": "p1", "prompt": "do it", "plan_notes": "self-only run"}},
        {"name": "mark", "args": {"partial_id": "p1", "status": "done", "note": "ok"}},
        {"name": "finish", "args": {"summary": "done"}},
    ]))
    res = pr.run_runner(run_cmd, "--4b-slots", "0")
    assert res.returncode == 0, res.output
    # Positiv-Anker: genau ein Selbstaufruf, kein 4B-Lauf.
    assert _nlines(pr.opencode_log) > 0
    assert pr.opencode_log.read_text().rstrip("\n") == "plan-worker-self p1"


def test_an_echoed_result_template_is_not_counted_as_success(repo_root, run_cmd):
    script = (
        "import { parseResult } from '" + str(repo_root / "scripts/llm/plan-runner/plan.mjs") + "';\n"
        "const echoed = 'print as your very last line exactly one of:\\nPLAN-RUNNER-RESULT: success <one-line summary>\\nPLAN-RUNNER-RESULT: failure <one-line reason>';\n"
        "const quoted = 'I will end with \\u0060PLAN-RUNNER-RESULT: success <one-line summary>\\u0060 or \\u0060PLAN-RUNNER-RESULT: failure <one-line reason>\\u0060.';\n"
        "const real = 'done\\nPLAN-RUNNER-RESULT: success measured 3 configs';\n"
        "console.log(JSON.stringify([parseResult(echoed).ok, parseResult(quoted).ok, parseResult(real)]));\n"
    )
    res = run_cmd(["node", "--input-type=module", "-e", script])
    assert res.returncode == 0, res.output
    assert res.output == '[false,false,{"ok":true,"summary":"measured 3 configs"}]'


def test_worker_agents_are_primary_agents_on_the_right_backends(repo_root, run_cmd):
    # opencode run faellt fuer mode=subagent still auf den Default-Agenten zurueck
    # ("is a subagent, not a primary agent. Falling back to default agent"): dann laeuft
    # jeder 4B-Dispatch auf dem Orchestrator-Modell (:1919). Beobachtet im ersten Live-Lauf.
    script = (
        "import { readFileSync } from 'node:fs';\n"
        "import { AGENT_4B, AGENT_SELF } from '" + str(repo_root / "scripts/llm/plan-runner/workers.mjs") + "';\n"
        "const s = readFileSync('" + str(repo_root / ".opencode/agent-models.jsonc") + "', 'utf8');\n"
        "const o = JSON.parse(s.replace(/^\\s*\\/\\/.*$/gm, '').replace(/\\/\\*[\\s\\S]*?\\*\\//g, ''));\n"
        "const want = { [AGENT_4B]: 'llamacpp-qwen3/', [AGENT_SELF]: 'llamacpp-local/' };\n"
        "for (const [name, prefix] of Object.entries(want)) {\n"
        "  const a = (o.agent || {})[name];\n"
        "  if (!a) { console.log('missing ' + name); process.exit(1); }\n"
        "  if (a.mode !== 'primary') { console.log(name + ' mode ' + a.mode); process.exit(1); }\n"
        "  if (!String(a.model).startsWith(prefix)) { console.log(name + ' model ' + a.model); process.exit(1); }\n"
        "}\n"
        "console.log('ok ' + AGENT_4B + ' ' + AGENT_SELF);\n"
    )
    res = run_cmd(["node", "--input-type=module", "-e", script])
    assert res.returncode == 0, res.output
    assert res.output.startswith("ok ")


def test_workers_keep_running_while_the_orchestrator_sleeps(pr, run_cmd, monkeypatch):
    pr.make_change("p1:", "p2:", "p3:")
    monkeypatch.setenv("FAKE_SLEEP_4B", "1")
    monkeypatch.setenv("FAKE_SLEEP_SELF", "3")
    pr.start_orch(json.dumps([
        {"name": "dispatch_4b", "args": {"partial_id": "p1", "prompt": "go"}},
        {"name": "execute_self", "args": {"partial_id": "p2", "prompt": "do it yourself", "plan_notes": "p1 on 4b, p2 self"}},
        {"name": "mark", "args": {"partial_id": "p1", "status": "done", "note": "ok"}},
        {"name": "mark", "args": {"partial_id": "p2", "status": "done", "note": "ok"}},
        {"name": "mark", "args": {"partial_id": "p3", "status": "done", "note": "ok"}},
        {"name": "finish", "args": {"summary": "done"}},
    ]))
    res = pr.run_runner(run_cmd, "--4b-slots", "1")
    assert res.returncode == 0, res.output
    log_lines = pr.opencode_log.read_text().splitlines()
    # Positiv-Anker: alle drei Laeufe fanden statt.
    assert len(log_lines) == 3
    # p3 wurde waehrend des Selbstaufrufs vergeben und endete vor ihm.
    p3 = [i for i, l in enumerate(log_lines, 1) if l == "plan-worker-qwen35 p3"]
    self_ = [i for i, l in enumerate(log_lines, 1) if l == "plan-worker-self p2"]
    assert p3 and self_
    assert p3[0] < self_[0]
    # Das execute_self-Ergebnis meldet die Laeufe aus der Schlafphase.
    res_text = json.loads(_line(pr.requests_log, 3))["messages"][-1]["content"]
    assert sum(1 for l in res_text.splitlines() if l.startswith("success")) == 1
    assert "p3" in res_text
    state = json.loads((pr.ch / ".plan-runner" / "state.json").read_text())
    assert state["orchestrator"]["notes"] == "p1 on 4b, p2 self"
    assert pr.state_of("p3") == "done"


def test_t900729_worker_starten_ohne_dir_und_mit_dem_modell_ihres_agenten(pr, run_cmd, monkeypatch):
    pr.make_change("p1:")
    args_log = pr.t / "args.log"
    monkeypatch.setenv("FAKE_OPENCODE_ARGS", str(args_log))
    pr.start_orch(json.dumps([
        {"name": "dispatch_4b", "args": {"partial_id": "p1", "prompt": "go"}},
        {"name": "wait_event", "args": {}},
        {"name": "mark", "args": {"partial_id": "p1", "status": "done", "note": "ok"}},
        {"name": "finish", "args": {"summary": "done"}},
    ]))
    pr.run_runner(run_cmd)
    assert pr.state_of("p1") == "done"
    output = args_log.read_text()
    assert "--dir" not in output
    assert "run --agent plan-worker-qwen35 --model llamacpp-qwen3/" in output


def test_t901014_p1_dispatch_policy_separates_worker_track_from_self_track(repo_root, run_cmd):
    # Worker-Track-Trennung: genau eine Policy-Funktion entscheidet Self vs.
    # 4B-Slots; Pool-Verwaltung bleibt davon unberuehrt ( Faithful gegen
    # plan-runner-fake-opencode.sh: PWD=worktree-Vererbung erhalten).
    script = (
        "import { decideTrack, buildAgentSpawn } from '" + str(repo_root / "scripts/llm/plan-runner/workers.mjs") + "';\n"
        "const eq = (got, want) => { if (got !== want) throw new Error(got + ' !== ' + want); };\n"
        "eq(decideTrack({ ready: ['p1'], freeSlots: 2 }), 'worker');\n"
        "eq(decideTrack({ ready: ['p1'], freeSlots: 0 }), 'self');\n"
        "eq(decideTrack({ ready: [], freeSlots: 2 }), 'idle');\n"
        "eq(decideTrack({ ready: [], freeSlots: 0 }), 'idle');\n"
        "const sp = buildAgentSpawn({ agent: 'plan-worker-qwen35', prompt: 'x', worktree: '/tmp/wt' });\n"
        "if (sp.env.PWD !== '/tmp/wt') throw new Error('PWD not inherited');\n"
        "console.log('track-ok');\n"
    )
    res = run_cmd(["node", "--input-type=module", "-e", script])
    assert res.returncode == 0, res.output
    assert res.output == "track-ok"


def test_t901014_p2_worker_prompt_is_machine_format_without_md_rest(repo_root, run_cmd):
    # Maschinen-Format: Record-Zeile mit Pflichtfeldern zuerst, BODY-Block mit
    # Budget-Kuerzung; keine freien Markdown-Reste (Fake-Orch liest weiter
    # fixtures/plan-runner-fake-orch.mjs, Fake-Worker braucht Partial-ID).
    script = (
        "import { buildWorkerPrompt, formatPartialRecord, MAX_PROMPT_BODY_CHARS } from '"
        + str(repo_root / "scripts/llm/plan-runner/plan.mjs") + "';\n"
        "const p = { id: 'p1', role: 'impl', targetFiles: ['src/a.txt'], dependsOn: [], file: 'tasks.d/p1.md' };\n"
        "const out = buildWorkerPrompt({ partial: p, partialText: '# task', worktree: '/tmp/wt', extra: '' });\n"
        "if (!out.startsWith('Partial-ID: p1')) throw new Error('Partial-ID first line lost');\n"
        "if (!out.includes('PID:p1|ROLE:impl|FILES:src/a.txt|DEPS:-')) throw new Error('record line wrong');\n"
        "if (/-----/.test(out)) throw new Error('.md-rest delimiter left');\n"
        "if (!out.includes('END-BODY')) throw new Error('END-BODY missing');\n"
        "const long = buildWorkerPrompt({ partial: p, partialText: 'x'.repeat(MAX_PROMPT_BODY_CHARS + 10), worktree: '/tmp/wt' });\n"
        "if (!long.includes('[TRUNCATED 10 chars]')) throw new Error('budget trim missing');\n"
        "if (formatPartialRecord(p) !== 'PID:p1|ROLE:impl|FILES:src/a.txt|DEPS:-') throw new Error('schema wrong');\n"
        "console.log('format-ok');\n"
    )
    res = run_cmd(["node", "--input-type=module", "-e", script])
    assert res.returncode == 0, res.output
    assert res.output == "format-ok"


def test_t901014_p3_plan_without_machine_readable_manifest_field_fails_validation(repo_root, tmp_path, run_cmd):
    # Validierung ohne .md-Reste: ein Partial mit leerer target_files-Zelle
    # schlaegt fail-closed fehl (Negativfall, kein Warn-Fallback).
    bad = tmp_path / "badplan"
    (bad / "tasks.d").mkdir(parents=True)
    (bad / "tasks.md").write_text(
        "---\n"
        "title: bad\n"
        "ticket_id: T901014\n"
        "domains: [agents]\n"
        "status: draft\n"
        "---\n"
        "\n"
        "# Bad — Implementation Plan\n"
        "\n"
        "## Partials\n"
        "\n"
        "| id | file | role | target_files | depends_on |\n"
        "|----|------|------|--------------|------------|\n"
        "| P1 | tasks.d/p1.md | impl |  |  |\n"
        "| P2 | tasks.d/p2.md | tests | tests/spec/llm-local-dev/ | P1 |\n"
        "\n"
        "## File Structure\n"
        "\n"
        "- `tests/spec/llm-local-dev/`\n"
        "\n"
        "## Verify\n"
        "\n"
        "- task test:changed; task freshness:regenerate; task freshness:check\n"
    )
    (bad / "tasks.d" / "p1.md").write_text("failing-test bats expected-FAIL\n")
    (bad / "tasks.d" / "p2.md").write_text("run bats tests/spec/llm-local-dev/, expected FAIL on old stand\n")
    (bad / "intel.json").write_text('{"meta":{},"impact_files":[],"symbols":[]}\n')
    res = run_cmd(["bash", str(repo_root / "scripts" / "plan-lint.sh"), str(bad / "tasks.md")])
    assert res.returncode != 0
    assert "STRUCT-PARTIAL" in res.output

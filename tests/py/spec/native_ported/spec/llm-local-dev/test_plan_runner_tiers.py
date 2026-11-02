"""plan-runner: Fallback-Kette (Tiers), Harness je Partial, Budget und Ereignisse (walkie-dispatch-flow p6).

Muster wie test_plan_runner.py: geprueft wird die Ausgabe der Kommandos (Exit-Code, stdout/stderr,
state.json, events.jsonl), nicht der Quelltext (T002448-M4). Keine echten Modelle: Fake-Orchestrator,
Fake-OpenAI-Worker (Direkt-Track), opencode- und claude-Stubs ueber PATH.
"""

import json
import os
import socket
import stat
import subprocess
import time
import urllib.error
import urllib.request
from pathlib import Path

import pytest

RUNNER = Path("scripts") / "llm" / "plan-runner.mjs"
MODS = Path("scripts") / "llm" / "plan-runner"

FAKE_CLAUDE = """#!/usr/bin/env bash
# Stub fuer `claude -p --output-format json`: meldet Kosten ueber total_cost_usd.
prompt="${*: -1}"
partial="$(grep -oE 'Partial-ID: [A-Za-z0-9_-]+' <<<"$prompt" | head -1 | cut -d' ' -f2 || true)"
echo "claude ${partial:-unknown} GH_TOKEN=${GH_TOKEN:-unset} ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY:-unset} ARGS=${*:1:$#-1}" >> "${FAKE_CLAUDE_LOG:?}"
printf '{"type":"result","is_error":false,"result":"done\\\\nPLAN-RUNNER-RESULT: success fake claude","total_cost_usd":%s}\\n' "${FAKE_CLAUDE_COST:-0.25}"
"""

FAKE_PI = """#!/usr/bin/env bash
# Stub fuer `pi --mode json -p`: JSON-Events, Settlement ueber agent_end.
prompt="${*: -1}"
partial="$(grep -oE 'Partial-ID: [A-Za-z0-9_-]+' <<<"$prompt" | head -1 | cut -d' ' -f2 || true)"
echo "pi ${partial:-unknown} ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY:-unset} GH_TOKEN=${GH_TOKEN:-unset} ARGS=${*:1:$#-1}" >> "${FAKE_PI_LOG:?}"
echo '{"type":"message_end","message":{"role":"assistant","content":[{"type":"text","text":"PLAN-RUNNER-RESULT: success fake pi"}]}}'
echo '{"type":"agent_end"}'
"""

FAKE_AGY = """#!/usr/bin/env bash
# Stub fuer `agy -p --output-format json`: protokolliert die Argumente (ohne Prompt).
echo "agy ARGS=${*:1:$#-1}" >> "${FAKE_AGY_LOG:?}"
printf '{"type":"result","result":"PLAN-RUNNER-RESULT: success fake agy"}\\n'
"""

FAILING_OPENCODE = """#!/usr/bin/env bash
# opencode-Stub, dessen Lauf scheitert: meldet failure ueber die Ergebniszeile.
echo "opencode $*" | cut -c1-60 >> "${FAKE_OPENCODE_LOG:?}"
echo "PLAN-RUNNER-RESULT: failure self run broke"
"""

FLAKY_OPENCODE = """#!/usr/bin/env bash
# opencode-Stub: der erste Lauf scheitert, jeder weitere gelingt.
echo "opencode $*" | cut -c1-60 >> "${FAKE_OPENCODE_LOG:?}"
if [ ! -e "${FLAKY_STATE:?}" ]; then touch "$FLAKY_STATE"; echo "PLAN-RUNNER-RESULT: failure first run broke"; exit 0; fi
echo "PLAN-RUNNER-RESULT: success second run"
"""

STUB_LOGGING = """#!/usr/bin/env bash
echo "$0 $*" >> "{log}"
exit {code}
"""


def _free_port() -> int:
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return port


def _wait_health(url: str) -> None:
    for _ in range(50):
        try:
            with urllib.request.urlopen(f"{url}/health", timeout=2) as resp:
                if resp.status == 200:
                    return
        except (urllib.error.URLError, OSError):
            pass
        time.sleep(0.1)
    raise RuntimeError(f"{url} did not start")


def _executable(path: Path, text: str) -> Path:
    path.write_text(text)
    path.chmod(path.stat().st_mode | stat.S_IXUSR)
    return path


class Rig:
    def __init__(self, repo, tmp, monkeypatch):
        self.repo = repo
        self.t = tmp
        self.fix = repo / "tests" / "spec" / "llm-local-dev" / "fixtures"
        self.ch = tmp / "change"
        self.wt = tmp / "worktree"
        self.mp = monkeypatch
        self.procs = []
        (self.ch / "tasks.d").mkdir(parents=True)
        self.wt.mkdir()
        bindir = tmp / "bin"
        bindir.mkdir()
        _executable(bindir / "claude", FAKE_CLAUDE)
        _executable(bindir / "pi", FAKE_PI)
        _executable(bindir / "agy", FAKE_AGY)
        self.agy_log = tmp / "agy.log"
        self.agy_log.write_text("")
        monkeypatch.setenv("FAKE_AGY_LOG", str(self.agy_log))
        monkeypatch.delenv("PLAN_RUNNER_AGY_SKIP_PERMISSIONS", raising=False)
        self.pi_log = tmp / "pi.log"
        self.pi_log.write_text("")
        monkeypatch.setenv("FAKE_PI_LOG", str(self.pi_log))
        self.systemctl_log = tmp / "systemctl.log"
        _executable(bindir / "systemctl", STUB_LOGGING.format(log=self.systemctl_log, code=0))
        self.claude_log = tmp / "claude.log"
        self.opencode_log = tmp / "opencode.log"
        self.requests_log = tmp / "requests.log"
        for f in (self.systemctl_log, self.claude_log, self.opencode_log, self.requests_log):
            f.write_text("")
        for name in ("PLAN_RUNNER_TIERS", "PLAN_RUNNER_LEASE_GUARD", "PLAN_RUNNER_CLOUD_HARNESS",
                     "PLAN_RUNNER_CLOUD_BUDGET_USD", "PLAN_RUNNER_TIER2_URL", "PLAN_RUNNER_TIER2_MODEL"):
            monkeypatch.delenv(name, raising=False)
        monkeypatch.setenv("PATH", f"{bindir}{os.pathsep}{os.environ['PATH']}")
        monkeypatch.setenv("PLAN_RUNNER_RECALL", "off")
        monkeypatch.setenv("PLAN_RUNNER_OPENCODE", str(self.fix / "plan-runner-fake-opencode.sh"))
        monkeypatch.setenv("FAKE_OPENCODE_LOG", str(self.opencode_log))
        monkeypatch.setenv("FAKE_CLAUDE_LOG", str(self.claude_log))
        monkeypatch.setenv("FAKE_SLEEP_CLOUD", "0")
        monkeypatch.setenv("FAKE_SLEEP_SELF", "0")
        monkeypatch.setenv("PLAN_RUNNER_DIRECT_URL", "http://127.0.0.1:9")
        monkeypatch.setenv("PLAN_RUNNER_SELF_URL", "http://127.0.0.1:9")
        # Der Runner darf diese Werte nicht an Kindprozesse durchreichen (Env-Scrubbing).
        monkeypatch.setenv("GH_TOKEN", "leaked-gh-token")
        monkeypatch.setenv("ANTHROPIC_API_KEY", "own-anthropic-key")

    def make_change(self, specs):
        """specs: {id: {"deps": "p1,p2", "front": "fallback: [5070ti, cloud]\\n..."}} oder id -> ""."""
        lines = ["# Plan", "", "## Partials", "",
                 "| id | plan | role | target_files | depends_on |",
                 "|----|------|------|--------------|------------|"]
        for pid, spec in specs.items():
            spec = spec or {}
            lines.append(f"| {pid} | tasks.d/{pid}-work.md | impl | src/{pid}.txt | {spec.get('deps', '')} |")
            front = spec.get("front")
            head = f"---\n{front}\n---\n\n" if front else ""
            (self.ch / "tasks.d" / f"{pid}-work.md").write_text(f"{head}# {pid}\n\n## Task: write src/{pid}.txt\n")
        lines += ["", "## Verify"]
        (self.ch / "tasks.md").write_text("\n".join(lines) + "\n")

    def _serve(self, argv, url):
        out = open(self.t / f"{Path(argv[1]).name}.out", "w")
        self.procs.append(subprocess.Popen(["node", *argv], stdout=out, stderr=subprocess.STDOUT))
        _wait_health(url)

    def start_orch(self, script):
        (self.t / "script.json").write_text(json.dumps(script))
        port = _free_port()
        url = f"http://127.0.0.1:{port}"
        self._serve([str(self.fix / "plan-runner-fake-orch.mjs"), str(port),
                     str(self.t / "script.json"), str(self.requests_log)], url)
        self.mp.setenv("PLAN_RUNNER_ORCH_URL", url)

    def start_direct_worker(self, script):
        """Fake-OpenAI-Server fuer den Direkt-Track (vLLM :8123-Ersatz)."""
        (self.t / "worker.json").write_text(json.dumps(script))
        self.worker_log = self.t / "worker.log"
        self.worker_log.write_text("")
        port = _free_port()
        url = f"http://127.0.0.1:{port}"
        self._serve([str(self.fix / "plan-runner-fake-openai-worker.mjs"), str(port),
                     str(self.t / "worker.json"), str(self.worker_log)], url)
        self.mp.setenv("PLAN_RUNNER_DIRECT_URL", url)

    def start_tier2_server(self):
        """Zweiter Fake-Endpunkt (antwortet auf /v1/models): macht den Tier 3060ti verfuegbar."""
        (self.t / "tier2.json").write_text("[]")
        port = _free_port()
        url = f"http://127.0.0.1:{port}"
        self._serve([str(self.fix / "plan-runner-fake-openai-worker.mjs"), str(port),
                     str(self.t / "tier2.json"), str(self.t / "tier2.log")], url)
        self.mp.setenv("PLAN_RUNNER_TIER2_URL", url)
        self.mp.setenv("PLAN_RUNNER_TIER2_MODEL", "qwen-4b")

    def run(self, run_cmd, *extra):
        return run_cmd(
            ["timeout", "60", "node", str(self.repo / RUNNER), str(self.ch), "--worktree", str(self.wt), *extra],
            timeout=90,
        )

    def state(self):
        return json.loads((self.ch / ".plan-runner" / "state.json").read_text())

    def events(self, path=None):
        file = Path(path) if path else self.ch / ".plan-runner" / "events.jsonl"
        return [json.loads(l) for l in file.read_text().splitlines() if l.strip()]

    def close(self):
        for p in self.procs:
            p.kill()
            p.wait()


@pytest.fixture
def rig(repo_root, tmp_path, monkeypatch):
    r = Rig(repo_root, tmp_path, monkeypatch)
    yield r
    r.close()


LOCAL_FAILURE = {"tool_calls": [{"name": "finish", "args": {"status": "failure", "summary": "local model gave up"}}]}
FALLBACK_BOTH = "fallback: [5070ti, cloud]"


# ---------- Schnittstellen der neuen Module ----------

def test_partial_meta_reads_frontmatter_and_defaults_to_auto(repo_root, run_cmd):
    script = (
        f"import {{ partialMeta }} from '{repo_root / MODS / 'plan.mjs'}';\n"
        "const text = '---\\nharness: claude\\ntrack: cloud\\nfallback: [5070ti, cloud]\\nrepo: Paddione/Bachelorprojekt\\nsize: l\\n---\\n# p';\n"
        "console.log(JSON.stringify([partialMeta(text), partialMeta('# no frontmatter'), partialMeta('---\\nsize: s\\n---\\n')]));\n"
    )
    res = run_cmd(["node", "--input-type=module", "-e", script])
    assert res.returncode == 0, res.output
    full = {"harness": "claude", "track": "cloud", "fallback": ["5070ti", "cloud"], "repo": "Paddione/Bachelorprojekt"}
    empty = {"harness": "auto", "track": None, "fallback": None, "repo": None}
    assert json.loads(res.output) == [full, empty, empty]


def test_parse_tiers_default_chain_and_rejects_bad_config(repo_root, run_cmd):
    script = (
        f"import {{ parseTiers }} from '{repo_root / MODS / 'tiers.mjs'}';\n"
        "const ids = (e) => parseTiers(e).map((t) => t.id);\n"
        "const bad = (v) => { try { parseTiers({ PLAN_RUNNER_TIERS: v }); return 'accepted'; } catch (e) { return String(e.message); } };\n"
        "console.log(JSON.stringify([\n"
        "  ids({}),\n"
        "  ids({ PLAN_RUNNER_TIER2_URL: 'http://127.0.0.1:1', PLAN_RUNNER_TIER2_MODEL: 'm' }),\n"
        "  parseTiers({ PLAN_RUNNER_CLOUD_HARNESS: 'agy' }).find((t) => t.kind === 'cloud').harness,\n"
        "  bad('{nope'), bad('[]'), bad('[{\"id\":\"x\",\"kind\":\"bogus\"}]'),\n"
        "  bad('[{\"id\":\"a\",\"kind\":\"cloud\"},{\"id\":\"a\",\"kind\":\"cloud\"}]'),\n"
        "]));\n"
    )
    res = run_cmd(["node", "--input-type=module", "-e", script])
    assert res.returncode == 0, res.output
    ids, with_tier2, cloud_harness, *errors = json.loads(res.output)
    assert ids == ["5070ti", "cloud"]
    assert with_tier2 == ["5070ti", "3060ti", "cloud"]
    assert cloud_harness == "agy"
    assert len(errors) == 4
    assert all(e.startswith("PLAN_RUNNER_TIERS") for e in errors), errors


def test_next_tier_follows_the_fallback_order_tries_each_tier_once_and_pauses(repo_root, run_cmd):
    script = (
        f"import {{ parseTiers, nextTier }} from '{repo_root / MODS / 'tiers.mjs'}';\n"
        "const tiers = parseTiers({});\n"
        "const r = (p, h, l, skip) => { const x = nextTier(p, h, tiers, l, skip); return x.tier ? x.tier.id : 'pause:' + x.pause; };\n"
        "const ok = { budgetUsd: 5, spentUsd: 0 };\n"
        "const out = [\n"
        "  r({ fallback: ['5070ti', 'cloud'] }, [], ok),\n"
        "  r({ fallback: ['5070ti', 'cloud'] }, [{ tier: '5070ti' }], ok),\n"
        "  r({ fallback: ['5070ti', 'cloud'] }, [{ tier: '5070ti' }, { tier: 'cloud' }], ok),\n"
        "  r({ fallback: ['cloud', '5070ti'] }, [], ok),\n"
        "  r({ fallback: null }, [{ tier: '5070ti' }], ok),\n"
        "  r({ fallback: ['5070ti', 'cloud'] }, [{ tier: '5070ti' }], { budgetUsd: 5, spentUsd: 5 }),\n"
        "  r({ fallback: ['cloud', '5070ti'] }, [], { budgetUsd: 0, spentUsd: 0 }),\n"
        "  r({ fallback: ['5070ti', 'cloud'] }, [], ok, new Set(['5070ti'])),\n"
        "  r({ fallback: ['5070ti'] }, [], ok, new Set(['5070ti'])),\n"
        "];\n"
        "console.log(JSON.stringify(out));\n"
    )
    res = run_cmd(["node", "--input-type=module", "-e", script])
    assert res.returncode == 0, res.output
    assert json.loads(res.output) == [
        "5070ti",           # erster Tier der Kette
        "cloud",            # 5070ti schon versucht
        "pause:owner",      # alles versucht
        "cloud",            # Reihenfolge des fallback-Frontmatters gilt
        "cloud",            # ohne fallback: alle Tiers der Reihe nach
        "pause:budget",     # Budget aufgebraucht vor cloud
        "5070ti",           # lokaler Tier laeuft trotz leerem Budget weiter
        "cloud",            # nicht verfuegbarer Tier wird uebersprungen
        "pause:owner",      # nur der nicht verfuegbare Tier in der Kette
    ]


def test_book_cost_separates_flat_rate_from_billed_calls(repo_root, run_cmd):
    script = (
        f"import {{ bookCost }} from '{repo_root / MODS / 'tiers.mjs'}';\n"
        "const l = { budgetUsd: 5, spentUsd: 0, flatRateCalls: 0, calls: [] };\n"
        "bookCost(l, { partial: 'p1', harness: 'claude', costUsd: 0.25, flatRate: false });\n"
        "bookCost(l, { partial: 'p1', harness: 'muse', costUsd: null, flatRate: true });\n"
        "bookCost(l, { partial: 'p2', harness: 'pi', costUsd: null, flatRate: false });\n"
        "bookCost(l, { partial: 'p2', harness: 'claude', costUsd: 0.5, flatRate: false });\n"
        "console.log(JSON.stringify({ spent: l.spentUsd, flat: l.flatRateCalls, calls: l.calls.map((c) => c.harness + ':' + c.costUsd) }));\n"
    )
    res = run_cmd(["node", "--input-type=module", "-e", script])
    assert res.returncode == 0, res.output
    assert json.loads(res.output) == {
        "spent": 0.75, "flat": 1, "calls": ["claude:0.25", "muse:0", "pi:0", "claude:0.5"],
    }


def test_harness_spawn_builds_argv_and_scrubs_foreign_secrets(repo_root, run_cmd):
    script = (
        f"import {{ harnessSpawn }} from '{repo_root / MODS / 'harness.mjs'}';\n"
        "const env = { PATH: '/bin', GH_TOKEN: 'g', GITHUB_TOKEN: 'g', GH_ENTERPRISE_TOKEN: 'g', ANTHROPIC_API_KEY: 'a', GEMINI_API_KEY: 'm' };\n"
        "const keys = (s) => Object.keys(s.env).filter((k) => /TOKEN|API_KEY/.test(k)).sort();\n"
        "const wt = '/tmp/wt';\n"
        "const claude = harnessSpawn({ harness: 'claude', prompt: 'P', worktree: wt, env });\n"
        "const pi = harnessSpawn({ harness: 'pi', prompt: 'P', worktree: wt, env, tier: { id: '3060ti', model: 'qwen-4b' } });\n"
        "const agy = harnessSpawn({ harness: 'agy', prompt: 'P', worktree: wt, env });\n"
        "const muse = harnessSpawn({ harness: 'muse', prompt: 'P', worktree: wt, env: { ...env, PLAN_RUNNER_OPENCODE: '/x/oc' } });\n"
        "const sonnet = harnessSpawn({ harness: 'claude', prompt: 'P', worktree: wt, env: { ...env, PLAN_RUNNER_CLAUDE_MODEL: 'opus' } });\n"
        "console.log(JSON.stringify({\n"
        "  claude: [claude.bin, claude.args, keys(claude), claude.env.PWD],\n"
        "  pi: [pi.bin, pi.args, keys(pi)],\n"
        "  agy: [agy.bin, agy.args.slice(0, 4), keys(agy)],\n"
        "  muse: [muse.bin, muse.args.slice(0, 3), keys(muse)],\n"
        "  model: sonnet.args.slice(3, 5),\n"
        "}));\n"
    )
    res = run_cmd(["node", "--input-type=module", "-e", script])
    assert res.returncode == 0, res.output
    out = json.loads(res.output)
    # claude behaelt den eigenen Key, GitHub-Tokens fehlen (wie devflow_runner/claude.py).
    assert out["claude"] == ["claude", ["-p", "--output-format", "json", "--model", "sonnet", "P"], ["ANTHROPIC_API_KEY"], "/tmp/wt"]
    # pi verliert auch fremde API-Keys; Provider zeigt auf den Tier, Settlement ueber JSON-Events.
    assert out["pi"] == ["pi", ["--mode", "json", "-p", "--no-session", "--provider", "3060ti", "--model", "qwen-4b", "P"], []]
    assert out["agy"][0] == "agy"
    # Host-Lauf ohne Sandbox: kein --dangerously-skip-permissions ohne ausdrueckliches Opt-in.
    assert out["agy"][1] == ["-p", "--output-format", "json", "P"]
    assert out["agy"][2] == ["GEMINI_API_KEY"]
    assert out["muse"] == ["/x/oc", ["run", "--agent", "plan-worker-muse"], []]
    assert out["model"] == ["--model", "opus"]


def test_parse_outcome_reads_cost_settlement_and_flat_rate(repo_root, run_cmd):
    script = (
        f"import {{ parseOutcome }} from '{repo_root / MODS / 'harness.mjs'}';\n"
        "const claudeOk = JSON.stringify({ type: 'result', is_error: false, result: 'x\\nPLAN-RUNNER-RESULT: success all green', total_cost_usd: 0.25 });\n"
        "const claudeErr = JSON.stringify({ type: 'result', is_error: true, result: 'PLAN-RUNNER-RESULT: success nope', total_cost_usd: 0.1 });\n"
        "const claudeNoLine = JSON.stringify({ type: 'result', is_error: false, result: 'no marker', total_cost_usd: 0.05 });\n"
        "const piMsg = (t) => JSON.stringify({ type: 'message_end', message: { role: 'assistant', content: [{ type: 'text', text: t }] } });\n"
        "const piOk = piMsg('PLAN-RUNNER-RESULT: success pi done') + '\\n' + JSON.stringify({ type: 'agent_end' });\n"
        "const piOpen = piMsg('PLAN-RUNNER-RESULT: success pi done');\n"
        "const piAborted = piMsg('PLAN-RUNNER-RESULT: success x') + '\\n' + JSON.stringify({ type: 'agent_settled', aborted: true });\n"
        "const text = 'working\\nPLAN-RUNNER-RESULT: success oc done';\n"
        "console.log(JSON.stringify([\n"
        "  parseOutcome('claude', claudeOk), parseOutcome('claude', claudeErr), parseOutcome('claude', claudeNoLine), parseOutcome('claude', 'garbage'),\n"
        "  parseOutcome('pi', piOk), parseOutcome('pi', piOpen), parseOutcome('pi', piAborted),\n"
        "  parseOutcome('muse', text), parseOutcome('opencode', text),\n"
        "]));\n"
    )
    res = run_cmd(["node", "--input-type=module", "-e", script])
    assert res.returncode == 0, res.output
    got = json.loads(res.output)
    assert got[0] == {"ok": True, "summary": "all green", "costUsd": 0.25, "flatRate": False}
    assert got[1]["ok"] is False and got[1]["costUsd"] == 0.1
    assert got[2]["ok"] is False and got[2]["costUsd"] == 0.05 and got[2]["summary"] == "no result line"
    assert got[3]["ok"] is False and got[3]["costUsd"] is None
    assert got[4] == {"ok": True, "summary": "pi done", "costUsd": None, "flatRate": False}
    assert got[5]["ok"] is False and got[5]["summary"] == "no-settle"
    assert got[6]["ok"] is False and got[6]["summary"] == "aborted"
    assert got[7] == {"ok": True, "summary": "oc done", "costUsd": None, "flatRate": True}
    assert got[8] == {"ok": True, "summary": "oc done", "costUsd": None, "flatRate": False}


def test_emitter_appends_one_json_line_per_event(repo_root, tmp_path, run_cmd):
    target = tmp_path / "deep" / "events.jsonl"
    script = (
        f"import {{ makeEmitter }} from '{repo_root / MODS / 'events.mjs'}';\n"
        f"const emit = makeEmitter('{target}');\n"
        "emit({ type: 'escalated', partial: 'p1', tier: 'cloud', harness: 'claude', costUsd: 0.1, spentUsd: 0.1, detail: 'x' });\n"
        "emit({ type: 'run_done' });\n"
    )
    res = run_cmd(["node", "--input-type=module", "-e", script])
    assert res.returncode == 0, res.output
    lines = [json.loads(l) for l in target.read_text().splitlines()]
    assert [l["type"] for l in lines] == ["escalated", "run_done"]
    assert set(lines[0]) == {"ts", "type", "partial", "tier", "harness", "costUsd", "spentUsd", "detail"}
    assert lines[0]["partial"] == "p1" and lines[0]["costUsd"] == 0.1
    assert lines[1]["partial"] is None and lines[1]["tier"] is None
    assert lines[0]["ts"].endswith("Z") and lines[0]["ts"].startswith("20")


# ---------- Laeufe ----------

def test_failure_on_the_local_tier_escalates_to_cloud_and_books_the_cost(rig, run_cmd):
    rig.make_change({"p1": {"front": FALLBACK_BOTH}})
    rig.start_direct_worker([LOCAL_FAILURE])
    rig.start_orch([
        {"name": "dispatch_direct", "args": {"partial_id": "p1", "prompt": "go"}},
        {"name": "wait_event", "args": {}},
        {"name": "mark", "args": {"partial_id": "p1", "status": "done", "note": "ok"}},
        {"name": "finish", "args": {"summary": "done"}},
    ])
    res = rig.run(run_cmd, "--direct-slots", "1", "--cloud-slots", "0")
    assert res.returncode == 0, res.output
    assert "PLAN-RUNNER: done=1/1" in res.output
    assert "lease guard not configured" in res.output
    events = rig.events()
    assert [e["type"] for e in events] == ["partial_started", "escalated", "partial_started", "partial_done", "run_done"]
    started, escalated, restarted, done, _ = events
    assert (started["partial"], started["tier"], started["harness"]) == ("p1", "5070ti", "direct")
    assert (escalated["partial"], escalated["tier"]) == ("p1", "cloud")
    assert "5070ti" in escalated["detail"] and "local model gave up" in escalated["detail"]
    assert (restarted["tier"], restarted["harness"]) == ("cloud", "claude")
    assert (done["tier"], done["harness"], done["costUsd"], done["spentUsd"]) == ("cloud", "claude", 0.25, 0.25)
    state = rig.state()
    assert state["partials"]["p1"]["status"] == "done"
    assert [(h["tier"], h["ok"]) for h in state["partials"]["p1"]["history"]] == [("5070ti", False), ("cloud", True)]
    assert state["ledger"]["spentUsd"] == 0.25
    assert state["ledger"]["budgetUsd"] == 5
    assert [c["harness"] for c in state["ledger"]["calls"] if c["costUsd"]] == ["claude"]
    # Der Orchestrator sieht nur das Endergebnis, nicht den Zwischenfehler des lokalen Tiers.
    seen = json.loads(rig.requests_log.read_text().splitlines()[2])["messages"][-1]["content"]
    assert "success" in seen and "local model gave up" not in seen
    # Env-Scrubbing: claude sieht weder GH_TOKEN noch fremde Keys, aber den eigenen Key.
    log = rig.claude_log.read_text()
    assert "claude p1 GH_TOKEN=unset ANTHROPIC_API_KEY=own-anthropic-key" in log
    assert "--model sonnet" in log
    assert rig.opencode_log.read_text() == ""


def test_budget_exhausted_pauses_cloud_partials_with_exit_3_and_resumes_with_more_budget(rig, run_cmd):
    rig.make_change({"p1": {}})
    rig.start_orch([
        {"name": "dispatch_cloud", "args": {"partial_id": "p1", "prompt": "go"}},
        {"name": "mark", "args": {"partial_id": "p1", "status": "done", "note": "try"}},
        {"name": "finish", "args": {"summary": "paused"}},
    ])
    res = rig.run(run_cmd, "--direct-slots", "0", "--cloud-slots", "1", "--budget-usd", "0")
    assert res.returncode == 3, res.output
    assert "paused=1" in res.output
    assert rig.state()["partials"]["p1"]["status"] == "paused_budget"
    assert rig.opencode_log.read_text() == ""
    # Der Orchestrator bekommt die Pause gemeldet und kann sie nicht per mark aushebeln.
    reqs = [json.loads(l)["messages"][-1]["content"] for l in rig.requests_log.read_text().splitlines()]
    assert "PAUSED_BUDGET" in reqs[1]
    assert "paused_budget" in reqs[2]
    assert [e["type"] for e in rig.events()] == ["budget_paused", "run_done"]
    assert rig.events()[0]["partial"] == "p1"
    # Fortsetzen mit hoeherem Budget: paused_budget wird wieder ready, der Lauf endet mit 0.
    rig.requests_log.write_text("")
    rig.procs[-1].kill()
    rig.start_orch([
        {"name": "dispatch_cloud", "args": {"partial_id": "p1", "prompt": "go"}},
        {"name": "wait_event", "args": {}},
        {"name": "mark", "args": {"partial_id": "p1", "status": "done", "note": "ok"}},
        {"name": "finish", "args": {"summary": "done"}},
    ])
    res = rig.run(run_cmd, "--direct-slots", "0", "--cloud-slots", "1", "--budget-usd", "5")
    assert res.returncode == 0, res.output
    assert "PLAN-RUNNER: done=1/1" in res.output
    assert rig.opencode_log.read_text().rstrip("\n") == "plan-worker-muse p1"
    state = rig.state()
    assert state["partials"]["p1"]["status"] == "done"
    assert state["ledger"]["budgetUsd"] == 5
    assert state["ledger"]["flatRateCalls"] == 1
    assert [e["type"] for e in rig.events()][-3:] == ["partial_started", "partial_done", "run_done"]


def test_spent_budget_stops_the_next_escalation_while_local_work_continues(rig, run_cmd, tmp_path):
    rig.make_change({"p1": {"front": FALLBACK_BOTH}, "p2": {"front": FALLBACK_BOTH}})
    guard = _executable(tmp_path / "guard-free.sh", STUB_LOGGING.format(log=tmp_path / "guard.log", code=0))
    rig.mp.setenv("PLAN_RUNNER_LEASE_GUARD", str(guard))
    rig.start_direct_worker([LOCAL_FAILURE, LOCAL_FAILURE])
    rig.start_orch([
        {"name": "dispatch_direct", "args": {"partial_id": "p1", "prompt": "go"}},
        {"name": "wait_event", "args": {}},
        {"name": "mark", "args": {"partial_id": "p1", "status": "done", "note": "ok"}},
        {"name": "dispatch_direct", "args": {"partial_id": "p2", "prompt": "go"}},
        {"name": "wait_event", "args": {}},
        {"name": "finish", "args": {"summary": "p2 paused"}},
    ])
    res = rig.run(run_cmd, "--direct-slots", "1", "--cloud-slots", "0", "--budget-usd", "0.2")
    assert res.returncode == 3, res.output
    assert "paused=1" in res.output
    assert (tmp_path / "guard.log").read_text().split()[-1] == "0"
    state = rig.state()
    # p1 lief in der Cloud (0,25 USD gebucht), p2 findet danach kein Budget mehr fuer cloud.
    assert state["partials"]["p1"]["status"] == "done"
    assert state["partials"]["p2"]["status"] == "paused_budget"
    assert state["ledger"]["spentUsd"] == 0.25
    assert [e["type"] for e in rig.events()].count("budget_paused") == 1
    assert rig.claude_log.read_text().count("claude ") == 1


def test_no_tier_left_pauses_the_partial_for_the_owner(rig, run_cmd):
    rig.make_change({"p1": {"front": "fallback: [5070ti]"}})
    rig.start_direct_worker([LOCAL_FAILURE])
    rig.start_orch([
        {"name": "dispatch_direct", "args": {"partial_id": "p1", "prompt": "go"}},
        {"name": "wait_event", "args": {}},
        {"name": "finish", "args": {"summary": "owner decides"}},
    ])
    events_file = rig.t / "custom-events.jsonl"
    res = rig.run(run_cmd, "--direct-slots", "1", "--cloud-slots", "0", "--events", str(events_file))
    assert res.returncode == 3, res.output
    assert rig.state()["partials"]["p1"]["status"] == "paused_owner"
    assert [e["type"] for e in rig.events(events_file)] == ["partial_started", "owner_paused", "run_done"]
    assert not (rig.ch / ".plan-runner" / "events.jsonl").exists()
    assert rig.claude_log.read_text() == ""


def test_lease_guard_exit_1_skips_the_local_tier_and_stops_nothing(rig, run_cmd, tmp_path):
    rig.make_change({"p1": {}})
    guard_log = tmp_path / "guard.log"
    guard = _executable(tmp_path / "guard-busy.sh", STUB_LOGGING.format(log=guard_log, code=1))
    rig.mp.setenv("PLAN_RUNNER_LEASE_GUARD", str(guard))
    rig.start_direct_worker([LOCAL_FAILURE])
    rig.start_orch([
        {"name": "dispatch_direct", "args": {"partial_id": "p1", "prompt": "go"}},
        {"name": "dispatch_cloud", "args": {"partial_id": "p1", "prompt": "go"}},
        {"name": "wait_event", "args": {}},
        {"name": "mark", "args": {"partial_id": "p1", "status": "done", "note": "ok"}},
        {"name": "finish", "args": {"summary": "done"}},
    ])
    res = rig.run(run_cmd, "--direct-slots", "1", "--cloud-slots", "1")
    assert res.returncode == 0, res.output
    assert "tier 5070ti skipped" in res.output
    assert "direct slots 0" in res.output
    assert guard_log.read_text().split()[-1] == "0"  # <gpu-index> als Argument
    # Das Direkt-Modell wurde nie angefragt, und nichts wurde gestoppt oder verdraengt.
    assert rig.worker_log.read_text() == ""
    assert rig.systemctl_log.read_text() == ""
    assert rig.opencode_log.read_text().rstrip("\n") == "plan-worker-muse p1"
    assert "BUSY" in json.loads(rig.requests_log.read_text().splitlines()[1])["messages"][-1]["content"]


def test_a_fixed_harness_runs_every_partial_and_books_its_cost(rig, run_cmd):
    rig.make_change({"p1": {}, "p2": {"front": "harness: auto"}})
    rig.start_orch([
        {"name": "dispatch_cloud", "args": {"partial_id": "p1", "prompt": "go"}},
        {"name": "wait_event", "args": {}},
        {"name": "mark", "args": {"partial_id": "p1", "status": "done", "note": "ok"}},
        {"name": "dispatch_cloud", "args": {"partial_id": "p2", "prompt": "go"}},
        {"name": "wait_event", "args": {}},
        {"name": "mark", "args": {"partial_id": "p2", "status": "done", "note": "ok"}},
        {"name": "finish", "args": {"summary": "done"}},
    ])
    res = rig.run(run_cmd, "--direct-slots", "0", "--cloud-slots", "1", "--harness", "claude")
    assert res.returncode == 0, res.output
    assert "PLAN-RUNNER: done=2/2" in res.output
    assert rig.opencode_log.read_text() == ""
    assert rig.claude_log.read_text().count("claude p") == 2
    state = rig.state()
    assert state["ledger"]["spentUsd"] == 0.5
    assert all(e["harness"] == "claude" for e in rig.events() if e["type"] == "partial_started")


def test_a_fixed_harness_is_also_budget_gated(rig, run_cmd):
    rig.make_change({"p1": {}})
    rig.start_orch([
        {"name": "dispatch_cloud", "args": {"partial_id": "p1", "prompt": "go"}},
        {"name": "finish", "args": {"summary": "paused"}},
    ])
    res = rig.run(run_cmd, "--direct-slots", "0", "--cloud-slots", "1", "--harness", "claude", "--budget-usd", "0")
    assert res.returncode == 3, res.output
    assert rig.claude_log.read_text() == ""
    assert rig.state()["partials"]["p1"]["status"] == "paused_budget"


def test_a_partial_frontmatter_harness_applies_without_the_flag(rig, run_cmd):
    rig.make_change({"p1": {"front": "harness: claude"}})
    rig.start_orch([
        {"name": "dispatch_cloud", "args": {"partial_id": "p1", "prompt": "go"}},
        {"name": "wait_event", "args": {}},
        {"name": "mark", "args": {"partial_id": "p1", "status": "done", "note": "ok"}},
        {"name": "finish", "args": {"summary": "done"}},
    ])
    res = rig.run(run_cmd, "--direct-slots", "0", "--cloud-slots", "1")
    assert res.returncode == 0, res.output
    assert rig.claude_log.read_text().count("claude p1") == 1
    assert rig.opencode_log.read_text() == ""


@pytest.mark.parametrize("value", ["{nope", "[]", '[{"id":"x","kind":"bogus"}]'])
def test_invalid_plan_runner_tiers_is_a_configuration_error(rig, run_cmd, value):
    rig.make_change({"p1": {}})
    rig.mp.setenv("PLAN_RUNNER_TIERS", value)
    res = rig.run(run_cmd)
    assert res.returncode == 2, res.output
    assert "PLAN_RUNNER_TIERS" in res.output


def test_unknown_harness_flag_and_frontmatter_are_configuration_errors(rig, run_cmd):
    rig.make_change({"p1": {}})
    res = rig.run(run_cmd, "--harness", "gpt-9000")
    assert res.returncode == 2, res.output
    assert "harness" in res.output
    rig.make_change({"p1": {"front": "harness: gpt-9000"}})
    res = rig.run(run_cmd)
    assert res.returncode == 2, res.output
    assert "p1" in res.output and "harness" in res.output


def test_a_failed_self_run_escalates_to_the_next_tier(rig, run_cmd, tmp_path):
    rig.make_change({"p1": {"front": FALLBACK_BOTH}})
    rig.mp.setenv("PLAN_RUNNER_OPENCODE", str(_executable(tmp_path / "failing-opencode.sh", FAILING_OPENCODE)))
    rig.start_orch([
        {"name": "execute_self", "args": {"partial_id": "p1", "prompt": "do it", "plan_notes": "n"}},
        {"name": "wait_event", "args": {}},
        {"name": "mark", "args": {"partial_id": "p1", "status": "done", "note": "ok"}},
        {"name": "finish", "args": {"summary": "done"}},
    ])
    rig.mp.setenv("PLAN_RUNNER_SELF_URL", os.environ["PLAN_RUNNER_ORCH_URL"])
    res = rig.run(run_cmd, "--direct-slots", "0", "--cloud-slots", "0")
    assert res.returncode == 0, res.output
    reply = json.loads(rig.requests_log.read_text().splitlines()[1])["messages"][-1]["content"]
    assert reply.startswith("ESCALATED p1") and "self run broke" in reply
    state = rig.state()
    assert [(h["tier"], h["harness"], h["ok"]) for h in state["partials"]["p1"]["history"]] == [
        ("5070ti", "opencode", False), ("cloud", "claude", True)]
    assert [e["type"] for e in rig.events()] == ["partial_started", "escalated", "partial_started", "partial_done", "run_done"]
    assert state["ledger"]["spentUsd"] == 0.25


def test_the_second_gpu_tier_runs_the_partial_through_pi_when_its_endpoint_answers(rig, run_cmd):
    rig.make_change({"p1": {"front": "fallback: [5070ti, 3060ti, cloud]"}})
    rig.start_tier2_server()
    rig.start_direct_worker([LOCAL_FAILURE])
    rig.start_orch([
        {"name": "dispatch_direct", "args": {"partial_id": "p1", "prompt": "go"}},
        {"name": "wait_event", "args": {}},
        {"name": "mark", "args": {"partial_id": "p1", "status": "done", "note": "ok"}},
        {"name": "finish", "args": {"summary": "done"}},
    ])
    res = rig.run(run_cmd, "--direct-slots", "1", "--cloud-slots", "0")
    assert res.returncode == 0, res.output
    state = rig.state()
    assert [(h["tier"], h["harness"], h["ok"]) for h in state["partials"]["p1"]["history"]] == [
        ("5070ti", "direct", False), ("3060ti", "pi", True)]
    log = rig.pi_log.read_text()
    assert "pi p1 ANTHROPIC_API_KEY=unset GH_TOKEN=unset" in log
    assert "--mode json -p --no-session --provider 3060ti --model qwen-4b" in log
    assert rig.claude_log.read_text() == ""
    assert state["ledger"]["spentUsd"] == 0


def test_an_unreachable_second_tier_is_skipped_in_the_chain(rig, run_cmd, monkeypatch):
    rig.make_change({"p1": {"front": "fallback: [5070ti, 3060ti, cloud]"}})
    monkeypatch.setenv("PLAN_RUNNER_TIER2_URL", "http://127.0.0.1:9")
    monkeypatch.setenv("PLAN_RUNNER_TIER2_MODEL", "qwen-4b")
    rig.start_direct_worker([LOCAL_FAILURE])
    rig.start_orch([
        {"name": "dispatch_direct", "args": {"partial_id": "p1", "prompt": "go"}},
        {"name": "wait_event", "args": {}},
        {"name": "mark", "args": {"partial_id": "p1", "status": "done", "note": "ok"}},
        {"name": "finish", "args": {"summary": "done"}},
    ])
    res = rig.run(run_cmd, "--direct-slots", "1", "--cloud-slots", "0")
    assert res.returncode == 0, res.output
    assert "tier 3060ti skipped: http://127.0.0.1:9 did not answer /v1/models" in res.output
    assert [h["tier"] for h in rig.state()["partials"]["p1"]["history"]] == ["5070ti", "cloud"]
    assert rig.pi_log.read_text() == ""


def test_without_a_configured_chain_a_failure_still_goes_to_the_orchestrator(rig, run_cmd, tmp_path):
    # Ohne `fallback:` im Frontmatter und ohne PLAN_RUNNER_TIERS eskaliert der Runner nicht (kein stilles
    # Cloud-Budget fuer Plaene ohne Kette): der Orchestrator prueft das Ergebnis und entscheidet wie bisher.
    rig.make_change({"p1": {}})
    rig.mp.setenv("PLAN_RUNNER_OPENCODE", str(_executable(tmp_path / "flaky-opencode.sh", FLAKY_OPENCODE)))
    rig.mp.setenv("FLAKY_STATE", str(tmp_path / "flaky.state"))
    rig.start_orch([
        {"name": "dispatch_cloud", "args": {"partial_id": "p1", "prompt": "go"}},
        {"name": "wait_event", "args": {}},
        {"name": "mark", "args": {"partial_id": "p1", "status": "open", "note": "retry"}},
        {"name": "dispatch_cloud", "args": {"partial_id": "p1", "prompt": "again"}},
        {"name": "wait_event", "args": {}},
        {"name": "mark", "args": {"partial_id": "p1", "status": "done", "note": "ok"}},
        {"name": "finish", "args": {"summary": "done"}},
    ])
    res = rig.run(run_cmd, "--direct-slots", "0", "--cloud-slots", "1")
    assert res.returncode == 0, res.output
    first = json.loads(rig.requests_log.read_text().splitlines()[2])["messages"][-1]["content"]
    assert "failure" in first and "first run broke" in first
    assert [e["type"] for e in rig.events()] == ["partial_started", "partial_started", "partial_done", "run_done"]
    state = rig.state()
    assert [(h["tier"], h["ok"]) for h in state["partials"]["p1"]["history"]] == [("cloud", False), ("cloud", True)]
    assert state["partials"]["p1"]["status"] == "done"
    assert rig.claude_log.read_text() == ""


def _run_agy(rig, run_cmd):
    rig.make_change({"p1": {}})
    rig.start_orch([
        {"name": "dispatch_cloud", "args": {"partial_id": "p1", "prompt": "go"}},
        {"name": "wait_event", "args": {}},
        {"name": "mark", "args": {"partial_id": "p1", "status": "done", "note": "ok"}},
        {"name": "finish", "args": {"summary": "done"}},
    ])
    res = rig.run(run_cmd, "--direct-slots", "0", "--cloud-slots", "1", "--harness", "agy")
    assert res.returncode == 0, res.output
    return rig.agy_log.read_text()


def test_agy_runs_without_skip_permissions_unless_the_sandbox_opt_in_is_set(rig, run_cmd):
    # Der Runner laeuft auf dem Entwickler-Host ohne Sandbox (anders als devflow_runner im K8s-Pod).
    log = _run_agy(rig, run_cmd)
    assert "agy ARGS=-p --output-format json" in log
    assert "--dangerously-skip-permissions" not in log


def test_agy_gets_skip_permissions_only_with_the_explicit_opt_in(rig, run_cmd, monkeypatch):
    monkeypatch.setenv("PLAN_RUNNER_AGY_SKIP_PERMISSIONS", "1")
    log = _run_agy(rig, run_cmd)
    assert "agy ARGS=-p --output-format json --dangerously-skip-permissions" in log


@pytest.mark.parametrize("value", ["", "0", "true", "yes"])
def test_only_the_literal_one_enables_skip_permissions_for_agy(rig, run_cmd, monkeypatch, value):
    monkeypatch.setenv("PLAN_RUNNER_AGY_SKIP_PERMISSIONS", value)
    assert "--dangerously-skip-permissions" not in _run_agy(rig, run_cmd)

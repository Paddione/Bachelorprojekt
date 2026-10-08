"""Native migration of tests/spec/devflow-mcp/plan-stage.bats."""

import os
import stat
import subprocess
from pathlib import Path

import pytest


def _central(*parts):
    """Zentraler MCP-Server-Pfad (T901492; CI setzt MCP_SERVERS_HOME auf den Zweit-Checkout)."""
    return Path(os.environ.get("MCP_SERVERS_HOME", "/home/patrick/mcp-servers")).joinpath(*parts)


class Devflow:
    """Port of tests/spec/devflow-mcp/helpers.bash (devflow_setup, devflow_index, devflow_call, json)."""

    def __init__(self, run_cmd, repo_root: Path, tmp_path: Path):
        self.run_cmd = run_cmd
        self.repo_root = repo_root
        self.fix = repo_root / "tests/spec/devflow-mcp/fixtures"
        self.t = tmp_path
        self.status = None
        self.output = ""
        self.env = {}
        self._setup()

    def _git(self, *args, cwd=None):
        return self.run_cmd(["git", "-C", str(cwd or self.frepo), *args])

    def _setup(self):
        t = self.t
        self.env.update({
            "DEVFLOW_BGE_STDIO": f"node {self.fix}/fake-bge.mjs",
            "DEVFLOW_PG_STDIO": f"node {self.fix}/fake-pg.mjs",
            "DEVFLOW_CBM_STDIO": f"node {self.fix}/fake-cbm.mjs",
            "DEVFLOW_CACHE_DIR": str(t / "cache"),
            "FAKE_BGE_LOG": str(t / "bge.log"),
        })
        self.frepo = t / "repo"
        (self.frepo / "src").mkdir(parents=True, exist_ok=True)
        (self.frepo / "src" / "locks.mjs").write_text(
            "// Agent-Locks: Claim und Release fuer Worktrees.\n"
            "export function claimLock(scope, id) {\n"
            "  // schreibt agent-locks/<scope>__<id>.json\n"
            "  return writeLockFile(scope, id);\n"
            "}\n")
        (self.frepo / "src" / "tiers.mjs").write_text(
            "// Tool-Tiers: erste passende tool_tiers-Zeile gewinnt.\n"
            "export function resolveToolTier(name, instCfg) {\n"
            "  return instCfg.tier;\n"
            "}\n")
        (self.frepo / "src" / "render.mjs").write_text(
            "// Prompt-Block rendern.\n"
            "export class PromptRenderer {\n"
            "  render(block) { return block; }\n"
            "}\n")
        self.run_cmd(["git", "init", "-q", str(self.frepo)]).check()
        self._git("add", ".").check()
        self._git("-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "init").check()
        self.env["DEVFLOW_REPO_ROOT"] = str(self.frepo)
        self.env["FAKE_CBM_SYMBOLS"] = (
            '[\n'
            '    {"qn":"fixture-proj.src.locks.claimLock","file":"src/locks.mjs","s":2,"e":5,"sig":"(scope, id)","doc":"// Agent-Locks: Claim und Release fuer Worktrees.","label":"Function"},\n'
            '    {"qn":"fixture-proj.src.tiers.resolveToolTier","file":"src/tiers.mjs","s":2,"e":4,"sig":"(name, instCfg)","doc":"","label":"Function"},\n'
            '    {"qn":"fixture-proj.src.render.PromptRenderer","file":"src/render.mjs","s":2,"e":4,"sig":"","doc":"","label":"Class"}\n'
            '  ]'
        )
        self.env["FAKE_CBM_CALLS"] = '[["fixture-proj.src.render.PromptRenderer","fixture-proj.src.tiers.resolveToolTier"]]'
        self.env["FAKE_PG_ROWS"] = (
            '[\n'
            '    {"source":"specs_plans","title":"toolset-tool-level","uri":"file:.agents/plans/toolset-tool-level/tasks.md","text":"tool_tiers resolve tier per tool, first matching glob wins","score":0.8},\n'
            '    {"source":"bug_tickets","title":"T900984","uri":"ticket:T900984","text":"ticket-mcp-node lists tools twice","score":0.5}\n'
            '  ]'
        )
        self.env["TOOLSET_REGISTRY"] = str(t / "capabilities.yaml")
        self.env["TOOLSET_LOCK"] = str(t / "toolset.lock.yaml")
        Path(self.env["TOOLSET_REGISTRY"]).write_text(
            "capabilities:\n"
            "  cluster:\n"
            "    mcp:fake-k8s:\n"
            "      state: canonical\n"
            "      use_when: \"Pods und Ressourcen im Cluster lesen\"\n"
            "      roles: [bp-run]\n"
            "      tier: safe\n"
            "      tool_tiers:\n"
            "        pods_exec: dangerous\n"
            "  tickets:\n"
            "    mcp:fake-tickets:\n"
            "      state: canonical\n"
            "      use_when: \"Tickets lesen und Status setzen\"\n"
            "      roles: [bp-run, bp-ship]\n"
            "      tier: caution\n"
            "      tools_suppressed: [stage_plan]\n")
        Path(self.env["TOOLSET_LOCK"]).write_text(
            "lock_version: 2\n"
            "servers:\n"
            "  fake-k8s:\n"
            "    status: ok\n"
            "    tool_count: 2\n"
            "    tools:\n"
            "      pods_log: {hash: aaaaaaaaaaaa, summary: \"Read the logs of a pod\"}\n"
            "      pods_exec: {hash: bbbbbbbbbbbb, summary: \"Execute a command inside a pod\"}\n"
            "  fake-tickets:\n"
            "    status: ok\n"
            "    tool_count: 2\n"
            "    tools:\n"
            "      get_ticket: {hash: cccccccccccc, summary: \"Read a ticket by id\"}\n"
            "      stage_plan: {hash: dddddddddddd, summary: \"Stage a plan for a ticket\"}\n")

    def _exec(self, cmd, extra_env=None):
        res = self.run_cmd(cmd, env={**self.env, **(extra_env or {})}, timeout=180)
        self.status = res.returncode
        self.output = res.output
        return res

    def index(self, extra_env=None, *args):
        """devflow_index: graph-index.mjs against the fixture repo."""
        return self._exec(["node", str(_central("devflow", "graph-index.mjs")),
                           "--repo", str(self.frepo), *args], extra_env)

    def call(self, *args, extra_env=None):
        """devflow_call: one tool of the devflow server over stdio."""
        return self._exec(["node", str(self.fix / "call.mjs"), str(self.repo_root), *args],
                          extra_env)

    def json(self, expr):
        """json EXPR: evaluate a node expression over the JSON in $output (variable d)."""
        script = ("const d=JSON.parse(require('fs').readFileSync(0,'utf8')); "
                  f"console.log({expr})")
        proc = subprocess.run(["node", "-e", script], input=self.output,
                              capture_output=True, text=True)
        self.status = proc.returncode
        self.output = (proc.stdout + proc.stderr).strip()
        return proc

    @property
    def cache_dir(self) -> Path:
        return Path(self.env["DEVFLOW_CACHE_DIR"]) / "fixture-proj"

    def node(self, code, *args):
        return self._exec(["node", "-e", code, *args])


def _write_exec(path: Path, body: str):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(body)
    path.chmod(path.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)


@pytest.fixture
def devflow(run_cmd, repo_root, tmp_path):
    return Devflow(run_cmd, repo_root, tmp_path)


WORKTREE_CREATE_BODY = (
    'args=(); for a in "$@"; do case "$a" in --*) ;; *) args+=("$a");; esac; done; '
    'git -C "$(dirname "$0")/.." worktree add -q -b "${args[0]}" "${args[1]}" "${args[2]:-origin/main}"'
)
PLAN_LINT_BODY = (
    'f="${@: -1}"; if grep -q BROKEN "$f"; then echo "{\\"verdict\\":\\"FAIL\\",'
    '\\"hard\\":[\\"STRUCT1: missing header\\"],\\"warn\\":[]}"; exit 1; fi; '
    'echo "{\\"verdict\\":\\"PASS\\",\\"hard\\":[],\\"warn\\":[]}"'
)


def _stub(devflow, name: str, body: str):
    """stub NAME BODY: script that logs its call to $CALLS, then runs BODY."""
    script = devflow.frepo / "scripts" / name
    script.parent.mkdir(parents=True, exist_ok=True)
    script.write_text(f'#!/usr/bin/env bash\necho "{name} $*" >> "$CALLS"\n{body}\n')
    script.chmod(script.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)


@pytest.fixture
def plan_env(devflow):
    """plan-stage setup: bare origin, pushed main, stubs for the repo scripts."""
    t = devflow.t
    origin = t / "origin.git"
    devflow.origin = origin
    devflow.run_cmd(["git", "init", "-q", "--bare", str(origin)]).check()
    devflow._git("config", "user.email", "t@t").check()
    devflow._git("config", "user.name", "t").check()
    devflow._git("remote", "add", "origin", str(origin)).check()
    devflow._git("push", "-q", "origin", "HEAD:main").check()
    devflow._git("fetch", "-q", "origin").check()
    calls = t / "calls.log"
    devflow.calls = calls
    devflow.env["CALLS"] = str(calls)
    _stub(devflow, "worktree-create.sh", WORKTREE_CREATE_BODY)
    _stub(devflow, "agent-lock.sh", "exit 0")
    _stub(devflow, "plan-preflight.sh", "exit 0")
    _stub(devflow, "ticket.sh", 'echo "Ticket staged"')
    _stub(devflow, "plan-lint.sh", PLAN_LINT_BODY)
    return devflow


def _stage(devflow, plan_markdown: str):
    devflow.call("plan_stage", (
        '{"ticket":"T999001","slug":"demo","branch_type":"feature",'
        f'"plan_markdown":"{plan_markdown}","design_markdown":"# design"}}'))


def _calls(devflow) -> list:
    return devflow.calls.read_text().splitlines() if devflow.calls.exists() else []


def test_plan_stage_legt_worktree_an_committet_den_plan_pusht_und_stagt(plan_env):
    _stage(plan_env, "# demo — Implementation Plan")
    assert plan_env.status == 0
    plan_env.json('[d.ok, d.branch, d.lint.verdict, '
                  'd.steps.map(s => s.name + ":" + s.status).join(",")].join(" ")')
    assert plan_env.output.startswith("true feature/demo-T999001 PASS ")
    assert ":failed" not in plan_env.output
    remote = plan_env.run_cmd(["git", "-C", str(plan_env.frepo), "ls-remote", "origin",
                               "refs/heads/feature/demo-T999001"])
    assert remote.output
    tasks = plan_env.run_cmd(["git", "--git-dir", str(plan_env.origin), "show",
                              "feature/demo-T999001:.agents/plans/demo/tasks.md"])
    assert "demo — Implementation Plan" in tasks.output
    design = plan_env.run_cmd(["git", "--git-dir", str(plan_env.origin), "show",
                               "feature/demo-T999001:.agents/plans/demo/design.md"])
    assert "# design" in design.output


def test_plan_stage_aufrufreihenfolge_endet_mit_stage_plan_hold(plan_env):
    _stage(plan_env, "# demo — Implementation Plan")
    assert plan_env.status == 0
    names = [ln.split(" ", 1)[0] for ln in _calls(plan_env)]
    assert " ".join(names) + " " == \
        "worktree-create.sh agent-lock.sh plan-lint.sh plan-preflight.sh ticket.sh "
    ticket_lines = [ln for ln in _calls(plan_env) if ln.startswith("ticket.sh")]
    output = "\n".join(ticket_lines)
    assert "stage-plan" in output
    assert "--id T999001" in output
    assert "--hold" in output


def test_plan_stage_roter_lint_bricht_vor_commit_und_push_ab_worktree_bleibt(plan_env):
    _stage(plan_env, "# BROKEN plan")
    assert plan_env.status == 0
    plan_env.json('[d.ok, d.lint.verdict, d.lint.hard[0]].join(" ")')
    assert plan_env.output.startswith("false FAIL STRUCT1")
    remote = plan_env.run_cmd(["git", "-C", str(plan_env.frepo), "ls-remote", "origin",
                               "refs/heads/feature/demo-T999001"])
    assert remote.output == ""
    assert sum(1 for ln in _calls(plan_env) if ln.startswith("ticket.sh")) == 0
    assert (plan_env.frepo / ".worktrees" / "demo-T999001" / ".agents" / "plans" /
            "demo" / "tasks.md").is_file()


def test_plan_lint_liefert_das_urteil_strukturiert(plan_env):
    plan = plan_env.t / "p.md"
    plan.write_text("# BROKEN\n")
    plan_env.call("plan_lint", '{"plan_path":"' + str(plan) + '"}')
    assert plan_env.status == 0
    plan_env.json('d.verdict + " " + d.hard.length')
    assert plan_env.output == "FAIL 1"

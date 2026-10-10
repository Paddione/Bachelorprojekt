"""Native migration of tests/spec/devflow-mcp/retrieval.bats."""

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


@pytest.fixture
def indexed(devflow):
    """setup() of retrieval.bats: devflow_setup + devflow_index (output discarded)."""
    devflow.index()
    return devflow


def test_retrieval_der_server_bietet_die_devflow_tools_an(indexed):
    indexed.call("list")
    assert indexed.status == 0
    for tool in ("context_for_task", "recommend_tools", "search_code", "graph_status",
                 "plan_stage", "plan_lint", "lock", "collision_check", "ci_status",
                 "task_oracle"):
        assert f" {tool} " in f" {indexed.output} ", tool


def test_retrieval_search_code_findet_das_passende_symbol_zuerst(indexed):
    indexed.call("search_code", '{"query":"which tool tier does resolveToolTier return","k":2}')
    assert indexed.status == 0
    indexed.json("d.results[0].qualified_name + ' ' + d.results[0].file + ':' + d.results[0].line")
    assert "resolveToolTier src/tiers.mjs:2" in indexed.output


def test_retrieval_context_for_task_liefert_code_plaene_und_werkzeuge_in_einem_aufruf(indexed):
    indexed.call("context_for_task",
                 '{"task":"resolve the tool tier for pods","role":"bp-run"}')
    assert indexed.status == 0
    indexed.json("[d.code.length > 0, d.plans[0].title, d.tools.length > 0, d.role].join(' ')")
    assert indexed.output == "true toolset-tool-level true bp-run"


def test_retrieval_recommend_tools_filtert_nach_rolle_unterdrueckung_und_tier(indexed):
    indexed.call("recommend_tools",
                 '{"task":"read pod logs and stage a plan","role":"bp-run","k":10}')
    assert indexed.status == 0
    indexed.json("d.tools.map(t => t.server + '.' + t.tool).join(',')")
    # Positiv-Anker zuerst: das passende Lese-Tool ist da.
    assert "fake-k8s.pods_log" in indexed.output
    # stage_plan ist unterdrueckt, pods_exec liegt ueber max_tier (Default assisted).
    assert "stage_plan" not in indexed.output
    assert "pods_exec" not in indexed.output


def test_retrieval_recommend_tools_mit_max_tier_dangerous_nimmt_pods_exec_auf(indexed):
    indexed.call("recommend_tools",
                 '{"task":"execute a command inside a pod","role":"bp-run","max_tier":"dangerous"}')
    assert indexed.status == 0
    indexed.json("d.tools[0].tool + ' ' + d.tools[0].tier")
    assert indexed.output == "pods_exec dangerous"


def test_retrieval_rerank_ausfall_degradiert_statt_zu_scheitern(indexed):
    indexed.call("search_code", '{"query":"claim a lock for a worktree","k":1}',
                 extra_env={"FAKE_BGE_FAIL_RERANK": "1"})
    assert indexed.status == 0
    indexed.json("d.results.length + ' ' + d.degraded.join(',')")
    assert indexed.output == "1 rerank"


def test_retrieval_ohne_rerank_sortiert_recommend_tools_lexikalisch_statt_in_registry_reihenfolge(
        indexed):
    indexed.call("recommend_tools",
                 '{"task":"read the logs of a pod","role":"bp-run","k":3}',
                 extra_env={"FAKE_BGE_FAIL_RERANK": "1"})
    assert indexed.status == 0
    indexed.json("d.tools[0].tool + ' ' + d.degraded.join(',')")
    assert indexed.output == "pods_log rerank"


def test_retrieval_bearer_token_kommt_aus_server_env_wenn_die_umgebung_keinen_hat(
        indexed, repo_root):
    home = indexed.t / "home"
    (home / ".config" / "bge-mcp").mkdir(parents=True)
    (home / ".config" / "mcp-postgres").mkdir(parents=True)
    (home / ".config" / "bge-mcp" / "server.env").write_text(
        'BGE_MCP_TOKEN="from-file"\n# Kommentar\n')
    (home / ".config" / "mcp-postgres" / "server.env").write_text(
        "MCP_POSTGRES_TOKEN=pg-file\n")
    code = (
        "import(process.argv[1]).then(({ withTokens }) => {\n"
        "  const e = withTokens({ MCP_POSTGRES_TOKEN: \"from-env\" }, process.argv[2]);\n"
        "  console.log(e.BGE_MCP_TOKEN + \" \" + e.MCP_POSTGRES_TOKEN);\n"
        "});\n"
    )
    backends = _central("devflow", "lib", "backends.mjs")
    result = indexed.run_cmd(
        ["env", "-u", "BGE_MCP_TOKEN", "-u", "MCP_POSTGRES_TOKEN",
         "node", "-e", code, str(backends), str(home)],
        env=indexed.env)
    assert result.returncode == 0
    # Umgebung gewinnt, die Datei fuellt nur Luecken.
    assert result.output == "from-file from-env"


def test_retrieval_unbekannte_rolle_ist_ein_tool_fehler(indexed):
    indexed.call("recommend_tools", '{"task":"x","role":"db"}')
    assert indexed.status == 0
    indexed.json("String(d.isError) + ' ' + d.error")
    assert indexed.output.startswith("true ")
    assert "db" in indexed.output


def test_retrieval_graph_status_meldet_einen_veralteten_index(indexed):
    indexed.call("graph_status", "{}")
    assert indexed.status == 0
    indexed.json("d.count + ' ' + d.stale")
    assert indexed.output == "3 false"
    indexed._git("-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q",
                 "--allow-empty", "-m", "next").check()
    indexed.call("graph_status", "{}")
    indexed.json("String(d.stale)")
    assert indexed.output == "true"


def test_knowledge_candidates_exclude_unknown_embedding_model_before_limit(tmp_path):
    """Model compatibility belongs to candidate selection, before vector ranking."""
    import json
    module = _central("devflow", "lib", "retrieve.mjs")
    code = r"""
const { searchKnowledge } = await import(process.argv[1]);
let sql;
await searchKnowledge({ query: 'current doctrine', queryVector: [1, 0],
  bge: { async rerank() { return []; } },
  pg: { async query(statement) { sql = statement; return []; } } });
console.log(JSON.stringify(sql));
"""
    result = subprocess.run(["node", "--input-type=module", "-e", code, str(module)],
                            text=True, capture_output=True, check=True)
    sql = json.loads(result.stdout)
    where = sql.lower().split("where", 1)[1].split("order by", 1)[0]
    assert "embedding_model" in where and "bge-m3" in where, sql


def test_knowledge_candidates_exclude_historical_archive_before_limit(tmp_path):
    """An abandoned corpus must not crowd current candidates out of top-k."""
    import json
    module = _central("devflow", "lib", "retrieve.mjs")
    code = r"""
const { searchKnowledge } = await import(process.argv[1]);
let sql;
await searchKnowledge({ query: 'current doctrine', queryVector: [1, 0],
  bge: { async rerank() { return []; } },
  pg: { async query(statement) { sql = statement; return []; } } });
console.log(JSON.stringify(sql));
"""
    result = subprocess.run(["node", "--input-type=module", "-e", code, str(module)],
                            text=True, capture_output=True, check=True)
    sql = json.loads(result.stdout)
    where = sql.lower().split("where", 1)[1].split("order by", 1)[0]
    target = "open" + "spec"
    assert target in where and ("not" in where or "!=" in where or "<>" in where), sql

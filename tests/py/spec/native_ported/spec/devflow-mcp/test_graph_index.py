"""Native migration of tests/spec/devflow-mcp/graph-index.bats."""

import os
import stat
import subprocess
from pathlib import Path

import pytest


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
        return self._exec(["node", str(self.repo_root / "scripts/devflow-mcp/graph-index.mjs"),
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


def test_graph_index_baut_den_cache_mit_einem_chunk_je_symbol(devflow):
    # Pruefmodus: command output verification (T002448-M4).
    devflow.index()
    assert devflow.status == 0
    assert (devflow.cache_dir / "meta.json").is_file()
    devflow.node(
        "const fs = require('fs'); const d = process.argv[1];\n"
        "const meta = JSON.parse(fs.readFileSync(d + '/meta.json', 'utf8'));\n"
        "const lines = fs.readFileSync(d + '/symbols.jsonl', 'utf8').trim().split('\\n');\n"
        "const bytes = fs.statSync(d + '/vectors.f32').size;\n"
        "console.log(`count=${meta.count} lines=${lines.length} ok=${bytes === meta.count * meta.dims * 4}`);\n",
        str(devflow.cache_dir))
    assert "count=3 lines=3 ok=true" in devflow.output


def test_graph_index_chunk_enthaelt_signatur_rumpf_und_aufrufkanten(devflow):
    devflow.index()
    assert devflow.status == 0
    lines = [ln for ln in (devflow.cache_dir / "symbols.jsonl").read_text().splitlines()
             if "resolveToolTier" in ln]
    output = "\n".join(lines)
    assert "src/tiers.mjs:2" in output
    assert "(name, instCfg)" in output
    assert "return instCfg.tier" in output
    assert "called by: PromptRenderer" in output


def test_graph_index_zweiter_lauf_bettet_nur_geaenderte_symbole_neu_ein(devflow):
    devflow.index()
    assert devflow.status == 0
    Path(devflow.env["FAKE_BGE_LOG"]).write_text("")
    locks = devflow.frepo / "src" / "locks.mjs"
    locks.write_text(locks.read_text() + "// geaendert\n")
    locks.write_text(locks.read_text().replace(
        "return writeLockFile(scope, id);", "return writeLockFile(scope, id, true);"))
    devflow.index()
    assert devflow.status == 0
    assert "reused 2" in devflow.output
    assert Path(devflow.env["FAKE_BGE_LOG"]).read_text().strip() == "embed 1"


def test_graph_index_abbruch_mitten_im_lauf_sichert_den_fortschritt_der_naechste_lauf_setzt_fort(
        devflow):
    # Batch 1 und Ausfall nach dem ersten Aufruf: genau ein Symbol bekommt einen Vektor.
    devflow.index({"FAKE_BGE_FAIL_AFTER": "1", "DEVFLOW_EMBED_BATCH": "1"})
    assert devflow.status == 0
    assert "partial" in devflow.output
    devflow.node("const m=require(process.argv[1]); "
                 "console.log(`count=${m.count} partial=${m.partial} pending=${m.pending}`)",
                 str(devflow.cache_dir / "meta.json"))
    assert devflow.output == "count=1 partial=true pending=2"
    Path(devflow.env["FAKE_BGE_LOG"]).write_text("")
    devflow.index({"DEVFLOW_EMBED_BATCH": "1"})
    assert devflow.status == 0
    assert "reused 1" in devflow.output
    devflow.node("const m=require(process.argv[1]); "
                 "console.log(`count=${m.count} partial=${m.partial}`)",
                 str(devflow.cache_dir / "meta.json"))
    assert devflow.output == "count=3 partial=false"


def test_graph_index_eingebettet_wird_nur_der_kopf_der_volle_text_bleibt_fuer_den_ausschnitt(
        devflow):
    devflow.index({"DEVFLOW_EMBED_CHARS": "40"})
    assert devflow.status == 0
    devflow.node(
        "const fs=require('fs'); const r=fs.readFileSync(process.argv[1],'utf8').trim().split('\\n')"
        ".map(JSON.parse).find(x=>x.name==='resolveToolTier');\n"
        "console.log(`${r.embed_chars} ${r.text.includes('return instCfg.tier')}`);\n",
        str(devflow.cache_dir / "symbols.jsonl"))
    assert devflow.output == "40 true"


def test_graph_index_ohne_erreichbares_bge_endet_der_lauf_mit_exit_0_und_schreibt_nichts(
        devflow):
    devflow.env["DEVFLOW_BGE_STDIO"] = "/nonexistent/fake-bge"
    devflow.index()
    assert devflow.status == 0
    assert "bge" in devflow.output
    assert not (devflow.cache_dir / "meta.json").exists()

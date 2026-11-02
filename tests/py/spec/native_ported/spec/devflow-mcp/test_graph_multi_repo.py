"""Multi-repo graph resolution (P3 worker-repo-graph-alignment).

Indexes three fixture repos (proj-a/b/c) and asserts context_for_task,
search_code and graph_status resolve the passed `repo` to its own cache.
RED without the server-side `repo` parameter (singleton answers for all).
"""

import json
import os
import subprocess
from pathlib import Path

import pytest


def _central(*parts):
    return Path(os.environ.get("MCP_SERVERS_HOME", "/home/patrick/mcp-servers")).joinpath(*parts)


def _run(cmd, env, cwd):
    p = subprocess.run(cmd, cwd=str(cwd), env=env, capture_output=True, text=True, timeout=180)
    assert p.returncode == 0, f"{cmd}\n{p.stdout}\n{p.stderr}"
    return p.stdout.strip()


@pytest.fixture
def multi(tmp_path):
    repo_root = Path(__file__).resolve().parents[6]
    fix = repo_root / "tests/spec/devflow-mcp/fixtures"
    env = {**os.environ,
           "DEVFLOW_BGE_STDIO": f"node {fix}/fake-bge.mjs",
           "DEVFLOW_PG_STDIO": f"node {fix}/fake-pg.mjs",
           "DEVFLOW_CBM_STDIO": f"node {fix}/fake-cbm.mjs",
           "DEVFLOW_CACHE_DIR": str(tmp_path / "cache"),
           "TOOLSET_HOME": os.environ.get("TOOLSET_HOME", "/home/patrick/Bachelorprojekt/scripts/toolset")}
    repos = {}
    for tag in ("a", "b", "c"):
        r = tmp_path / f"repo_{tag}"
        (r / "src").mkdir(parents=True)
        (r / "src" / "mod.mjs").write_text(f"// {tag}\nexport function fn_{tag}() {{ return '{tag}'; }}\n")
        _run(["git", "init", "-q", str(r)], env, r)
        _run(["git", "-C", str(r), "add", "."], env, r)
        _run(["git", "-C", str(r), "-c", "user.email=t@t", "-c", "user.name=t",
              "commit", "-qm", "init"], env, r)
        sym = json.dumps([{"qn": f"proj-{tag}.src.mod.fn_{tag}", "file": "src/mod.mjs",
                           "s": 2, "e": 2, "sig": "()", "doc": tag, "label": "Function"}])
        e2 = {**env, "FAKE_CBM_SYMBOLS": sym, "FAKE_CBM_CALLS": "[]",
              "FAKE_CBM_PROJECT": f"proj-{tag}", "DEVFLOW_REPO_ROOT": str(r)}
        _run(["node", str(_central("devflow", "graph-index.mjs")), "--repo", str(r)], e2, r)
        repos[tag] = str(r)
    call = ["node", str(fix / "call.mjs"), str(repo_root)]
    return env, repos, call


def _call(env, call, tool, args):
    p = subprocess.run([*call, tool, json.dumps(args)], env=env,
                       capture_output=True, text=True, timeout=120)
    assert p.returncode == 0, f"{tool} {args}\n{p.stdout}\n{p.stderr}"
    return json.loads(p.stdout.strip())


def test_graph_status_resolves_each_repo(multi):
    env, repos, call = multi
    for tag, path in repos.items():
        d = _call(env, call, "graph_status", {"repo": path})
        assert d["indexed"] is True, (tag, d)
        assert d["project"] == f"proj-{tag}", (tag, d)


def test_search_code_hits_the_passed_repo_cache(multi):
    env, repos, call = multi
    for tag, path in repos.items():
        d = _call(env, call, "search_code", {"query": f"fn_{tag}", "k": 3, "repo": path})
        assert d["graph"]["project"] == f"proj-{tag}", (tag, d)
        assert any(f"fn_{tag}" in r["qualified_name"] for r in d["results"]), (tag, d)


def test_context_for_task_uses_the_passed_repo(multi):
    env, repos, call = multi
    d = _call(env, call, "context_for_task",
              {"task": "call fn_b in the helper", "role": "bp-run",
               "repo": repos["b"], "k_tools": 0, "k_docs": 0})
    assert d["graph"]["project"] == "proj-b", d["graph"]
    assert any("fn_b" in r["qualified_name"] for r in d["code"]), d["code"]

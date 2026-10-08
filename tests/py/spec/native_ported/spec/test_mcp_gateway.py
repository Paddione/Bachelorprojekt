"""Native migration of tests/spec/mcp-gateway.bats."""

import hashlib
import os
import re
import shutil
import subprocess
from pathlib import Path

import pytest
import yaml

DEV_POD_MANIFEST_REL = "k3d/dev-pod/deployment.yaml"
MCP_NODE_DIR_REL = "docker/mcp-node"


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def _registry(repo_root: Path):
    return yaml.safe_load(_read(repo_root / "docs" / "agent-guide" / "registry" / "mcp.yaml"))


def _pg_container_args(repo_root: Path) -> str:
    """cat reap-postgres-children.sh supervisor.sh Dockerfile (Startpfad des postgres-Servers)."""
    base = repo_root / MCP_NODE_DIR_REL
    return "".join(_read(base / name) for name in ("reap-postgres-children.sh", "supervisor.sh", "Dockerfile"))


def _reaper_selection_fn(repo_root: Path) -> str:
    """sed -n '/^list_reap_candidates()/,/^}/p' ueber das Startkommando."""
    out = []
    inside = False
    for line in _pg_container_args(repo_root).splitlines():
        if not inside and re.match(r"^list_reap_candidates\(\)", line):
            inside = True
        if inside:
            out.append(line)
            if re.match(r"^\}", line):
                break
    return "\n".join(out) + ("\n" if out else "")


def _pg_memory_limit(repo_root: Path) -> str:
    d = yaml.safe_load(_read(repo_root / DEV_POD_MANIFEST_REL))
    c = next(c for c in d["spec"]["template"]["spec"]["containers"] if c.get("name") == "mcp-node")
    return str(c["resources"]["limits"]["memory"])


def _mk_proc(root: Path, pid: int, ppid: int, start: int, *argv: str) -> None:
    d = root / str(pid)
    d.mkdir(parents=True, exist_ok=True)
    (d / "cmdline").write_bytes("".join(a + "\0" for a in argv).encode("utf-8"))
    # /proc/<pid>/stat: Feld 1=pid 2=comm 3=state 4=ppid ... 22=starttime
    (d / "stat").write_text(f"{pid} (node) S {ppid}" + " 0" * 17 + f" {start}\n", encoding="utf-8")
    (d / "status").write_text("VmRSS:\t13000 kB\n", encoding="utf-8")


def _mk_fixture(root: Path) -> None:
    _mk_proc(root, 1, 0, 100, "node", "/usr/local/bin/supergateway", "--stdio",
             'mcp-server-postgres "postgresql://x"')
    _mk_proc(root, 19, 1, 110, "/bin/sh", "-c",
             "reap_stale_children() { … mcp-server-postgres … }; reap_stale_children &")
    _mk_proc(root, 4711, 1, 200, "node", "/usr/local/bin/mcp-server-postgres", "postgresql://x")
    _mk_proc(root, 4712, 1, 210, "node", "/usr/local/bin/mcp-server-postgres", "postgresql://x")


def _run_selection(run_cmd, repo_root: Path, fixture: Path, self_pid: str):
    fn = _reaper_selection_fn(repo_root)
    script = f"{fn}\nPROC_ROOT='{fixture}' SELF_PID='{self_pid}' list_reap_candidates"
    return run_cmd(["bash", "-c", script])


def _selected_pids(run_cmd, repo_root: Path, fixture: Path, self_pid: str) -> str:
    r = _run_selection(run_cmd, repo_root, fixture, self_pid)
    pids = [line.split()[1] for line in r.stdout.splitlines() if len(line.split()) >= 2]
    return " ".join(pids)


def _fixture(tmp_path: Path) -> Path:
    root = tmp_path / "proc"
    root.mkdir()
    _mk_fixture(root)
    return root


# ── OAuth2 Proxy MCP Path Bypass ──────────────────────────────────────

def test_oauth2_proxy_dev_yaml_exists(repo_root):
    assert (repo_root / "k3d" / "dev-stack" / "oauth2-proxy-dev.yaml").is_file()


def test_oauth2_proxy_dev_yaml_has_skip_auth_route_for_mcp_paths(repo_root):
    assert "skip-auth-route" in _read(repo_root / "k3d" / "dev-stack" / "oauth2-proxy-dev.yaml")


def test_oauth2_proxy_dev_yaml_bypass_includes_kubernetes_mcp_path(repo_root):
    assert "kubernetes" in _read(repo_root / "k3d" / "dev-stack" / "oauth2-proxy-dev.yaml")


def test_oauth2_proxy_dev_yaml_bypass_includes_postgres_mcp_path(repo_root):
    assert "postgres" in _read(repo_root / "k3d" / "dev-stack" / "oauth2-proxy-dev.yaml")


# ── MCP Registry SSOT ─────────────────────────────────────────────────

def test_ssot_registry_mcp_yaml_exists_with_clients_and_cluster(repo_root):
    path = repo_root / "docs" / "agent-guide" / "registry" / "mcp.yaml"
    assert path.is_file()
    d = yaml.safe_load(_read(path))
    assert len(d["clients"]) >= 0 and len(d["cluster"]) >= 0


def test_mcp_sync_sh_check_passes_registry_matches_generated_configs(run_cmd, repo_root, monkeypatch):
    # Entruempelt das Aufrufer-Env, damit der Renderer deterministisch aufloest (T900922).
    monkeypatch.delenv("BGE_MCP_TOKEN", raising=False)
    monkeypatch.delenv("MCP_POSTGRES_TOKEN", raising=False)
    r = run_cmd(["bash", str(repo_root / "scripts" / "mcp-sync.sh"), "check"])
    assert r.returncode == 0, r.output


def _md5_pair(repo_root: Path) -> str:
    lines = []
    for rel in (".mcp.json", ".opencode/opencode.jsonc"):
        p = repo_root / rel
        if p.is_file():
            lines.append(f"{hashlib.md5(p.read_bytes()).hexdigest()}  {p}\n")
    return hashlib.md5("".join(lines).encode("utf-8")).hexdigest()


def test_mcp_sync_sh_check_is_read_only_never_writes(run_cmd, repo_root):
    before = _md5_pair(repo_root)
    run_cmd(["bash", str(repo_root / "scripts" / "mcp-sync.sh"), "check"])
    after = _md5_pair(repo_root)
    assert before == after


def test_mcp_sync_sh_check_skips_agy_target_with_visible_message(run_cmd, repo_root):
    if (Path.home() / ".gemini" / "config" / "mcp_config.json").is_file():
        pytest.skip("agy target exists on this machine — test only applies in CI")
    r = run_cmd(["bash", str(repo_root / "scripts" / "mcp-sync.sh"), "check"])
    assert "skipped" in r.output


# ── mcp-postgres Brand-Bindung (T002278) ──────────────────────────────

def test_registry_declares_mcp_postgres_brand_binding_and_target_database(repo_root):
    c = _registry(repo_root)["clients"]["mcp-postgres"]
    assert c.get("brand") == "mentolder"
    assert c.get("database")


def test_registry_names_the_sanctioned_korczewski_read_path_for_mcp_postgres(repo_root):
    c = _registry(repo_root)["clients"]["mcp-postgres"]
    assert c.get("korczewski_path")
    assert re.search(r"workspace-korczewski", c["korczewski_path"])


def test_mcp_tool_guide_warns_that_mcp_postgres_is_brand_scoped_to_mentolder(repo_root):
    text = _read(repo_root / ".claude" / "skills" / "references" / "mcp-tool-guide.md")
    assert re.search(r"brand-gebunden|brand-scoped|nur die mentolder-DB", text, re.IGNORECASE)


def test_mcp_tool_guide_routes_ticket_reads_to_ticket_mcp_with_explicit_brand(repo_root):
    assert "T002278" in _read(repo_root / ".claude" / "skills" / "references" / "mcp-tool-guide.md")


def test_claude_md_routing_table_no_longer_sells_mcp_postgres_as_the_ticket_query_path(repo_root):
    claude = repo_root / "CLAUDE.md"
    # Positiv-Anker zuerst (T002375-p7).
    assert claude.is_file(), "CLAUDE.md nicht gefunden — der Test haette vakuos bestanden"
    text = _read(claude)
    assert "mcp-postgres" in text, "CLAUDE.md erwaehnt mcp-postgres gar nicht mehr — Anker pruefen"
    assert "mcp-postgres` (localhost:13001) — Ticket-Queries" not in text


def test_cluster_container_names_match_deployment_manifest(repo_root):
    # [T900107] Subjekt ist der dev-pod.
    text = _read(repo_root / "k3d" / "dev-pod" / "deployment.yaml")
    count = len([line for line in text.splitlines()
                 if re.search(r"^ *- name: (mcp-node|mcp-kubernetes|repo-sync)$", line)])
    assert count == 3


# ── Ops Agent Output-Trust Guardrails ─────────────────────────────────

def test_bp_run_md_exists(repo_root):
    assert (repo_root / ".claude" / "agents" / "bp-run.md").is_file()


def test_ops_agent_has_output_trust_shell_session_integrity_section(repo_root):
    assert re.search(r"output.*trust|shell.*session.*integrity", _read(repo_root / ".claude" / "agents" / "bp-run.md"),
                     re.IGNORECASE)


def test_ops_agent_warns_against_fabricating_diagnosis_from_unverified_output(repo_root):
    assert re.search(r"fabricate|do not conclude|never.*diagnose.*unverified",
                     _read(repo_root / ".claude" / "agents" / "bp-run.md"), re.IGNORECASE)


def test_ops_agent_prescribes_kubectl_get_nodes_as_verification_probe(repo_root):
    assert "kubectl get nodes" in _read(repo_root / ".claude" / "agents" / "bp-run.md")


# ── repo-built MCP servers: PATH name, not absolute path (T002301) ────

def _yaml_block(text: str, server: str) -> list:
    """awk-Block: Zeilen nach '  <server>:' bis zur naechsten Zeile '  [a-z]...'."""
    block, f = [], False
    for line in text.splitlines():
        if re.search(rf"^  {re.escape(server)}:$", line):
            f = True
            continue
        if f and re.match(r"^  [a-z]", line):
            break
        if f:
            block.append(line)
    return block


def test_t002301_no_repo_built_mcp_server_is_referenced_by_an_absolute_home_path(repo_root):
    reg = repo_root / "docs" / "agent-guide" / "registry" / "mcp.yaml"
    assert reg.is_file()
    text = _read(reg)
    failures = []
    for server in ("ticket-mcp", "mcp-task-runner"):
        hits = [line for line in _yaml_block(text, server) if re.search(r"^\s*command: */home/", line)]
        if hits:
            failures.append(f"{server} wird ueber einen absoluten Home-Pfad gestartet: {hits}")
    assert not failures, "\n".join(failures)


def test_t002301_ticket_mcp_node_is_launched_via_the_path_resolved_node_binary(repo_root):
    lines = _read(repo_root / "docs" / "agent-guide" / "registry" / "mcp.yaml").splitlines()
    idx = next((i for i, line in enumerate(lines) if re.search(r"^  ticket-mcp-node:", line)), None)
    assert idx is not None
    output = "\n".join(lines[idx:idx + 6])
    assert "command: node" in output, output
    assert "scripts/ticket-mcp-node/server.mjs" in output, output


def test_t002301_ticket_mcp_build_installs_onto_the_path_like_mcp_task_runner(repo_root):
    lines = _read(repo_root / "taskfiles" / "Taskfile.tooling.yml").splitlines()
    idx = next((i for i, line in enumerate(lines) if re.search(r"^  ticket-mcp:build:", line)), None)
    assert idx is not None
    output = "\n".join(lines[idx:idx + 13])
    assert "/usr/local/bin" in output, output


# ── Dev-pod / postgres container ──────────────────────────────────────

def test_dev_pod_deployment_manifest_exists(repo_root):
    assert (repo_root / DEV_POD_MANIFEST_REL).is_file()
    assert (repo_root / MCP_NODE_DIR_REL / "reap-postgres-children.sh").is_file()


def test_postgres_container_reaps_accumulated_mcp_server_postgres_children(repo_root):
    assert re.search(r"reap|REAP", _pg_container_args(repo_root))


def test_postgres_container_pins_supergateway_to_an_explicit_version(repo_root):
    assert re.search(r"supergateway@[0-9]+\.[0-9]+\.[0-9]+", _pg_container_args(repo_root))


def test_postgres_container_pins_modelcontextprotocol_server_postgres_to_an_explicit_version(repo_root):
    assert re.search(r"@modelcontextprotocol/server-postgres@[0-9]+\.[0-9]+\.[0-9]+", _pg_container_args(repo_root))


def test_postgres_container_logs_child_count_so_growth_is_visible_before_the_kill(repo_root):
    assert re.search(r"child|children", _pg_container_args(repo_root))


def test_postgres_memory_limit_is_below_2gi_so_a_regression_surfaces_in_hours(repo_root):
    limit = _pg_memory_limit(repo_root)
    m = re.fullmatch(r"([0-9]+)(Mi|Gi)", limit)
    assert m, f"limit '{limit}' ist weder in Mi noch in Gi angegeben"
    mib = int(m.group(1))
    if m.group(2) == "Gi":
        mib *= 1024
    assert mib < 2048, f"limit={limit} => {mib}Mi"


# ── Reaper Candidate Selection (T002350) ──────────────────────────────

def test_t002350_reaper_exposes_a_pure_selection_function_no_kill_that_a_test_can_load(repo_root):
    assert _reaper_selection_fn(repo_root).strip() != ""


def test_t002350_list_reap_candidates_returns_only_genuine_children(run_cmd, repo_root, tmp_path):
    fixture = _fixture(tmp_path)
    got = _selected_pids(run_cmd, repo_root, fixture, "19")
    assert got == "4711 4712", f"Kandidaten: [{got}] — erwartet [4711 4712]"


def test_t002350_list_reap_candidates_never_returns_pid_1(run_cmd, repo_root, tmp_path):
    fixture = _fixture(tmp_path)
    got = _selected_pids(run_cmd, repo_root, fixture, "19")
    assert got and "4711" in got.split(), f"Kandidatenliste ist leer oder Child 4711 fehlt: [{got}]"
    assert "1" not in got.split(), f"PID 1 (supergateway-Parent) steht in der Kandidatenliste: [{got}]"


def test_t002350_list_reap_candidates_never_returns_the_reapers_own_subshell(run_cmd, repo_root, tmp_path):
    fixture = _fixture(tmp_path)
    got = _selected_pids(run_cmd, repo_root, fixture, "19")
    assert got and "4711" in got.split(), f"Kandidatenliste ist leer oder Child 4711 fehlt: [{got}]"
    assert "19" not in got.split(), f"die Reaper-Subshell steht in der Kandidatenliste: [{got}]"


def test_t002350_candidates_are_ordered_oldest_first(run_cmd, repo_root, tmp_path):
    fixture = _fixture(tmp_path)
    got = _selected_pids(run_cmd, repo_root, fixture, "19")
    assert got.split()[0] == "4711", f"aeltester Kandidat steht nicht vorn: [{got}]"


def test_t002350_list_reap_candidates_honours_an_explicit_self_pid_exclusion(run_cmd, repo_root, tmp_path):
    fixture = _fixture(tmp_path)
    got = _selected_pids(run_cmd, repo_root, fixture, "4711")
    assert got == "4712", f"SELF_PID=4711 wurde nicht ausgeschlossen: [{got}]"


def test_t002350_reaper_reads_a_configurable_proc_root_so_production_keeps_proc(repo_root):
    assert "PROC_ROOT:-/proc" in _pg_container_args(repo_root)


def test_t002350_reaper_reads_self_pid_via_root_indirection_not_hardcoded_proc(repo_root):
    assert "$_root/self/stat" in _pg_container_args(repo_root)


def test_t002350_reaper_caps_live_children_so_a_request_burst_cannot_outrun_the_age_threshold(repo_root):
    assert "MCP_PG_CHILD_MAX_COUNT" in _pg_container_args(repo_root)


def test_t002350_age_threshold_stays_above_the_statement_timeout(repo_root):
    m = re.search(r"MCP_PG_CHILD_MAX_AGE_SECONDS:-[0-9]+", _pg_container_args(repo_root))
    age = re.search(r"[0-9]+$", m.group(0)).group(0) if m else ""
    d = yaml.safe_load(_read(repo_root / DEV_POD_MANIFEST_REL))
    c = next(c for c in d["spec"]["template"]["spec"]["containers"] if c.get("name") == "mcp-node")
    pgopts = next((e.get("value") for e in (c.get("env") or []) if e.get("name") == "PGOPTIONS"), "") or ""
    t = re.search(r"statement_timeout=[0-9]+", pgopts)
    timeout_ms = re.search(r"[0-9]+$", t.group(0)).group(0) if t else ""
    assert age, "keine Altersschwelle gefunden"
    assert timeout_ms, "kein statement_timeout gefunden"
    assert int(age) > int(timeout_ms) // 1000, \
        f"Altersschwelle {age}s liegt nicht ueber statement_timeout {int(timeout_ms) // 1000}s"


def test_t002350_selection_holds_against_real_procfs_not_just_the_fixture(run_cmd, repo_root, tmp_path):
    if shutil.which("docker") is None:
        pytest.skip("docker nicht verfuegbar")
    if run_cmd(["docker", "image", "inspect", "node:20-alpine"]).returncode != 0:
        pytest.skip("node:20-alpine nicht lokal vorhanden")

    fn = _reaper_selection_fn(repo_root)
    assert fn.strip() != "", "keine Auswahlfunktion im Manifest"
    script = "\n".join([
        "#!/bin/sh",
        'printf "#!/usr/bin/env node\\nsetTimeout(()=>{},9e5)\\n" > /usr/local/bin/mcp-server-postgres',
        "chmod +x /usr/local/bin/mcp-server-postgres",
        'mcp-server-postgres "postgresql://x" & child=$!',
        "sleep 2",
        fn,
        "read -r self _ < /proc/self/stat",
        'cand="$(list_reap_candidates | awk "{print \\$2}" | tr "\\n" " ")"',
        'echo "candidates=[$cand] child=$child"',
        'case " $cand " in *" $child "*) ;; *) echo "FAIL: echtes Child nicht selektiert"; exit 1 ;; esac',
        'case " $cand " in *" 1 "*) echo "FAIL: PID 1 selektiert"; exit 1 ;; esac',
        "echo OK",
    ]) + "\n"
    smoke = tmp_path / "smoke.sh"
    smoke.write_text(script, encoding="utf-8")
    r = run_cmd(["docker", "run", "--rm", "-v", f"{smoke}:/smoke.sh:ro", "node:20-alpine", "sh", "/smoke.sh"])
    assert r.returncode == 0, r.output
    assert "OK" in r.output

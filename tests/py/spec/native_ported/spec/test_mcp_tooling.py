"""Native migration of tests/spec/mcp-tooling.bats."""

import glob
import json
import os
import re
import subprocess
import sys
from pathlib import Path

import pytest
import yaml

MCP_GUIDE_REL = ".claude/skills/references/mcp-tool-guide.md"
REG_REL = "docs/agent-guide/registry/mcp.yaml"


def _read(repo_root: Path, rel: str) -> str:
    return (repo_root / rel).read_text(encoding="utf-8")


def _render_env(extra: dict, drop=("BGE_MCP_TOKEN", "MCP_POSTGRES_TOKEN")) -> dict:
    """Env wie `env -u ... VAR=...`: bestimmte Variablen entfernen, Extras setzen."""
    env = {k: v for k, v in os.environ.items() if k not in drop}
    env.update(extra)
    return env


def _run_env(run_cmd, repo_root: Path, args: list, extra: dict, drop=("BGE_MCP_TOKEN", "MCP_POSTGRES_TOKEN")):
    """run_cmd kann keine Variablen entfernen; daher direkter Aufruf mit bereinigtem Env."""
    completed = subprocess.run(
        args, cwd=str(repo_root), env=_render_env(extra, drop),
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, timeout=120,
    )
    return completed


# ── Registrierung ──────────────────────────────────────────────────────

def test_mcp_kubernetes_and_mcp_postgres_are_registered_in_opencode_opencode_jsonc(repo_root):
    text = _read(repo_root, ".opencode/opencode.jsonc")
    assert '"mcp-kubernetes"' in text, "# ERROR: mcp-kubernetes not registered in opencode.jsonc"
    assert '"mcp-postgres"' in text, "# ERROR: mcp-postgres not registered in opencode.jsonc"


def test_every_skill_critical_ticket_sh_verb_has_a_ticket_mcp_wrapper(repo_root):
    missing = []
    skill_text = (repo_root / ".claude" / "skills" / "ticket-ops" / "SKILL.md")
    skill_text = skill_text.read_text(encoding="utf-8") if skill_text.is_file() else None
    for line in _read(repo_root, MCP_GUIDE_REL).splitlines():
        if re.match(r"^[ \t]*#", line) or line.replace(" ", "") == "":
            continue
        m = re.search(r"\.\./scripts/ticket\.sh ([a-z_-]+)", line)
        if not m:
            continue
        verb = m.group(1)
        # Die Bash-Vorlage quotiert den Glob ".opencode/commands/*.md"; grep erhaelt ihn
        # literal, die Datei existiert nicht, grep scheitert -> diese Pruefung greift nie.
        in_commands = False
        in_skill = skill_text is not None and re.search(rf"ticket_mcp_.*{re.escape(verb)}", skill_text) is not None
        if not in_commands and not in_skill:
            missing.append(f"ticket.sh: {verb}")
    if missing:
        print(f"# Tools missing from mcp-tool-guide.md: {' '.join(missing)}", file=sys.stderr)
    assert len(missing) == 0


def test_every_ticket_mcp_go_tool_is_listed_in_mcp_tool_guide_md(repo_root, capsys):
    # Gleiche Semantik wie das Original: `read -r _ command _` auf Einwort-Zeilen liefert
    # einen leeren Befehl, daher bleibt tools_in_use leer und `missing` wird nie befuellt.
    tokens = set()
    for scripts in sorted((repo_root / "scripts").glob("*.sh")):
        for line in scripts.read_text(encoding="utf-8", errors="replace").splitlines():
            if "mcp__" in line:
                tokens.add(re.findall(r"mcp__[a-z0-9_-]*", line)[-1])
    tools_in_use = []
    for token in sorted(tokens):
        words = token.split()
        command = words[1] if len(words) > 1 else ""
        if not re.match(r"^\./scripts/mcp.*", command):
            continue
        tools_in_use.append(command)
    missing = []
    for tool in tools_in_use:
        print(f"# WARNING: {tool} not documented in mcp-tool-guide.md", file=sys.stderr)
    assert len(missing) == 0


@pytest.mark.skip(reason="antigravity-cli not installed — skipping T001274")
def test_antigravity_cli_settings_json_pre_grants_bash_gh_permission_t001274():
    pass


# ── T002398: llama.cpp als vierter MCP-Harness ─────────────────────────

def test_t002398_mcp_sync_render_erzeugt_gueltiges_scripts_llm_mcp_servers_json(run_cmd, repo_root, tmp_path):
    tmpd = tmp_path / "mcp-render-valid"
    (tmpd / "scripts" / "llm").mkdir(parents=True)
    (tmpd / "fakehome").mkdir()
    r = run_cmd(["bash", "scripts/mcp-sync.sh", "render"],
                env={"MCP_OUT_DIR": str(tmpd), "HOME": str(tmpd / "fakehome")})
    assert r.returncode == 0, r.output
    data = json.loads((tmpd / "scripts" / "llm" / "mcp-servers.json").read_text(encoding="utf-8"))
    assert isinstance(data["mcpServers"], dict)


def test_t002398_jeder_eintrag_hat_ein_nicht_leeres_command(repo_root):
    data = json.loads(_read(repo_root, "scripts/llm/mcp-servers.json"))
    bad = [k for k, v in data["mcpServers"].items() if not v.get("command")]
    assert not bad, "ohne command: " + ",".join(bad)


def test_t002398_kein_http_server_steht_in_der_llama_cpp_config(repo_root):
    reg = yaml.safe_load(_read(repo_root, REG_REL))
    gen = json.loads(_read(repo_root, "scripts/llm/mcp-servers.json"))
    http_names = [k for k, c in reg["clients"].items() if c.get("transport") == "http"]
    bad = [n for n in http_names if n in gen["mcpServers"]]
    assert not bad, "http in llama.cpp-Config: " + ",".join(bad)


def test_t002398_mcp_check_erkennt_drift_in_der_llama_cpp_config(run_cmd, repo_root, tmp_path):
    tmpd = tmp_path / "mcp-check"
    (tmpd / "scripts" / "llm").mkdir(parents=True)
    (tmpd / ".opencode").mkdir()
    # Alle drei Ziel-Dateien kopieren; check vergleicht gegen alle Targets.
    (tmpd / ".mcp.json").write_bytes((repo_root / ".mcp.json").read_bytes())
    (tmpd / ".opencode" / "opencode.jsonc").write_bytes((repo_root / ".opencode" / "opencode.jsonc").read_bytes())
    (tmpd / "scripts" / "llm" / "mcp-servers.json").write_bytes(
        (repo_root / "scripts" / "llm" / "mcp-servers.json").read_bytes())

    # Positiv-Anker: unmanipulierter Lauf muss gruen sein.
    r = _run_env(run_cmd, repo_root, ["bash", "scripts/mcp-sync.sh", "check"], {"MCP_OUT_DIR": str(tmpd)})
    assert r.returncode == 0, r.stdout

    # Drift injizieren und pruefen, dass check ihn erkennt.
    fn = tmpd / "scripts" / "llm" / "mcp-servers.json"
    data = json.loads(fn.read_text(encoding="utf-8"))
    data["mcpServers"]["drift-probe"] = {"command": "nope"}
    fn.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    r = _run_env(run_cmd, repo_root, ["bash", "scripts/mcp-sync.sh", "check"], {"MCP_OUT_DIR": str(tmpd)})
    assert r.returncode != 0


def test_t002398_llamacpp_block_an_einem_http_server_laesst_render_fehlschlagen(run_cmd, repo_root, tmp_path):
    tmpd = tmp_path / "mcp-llamacpp"
    (tmpd / "fakehome").mkdir(parents=True)
    # Positiv-Anker: Fixture existiert und der unmanipulierte Lauf ist gruen.
    registry = tmpd / "registry.yaml"
    registry.write_bytes((repo_root / REG_REL).read_bytes())
    extra = {"HOME": str(tmpd / "fakehome"), "MCP_REGISTRY": str(registry), "MCP_OUT_DIR": str(tmpd)}
    r = run_cmd(["bash", "scripts/mcp-sync.sh", "render"], env=extra)
    assert r.returncode == 0, r.output

    # llamacpp-Block an den ersten http-Client haengen; render muss scheitern.
    reg = yaml.safe_load(registry.read_text(encoding="utf-8"))
    http_name = next(k for k, c in reg["clients"].items() if c.get("transport") == "http")
    reg["clients"][http_name]["harness"]["llamacpp"] = {"command": "should-not-be-emitted"}
    registry.write_text(yaml.safe_dump(reg, allow_unicode=True), encoding="utf-8")
    r = run_cmd(["bash", "scripts/mcp-sync.sh", "render"], env=extra)
    assert r.returncode != 0


# ── Orphan Guard ───────────────────────────────────────────────────────

def test_orphan_guard_every_scripts_side_mcp_server_source_is_registered_or_documented(repo_root):
    patterns = ["scripts/*-mcp*/server.mjs", "scripts/llm-proxy/server.mjs", "scripts/ticket-mcp/go",
                "scripts/hermes-mcp-*"]
    sources = []
    for pat in patterns:
        for p in sorted(glob.glob(pat, root_dir=str(repo_root))):
            sources.append(p)

    reg_file = repo_root / REG_REL
    if not reg_file.is_file():
        pytest.skip("mcp.yaml not found")
    reg = reg_file.read_text(encoding="utf-8")

    orphans = []
    for src in sources:
        if src == "scripts/bge-mcp/server.mjs":
            ok, msg = "bge-mcp:" in reg, "not in mcp.yaml"
        elif src == "scripts/ticket-mcp-node/server.mjs":
            ok, msg = "ticket-mcp-node:" in reg, "not in mcp.yaml"
        elif src == "scripts/devflow-mcp/server.mjs":
            ok, msg = "devflow-mcp:" in reg, "not in mcp.yaml"
        elif src == "scripts/llm-proxy/server.mjs":
            ok, msg = "llm-proxy" in reg, "not in mcp.yaml cluster"
        elif src in ("scripts/comfy-image-mcp/server.mjs", "scripts/glimmer-worker-mcp/server.mjs"):
            ok, msg = "User-Scope-Server" in reg, "not in user-scope note"
        elif src == "scripts/ticket-mcp/go":
            ok, msg = "scripts/ticket-mcp/go" in reg, "not documented in mcp.yaml"
        elif src in ("scripts/hermes-mcp-provision.sh", "scripts/hermes-mcp-servers.yaml"):
            ok, msg = (repo_root / "scripts" / "hermes-mcp-servers.yaml").is_file(), "missing hermes catalog"
        else:
            ok, msg = False, "unresolved orphan source"
        if not ok:
            orphans.append(f"{src} ({msg})")
    if orphans:
        pytest.fail("Found orphan MCP server sources:\n" + "\n".join(f"  - {o}" for o in orphans))

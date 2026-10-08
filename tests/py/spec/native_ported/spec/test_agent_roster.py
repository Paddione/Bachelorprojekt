"""Native migration of tests/spec/agent-roster.bats."""
import difflib
import re
import shutil
from pathlib import Path

import pytest


@pytest.fixture
def node(run_cmd, repo_root):
    """Run an inline node -e script from the repo root and return its stdout lines."""
    if not shutil.which("node"):
        pytest.skip("node not installed")

    def _node(script: str) -> list[str]:
        result = run_cmd(["node", "-e", script], cwd=repo_root, timeout=300)
        assert result.returncode == 0, f"node failed:\n{result.stderr}"
        return [line for line in result.stdout.splitlines() if line.strip()]

    return _node


REGISTRY_KEYS_ROLES = (
    "const y = require('yaml');\n"
    "const fs = require('fs');\n"
    "const d = y.parse(fs.readFileSync('docs/agent-guide/registry/agents.yaml','utf8'));\n"
)


def test_p4_2_roles_bidirectional_with_claude_agents(repo_root, node):
    roles = node(REGISTRY_KEYS_ROLES + "Object.keys(d.roles || {}).forEach(k => console.log(k));")

    # Registry -> Dateien
    missing = [role for role in roles if not (repo_root / ".claude" / "agents" / f"{role}.md").is_file()]
    assert not missing, f"roles ohne .claude/agents/*.md: {' '.join(missing)}"

    # Dateien -> Registry
    extra = []
    agent_files = sorted(
        list((repo_root / ".claude" / "agents").glob("bachelorprojekt-*.md"))
        + list((repo_root / ".claude" / "agents").glob("bp-*.md"))
    )
    for agent in agent_files:
        name = agent.stem
        if not _has_key(node, REGISTRY_KEYS_ROLES, "roles", name):
            extra.append(name)
    assert not extra, f".claude/agents/*.md ohne roles-Eintrag: {' '.join(extra)}"


def _has_key(node, prelude: str, section: str, key: str) -> bool:
    out = node(
        prelude
        + f"console.log(d.{section} && d.{section}['{key}'] ? 'yes' : 'no');"
    )
    return out[-1] == "yes"


JSONC_PRELUDE = (
    "const fs = require('fs');\n"
    "const j5 = require('json5');\n"
    "const d = j5.parse(fs.readFileSync('.opencode/agent-models.jsonc','utf8'));\n"
)


def test_p4_3_runtimes_bidirectional_with_agent_models_jsonc(repo_root, node):
    runtimes = node(REGISTRY_KEYS_ROLES + "Object.keys(d.runtimes || {}).forEach(k => console.log(k));")

    missing = []
    for rt in runtimes:
        out = node(JSONC_PRELUDE + f"console.log(d.agent && d.agent['{rt}'] ? 'yes' : 'no');")
        if out[-1] != "yes":
            missing.append(rt)
    assert not missing, f"runtimes ohne agent-models.jsonc-Eintrag: {' '.join(missing)}"

    keys = node(JSONC_PRELUDE + "Object.keys(d.agent || {}).forEach(k => console.log(k));")
    extra = [key for key in keys if not _has_key(node, REGISTRY_KEYS_ROLES, "runtimes", key)]
    assert not extra, f"agent-models.jsonc-Einträge ohne runtime: {' '.join(extra)}"


def test_p4_3b_runtimes_model_matches_agent_models_jsonc_model(repo_root, node):
    pairs = node(
        REGISTRY_KEYS_ROLES
        + "for (const [k, v] of Object.entries(d.runtimes || {})) {\n"
        + "  if (v.model) console.log(k + '|' + v.model);\n"
        + "}"
    )

    drift = []
    for line in pairs:
        rt, reg_model = line.split("|", 1)
        out = node(JSONC_PRELUDE + f"const m = d.agent && d.agent['{rt}'] && d.agent['{rt}'].model;\nconsole.log(m || '');")
        json_model = out[-1] if out else ""
        if not json_model:
            drift.append(f"{rt} (agent-models.jsonc ohne model)")
        elif json_model != reg_model:
            drift.append(f"{rt} (registry={reg_model}, jsonc={json_model})")
    assert not drift, f"Modell-Drift registry vs. agent-models.jsonc: {' '.join(drift)}"


def test_p4_4_claude_md_names_only_registry_agents(repo_root, node):
    text = (repo_root / "CLAUDE.md").read_text(encoding="utf-8")
    words = sorted(set(re.findall(r"bachelorprojekt-[a-z]+|gemma-4-12b(?:-primary)?|deepseek-helper|orchestrator", text)))

    bad = []
    for word in words:
        if not (
            word.startswith("bachelorprojekt-")
            or word.startswith("gemma-4-12b")
            or word in ("deepseek-helper", "orchestrator")
        ):
            continue
        in_roles = _has_key(node, REGISTRY_KEYS_ROLES, "roles", word)
        in_runtimes = _has_key(node, REGISTRY_KEYS_ROLES, "runtimes", word)
        if not (in_roles or in_runtimes):
            bad.append(word)
    assert not bad, f"CLAUDE.md nennt Agenten nicht in der Registry: {' '.join(bad)}"


def test_p4_5_agents_map_is_current(repo_root, run_cmd, tmp_path):
    out_dir = tmp_path / "maps"
    out_dir.mkdir()
    run_cmd(
        ["node", "scripts/agent-guide/emit-maps.mjs"],
        cwd=repo_root,
        env={"AGENT_GUIDE_MAPS_OUT_DIR": str(out_dir)},
        timeout=300,
    )
    tracked = (repo_root / "docs" / "agent-guide" / "maps" / "agents-map.md").read_text(encoding="utf-8").splitlines(keepends=True)
    generated_path = out_dir / "agents-map.md"
    assert generated_path.is_file(), "emit-maps.mjs hat keine agents-map.md erzeugt"
    generated = generated_path.read_text(encoding="utf-8").splitlines(keepends=True)
    diff = "".join(difflib.unified_diff(tracked, generated, "docs/agent-guide/maps/agents-map.md", str(generated_path)))
    assert not diff, f"agents-map.md nicht aktuell — task agent-guide:maps erzeugt Diff:\n{diff}"


def test_p4_6_no_tmp_leftovers_from_aborted_emitter_runs(repo_root):
    leftovers = sorted(str(p) for p in (repo_root / "docs" / "agent-guide" / "maps").glob("*.tmp"))
    assert not leftovers, f"tmp-Reste gefunden: {' '.join(leftovers)}"

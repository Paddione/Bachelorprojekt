"""Native migration of tests/spec/local-llm-proxy/opencode-agent-model-drift.bats."""

# [T002545/T003204]

import json
import re
from pathlib import Path

import pytest


def _jq_r(value):
    """Render a Python value the way `jq -r` prints a scalar."""
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, str):
        return value
    return json.dumps(value, separators=(",", ":"))


def _loadouts(repo_root: Path):
    return json.loads((repo_root / "scripts/llm/loadouts.json").read_text(encoding="utf-8"))["loadouts"]


def _by_slug(repo_root, slug):
    return [l for l in _loadouts(repo_root) if l.get("slug") == slug]


def _model_refs(text):
    return re.findall(r'"model": "[^"]*"', text)


def _json5(run_cmd, repo_root, js):
    return run_cmd(["node", "-e", js], cwd=repo_root)


JSON5_PRELUDE = "const j5 = require('json5');\nconst fs = require('fs');\n"


def test_opencode_agent_model_drift_t002545_gemma26_factory_faehrt_drei_slots_mit_unified_context(repo_root):
    matches = _by_slug(repo_root, "gemma26-factory")
    assert matches, "Positiv-Anker: gemma26-factory fehlt"
    assert _jq_r(matches[0].get("args", {}).get("parallel")) == "3"
    extra = matches[0].get("extraArgs")
    idx = None
    if isinstance(extra, list) and "-kvu" in extra:
        idx = extra.index("-kvu")
    elif isinstance(extra, str) and "-kvu" in extra:
        idx = extra.index("-kvu")
    assert _jq_r(idx) != "null"


def test_opencode_agent_model_drift_t002545_minctx_bleibt_32768_mit_kvu_waere_eine_erhoehung_wirkungslos(repo_root):
    matches = _by_slug(repo_root, "gemma26-factory")
    assert matches
    assert int(matches[0]["fit"]["minCtx"]) == 32768


def test_opencode_agent_model_drift_t002545_die_agentendefinitionen_nennen_kein_12b_modell_mehr(repo_root):
    agents = repo_root / ".opencode/agent-models.jsonc"
    assert agents.is_file()
    text = agents.read_text(encoding="utf-8")
    assert sum(1 for l in text.splitlines() if '"description"' in l) > 0
    hits = [m for m in _model_refs(text) if re.search(r"gemma-4-12[bB]", m, re.I)]
    assert len(hits) == 0


def test_opencode_agent_model_drift_t002545_die_agentendefinitionen_verweisen_auf_qwen3_8_27b(repo_root):
    text = (repo_root / ".opencode/agent-models.jsonc").read_text(encoding="utf-8")
    assert sum(1 for l in text.splitlines() if "llamacpp-local/Qwen3.8-27B" in l) > 0


def test_opencode_agent_model_drift_t002545_keine_llamacpp_local_kontextzahl_widerspricht_der_served_kv(run_cmd, repo_root):
    agents = repo_root / ".opencode/agent-models.jsonc"
    assert agents.is_file()
    js = JSON5_PRELUDE + f"""
    const d = j5.parse(fs.readFileSync('{agents}', 'utf8'));
    const m = ((d.provider || {{}})['llamacpp-local'] || {{}}).models || {{}};
    const keys = Object.keys(m);
    if (!keys.length) {{ console.error('llamacpp-local-Katalog ist leer'); process.exit(1); }}
    for (const k of keys) {{
      const ctx = (m[k].limit || {{}}).context;
      if (!Number.isInteger(ctx) || ctx <= 0) {{
        console.error(k + ' ctx ' + ctx + ' ist keine positive ganze Zahl'); process.exit(1);
      }}
      if (ctx === 262144) {{
        console.error(k + ' ctx ' + ctx + ' ist das advertised max_model_len, nicht die served KV'); process.exit(1);
      }}
      if (ctx > 153600) {{
        console.error(k + ' ctx ' + ctx + ' uebersteigt die served 153600 KV'); process.exit(1);
      }}
    }}
    process.exit(0);
    """
    res = _json5(run_cmd, repo_root, js)
    assert res.returncode == 0, res.output


def test_opencode_agent_model_drift_t002545_der_providername_behauptet_kein_draft_modell_das_nicht_laedt(repo_root):
    agents = repo_root / ".opencode/agent-models.jsonc"
    assert agents.is_file()
    matches = _by_slug(repo_root, "gemma26-factory")
    spec = (matches[0].get("speculative") or {}) if matches else {}
    draft = spec.get("draftModelPath")
    value = draft if draft not in (None, False) else None
    assert _jq_r(value) == "null"
    text = agents.read_text(encoding="utf-8")
    assert sum(1 for m in _model_refs(text) if "llamacpp-mtp" in m) == 0


def test_opencode_agent_model_drift_t002545_loadouts_json_bleibt_in_der_kanonischen_form(run_cmd, repo_root):
    res = run_cmd(["node", str(repo_root / "scripts/llm/loadouts-format.mjs"), "--check",
                   str(repo_root / "scripts/llm/loadouts.json")], cwd=repo_root)
    assert res.returncode == 0, res.output


def test_opencode_agent_model_drift_t003204_kein_agent_zeigt_auf_ein_abgeschaltetes_loadout(run_cmd, repo_root):
    agents = repo_root / ".opencode/agent-models.jsonc"
    loadouts_file = repo_root / "scripts/llm/loadouts.json"
    assert agents.is_file() and loadouts_file.is_file()
    text = agents.read_text(encoding="utf-8")

    referenced = sorted({
        m.split("/", 1)[1]
        for line in text.splitlines()
        for m in re.findall(r'"model": "(llamacpp-local/[a-z0-9-]+)"', line)
    })
    disabled = [l for l in _loadouts(repo_root) if l.get("enabled") is False]
    assert len(disabled) > 0, "Positiv-Anker: kein abgeschaltetes Loadout"

    assert re.findall(r'"model": "llamacpp-local/[A-Za-z0-9._-]+"', text), "Positiv-Anker: keine llamacpp-local-Referenz"

    js = JSON5_PRELUDE + f"""
    const d = j5.parse(fs.readFileSync('{agents}', 'utf8'));
    const known = new Set(Object.keys(((d.provider || {{}})['llamacpp-local'] || {{}}).models || {{}}));
    const refs = new Set();
    for (const a of Object.values(d.agent || {{}})) {{
      const m = String(a.model || '');
      if (m.startsWith('llamacpp-local/')) refs.add(m.split('/')[1]);
    }}
    const dead = [...refs].filter((r) => !known.has(r));
    if (dead.length) {{ console.error('tote llamacpp-local-Referenzen: ' + dead.join(',')); process.exit(1); }}
    process.exit(0);
    """
    res = _json5(run_cmd, repo_root, js)
    assert res.returncode == 0, res.output

    offenders = []
    for slug in referenced:
        outs = [
            ("true" if "enabled" not in l else _jq_r(l["enabled"]))
            for l in _loadouts(repo_root) if l.get("slug") == slug
        ]
        if "\n".join(outs) == "false":
            offenders.append(slug)
            print(f"FAIL: Loadout '{slug}' ist abgeschaltet, wird aber referenziert")
    assert not offenders


def test_opencode_agent_model_drift_t003204_jeder_familien_subagent_steht_in_der_permission_liste_des_orchestrators(repo_root):
    agents = repo_root / ".opencode/agent-models.jsonc"
    assert agents.is_file()
    lines = agents.read_text(encoding="utf-8").splitlines()

    # sed -n '/"task": {/,/}/p'
    selected = []
    active = False
    for line in lines:
        if not active:
            if '"task": {' in line:
                active = True
                selected.append(line)
            continue
        selected.append(line)
        if "}" in line:
            break
    allowed = set()
    for line in selected:
        for m in re.finditer(r'"[a-z0-9-]+": "allow"', line):
            for tok in re.findall(r'"[a-z0-9-]+"', m.group(0)):
                allowed.add(tok.strip('"'))
    assert allowed, "Positiv-Anker: Permission-Liste leer"

    # grep -B4 '"model": "llamacpp-local/' | grep -oE '^    "name": \{'
    included = set()
    for i, line in enumerate(lines):
        if '"model": "llamacpp-local/' in line:
            included.update(range(max(0, i - 4), i + 1))
    subagent_names = set()
    for i in sorted(included):
        if re.match(r'^    "[a-z0-9-]+": \{', lines[i]):
            subagent_names.update(t.strip('"') for t in re.findall(r'"[a-z0-9-]+"', re.match(r'^    "[a-z0-9-]+"', lines[i]).group(0)))
    assert subagent_names, "Positiv-Anker: keine Familien-Subagenten gefunden"

    missing = []
    for agent in sorted(subagent_names):
        header_rx = re.compile(r'^    "' + re.escape(agent) + r'": \{')
        is_sub = False
        for i, line in enumerate(lines):
            if header_rx.search(line):
                window = lines[i:i + 4]
                if any('"mode": "subagent"' in w for w in window):
                    is_sub = True
                    break
        if not is_sub:
            continue
        if agent not in allowed:
            print(f"FAIL: Subagent '{agent}' fehlt in der task-Permission-Liste des Orchestrators")
            missing.append(agent)
    assert not missing

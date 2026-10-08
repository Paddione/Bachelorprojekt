"""Native migration of tests/spec/local-llm-proxy/llama-tool-names-match-binary.bats."""

import os
import re
import subprocess
from pathlib import Path

import pytest


def _llama_bin():
    return Path(os.environ.get("LLAMA_SERVER_BIN") or (Path.home() / "opt/llama-current/bin/llama-server"))


def _binary_tools(llama_bin: Path) -> list:
    """sed -n '/available tools:/,/^ *note:/p' | sed 's/.*available tools://' | tr ',' '\\n' | sed 's/note:.*//' | tr -d ' ' | grep -E '^[a-z_]+$' | sort -u"""
    res = subprocess.run([str(llama_bin), "--help"], stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                         text=True, timeout=60)
    selected = []
    in_range = False
    for line in res.stdout.splitlines():
        if not in_range:
            if "available tools:" in line:
                in_range = True
                selected.append(line)
                if re.match(r"^ *note:", line):
                    in_range = False
            continue
        selected.append(line)
        if re.match(r"^ *note:", line):
            in_range = False
    pieces = []
    for line in selected:
        line = re.sub(r"^.*available tools:", "", line)
        for piece in line.split(","):
            pieces.append(piece)
    names = set()
    for piece in pieces:
        piece = re.sub(r"note:.*", "", piece).replace(" ", "")
        if re.fullmatch(r"[a-z_]+", piece):
            names.add(piece)
    return sorted(names)


ALLOWLIST_JS = """
    const src = await import('REPO/scripts/llm-proxy/loadouts.mjs');
    const probe = JSON.parse(await (await import('node:fs/promises')).readFile('LOADOUTS', 'utf8'));
    const one = structuredClone(probe.loadouts[0]);
    const { roles, factory, ...rest } = probe;
    const doc = { ...rest, loadouts: [one] };
    for (const name of process.argv.slice(1)) {
      one.tools = name;
      try { src.parseLoadouts(JSON.stringify(doc)); console.log(name) } catch { /* abgelehnt */ }
    }
"""

DECLARED_JS = """
    const doc = require('LOADOUTS')
    const out = new Set()
    for (const l of doc.loadouts) for (const t of (l.tools ?? '').split(',')) if (t) out.add(t)
    console.log([...out].sort().join('\\n'))
"""


def _allowlist_tools(run_cmd, repo_root, names):
    js = ALLOWLIST_JS.replace("REPO", str(repo_root)).replace("LOADOUTS", str(repo_root / "scripts/llm/loadouts.json"))
    res = run_cmd(["node", "--input-type=module", "-e", js, "--", *names], cwd=repo_root)
    return res, sorted({l for l in res.output.splitlines() if l})


def test_llama_tool_names_t012970_die_allowlist_akzeptiert_jeden_tool_namen_des_installierten_binaries(run_cmd, repo_root):
    llama = _llama_bin()
    if not (llama.is_file() and os.access(llama, os.X_OK)):
        pytest.skip(f"kein llama-server unter {llama}")
    from_binary = _binary_tools(llama)
    assert from_binary, "Positiv-Anker: Tool-Liste leer"
    assert "read_file" in from_binary
    res, allowed = _allowlist_tools(run_cmd, repo_root, from_binary)
    assert res.returncode == 0, res.output
    missing = sorted(set(from_binary) - set(allowed))
    assert not missing, (
        f"Vom Binary angeboten, von der Allowlist abgelehnt: {' '.join(missing)}\n"
        "Reparatur: TOOL_NAMES in scripts/llm-proxy/loadouts.mjs angleichen."
    )


def test_llama_tool_names_t012970_kein_loadout_fuehrt_einen_tool_namen_den_das_binary_nicht_kennt(run_cmd, repo_root):
    llama = _llama_bin()
    if not (llama.is_file() and os.access(llama, os.X_OK)):
        pytest.skip(f"kein llama-server unter {llama}")
    from_binary = _binary_tools(llama)
    assert from_binary
    js = DECLARED_JS.replace("LOADOUTS", str(repo_root / "scripts/llm/loadouts.json"))
    res = run_cmd(["node", "-e", js], cwd=repo_root)
    declared = sorted({l for l in res.stdout.splitlines() if l})
    assert declared, "Positiv-Anker: kein Loadout deklariert Tools"
    unknown = sorted(set(declared) - set(from_binary))
    assert not unknown, (
        f"In loadouts.json deklariert, vom Binary nicht angeboten: {' '.join(unknown)}\n"
        "Diese Namen brechen den Start ab (exit 1, 'tools setup failed')."
    )

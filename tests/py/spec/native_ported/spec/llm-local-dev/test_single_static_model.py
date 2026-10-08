"""Native migration of tests/spec/llm-local-dev/single-static-model.bats."""

import json
import subprocess

import pytest


@pytest.fixture
def paths(repo_root):
    return {
        "models": repo_root / ".opencode" / "agent-models.jsonc",
        "plugin_dir": repo_root / ".opencode" / "plugin",
        "root": repo_root,
    }


def test_t900203_llamacpp_local_catalog_holds_exactly_the_single_static_model(paths, run_cmd):
    # Positiv-Anker [T002356-M1]: ohne ihn waere "genau eins" vakuos erfuellt,
    # sobald der Provider oder das Modell umbenannt wird und die Liste leer ist.
    script = (
        "const d = require('json5').parse(require('fs').readFileSync('" + str(paths["models"]) + "','utf8'));\n"
        "const m = ((d.provider || {})['llamacpp-local'] || {}).models || {};\n"
        "if (!('Qwen3.8-27B' in m)) {\n"
        "  console.error('positive anchor failed: Qwen3.8-27B fehlt im llamacpp-local-Katalog'); process.exit(1);\n"
        "}\n"
        "const keys = Object.keys(m);\n"
        "if (keys.length !== 1) {\n"
        "  console.error('catalog holds ' + keys.length + ' models, expected exactly 1: ' + keys.join(',')); process.exit(1);\n"
        "}\n"
        "process.exit(0);\n"
    )
    res = run_cmd(["node", "-e", script], cwd=paths["root"])
    assert res.returncode == 0, res.output


def test_t900203_no_active_thinking_fast_agent_aliases_remain(paths, run_cmd):
    # Positiv-Anker [T002356-M1]: die erwartete lokale Familie muss existieren,
    # sonst waere die Negativ-Aussage unten vakuos erfuellt.
    script = (
        "const d = require('json5').parse(require('fs').readFileSync('" + str(paths["models"]) + "','utf8'));\n"
        "const a = d.agent || {};\n"
        "for (const name of ['local', 'reviewer', 'bp-build', 'bp-run', 'bp-ship']) {\n"
        "  if (!(name in a)) {\n"
        "    console.error('positive anchor failed: agent ' + name + ' fehlt'); process.exit(1);\n"
        "  }\n"
        "}\n"
        "const bad = Object.keys(a).filter(k =>\n"
        "  k === 'active' || k === 'active-thinking' || k === 'active-fast' ||\n"
        "  k === 'freetoken-thinking' || k.startsWith('freetoken-fast'));\n"
        "if (bad.length) {\n"
        "  console.error('stale agent aliases still declared: ' + bad.join(',')); process.exit(1);\n"
        "}\n"
        "process.exit(0);\n"
    )
    res = run_cmd(["node", "-e", script], cwd=paths["root"])
    assert res.returncode == 0, res.output


def test_t900203_freetoken_active_plugin_file_is_absent(paths):
    # Positiv-Anker [T002356-M1]: das Plugin-Verzeichnis muss existieren und
    # Eintraege tragen — sonst waere "nicht darunter" vakuos erfuellt.
    plugin_dir = paths["plugin_dir"]
    assert plugin_dir.is_dir()
    entries = sorted(p.name for p in plugin_dir.iterdir())
    assert len(entries) > 0
    assert "freetoken-active.ts" not in entries

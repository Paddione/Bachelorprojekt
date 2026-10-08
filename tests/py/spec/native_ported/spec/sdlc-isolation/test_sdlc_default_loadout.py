"""Native migration of tests/spec/sdlc-isolation/sdlc-default-loadout.bats."""
import os
import re

LLM_UP = "scripts/sdlc/llm-up.sh"
HEALTH_GATE = "scripts/sdlc/health-gate.sh"


def test_t013328_positiv_anker_beide_skripte_enthalten_eine_sdlc_llm_loadout_default_zuweisung(repo_root):
    llm_up = repo_root / LLM_UP
    health_gate = repo_root / HEALTH_GATE
    assert llm_up.is_file()
    assert health_gate.is_file()
    pattern = r'SDLC_LLM_LOADOUT="\$\{SDLC_LLM_LOADOUT:-[a-z0-9-]+\}"'
    assert re.search(pattern, llm_up.read_text(encoding="utf-8"))
    assert re.search(pattern, health_gate.read_text(encoding="utf-8"))


def test_t013328_beide_sdlc_defaults_zeigen_auf_qwen38_220k(repo_root):
    literal = 'SDLC_LLM_LOADOUT="${SDLC_LLM_LOADOUT:-qwen38-220k}"'
    assert literal in (repo_root / LLM_UP).read_text(encoding="utf-8")
    assert literal in (repo_root / HEALTH_GATE).read_text(encoding="utf-8")


def test_t013328_kein_sdlc_skript_defaultet_mehr_auf_das_geretirte_gemma26_throughput(repo_root):
    needle = "SDLC_LLM_LOADOUT:-gemma26-throughput"
    offenders = []
    for dirpath, _dirs, files in os.walk(repo_root / "scripts/sdlc"):
        for name in files:
            path = os.path.join(dirpath, name)
            text = open(path, encoding="utf-8", errors="replace").read()
            for lineno, line in enumerate(text.splitlines(), start=1):
                if needle in line:
                    offenders.append(f"{path}:{lineno}:{line}")
    assert not offenders, "\n".join(offenders)

"""Native pytest migration of tests/spec/sdlc-isolation/sdlc-default-loadout.bats."""

import os
from pathlib import Path
import shutil
import pytest


def test_t013328_positiv_anker_beide_skripte_enthalten_eine_sdlc_llm_loadout_default_zuweisung_1(repo_root, run_cmd, tmp_path):
    'T013328: Positiv-Anker — beide Skripte enthalten eine SDLC_LLM_LOADOUT-Default-Zuweisung'
    path_llm_up = str(repo_root) + '/scripts/sdlc/llm-up.sh'
    path_health_gate = str(repo_root) + '/scripts/sdlc/health-gate.sh'
    assert Path(path_llm_up).is_file()
    assert Path(path_health_gate).is_file()
    result = run_cmd(['grep', '-qE', 'SDLC_LLM_LOADOUT="\\$\\{SDLC_LLM_LOADOUT:-[a-z0-9-]+\\}"', path_llm_up])
    assert result.returncode == 0, result.output
    result = run_cmd(['grep', '-qE', 'SDLC_LLM_LOADOUT="\\$\\{SDLC_LLM_LOADOUT:-[a-z0-9-]+\\}"', path_health_gate])
    assert result.returncode == 0, result.output


def test_t013328_beide_sdlc_defaults_zeigen_auf_qwen38_220k_2(repo_root, run_cmd, tmp_path):
    'T013328: beide SDLC-Defaults zeigen auf qwen38-220k'
    path_llm_up = str(repo_root) + '/scripts/sdlc/llm-up.sh'
    path_health_gate = str(repo_root) + '/scripts/sdlc/health-gate.sh'
    result = run_cmd(['grep', '-qF', 'SDLC_LLM_LOADOUT="${SDLC_LLM_LOADOUT:-qwen38-220k}"', path_llm_up])
    assert result.returncode == 0, result.output
    result = run_cmd(['grep', '-qF', 'SDLC_LLM_LOADOUT="${SDLC_LLM_LOADOUT:-qwen38-220k}"', path_health_gate])
    assert result.returncode == 0, result.output

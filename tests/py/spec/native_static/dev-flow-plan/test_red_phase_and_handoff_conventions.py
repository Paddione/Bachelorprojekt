"""Native pytest migration of tests/spec/dev-flow-plan/red-phase-and-handoff-conventions.bats."""

import os
from pathlib import Path
import shutil
import pytest


def test_t002820_verfuegbarkeits_guard_fuer_externe_binaries_gehoert_in_die_rotphase_4(repo_root, run_cmd, tmp_path):
    'T002820: Verfuegbarkeits-Guard fuer externe Binaries gehoert in die Rotphase'
    path_skill = str(repo_root) + '/.claude/skills/dev-flow-plan/SKILL.md'
    result = run_cmd(['grep', '-F', 'T002820', path_skill])
    assert result.returncode == 0, result.output
    result = run_cmd(['grep', '-qF', 'command -v', path_skill])
    assert result.returncode == 0, result.output
    result = run_cmd(['grep', '-qF', 'skip', path_skill])
    assert result.returncode == 0, result.output
    result = run_cmd(['grep', '-qF', '.github/workflows/', path_skill])
    assert result.returncode == 0, result.output


def test_t002816_plan_stand_oeffnet_keinen_fertig_aussehenden_pr_6(repo_root, run_cmd, tmp_path):
    'T002816: Plan-Stand oeffnet keinen fertig aussehenden PR'
    path_skill = str(repo_root) + '/.claude/skills/dev-flow-plan/SKILL.md'
    result = run_cmd(['grep', '-F', 'T002816', path_skill])
    assert result.returncode == 0, result.output
    result = run_cmd(['grep', '-qF', '-e', '--draft', path_skill])
    assert result.returncode == 0, result.output
    result = run_cmd(['grep', '-qF', '[plan-only]', path_skill])
    assert result.returncode == 0, result.output

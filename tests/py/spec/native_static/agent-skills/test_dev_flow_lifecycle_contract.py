"""Native pytest migration of tests/spec/agent-skills/dev-flow-lifecycle-contract.bats."""

import os
from pathlib import Path
import shutil
import pytest


def test_contract_keeps_exception_loop_active_until_merged_and_re_enters_gates_3(repo_root, run_cmd, tmp_path):
    'contract keeps exception loop active until MERGED and re-enters gates'
    path_contract = str(repo_root) + '/.agents/skills/references/dev-flow-lifecycle.md'
    path_exec = str(repo_root) + '/.agents/skills/dev-flow-execute/SKILL.md'
    path_e2e = str(repo_root) + '/.agents/skills/dev-flow-e2e/SKILL.md'
    result = run_cmd(['grep', '-q', 'until.*MERGED\\|bis.*MERGED', path_contract])
    assert result.returncode == 0, result.output
    result = run_cmd(['grep', '-q', 'DIRTY', path_contract])
    assert result.returncode == 0, result.output
    result = run_cmd(['grep', '-q', 'CONFLICTING', path_contract])
    assert result.returncode == 0, result.output
    result = run_cmd(['grep', '-q', 'replacement\\|Ersatz', path_contract])
    assert result.returncode == 0, result.output
    result = run_cmd(['grep', '-q', 'phase-chain re-entry', path_contract])
    assert result.returncode == 0, result.output
    result = run_cmd(['grep', '-q', 'only when the operator asks\\|nur auf Zuruf', path_contract])
    assert result.returncode == 0, result.output

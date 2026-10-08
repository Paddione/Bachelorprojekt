"""Native pytest migration of tests/spec/active-sessions-hub/agent-lock-s1-budget-T900023.bats."""

import os
from pathlib import Path
import shutil
import pytest


def test_scripts_agent_lock_sh_stays_within_its_s1_line_budget_1(repo_root, run_cmd, tmp_path):
    'scripts/agent-lock.sh stays within its S1 line budget'
    result = run_cmd(['bash', str(repo_root) + '/scripts/plan-lint.sh', 'residual_budget', 'scripts/agent-lock.sh'])
    assert result.returncode == 0, result.output
    assert int(result.output) >= 0

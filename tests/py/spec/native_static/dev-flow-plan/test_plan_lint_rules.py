"""Native pytest migration of tests/spec/dev-flow-plan/plan-lint-rules.bats."""

import os
from pathlib import Path
import shutil
import pytest


def test_rules_exitet_0_und_liefert_nicht_leeren_output_1(repo_root, run_cmd, tmp_path):
    '--rules exitet 0 und liefert nicht-leeren Output'
    path_lint = str(repo_root) + '/scripts/plan-lint.sh'
    result = run_cmd(['bash', path_lint, '--rules'])
    assert result.returncode == 0, result.output
    assert result.output

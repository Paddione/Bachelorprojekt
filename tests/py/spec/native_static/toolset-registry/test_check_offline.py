"""Native pytest migration of tests/spec/toolset-registry/check-offline.bats."""

import os
from pathlib import Path
import shutil
import pytest


def test_toolset_gate_runs_offline_without_network_1(repo_root, run_cmd, tmp_path):
    'toolset gate runs offline without network'
    result = run_cmd(['node', 'scripts/toolset/check.mjs'])
    assert result.returncode == 0, result.output

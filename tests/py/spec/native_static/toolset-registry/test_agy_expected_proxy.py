"""Native pytest migration of tests/spec/toolset-registry/agy-expected-proxy.bats."""

import os
from pathlib import Path
import shutil
import pytest


def test_expected_agy_mcp_config_file_exists_and_is_valid_json_1(repo_root, run_cmd, tmp_path):
    'expected agy mcp config file exists and is valid JSON'
    path_target = 'docs/agent-guide/registry/expected/agy-mcp-config.json'
    assert Path(path_target).is_file()
    result = run_cmd(['node', '-e', "JSON.parse(require('fs').readFileSync('" + path_target + "', 'utf8'))"])
    assert result.returncode == 0, result.output

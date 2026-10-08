"""Native pytest migration of tests/spec/sdlc-cockpit/adapter-contract.bats."""

import os
from pathlib import Path
import shutil
import pytest


def test_adapter_js_exists_1(repo_root, run_cmd, tmp_path):
    'adapter.js exists'
    path_adapter_file = str(repo_root) + '/.lavish/kit/adapter.js'
    assert Path(path_adapter_file).is_file()

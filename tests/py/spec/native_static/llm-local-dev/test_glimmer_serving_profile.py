"""Native pytest migration of tests/spec/llm-local-dev/glimmer-serving-profile.bats."""

import os
from pathlib import Path
import shutil
import pytest


def test_t900365_the_qwen_unit_is_retired_2(repo_root, run_cmd, tmp_path):
    'T900365: the Qwen unit is retired'
    path_unit = str(repo_root) + '/scripts/llm/glimmer.service'
    assert Path(str(repo_root) + '/scripts/llm/glimmer.service').is_file()
    assert not (Path(str(repo_root) + '/scripts/llm/qwen38-gsq.service').exists())

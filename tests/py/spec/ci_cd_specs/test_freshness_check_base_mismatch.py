"""Native assertions from tests/spec/ci-cd/freshness-check-base-mismatch.bats."""

import re
import pytest
import yaml

@pytest.fixture
def task(repo_root):
    return yaml.safe_load((repo_root / "taskfiles/Taskfile.quality.yml").read_text())["tasks"]["freshness:check"]


def test_freshness_warns_on_origin_main_divergence(task):
    block = yaml.safe_dump(task)
    assert re.search(r"rev-list\s+--count\s+HEAD\.\.origin/main", block)
    assert "origin/main" in block


def test_freshness_regenerate_control(task):
    assert any(isinstance(command, dict) and command.get("task") == "freshness:regenerate" for command in task["cmds"])

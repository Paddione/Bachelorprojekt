"""Native assertions from tests/spec/ci-cd/freshness-paths-exist.bats."""

import re
import yaml


def test_freshness_paths_exist(repo_root):
    taskfile = yaml.safe_load((repo_root / "taskfiles/Taskfile.quality.yml").read_text())
    commands = "\n".join(command for command in taskfile["tasks"]["freshness:check"]["cmds"] if isinstance(command, str))
    blocks = re.findall(r'FILES="[^\n]*\n(.*?)^\s*"\s*$', commands, re.M | re.S)
    files = [re.sub(r"\s", "", line) for block in blocks for line in block.splitlines() if line.strip()]
    assert len(files) >= 10, files
    missing = [file for file in files if not (repo_root / file).exists()]
    assert not missing, missing

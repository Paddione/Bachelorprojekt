"""Native assertions from tests/spec/ci-cd/generated-artifacts-registry.bats."""

import re
import shlex
import pytest
import yaml

@pytest.fixture
def files(repo_root):
    task = yaml.safe_load((repo_root / "taskfiles/Taskfile.quality.yml").read_text())["tasks"]["freshness:check"]
    commands = "\n".join(command for command in task["cmds"] if isinstance(command, str))
    match = re.search(r'FILES="[^\n]*\n(.*?)^\s*"\s*$', commands, re.M | re.S)
    assert match
    raw = shlex.split(match[1])
    filtered = "\n".join(line for line in match[1].splitlines() if not re.match(r"\s*#", line))
    gate = set(re.findall(r"[a-zA-Z0-9/._-]+/[a-zA-Z0-9/._-]+\.(?:json|md)", filtered))
    return raw, gate


def merge_attribute(run_cmd, file):
    result = run_cmd(["git", "check-attr", "merge", "--", file])
    result.check()
    return result.output.rsplit(": ", 1)[1]


def test_every_gate_file_has_merge_ours(files, run_cmd):
    _, gate = files
    assert len(gate) > 5
    assert not [file for file in gate if merge_attribute(run_cmd, file) != "ours"]


def test_raw_files_list_only_existing_paths(files, repo_root):
    raw, _ = files
    assert len(raw) > 5
    assert not [file for file in raw if not (repo_root / file).exists()]


def test_merge_ours_paths_exist(repo_root):
    source = (repo_root / ".gitattributes").read_text()
    paths = [match[0] for line in source.splitlines() if "merge=ours" in line for match in re.finditer(r"^[a-zA-Z0-9/._-]+\.(?:json|md)", line)]
    assert len(paths) > 5
    assert not [file for file in paths if not (repo_root / file).exists()]


def test_autostage_paths_exist(repo_root):
    source = (repo_root / ".githooks/pre-commit").read_text()
    block = re.search(r"_FRESHNESS_FILES=\((.*?)^\)", source, re.M | re.S)
    assert block
    paths = [match[0].strip() for line in block[1].splitlines() if not re.match(r"\s*#", line) for match in re.finditer(r"^\s+[a-zA-Z0-9/._-]+", line)]
    assert len(paths) > 10
    assert not [file for file in paths if not (repo_root / file).exists()]


def test_all_four_agent_maps_in_gate_and_merge_ours(repo_root, files, run_cmd):
    assert (repo_root / "scripts/agent-guide/emit-maps.mjs").is_file()
    _, gate = files
    for name in ["goals-map", "tools-map", "danger-map", "agents-map"]:
        file = f"docs/agent-guide/maps/{name}.md"
        assert file in gate
        assert merge_attribute(run_cmd, file) == "ours"

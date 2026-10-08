"""Native assertions from tests/spec/ci-cd/workflow-self-trigger.bats."""

import re


def test_filtered_workflows_list_themselves(repo_root):
    workflows = [(file, file.read_text()) for file in (repo_root / ".github/workflows").glob("*.yml")]
    filtered = [(file, source) for file, source in workflows if re.search(r"^\s+paths:", source, re.M)]
    assert filtered
    assert any(f".github/workflows/{file.name}" in source for file, source in filtered)
    missing = [file.name for file, source in filtered if f".github/workflows/{file.name}" not in source]
    assert not missing, missing


def test_fleet_render_runs_on_every_main_push(repo_root):
    source = (repo_root / ".github/workflows/render-fleet-artifact.yml").read_text()
    assert re.search(r"^\s+branches: \[main\]", source, re.M)
    assert not re.search(r"^\s+paths:", source, re.M)

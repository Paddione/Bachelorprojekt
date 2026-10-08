"""Native assertions from tests/spec/ci-cd/taskfiles-dir-convention.bats."""

import re


def test_task_resolves_included_namespaces(run_cmd):
    result = run_cmd(["task", "--list"])
    result.check()
    for namespace in ["llm:", "finetune:", "dev:", "brain:"]:
        assert namespace in result.output


def test_includes_point_to_taskfiles(repo_root):
    source = (repo_root / "Taskfile.yml").read_text()
    assert len(re.findall(r"^\s*taskfile:\s*\./taskfiles/Taskfile\.", source, re.M)) >= 14
    assert not re.search(r"^\s*taskfile:\s*\./Taskfile\.[a-z-]+\.ya?ml", source, re.M)


def test_root_only_has_entry_taskfile(repo_root):
    assert (repo_root / "Taskfile.yml").is_file()
    assert len(list((repo_root / "taskfiles").glob("Taskfile.*.y*ml"))) >= 14
    assert not list(repo_root.glob("Taskfile.*.y*ml"))

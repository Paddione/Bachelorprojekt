"""Native assertions from tests/spec/ci-cd/health-goals-pr-path.bats."""

import re
import pytest

@pytest.fixture
def config(repo_root):
    source = (repo_root / ".github/workflows/health-goals.yml").read_text()
    return "\n".join(line for line in source.splitlines() if not re.match(r"\s*#", line))


def test_goals_updates_through_pr(config):
    assert "git commit" in config
    assert re.search(r"gh(-axi)? pr create", config)
    assert not re.search(r"^\s*git push(\s*(#.*)?)?\s*$", config, re.M)


def test_auto_merge_enabled(config):
    assert re.search(r"gh(-axi)? pr merge.*--auto", config)


def test_job_can_create_pull_requests(config):
    assert re.search(r"^\s*pull-requests:\s*write", config, re.M)


def test_pr_title_passes_conventional_commit_validator(config, repo_root, run_cmd, tmp_path):
    title = re.search(r'^\s*--title "(.*)".*$', config, re.M)
    assert title and title[1]
    file = tmp_path / "title.txt"
    file.write_text(title[1] + "\n")
    run_cmd(["bash", str(repo_root / "scripts/validate-commit-msg.sh"), "message", str(file)]).check()


def test_cleanup_only_bot_branches(config):
    branch = re.search(r"^\s*BRANCH:\s*(chore/[^$]*)\$\{\{", config, re.M)
    filter_match = re.search(r'startswith\("([^" ]*)"\)', config)
    assert branch and branch[1]
    assert filter_match and filter_match[1]
    assert filter_match[1] == branch[1]
    assert not "chore/health-goals-fixes-sept25".startswith(filter_match[1])

"""Native assertions from tests/spec/ci-cd/automerge-run-scope.bats."""

import re
import yaml


def test_main_push_tests_merge_delta(repo_root):
    job = yaml.safe_load((repo_root / ".github/workflows/ci.yml").read_text())["jobs"]["test-spec-shard"]
    block = yaml.safe_dump(job)
    assert block
    for needle in ["github.event.before", "FIND_CHANGED_TESTS_FILES", "0000000000000000000000000000000000000000"]:
        assert needle in block


def test_lighthouse_runs_only_on_prs(repo_root):
    job = yaml.safe_load((repo_root / ".github/workflows/ci.yml").read_text())["jobs"]["lighthouse"]
    assert "github.event_name == 'pull_request'" in yaml.safe_dump(job)


def test_release_please_avoids_duplicate_push_and_pr(repo_root):
    release = (repo_root / ".github/workflows/release-please.yml").read_text()
    assert re.search(r"token:\s*\$\{\{\s*secrets\.GH_PAT", release)
    ci = (repo_root / ".github/workflows/ci.yml").read_text()
    assert "release-please--branches--main" not in "\n".join(line for line in ci.splitlines() if not re.match(r"\s*#", line))

"""Native assertions from tests/spec/ci-cd/github-only-ci.bats."""

def test_tracked_workflow_positive_anchor(run_cmd):
    result = run_cmd(["git", "ls-files", ".github/workflows"])
    result.check()
    assert result.output


def test_no_tracked_gitlab_ci_runner_or_mirror(run_cmd):
    test_tracked_workflow_positive_anchor(run_cmd)
    result = run_cmd(["git", "ls-files", "--", ".gitlab-ci.yml", ".gitlab-ci-images", "k3d/gitlab-runner-stack", "flux/clusters/fleet/*gitlab*", ".github/workflows/mirror-to-gitlab.yml"])
    result.check()
    assert not result.output


def test_workflows_do_not_push_to_gitlab_or_read_gitlab_secrets(run_cmd):
    test_tracked_workflow_positive_anchor(run_cmd)
    result = run_cmd(["git", "grep", "-n", "-E", r"registry\.gitlab\.com|GITLAB_", "--", ".github/workflows"])
    assert result.returncode == 1, result.output


def test_restore_runbook_documents_tag_and_new_secrets(repo_root, run_cmd):
    result = run_cmd(["git", "ls-files", "--", "docs/runbooks/gitlab-restore.md"])
    result.check()
    assert result.output
    source = (repo_root / "docs/runbooks/gitlab-restore.md").read_text()
    for needle in ["archive/gitlab-ci", "GITLAB_MIRROR_TOKEN", "GITLAB_MIRROR_URL", "GITLAB_RUNNER_TOKEN", "gitlab-registry-auth", "GITLAB_REGISTRY_PREFIX", "GITLAB_REGISTRY_TOKEN"]:
        assert needle in source

"""Native assertions from tests/spec/ci-cd/ghcr-digest-auth.bats."""

import re
import pytest
import yaml

@pytest.fixture
def login(repo_root):
    workflow = yaml.safe_load((repo_root / ".github/workflows/render-fleet-artifact.yml").read_text())
    steps = [step for job in workflow["jobs"].values() for step in job["steps"]]
    assert any("resolve-image-digest.sh" in step.get("run", "") for step in steps)
    return next(step for step in steps if step.get("name", "").startswith("Log in to GHCR"))


def test_renderer_ghcr_password_is_pat(login):
    assert "secrets.GH_PAT" in login["with"]["password"]
    assert "secrets.GITHUB_TOKEN" not in login["with"]["password"]


def test_renderer_ghcr_username_is_owner(login):
    assert "github.repository_owner" in login["with"]["username"]
    assert "github.actor" not in login["with"]["username"]


def test_pat_convention_matches_build_workflows(repo_root):
    workflows = [file.read_text() for file in (repo_root / ".github/workflows").glob("build-*.yml")]
    matching = [source for source in workflows if re.search(r"password:.*secrets\.GH_PAT", source)]
    assert matching
    assert all(re.search(r"username:.*github\.repository_owner", source) for source in matching)

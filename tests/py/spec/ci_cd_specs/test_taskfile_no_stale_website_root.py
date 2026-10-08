"""Native assertions from tests/spec/ci-cd/taskfile-no-stale-website-root.bats."""

import re


def test_no_stale_website_root_cd(repo_root):
    files = [repo_root / "Taskfile.yml", *(repo_root / "taskfiles").rglob("*")]
    sources = [file.read_text() for file in files if file.is_file()]
    assert any("cd components/website" in source for source in sources)
    assert not any(re.search(r"\bcd website\b", source) for source in sources)


def test_changed_website_branch_has_eslint_gate(repo_root):
    source = (repo_root / "taskfiles/Taskfile.test.yml").read_text()
    assert "RUN_WEBSITE" in source
    assert "cd components/website && pnpm lint" in source

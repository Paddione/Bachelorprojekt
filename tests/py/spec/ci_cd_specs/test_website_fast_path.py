"""Native assertions from tests/spec/ci-cd/website-fast-path.bats."""

import re

def test_website_coverage_relevance_filter(repo_root):
    source = (repo_root / ".github/workflows/ci.yml").read_text()
    assert re.search(r"run[_-]website=true", source)


def test_website_dependency_install_guard(repo_root):
    lines = (repo_root / ".github/workflows/ci.yml").read_text().splitlines()
    regions = ["\n".join(lines[max(0, i-2):i+6]) for i, line in enumerate(lines) if "Install website dependencies" in line]
    assert regions
    assert any("run_website == 'true'" in region or "run-website == 'true'" in region for region in regions)


def test_actionlint_installation_uses_cache(repo_root):
    lines = (repo_root / ".github/workflows/ci.yml").read_text().splitlines()
    regions = ["\n".join(lines[max(0, i-2):i+11]) for i, line in enumerate(lines) if "actions/cache" in line]
    assert regions
    assert any("actionlint" in region for region in regions)

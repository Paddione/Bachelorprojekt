"""Native assertions from tests/spec/ci-cd/unit-tests-no-dependency-skips.bats."""

import re
import yaml


def test_unit_job_installs_website_dependencies(repo_root):
    job = yaml.safe_load((repo_root / ".github/workflows/ci.yml").read_text())["jobs"]["test-bats"]
    block = yaml.safe_dump(job)
    for needle in ["BATS Unit", "npm ci", "pnpm", "components/website"]:
        assert needle in block


def test_no_unit_dependency_skips(repo_root):
    unit = repo_root / "tests/unit"
    assert len(list(unit.glob("*.bats"))) >= 50
    sources = [(file, file.read_text()) for file in unit.rglob("*.bats")]
    assert any("skip" in source for _, source in sources)
    pattern = re.compile(r'skip\s+"[^"\n]*(node_modules|npm install|pnpm install|npm ci)')
    bad = [str(file) for file, source in sources if pattern.search(source)]
    assert not bad, bad

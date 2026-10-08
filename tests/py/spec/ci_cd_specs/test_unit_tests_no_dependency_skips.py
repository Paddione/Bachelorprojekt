"""Guard from tests/spec/ci-cd/unit-tests-no-dependency-skips.bats, retargeted to pytest modules [T901392].

The offline gate installs the website dependencies, so unit tests must not skip for a missing
node_modules or package install."""

import re
import yaml


def test_unit_job_installs_website_dependencies(repo_root):
    job = yaml.safe_load((repo_root / ".github/workflows/ci.yml").read_text())["jobs"]["test-bats"]
    block = yaml.safe_dump(job)
    for needle in ["npm ci", "pnpm", "components/website", "pytest-run.sh"]:
        assert needle in block


def test_no_unit_dependency_skips(repo_root):
    files = list((repo_root / "tests/py/unit").rglob("test_*.py")) + list(
        (repo_root / "tests/py/spec/native_ported/unit").rglob("test_*.py"))
    assert len(files) >= 50
    sources = [(f, f.read_text()) for f in files]
    assert any("pytest.skip" in source for _, source in sources)
    pattern = re.compile(r"pytest\.skip\([^)\n]*(node_modules|npm install|pnpm install|npm ci)")
    bad = [str(f.relative_to(repo_root)) for f, source in sources if pattern.search(source)]
    assert not bad, bad

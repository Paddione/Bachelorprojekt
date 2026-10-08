"""Native migration of tests/spec/astro-type-check.bats."""
import re

def test_astro_script(repo_root):
    assert '"astro:check"' in (repo_root / 'components/website/package.json').read_text()

def test_ci_astro_job(repo_root):
    assert re.search(r'Astro TypeScript check|astro.*check', (repo_root / '.github/workflows/ci.yml').read_text())

def test_ci_astro_command(repo_root):
    assert re.search(r'pnpm run astro:check|pnpm astro:check', (repo_root / '.github/workflows/ci.yml').read_text())

def test_fixture_factory_exists(repo_root):
    assert (repo_root / 'components/website/src/lib/sdlc/tickets/__tests__/fixtures.ts').is_file()

def test_fixture_factory_rollup(repo_root):
    assert 'makeRollup' in (repo_root / 'components/website/src/lib/sdlc/tickets/__tests__/fixtures.ts').read_text()

"""Native migration of tests/spec/astro-type-check.bats."""
import re

def test_astro_script(repo_root):
    """REQ-ASTRO-TC-003: components/website/package.json has astro:check script"""
    assert '"astro:check"' in (repo_root / 'components/website/package.json').read_text()

def test_ci_astro_job(repo_root):
    """REQ-ASTRO-TC-004: ci.yml has Astro TypeScript check job"""
    assert re.search(r'Astro TypeScript check|astro.*check', (repo_root / '.github/workflows/ci.yml').read_text())

def test_ci_astro_command(repo_root):
    """REQ-ASTRO-TC-004: CI job runs pnpm run astro:check"""
    assert re.search(r'pnpm run astro:check|pnpm astro:check', (repo_root / '.github/workflows/ci.yml').read_text())

def test_fixture_factory_exists(repo_root):
    """REQ-ASTRO-TC-002: fixture factory exists at components/website/src/lib/sdlc/tickets/__tests__/fixtures.ts"""
    assert (repo_root / 'components/website/src/lib/sdlc/tickets/__tests__/fixtures.ts').is_file()

def test_fixture_factory_rollup(repo_root):
    """REQ-ASTRO-TC-002: fixture factory exports makeRollup"""
    assert 'makeRollup' in (repo_root / 'components/website/src/lib/sdlc/tickets/__tests__/fixtures.ts').read_text()

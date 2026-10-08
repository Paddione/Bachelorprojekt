"""Native migration of tests/spec/ts-suppression.bats."""
import pytest

@pytest.mark.parametrize('suppression', ['@ts-ignore', '@ts-expect-error'])
def test_no_suppressions(repo_root, suppression):
    files = [p for p in (repo_root / 'components/website/src').rglob('*') if p.is_file() and p.suffix in {'.ts', '.svelte', '.astro'} and 'node_modules' not in p.parts]
    assert files
    assert not [str(p) for p in files if suppression in p.read_text()]

"""Native migration of tests/spec/admin-token-consolidation.bats (7 cases)."""
import re


def styles(repo_root):
    return repo_root / 'components/website/src/styles'


def test_factory_tokens_removed(repo_root):
    assert not (styles(repo_root) / 'factory-tokens.css').exists()


def test_base_colors_are_aliases(repo_root):
    text = (styles(repo_root) / 'global.css').read_text()
    for color in '--brass --brass-2 --brass-d --fg --fg-soft --ink-750 --ink-800 --ink-850 --ink-900 --line --line-2 --mono --mute --mute-2 --sage --sans --serif'.split():
        assert any(color in line and 'var(' in line for line in text.splitlines()), color


def test_global_has_no_factory_import(repo_root):
    text = (styles(repo_root) / 'global.css').read_text()
    assert not re.search(r'@import[^;]*factory-tokens\.css', text)


def test_layout_has_no_factory_import(repo_root):
    assert 'factory-tokens.css' not in (repo_root / 'components/website/src/layouts/AdminLayout.astro').read_text()


def test_semantic_admin_tokens_declared(repo_root):
    text = (styles(repo_root) / 'global.css').read_text()
    tokens = '--admin-bg --admin-sidebar-bg --admin-surface --admin-surface-hover --admin-border --admin-border-bright --admin-primary --admin-primary-muted --admin-accent --admin-text --admin-text-mute --admin-text-disabled --admin-success --admin-danger --admin-info --admin-warning'.split()
    for token in tokens:
        assert re.search(r'^\s*' + re.escape(token) + r'\s*:', text, re.M), token


def test_danger_theme_token(repo_root):
    text = (styles(repo_root) / 'global.css').read_text()
    assert re.search(r'@theme\s*\{', text)
    assert '--color-danger' in text


def test_visual_baseline_required():
    # Original case only emitted an informational echo; it did not run E2E.
    import pytest
    pytest.skip('Visual-sweep baseline is verified by the separate e2e:admin suite')

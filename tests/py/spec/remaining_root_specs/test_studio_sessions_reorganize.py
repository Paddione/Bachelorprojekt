"""Native migration of tests/spec/studio-sessions-reorganize.bats."""
import pytest

@pytest.fixture
def web(repo_root):
    return repo_root / 'components/website/src'

def test_sidebar_sessions(web):
    text = (web / 'lib/admin/nav-items.ts').read_text()
    assert "href: '/admin/coaching/sessions'" in text
    assert "matches: ['/admin/coaching/sessions', '/admin/fragebogen']" in text

def test_sidebar_removed_route(web):
    text = (web / 'lib/admin/nav-items.ts').read_text()
    assert "href: '/admin/coaching/sessions'" in text
    assert "href: '/admin/coaching/studio'" not in text

def test_sessions_index_removed_links(web):
    text = (web / 'pages/admin/coaching/sessions/index.astro').read_text()
    assert '/admin/coaching/projekte' not in text
    assert 'href="/admin/coaching/studio"' not in text

def test_new_session(web):
    assert '+ Neue Session' in (web / 'components/admin/coaching/SessionsOverview.svelte').read_text()

def test_studio_wrapper_removed(web):
    assert not (web / 'pages/admin/coaching/studio.astro').is_file()

def test_brand_sub(web):
    assert 'Coaching Sessions' in (web / '../public/coaching-studio/app.jsx').read_text()

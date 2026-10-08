"""Native migration of tests/spec/e2e-testing.bats."""
def test_no_public_bug_seed(repo_root):
    assert 'createTestBugReport' not in (repo_root/'tests/e2e/specs/fa-bugs-notifications.spec.ts').read_text()

def test_bug_ticket_cleanup(repo_root):
    text=(repo_root/'tests/e2e/specs/fa-bugs-notifications.spec.ts').read_text()
    assert 'afterEach' in text
    assert 'DELETE FROM tickets.tickets' in text

def test_no_nested_footer(repo_root):
    assert '<footer' not in (repo_root/'components/website/src/components/kore/KoreHomepage.svelte').read_text()

def test_footer_case(repo_root):
    assert "toContainText('Korczewski')" not in (repo_root/'tests/e2e/specs/korczewski-home.spec.ts').read_text()

def test_accessible_brand_link(repo_root):
    text=(repo_root/'tests/e2e/specs/korczewski-home.spec.ts').read_text()
    assert 'korczewski startseite' not in text
    assert "getByRole('link', { name: /^korczewski" in text

def test_purge_no_negative_assertion(repo_root):
    assert 'not.toBe' not in (repo_root/'tests/e2e/specs/fa-59-systemtest-purge-endpoint.spec.ts').read_text()

def test_purge_positive_403(repo_root):
    assert 'toBe(403)' in (repo_root/'tests/e2e/specs/fa-59-systemtest-purge-endpoint.spec.ts').read_text()

"""Native migration of tests/spec/chat-inbox.bats."""
def test_inbox_test_filter(repo_root):
    assert 'is_test_data = false' in (repo_root / 'components/website/src/lib/messaging-db.ts').read_text()

def test_pending_test_filter(repo_root):
    assert "status = 'pending' AND is_test_data = false" in (repo_root / 'components/website/src/lib/messaging-db.ts').read_text()

def test_finalize_test_meeting(repo_root):
    assert "meetingType: '[TEST] Erstgesprach'" in (repo_root / 'tests/e2e/specs/fa-20-finalize.spec.ts').read_text()

def test_finalize_no_real_email(repo_root):
    assert 'test@example.de' not in (repo_root / 'tests/e2e/specs/fa-20-finalize.spec.ts').read_text()

def test_inbox_delete_includes_tests(repo_root):
    assert 'includeTest=1' in (repo_root / 'tests/e2e/specs/fa-admin-inbox-delete.spec.ts').read_text()

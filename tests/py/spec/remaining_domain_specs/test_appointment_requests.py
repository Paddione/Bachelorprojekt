"""Native migration of tests/spec/appointment-requests.bats (5 cases)."""
import re


def src(repo_root, name):
    return (repo_root / 'components/website/src' / name).read_text()


def test_same_day_reschedule_rejected(repo_root):
    text = src(repo_root, 'pages/api/anfrage/[token]/umbuchung.ts')
    assert 'berlinDayKey' in text
    assert 'status: 409' in text


def test_lead_check_strict_after(repo_root):
    assert re.search(r'[A-Za-z]*DayKey <= [A-Za-z]*DayKey', src(repo_root, 'pages/api/anfrage/[token]/umbuchung.ts'))


def test_token_lookup_generic_404(repo_root):
    for path in ['pages/anfrage/[token].astro', 'pages/api/anfrage/[token]/storno.ts', 'pages/api/anfrage/[token]/umbuchung.ts']:
        text = src(repo_root, path)
        for term in ['appointment-requests', 'reference_id', 'status: 404', 'Nicht gefunden']:
            assert term in text, (path, term)
        assert 'abgelaufen' not in text, path


def test_owner_claim_precedes_status_update(repo_root):
    text = src(repo_root, 'pages/api/owner/anfragen/[id]/annehmen.ts')
    assert re.search(r'claimSlot|isSlotInAnyWindow', text)
    lines = text.splitlines()
    claim = next((i for i, line in enumerate(lines) if 'claimSlot(' in line), None)
    update = next((i for i, line in enumerate(lines) if 'UPDATE inbox_items' in line), None)
    assert claim is not None and update is not None
    assert claim < update


def test_booking_idempotency(repo_root):
    text = src(repo_root, 'pages/api/booking.ts')
    assert 'idempotency-key' in text.lower()
    assert "payload->>'idempotencyKey'" in text
    assert 'resolveIdempotencyKey' in text
    assert not (repo_root / 'components/website/src/db/migrations/20261008_appointment_requests.sql').exists()

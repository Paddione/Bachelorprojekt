"""Native migration of tests/spec/services-calendar.bats; structural guards."""
import re
import pytest

@pytest.fixture
def web(repo_root):
    return repo_root / 'components/website/src'

def function_body(text, name):
    match = re.search(r'export async function ' + name + r'.*?^}', text, re.M | re.S)
    assert match, name
    return match.group()

def owner_routes(web):
    return [web / ('pages/api/owner/' + route) for route in ['calendar/block.ts', 'bookings/phone.ts', 'bookings/[uid]/reschedule.ts', 'bookings/[uid]/cancel.ts']]

def test_same_day_rejected(web):
    text = (web / 'pages/api/booking.ts').read_text()
    assert 'berlinDayKey' in text
    assert 'status: 409' in text

def test_strict_after_lead(web):
    assert re.search(r'[A-Za-z]*DayKey <= [A-Za-z]*DayKey', (web / 'pages/api/booking.ts').read_text())

def test_available_slots_berlin(web):
    text = (web / 'lib/caldav.ts').read_text()
    assert 'berlinDayKey' in text
    body = function_body(text, 'getAvailableSlots')
    assert 'toISOString().split' not in body
    assert not re.search(r'getHours\(|getDay\(|\.getDate\(', body)

def test_slot_window_berlin(web):
    text = (web / 'lib/appointments-db.ts').read_text()
    assert 'berlinDayKey' in text
    body = function_body(text, 'isSlotInAnyWindow')
    assert 'toISOString' not in body
    assert not re.search(r'getHours\(|getDay\(|\.getDate\(', body)

def test_atomic_slot_before_inbox(web):
    booking = (web / 'pages/api/booking.ts').read_text()
    appointments = (web / 'lib/appointments-db.ts').read_text()
    assert 'claimSlot' in booking
    assert 'DELETE FROM slot_whitelist' in appointments
    assert 'RETURNING' in appointments
    lines = booking.splitlines()
    claim = next(i for i, line in enumerate(lines) if 'claimSlot(' in line)
    insert = next(i for i, line in enumerate(lines) if 'createInboxItem(' in line)
    assert claim < insert

def test_buffers_holidays(web):
    caldav = (web / 'lib/caldav.ts').read_text()
    core = (web / 'lib/website-core-db.ts').read_text()
    assert re.search(r'getBookingBuffers|getHolidays', caldav)
    assert 'SLOT_BUFFER_MIN' in caldav
    assert 'booking_buffers' in core
    assert 'holidays' in core

def test_owner_auth(web):
    for path in owner_routes(web):
        text = path.read_text()
        assert 'requireOwner' in text
        assert 'status: 401' in text

def test_session_brand(web):
    for path in owner_routes(web):
        text = path.read_text()
        assert 'ownerBusiness(session)' in text
        assert not re.search(r'''searchParams\.get\(['"]brand|body\.brand|params\.brand''', text)

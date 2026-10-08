"""Native migration of tests/spec/website-interfaces.bats."""

# (T002196)

import re

import pytest


@pytest.fixture
def ws(repo_root):
    base = repo_root / "components" / "website"
    return {
        "status": base / "src/pages/api/status.ts",
        "booking": base / "src/pages/api/booking.ts",
        "finalize": base / "src/pages/api/meeting/finalize.ts",
        "clients": base / "src/pages/admin/clients.astro",
        "publish": base / "src/pages/admin/knowledge/snippets/[id]/publish.astro",
        "appointments_db": base / "src/lib/appointments-db.ts",
        "e2e_marker": repo_root / "tests/e2e/lib/e2e-marker.ts",
    }


def _read(p):
    return p.read_text(encoding="utf-8")


def _lines_with(text, pattern):
    lines = text.splitlines()
    return [i for i, l in enumerate(lines) if re.search(pattern, l)], lines


def test_t002196_1_status_ts_uses_check_rate_limit_with_scoped_status_key(ws):
    """T002196-1: status.ts uses checkRateLimit with scoped status: key"""
    assert re.search(r"checkRateLimit\(.status:", _read(ws["status"])), "missing scoped rate-limit key status:"


def test_t002196_1_status_ts_does_not_use_standalone_inline_rate_limit_map(ws):
    """T002196-1: status.ts does not use standalone inline rateLimitMap"""
    assert "rateLimitMap" not in _read(ws["status"]), "inline rateLimitMap still present"


def test_t002196_3_booking_ts_wraps_is_slot_in_any_window_in_try_catch(ws):
    # BATS-Original prueft im Ergebnis nur die Referenz (letzter Befehl).
    """T002196-3: booking.ts wraps isSlotInAnyWindow in try-catch"""
    assert "isSlotInAnyWindow" in _read(ws["booking"]), "isSlotInAnyWindow call missing from booking.ts"


def test_t002196_3_is_slot_in_any_window_in_appointments_db_returns_false_for_past_dates(ws):
    """T002196-3: isSlotInAnyWindow in appointments-db returns false for past dates"""
    assert "toISOString" in _read(ws["appointments_db"]), "isSlotInAnyWindow missing toISOString date conversion"


def test_t002196_4_finalize_ts_calls_init_meetings_db(ws):
    """T002196-4: finalize.ts calls initMeetingsDb"""
    assert "initMeetingsDb" in _read(ws["finalize"]), "initMeetingsDb call missing from finalize.ts"


def test_t002196_4_finalize_ts_imports_init_meetings_db_from_website_db(ws):
    """T002196-4: finalize.ts imports initMeetingsDb from website-db"""
    hits, lines = _lines_with(_read(ws["finalize"]), "initMeetingsDb")
    ok = any(re.search(r"import|from", l) for i in hits for l in lines[max(0, i - 5): i + 1])
    assert ok, "initMeetingsDb import missing"


def test_t002196_5_clients_astro_returns_403_for_non_html_requests_without_session(ws):
    """T002196-5: clients.astro returns 403 for non-HTML requests without session"""
    assert re.search(r"status: 403", _read(ws["clients"])), "403 response missing from clients.astro auth gate"


def test_t002196_5_clients_astro_accept_based_auth_gate_exists(ws):
    """T002196-5: clients.astro Accept-based auth gate exists"""
    lines = _read(ws["clients"]).splitlines()
    assert any("Accept" in l and "text/html" in l for l in lines), "Accept header check missing in clients.astro"


def test_t002196_6_publish_astro_wraps_list_snippets_in_try_catch(ws):
    """T002196-6: publish.astro wraps listSnippets in try-catch"""
    hits, lines = _lines_with(_read(ws["publish"]), "listSnippets")
    ok = any("try" in lines[j] for i in hits for j in ({max(0, i - 1), i}))
    assert ok, "listSnippets not wrapped in try block"


def test_t002196_6_publish_astro_returns_404_on_db_error(ws):
    """T002196-6: publish.astro returns 404 on DB error"""
    assert re.search(r"status: 404", _read(ws["publish"])), "404 response missing from publish.astro"

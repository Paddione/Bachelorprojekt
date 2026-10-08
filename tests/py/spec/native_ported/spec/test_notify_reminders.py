"""Native migration of tests/spec/notify-reminders.bats."""

import re
from pathlib import Path

# Guards for T901025: notify-reminders (transaktionale Mails, 24h-Erinnerung,
# Dedupe, Retry, Versandstatus). Style: tests/spec/appointment-requests.bats.
# IDs T901025-1..5 feed components/website/src/data/test-inventory.json
# via scripts/build-test-inventory.sh.


def _paths(repo_root: Path):
    lib = repo_root / "components/website/src/lib/appointment-notify.ts"
    cron = repo_root / "components/website/src/pages/api/cron/appointment-reminders.ts"
    return lib, cron


def _first_line(text: str, needle: str, regex: bool = False):
    """grep -n NEEDLE | head -1 | cut -d: -f1 (1-based line number, or None)."""
    pattern = re.compile(needle) if regex else None
    for idx, line in enumerate(text.splitlines(), start=1):
        if (pattern.search(line) if regex else needle in line):
            return idx
    return None


# ── Case 1: reminders only target confirmed requests ─────────────────────

def test_t901025_1_cron_reminds_only_bestaetigt_requests_offen_abgelehnt_excluded(repo_root):
    _, cron = _paths(repo_root)
    text = cron.read_text()
    assert "bestaetigt" in text, "bestaetigt filter missing from appointment-reminders.ts"
    assert "offen" in text, "offen exclusion missing from appointment-reminders.ts"
    assert "abgelehnt" in text, "abgelehnt exclusion missing from appointment-reminders.ts"
    assert "!== 'bestaetigt'" in text, \
        "state guard (!== bestaetigt) missing from appointment-reminders.ts"


# ── Case 2: cancelled requests never reach the send path ─────────────────

def test_t901025_2_storniert_requests_cannot_reach_sendnotify_guard_precedes_send(repo_root):
    _, cron = _paths(repo_root)
    text = cron.read_text()
    assert "storniert" in text, "storniert exclusion missing from appointment-reminders.ts"
    guard_line = _first_line(text, "!== 'bestaetigt'")
    send_line = _first_line(text, "sendNotify(")
    assert guard_line is not None, "state guard missing from appointment-reminders.ts"
    assert send_line is not None, "sendNotify call missing from appointment-reminders.ts"
    assert guard_line < send_line, \
        "state guard must precede sendNotify in appointment-reminders.ts"


# ── Case 3: retry is capped at 3 attempts ─────────────────────────────────

def test_t901025_3_notify_lib_retries_at_most_3_times(repo_root):
    lib, _ = _paths(repo_root)
    text = lib.read_text()
    assert "MAX_NOTIFY_ATTEMPTS = 3" in text, \
        "retry cap MAX_NOTIFY_ATTEMPTS = 3 missing from appointment-notify.ts"
    assert "MAX_NOTIFY_ATTEMPTS" in text, "MAX_NOTIFY_ATTEMPTS unused in appointment-notify.ts"


# ── Case 4: dedupe lookup precedes every send ─────────────────────────────

def test_t901025_4_dedupekey_check_precedes_the_mailer_call_in_sendnotify(repo_root):
    lib, _ = _paths(repo_root)
    text = lib.read_text()
    key_line = _first_line(text, "dedupeKey(")
    mail_line = _first_line(text, "await mailer(")
    assert key_line is not None, "dedupeKey call missing from appointment-notify.ts"
    assert mail_line is not None, "mailer call missing from appointment-notify.ts"
    assert key_line < mail_line, "dedupeKey must precede the mailer call in appointment-notify.ts"


# ── Case 5: cron endpoint is bearer-guarded (fail-closed 403) ─────────────

def test_t901025_5_cron_endpoint_checks_the_bearer_secret_and_answers_403(repo_root):
    _, cron = _paths(repo_root)
    text = cron.read_text()
    assert "authorization" in text.lower(), \
        "Authorization header check missing from appointment-reminders.ts"
    assert "Bearer " in text, "Bearer comparison missing from appointment-reminders.ts"
    assert "status: 403" in text, "403 response missing from appointment-reminders.ts"

"""Native migration of tests/unit/tickets-plan-staged-migration.bats."""

# Offline-safe: prüft den Migrations-Quelltext in tickets/migrations.ts und die
# Status-Reihenfolge in tickets/status.ts (TICKET_STATUSES, SSOT seit T007955).
# Stellt sicher, dass 'plan_staged' im Status-CHECK steht (der CHECK wird seit
# T007955 dynamisch aus der SSOT gebaut) und das Muster idempotent (drop+add) ist.
# Kein Cluster / keine DB nötig.

import json
import re
from pathlib import Path

import pytest

LIB = Path("components/website/src/lib")


@pytest.fixture
def paths(repo_root):
    lib = repo_root / LIB
    return {
        "src": lib / "tickets-schema.ts",
        "tmig": lib / "tickets" / "migrations.ts",
        "statuses": lib / "tickets" / "statuses.json",
        "sts": lib / "tickets" / "status.ts",
    }


def _text(path: Path) -> str:
    assert path.is_file(), f"missing file: {path}"
    return path.read_text(encoding="utf-8")


def _statuses(path: Path) -> list:
    return json.loads(_text(path))


# Seit T007955 baut migrations.ts den Status-CHECK aus TICKET_STATUSES statt aus
# einem SQL-Literal. Die Statusliste selbst ist damit die pruefbare Quelle — die
# beiden folgenden Tests pruefen sie, nicht mehr den erzeugten SQL-Text.


def test_tickets_plan_staged_ist_ein_gueltiger_status_ssot_statuses_json(paths):
    assert "plan_staged" in _statuses(paths["statuses"])


def test_tickets_status_migration_ist_idempotent_drop_constraint_if_exists(paths):
    assert "DROP CONSTRAINT IF EXISTS tickets_status_check" in _text(paths["tmig"])


def test_tickets_plan_staged_steht_zwischen_planning_und_backlog_im_check(paths):
    # T007955: der CHECK wird seitdem aus TICKET_STATUSES (status.ts, SSOT) gebaut —
    # Semantik pruefen: 'plan_staged' kommt nach 'planning' und vor 'backlog' vor
    # (awk-Flags, kein Source-Grep aufs Migrations-SQL).
    p = s = b = 0
    for line in _text(paths["sts"]).splitlines():
        if "'planning'" in line:
            p = 1
        if "'plan_staged'" in line:
            s = p
        if "'backlog'" in line:
            b = s
    assert p and s and b


def test_tickets_plan_staged_steht_zwischen_planning_und_backlog_ssot_statuses_json(paths):
    # Zweite Ebene: die JSON-Datei, aus der status.ts zur Laufzeit liest.
    # Positiv-Anker: erst belegen, dass alle drei Status ueberhaupt vorhanden sind —
    # sonst bestuende der Reihenfolge-Vergleich bei fehlenden Eintraegen vakuos.
    statuses = _statuses(paths["statuses"])
    assert "planning" in statuses and "plan_staged" in statuses and "backlog" in statuses
    assert statuses.index("planning") < statuses.index("plan_staged") < statuses.index("backlog")


def test_tickets_der_status_check_wird_aus_ticket_statuses_gebaut_nicht_aus_einem_literal(paths):
    # Die Zusicherung aus T007955: DB-Constraint und TypeScript-Union koennen nicht
    # driften, weil beide aus derselben Liste stammen.
    assert "TICKET_STATUSES.map" in _text(paths["tmig"])


def test_tickets_schema_ts_calls_apply_legacy_migrations_pool_regression_guard_for_the_split(paths):
    # Without this call, the status-CHECK migration above would never install.
    assert re.search(r"applyLegacyMigrations\([ \t]*pool[ \t]*\)", _text(paths["src"]))


def test_status_ts_ist_die_status_ssot_exportiert_alle_11_kanonischen_status_t007955(paths):
    text = _text(paths["sts"])
    for status in (
        "triage planning plan_staged backlog in_progress in_review qa_review "
        "blocked awaiting_deploy done archived"
    ).split():
        assert status in text, f"status {status} missing from status.ts"


def test_status_ts_exportiert_ssot_surface_ticket_statuses_valid_statuses_is_valid_status_ticket_status(paths):
    text = _text(paths["sts"])
    for pattern in (
        "export const TICKET_STATUSES",
        "export const VALID_STATUSES",
        "export function isValidStatus",
        "export type TicketStatus",
    ):
        assert pattern in text, f"missing {pattern!r} in status.ts"


def test_consumers_importieren_aus_status_ts_statt_lokaler_duplikate_t007955(repo_root):
    lib = repo_root / LIB
    admin = lib / "tickets" / "admin.ts"
    trans = lib / "tickets" / "transition.ts"
    cockpit_db = lib / "sdlc" / "tickets" / "cockpit-db.ts"
    route = repo_root / "components/website/src/pages/sdlc/api/cockpit/ticket-status.ts"
    assert "from './status'" in _text(admin)
    assert "from './status'" in _text(trans)
    assert "tickets/status" in _text(cockpit_db)
    assert "lib/tickets/status" in _text(route)

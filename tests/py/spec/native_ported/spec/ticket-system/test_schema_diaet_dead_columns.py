"""Native migration of tests/spec/ticket-system/schema-diaet-dead-columns.bats."""
import re


def test_grilling_answers_bewusst_alive_belassene_spalte_ist_weiterhin_im_code_referenziert_positiv_anker(repo_root):
    # Positiv-Anker: der Grep-Scope darf nicht vakuos sein.
    admin = repo_root / "components/website/src/lib/tickets/admin.ts"
    assert admin.is_file(), f"{admin} fehlt"
    assert "grilling_answers" in admin.read_text(encoding="utf-8", errors="replace")


def test_ai_question_human_answer_sind_aus_dem_website_code_entfernt(repo_root):
    files = [
        repo_root / "components/website/src/lib/tickets/admin.ts",
        repo_root / "components/website/src/lib/tickets/admin.test.ts",
        repo_root / "components/website/src/pages/sdlc/api/tickets/[id].ts",
    ]
    # grep Exit 2 bei fehlender Datei: alle Pfade muessen existieren.
    for f in files:
        assert f.is_file(), f"{f} fehlt"
    pattern = re.compile(r"ai_question|human_answer|aiQuestion|humanAnswer")
    hits = [str(f) for f in files if pattern.search(f.read_text(encoding="utf-8", errors="replace"))]
    assert not hits, f"Restreferenzen gefunden: {hits}"


def test_tickets_tickets_scope_ist_aus_migrations_ts_entfernt_pr_events_scope_bleibt_unangetastet(repo_root):
    migrations = repo_root / "components/website/src/lib/tickets/migrations.ts"
    assert migrations.is_file(), f"{migrations} fehlt"
    assert "ADD COLUMN IF NOT EXISTS scope" not in migrations.read_text(encoding="utf-8", errors="replace")
    # Positiv-Anker: pr_events.scope (andere Tabelle) muss unveraendert bleiben.
    tables = repo_root / "components/website/src/lib/tickets/tables/tickets.ts"
    assert tables.is_file(), f"{tables} fehlt"
    assert "scope        TEXT," in tables.read_text(encoding="utf-8", errors="replace")


def test_neue_migration_droppt_genau_ai_question_human_answer_scope_nicht_mehr(repo_root):
    migration = repo_root / "scripts/migrations/2026-07-28-schema-diaet-T002331.sql"
    assert migration.is_file(), f"{migration} fehlt"
    text = migration.read_text(encoding="utf-8", errors="replace")
    count = sum(1 for line in text.splitlines() if re.match(r"^ALTER TABLE tickets.tickets DROP COLUMN IF EXISTS", line))
    assert count == 3
    assert "DROP COLUMN IF EXISTS ai_question;" in text
    assert "DROP COLUMN IF EXISTS human_answer;" in text
    assert "DROP COLUMN IF EXISTS scope;" in text

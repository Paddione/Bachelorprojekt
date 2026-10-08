"""Native migration of tests/unit/tickets-tracking-migration.bats."""
import os
import re

import pytest

EXT_REQ_FIX = "MIGTEST-1"
EXT_PR_FIX = "-99100"
REQ_EXISTS_SQL = (
    "SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace "
    "WHERE n.nspname='bachelorprojekt' AND c.relname='requirements'"
)


@pytest.fixture
def db(repo_root, run_cmd):
    """setup()-Guards und teardown(): skip ohne TRACKING_DB_URL bzw. bei Prod-URL, Aufraeumen danach."""
    url = os.environ.get("TRACKING_DB_URL", "")
    if url == "":
        pytest.skip("TRACKING_DB_URL not set")
    if "web.mentolder.de" in url or "web.korczewski.de" in url:
        pytest.skip("refusing to run against prod URL")

    def psql(sql):
        return run_cmd(["psql", "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", url, "-c", sql], timeout=300)

    def node_script(*args):
        env = {"TRACKING_DB_URL": url}
        return run_cmd(["node", str(repo_root / "scripts/migrate-tracking-to-tickets.mjs"), *args],
                       env=env, timeout=300)

    yield {"url": url, "psql": psql, "node": node_script, "run_cmd": run_cmd}

    for sql in (
        f"DELETE FROM tickets.ticket_links WHERE pr_number = {EXT_PR_FIX}",
        f"DELETE FROM tickets.pr_events WHERE pr_number = {EXT_PR_FIX}",
        f"DELETE FROM bachelorprojekt.features_legacy WHERE pr_number = {EXT_PR_FIX}",
        f"DELETE FROM tickets.tickets WHERE external_id='{EXT_REQ_FIX}'",
        f"DELETE FROM bachelorprojekt.requirements_legacy WHERE id='{EXT_REQ_FIX}'",
        f"DELETE FROM bachelorprojekt.requirements WHERE id='{EXT_REQ_FIX}'",
    ):
        psql(sql)


def requirements_table_exists(db):
    """psql ... | grep -q '1 row' — sonst skip (sunset bereits angewendet)."""
    # Plain psql (ohne -t): die Fusszeile "(1 row)" ist das Pruefmerkmal.
    out = db["run_cmd"](["psql", db["url"], "-c", REQ_EXISTS_SQL], timeout=300).stdout
    if "1 row" not in out:
        pytest.skip("bachelorprojekt.requirements does not exist (sunset already applied)")


def count_pr_events(db):
    return db["psql"]("SELECT COUNT(*) FROM tickets.pr_events").stdout.replace(" ", "").rstrip("\n")


def test_migration_dry_run_does_not_write(db):
    requirements_table_exists(db)
    before = count_pr_events(db)
    db["node"]()
    after = count_pr_events(db)
    assert before == after


def test_migration_apply_moves_a_fresh_requirement_row_into_tickets_tickets(db):
    requirements_table_exists(db)
    db["psql"](
        "INSERT INTO bachelorprojekt.requirements (id, category, name, description, created_at)\n"
        f"     VALUES ('{EXT_REQ_FIX}', 'FA', 'Migration test req', 'desc', now())\n"
        "     ON CONFLICT DO NOTHING"
    )
    db["node"]("--apply")
    run = db["psql"](
        f"SELECT type, thesis_tag, title FROM tickets.tickets WHERE external_id='{EXT_REQ_FIX}'")
    assert run.returncode == 0, run.output
    assert "feature" in run.output
    assert EXT_REQ_FIX in run.output
    assert "Migration test req" in run.output


def test_migration_apply_twice_is_idempotent_no_duplicates(db):
    requirements_table_exists(db)
    db["node"]("--apply")
    db["node"]("--apply")
    run = db["psql"](f"SELECT COUNT(*) FROM tickets.tickets WHERE external_id='{EXT_REQ_FIX}'")
    assert run.returncode == 0, run.output
    assert re.fullmatch(r"\s*1\s*", run.output), run.output


def test_migration_bachelorprojekt_v_timeline_preserves_required_columns(db):
    requirements_table_exists(db)
    run = db["psql"](
        "SELECT column_name FROM information_schema.columns\n"
        "      WHERE table_schema='bachelorprojekt' AND table_name='v_timeline'\n"
        "      ORDER BY column_name"
    )
    assert run.returncode == 0, run.output
    for col in ("id", "day", "merged_at", "pr_number", "title", "description", "category",
                "scope", "brand", "requirement_id", "requirement_name"):
        assert col in run.output, f"missing column: {col}"


def test_migration_ticket_links_row_created_when_feature_row_had_requirement_id(db):
    requirements_table_exists(db)
    is_table = db["psql"](
        "SELECT count(*) FROM pg_tables WHERE schemaname='bachelorprojekt' AND tablename='features'"
    ).stdout.replace(" ", "")
    if is_table == "0":
        pytest.skip("features already migrated to view; ticket_links path not exercisable here")
    db["psql"](
        "INSERT INTO bachelorprojekt.features (pr_number, title, category, requirement_id, merged_at)\n"
        f"     VALUES ({EXT_PR_FIX}, 'pr', 'feat', '{EXT_REQ_FIX}', now())\n"
        "     ON CONFLICT (pr_number) DO NOTHING"
    )
    db["node"]("--apply")
    run = db["psql"](
        "SELECT 1 FROM tickets.ticket_links tl\n"
        "       JOIN tickets.tickets t ON t.id = tl.from_id\n"
        f"      WHERE t.external_id='{EXT_REQ_FIX}'\n"
        "        AND tl.kind='fixes'\n"
        f"        AND tl.pr_number={EXT_PR_FIX}"
    )
    assert run.returncode == 0, run.output
    assert re.fullmatch(r"\s*1\s*", run.output), run.output

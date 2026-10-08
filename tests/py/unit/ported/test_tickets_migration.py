"""Native migration of tests/unit/tickets-migration.bats."""
# Static checks read scripts/migrate-bugs-to-tickets.mjs. Runtime checks need a
# live PostgreSQL with bugs.bug_tickets and tickets.*; they skip when psql is
# missing, the database is unreachable, or the legacy table is already gone.
import json
import os
import re
import shutil
from pathlib import Path

import pytest

MIGRATE_REL = "scripts/migrate-bugs-to-tickets.mjs"
TABLE_EXISTS_SQL = (
    "SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace "
    "WHERE n.nspname='bugs' AND c.relname='bug_tickets'"
)
TABLE_MISSING = "bugs.bug_tickets does not exist (sunset already applied)"


@pytest.fixture(scope="module")
def migrate_path(repo_root) -> Path:
    return repo_root / MIGRATE_REL


@pytest.fixture(scope="module")
def migrate_text(migrate_path) -> str:
    assert migrate_path.is_file(), f"missing {MIGRATE_REL}"
    return migrate_path.read_text(encoding="utf-8")


def _line_match(text: str, regex: str) -> bool:
    """grep -q with a regex: any single line matches."""
    return any(re.search(regex, line) for line in text.splitlines())


@pytest.fixture(scope="module")
def pgurl() -> str:
    url = os.environ.get("TRACKING_DB_URL") or "postgres://postgres:postgres@localhost:5432/website"
    # Safety guard: refuse to run against production databases.
    if "mentolder" in url or "korczewski" in url:
        pytest.skip("TRACKING_DB_URL points to a production host - refusing to run against live data")
    return url


def _psql(run_cmd, pgurl, sql, tuples=False):
    args = ["psql", pgurl]
    if tuples:
        args += ["-t", "-A"]
    args += ["-c", sql]
    return run_cmd(args, timeout=300)


def _require_bug_table(run_cmd, pgurl):
    """Skip unless bugs.bug_tickets exists and the database answers."""
    if shutil.which("psql") is None:
        pytest.skip(TABLE_MISSING)
    exists = _psql(run_cmd, pgurl, TABLE_EXISTS_SQL)
    if "1 row" not in exists.stdout:
        pytest.skip(TABLE_MISSING)
    if _psql(run_cmd, pgurl, "SELECT 1").returncode != 0:
        pytest.skip("No database available (set TRACKING_DB_URL)")


def _count(run_cmd, pgurl, sql):
    result = _psql(run_cmd, pgurl, sql, tuples=True)
    result.check()
    return result.stdout.strip()


def _migrate(run_cmd, repo_root, pgurl, *flags):
    result = run_cmd(["node", str(repo_root / MIGRATE_REL), *flags], env={"PGURL": pgurl}, timeout=300)
    result.check()
    return result


# ── Static checks (no DB required) ───────────────────────────────

def test_static_migration_script_exists_and_is_idempotent_uses_external_id_check(migrate_path, migrate_text):
    assert migrate_path.is_file()
    assert "WHERE external_id = $1" in migrate_text


def test_static_apply_mode_wraps_in_begin_commit_rollback_transaction(migrate_text):
    assert "apply ? 'BEGIN'" in migrate_text or "if (apply) await client.query" in migrate_text
    assert "COMMIT" in migrate_text
    assert "ROLLBACK" in migrate_text


def test_static_dry_run_mode_supported_default_apply_flag_required(migrate_text):
    assert "process.argv.includes('--apply')" in migrate_text
    assert "dryRun" in migrate_text


def test_static_status_map_covers_open_triage_resolved_done_fixed_archived_archived_fixed(migrate_text):
    assert _line_match(migrate_text, r"open.*triage")
    assert _line_match(migrate_text, r"resolved.*done")
    assert "archived" in migrate_text
    assert "'fixed'" in migrate_text


def test_static_category_tag_maps_all_three_bug_categories_to_kind_tags(migrate_text):
    assert _line_match(migrate_text, r"fehler.*kind:bug")
    assert _line_match(migrate_text, r"verbesserung.*kind:improvement")
    assert _line_match(migrate_text, r"erweiterungswunsch.*kind:wish")


def test_static_title_is_description_sliced_to_200_chars(migrate_text):
    assert "slice(0, 200)" in migrate_text


def test_static_resolution_note_migrated_as_status_change_comment_with_author_label_migration(migrate_text):
    assert "'migration'" in migrate_text
    assert "'status_change'" in migrate_text
    assert "resolution_note" in migrate_text


def test_static_output_json_includes_inserted_skipped_and_mode_fields(migrate_text):
    assert "inserted" in migrate_text
    assert "skipped" in migrate_text
    assert "mode" in migrate_text


def test_static_script_syntax_is_valid_node_check(run_cmd, repo_root, migrate_path):
    if shutil.which("node") is None:
        pytest.skip("node not installed")
    result = run_cmd(["node", "--check", str(migrate_path)])
    result.check()


# ── Runtime tests (require live DB) ──────────────────────────────

def test_runtime_every_bugs_bug_tickets_row_produces_one_tickets_tickets_row(run_cmd, repo_root, pgurl):
    _require_bug_table(run_cmd, pgurl)
    before = _count(run_cmd, pgurl, "SELECT count(*) FROM bugs.bug_tickets")
    _migrate(run_cmd, repo_root, pgurl, "--apply")
    after = _count(run_cmd, pgurl, "SELECT count(*) FROM tickets.tickets WHERE type='bug'")
    assert before == after


def test_runtime_status_mapping_is_correct_open_triage_resolved_done_fixed(run_cmd, repo_root, pgurl):
    _require_bug_table(run_cmd, pgurl)
    open_count = _count(run_cmd, pgurl, "SELECT count(*) FROM bugs.bug_tickets WHERE status='open'")
    triage_count = _count(run_cmd, pgurl, "SELECT count(*) FROM tickets.tickets WHERE type='bug' AND status='triage'")
    assert open_count == triage_count
    resolved_count = _count(run_cmd, pgurl, "SELECT count(*) FROM bugs.bug_tickets WHERE status='resolved'")
    done_fixed_count = _count(
        run_cmd, pgurl,
        "SELECT count(*) FROM tickets.tickets WHERE type='bug' AND status='done' AND resolution='fixed'",
    )
    assert resolved_count == done_fixed_count


def test_runtime_archived_rows_map_to_status_archived_resolution_fixed(run_cmd, repo_root, pgurl):
    _require_bug_table(run_cmd, pgurl)
    archived = _count(run_cmd, pgurl, "SELECT count(*) FROM bugs.bug_tickets WHERE status='archived'")
    mapped = _count(
        run_cmd, pgurl,
        "SELECT count(*) FROM tickets.tickets WHERE type='bug' AND status='archived' AND resolution='fixed'",
    )
    assert archived == mapped


def test_runtime_category_tags_are_created_kind_bug_for_fehler_rows(run_cmd, repo_root, pgurl):
    _require_bug_table(run_cmd, pgurl)
    fehler_count = _count(run_cmd, pgurl, "SELECT count(*) FROM bugs.bug_tickets WHERE category='fehler'")
    if fehler_count == "0":
        pytest.skip("No fehler rows in bugs.bug_tickets")
    tag_count = _count(run_cmd, pgurl, """
    SELECT count(DISTINCT tt.ticket_id)
      FROM tickets.ticket_tags tt
      JOIN tickets.tags tg ON tg.id = tt.tag_id
      JOIN tickets.tickets t ON t.id = tt.ticket_id
     WHERE tg.name = 'kind:bug' AND t.type = 'bug'""")
    assert tag_count == fehler_count


def test_runtime_resolution_note_rows_produce_a_status_change_comment(run_cmd, repo_root, pgurl):
    _require_bug_table(run_cmd, pgurl)
    with_note = _count(
        run_cmd, pgurl,
        "SELECT count(*) FROM bugs.bug_tickets WHERE resolution_note IS NOT NULL AND resolution_note <> ''",
    )
    if with_note == "0":
        pytest.skip("No rows with resolution_note in bugs.bug_tickets")
    comment_count = _count(run_cmd, pgurl, """
    SELECT count(*) FROM tickets.ticket_comments
     WHERE kind='status_change' AND author_label='migration'""")
    assert comment_count == with_note


def test_runtime_idempotent_second_run_does_not_duplicate(run_cmd, repo_root, pgurl):
    _require_bug_table(run_cmd, pgurl)
    _migrate(run_cmd, repo_root, pgurl, "--apply")
    count1 = _count(run_cmd, pgurl, "SELECT count(*) FROM tickets.tickets WHERE type='bug'")
    _migrate(run_cmd, repo_root, pgurl, "--apply")
    count2 = _count(run_cmd, pgurl, "SELECT count(*) FROM tickets.tickets WHERE type='bug'")
    assert count1 == count2


def test_runtime_idempotent_second_run_reports_all_rows_as_skipped(run_cmd, repo_root, pgurl):
    _require_bug_table(run_cmd, pgurl)
    total = _count(run_cmd, pgurl, "SELECT count(*) FROM bugs.bug_tickets")
    result = run_cmd(["node", str(repo_root / MIGRATE_REL), "--apply"], env={"PGURL": pgurl}, timeout=300)
    result.check()
    try:
        skipped = str(json.loads(result.output)["skipped"])
    except (ValueError, KeyError):
        skipped = None
    assert skipped == total


def test_runtime_dry_run_default_makes_no_changes_to_tickets_table(run_cmd, repo_root, pgurl):
    _require_bug_table(run_cmd, pgurl)
    before = _count(run_cmd, pgurl, "SELECT count(*) FROM tickets.tickets WHERE type='bug'")
    _migrate(run_cmd, repo_root, pgurl)
    after = _count(run_cmd, pgurl, "SELECT count(*) FROM tickets.tickets WHERE type='bug'")
    assert before == after


def test_runtime_dry_run_output_json_has_mode_dry_run(run_cmd, repo_root, pgurl):
    _require_bug_table(run_cmd, pgurl)
    result = run_cmd(["node", str(repo_root / MIGRATE_REL)], env={"PGURL": pgurl}, timeout=300)
    result.check()
    data = json.loads(result.output)
    assert data["mode"] == "dry-run", f"expected dry-run, got {data['mode']}"


def test_runtime_comments_are_copied(run_cmd, repo_root, pgurl):
    _require_bug_table(run_cmd, pgurl)
    _migrate(run_cmd, repo_root, pgurl, "--apply")
    expected = int(_count(run_cmd, pgurl, "SELECT count(*) FROM bugs.bug_ticket_comments"))
    actual = int(_count(run_cmd, pgurl, """
    SELECT count(*) FROM tickets.ticket_comments tc
    JOIN tickets.tickets t ON t.id = tc.ticket_id
    WHERE t.type = 'bug' AND tc.kind <> 'system' AND tc.author_label <> 'migration'"""))
    assert actual >= expected


def test_runtime_fixed_in_pr_to_ticket_links(run_cmd, repo_root, pgurl):
    _require_bug_table(run_cmd, pgurl)
    _migrate(run_cmd, repo_root, pgurl, "--apply")
    expected = _count(run_cmd, pgurl, "SELECT count(*) FROM bugs.bug_tickets WHERE fixed_in_pr IS NOT NULL")
    actual = _count(run_cmd, pgurl, """
    SELECT count(*) FROM tickets.ticket_links WHERE kind='fixes' AND pr_number IS NOT NULL""")
    assert actual == expected


def test_static_extension_blocks_present_comments_screenshots_fixed_in_pr(migrate_text):
    assert "bug_ticket_comments" in migrate_text
    assert "screenshots_json" in migrate_text
    assert "ticket_attachments" in migrate_text
    assert "ticket_links" in migrate_text
    assert "kind='fixes'" in migrate_text


def test_static_view_creation_block_is_guarded_by_not_dryrun(migrate_text):
    assert "CREATE OR REPLACE VIEW bugs.bug_tickets" in migrate_text
    assert "pg_tables" in migrate_text
    assert "bug_tickets_legacy" in migrate_text


RELKIND_SQL = (
    "SELECT relkind FROM pg_class "
    "WHERE relname='bug_tickets' AND relnamespace=(SELECT oid FROM pg_namespace WHERE nspname='bugs')"
)


def test_runtime_bugs_bug_tickets_is_a_view_after_migration(run_cmd, repo_root, pgurl):
    _require_bug_table(run_cmd, pgurl)
    _migrate(run_cmd, repo_root, pgurl, "--apply")
    # 'r' = ordinary table, 'v' = view, 'm' = materialized view
    assert _count(run_cmd, pgurl, RELKIND_SQL) == "v"


def test_runtime_legacy_fixed_in_pr_join_still_works_against_the_view(run_cmd, repo_root, pgurl):
    _require_bug_table(run_cmd, pgurl)
    # Mirrors the query in components/website/src/lib/website-db.ts lines 88-91.
    result = _psql(run_cmd, pgurl, """
    SELECT fixed_in_pr AS pr, COUNT(*)::int AS n
      FROM bugs.bug_tickets
     WHERE fixed_in_pr = ANY('{1,2,3,99999}'::int[])
     GROUP BY fixed_in_pr""")
    result.check()


def test_runtime_re_running_migration_is_idempotent_view_not_corrupted(run_cmd, repo_root, pgurl):
    _require_bug_table(run_cmd, pgurl)
    _migrate(run_cmd, repo_root, pgurl, "--apply")
    _migrate(run_cmd, repo_root, pgurl, "--apply")
    assert _count(run_cmd, pgurl, RELKIND_SQL) == "v"

"""Native pytest migration of tests/spec/ticket-system/schema-diaet-dead-columns.bats."""

import os
from pathlib import Path
import shutil
import pytest


def test_grilling_answers_bewusst_alive_belassene_spalte_ist_weiterhin_im_code_referenziert_positiv_1(repo_root, run_cmd, tmp_path):
    'grilling_answers (bewusst alive belassene Spalte) ist weiterhin im Code referenziert — Positiv-Anker'
    result = run_cmd(['grep', '-rl', 'grilling_answers', str(repo_root) + '/components/website/src/lib/tickets/admin.ts'])
    assert result.returncode == 0, result.output
    assert result.output


def test_tickets_tickets_scope_ist_aus_migrations_ts_entfernt_pr_events_scope_bleibt_unangetastet_3(repo_root, run_cmd, tmp_path):
    'tickets.tickets.scope ist aus migrations.ts entfernt (pr_events.scope bleibt unangetastet)'
    result = run_cmd(['grep', '-n', 'ADD COLUMN IF NOT EXISTS scope', str(repo_root) + '/components/website/src/lib/tickets/migrations.ts'])
    assert result.returncode == 1, result.output
    result = run_cmd(['grep', '-n', 'scope        TEXT,', str(repo_root) + '/components/website/src/lib/tickets/tables/tickets.ts'])
    assert result.returncode == 0, result.output


def test_neue_migration_droppt_genau_ai_question_human_answer_scope_nicht_mehr_4(repo_root, run_cmd, tmp_path):
    'neue Migration droppt genau ai_question, human_answer, scope — nicht mehr'
    path_migration = str(repo_root) + '/scripts/migrations/2026-07-28-schema-diaet-T002331.sql'
    assert Path(path_migration).is_file()
    result = run_cmd(['grep', '-c', '^ALTER TABLE tickets.tickets DROP COLUMN IF EXISTS', path_migration])
    assert result.returncode == 0, result.output
    assert int(result.output) == 3
    result = run_cmd(['grep', '-q', 'DROP COLUMN IF EXISTS ai_question;', path_migration])
    assert result.returncode == 0, result.output
    result = run_cmd(['grep', '-q', 'DROP COLUMN IF EXISTS human_answer;', path_migration])
    assert result.returncode == 0, result.output
    result = run_cmd(['grep', '-q', 'DROP COLUMN IF EXISTS scope;', path_migration])
    assert result.returncode == 0, result.output

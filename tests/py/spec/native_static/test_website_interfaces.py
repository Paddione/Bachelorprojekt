"""Native pytest migration of tests/spec/website-interfaces.bats."""

import os
from pathlib import Path
import shutil
import pytest


def test_t002196_1_status_ts_uses_checkratelimit_with_scoped_status_key_1(repo_root, run_cmd, tmp_path):
    'T002196-1: status.ts uses checkRateLimit with scoped status: key'
    path_status_ts = str(repo_root / 'tests/spec') + '/../../components/website/src/pages/api/status.ts'
    path_booking_ts = str(repo_root / 'tests/spec') + '/../../components/website/src/pages/api/booking.ts'
    path_finalize_ts = str(repo_root / 'tests/spec') + '/../../components/website/src/pages/api/meeting/finalize.ts'
    path_clients_astro = str(repo_root / 'tests/spec') + '/../../components/website/src/pages/admin/clients.astro'
    path_publish_astro = str(repo_root / 'tests/spec') + '/../../components/website/src/pages/admin/knowledge/snippets/[id]/publish.astro'
    path_e2e_marker_ts = str(repo_root / 'tests/spec') + '/../../tests/e2e/lib/e2e-marker.ts'
    result = run_cmd(['grep', '-E', 'checkRateLimit\\(.status:', path_status_ts])
    assert result.returncode == 0, result.output


def test_t002196_1_status_ts_does_not_use_standalone_inline_ratelimitmap_2(repo_root, run_cmd, tmp_path):
    'T002196-1: status.ts does not use standalone inline rateLimitMap'
    path_status_ts = str(repo_root / 'tests/spec') + '/../../components/website/src/pages/api/status.ts'
    path_booking_ts = str(repo_root / 'tests/spec') + '/../../components/website/src/pages/api/booking.ts'
    path_finalize_ts = str(repo_root / 'tests/spec') + '/../../components/website/src/pages/api/meeting/finalize.ts'
    path_clients_astro = str(repo_root / 'tests/spec') + '/../../components/website/src/pages/admin/clients.astro'
    path_publish_astro = str(repo_root / 'tests/spec') + '/../../components/website/src/pages/admin/knowledge/snippets/[id]/publish.astro'
    path_e2e_marker_ts = str(repo_root / 'tests/spec') + '/../../tests/e2e/lib/e2e-marker.ts'
    result = run_cmd(['grep', '-n', 'rateLimitMap', path_status_ts])
    assert result.returncode != 0, result.output


def test_t002196_3_booking_ts_wraps_isslotinanywindow_in_try_catch_3(repo_root, run_cmd, tmp_path):
    'T002196-3: booking.ts wraps isSlotInAnyWindow in try-catch'
    path_status_ts = str(repo_root / 'tests/spec') + '/../../components/website/src/pages/api/status.ts'
    path_booking_ts = str(repo_root / 'tests/spec') + '/../../components/website/src/pages/api/booking.ts'
    path_finalize_ts = str(repo_root / 'tests/spec') + '/../../components/website/src/pages/api/meeting/finalize.ts'
    path_clients_astro = str(repo_root / 'tests/spec') + '/../../components/website/src/pages/admin/clients.astro'
    path_publish_astro = str(repo_root / 'tests/spec') + '/../../components/website/src/pages/admin/knowledge/snippets/[id]/publish.astro'
    path_e2e_marker_ts = str(repo_root / 'tests/spec') + '/../../tests/e2e/lib/e2e-marker.ts'
    result = run_cmd(['grep', '-A2', 'try {', path_booking_ts])
    result = run_cmd(['grep', '-B1', 'isSlotInAnyWindow', path_booking_ts])
    assert result.returncode == 0, result.output


def test_t002196_3_isslotinanywindow_in_appointments_db_returns_false_for_past_dates_4(repo_root, run_cmd, tmp_path):
    'T002196-3: isSlotInAnyWindow in appointments-db returns false for past dates'
    path_status_ts = str(repo_root / 'tests/spec') + '/../../components/website/src/pages/api/status.ts'
    path_booking_ts = str(repo_root / 'tests/spec') + '/../../components/website/src/pages/api/booking.ts'
    path_finalize_ts = str(repo_root / 'tests/spec') + '/../../components/website/src/pages/api/meeting/finalize.ts'
    path_clients_astro = str(repo_root / 'tests/spec') + '/../../components/website/src/pages/admin/clients.astro'
    path_publish_astro = str(repo_root / 'tests/spec') + '/../../components/website/src/pages/admin/knowledge/snippets/[id]/publish.astro'
    path_e2e_marker_ts = str(repo_root / 'tests/spec') + '/../../tests/e2e/lib/e2e-marker.ts'
    path_appointments_db = str(repo_root / 'tests/spec') + '/../../components/website/src/lib/appointments-db.ts'
    result = run_cmd(['grep', '-E', 'toISOString', path_appointments_db])
    assert result.returncode == 0, result.output


def test_t002196_4_finalize_ts_calls_initmeetingsdb_5(repo_root, run_cmd, tmp_path):
    'T002196-4: finalize.ts calls initMeetingsDb'
    path_status_ts = str(repo_root / 'tests/spec') + '/../../components/website/src/pages/api/status.ts'
    path_booking_ts = str(repo_root / 'tests/spec') + '/../../components/website/src/pages/api/booking.ts'
    path_finalize_ts = str(repo_root / 'tests/spec') + '/../../components/website/src/pages/api/meeting/finalize.ts'
    path_clients_astro = str(repo_root / 'tests/spec') + '/../../components/website/src/pages/admin/clients.astro'
    path_publish_astro = str(repo_root / 'tests/spec') + '/../../components/website/src/pages/admin/knowledge/snippets/[id]/publish.astro'
    path_e2e_marker_ts = str(repo_root / 'tests/spec') + '/../../tests/e2e/lib/e2e-marker.ts'
    result = run_cmd(['grep', '-E', 'initMeetingsDb', path_finalize_ts])
    assert result.returncode == 0, result.output


def test_t002196_5_clients_astro_returns_403_for_non_html_requests_without_session_7(repo_root, run_cmd, tmp_path):
    'T002196-5: clients.astro returns 403 for non-HTML requests without session'
    path_status_ts = str(repo_root / 'tests/spec') + '/../../components/website/src/pages/api/status.ts'
    path_booking_ts = str(repo_root / 'tests/spec') + '/../../components/website/src/pages/api/booking.ts'
    path_finalize_ts = str(repo_root / 'tests/spec') + '/../../components/website/src/pages/api/meeting/finalize.ts'
    path_clients_astro = str(repo_root / 'tests/spec') + '/../../components/website/src/pages/admin/clients.astro'
    path_publish_astro = str(repo_root / 'tests/spec') + '/../../components/website/src/pages/admin/knowledge/snippets/[id]/publish.astro'
    path_e2e_marker_ts = str(repo_root / 'tests/spec') + '/../../tests/e2e/lib/e2e-marker.ts'
    result = run_cmd(['grep', '-E', 'status: 403', path_clients_astro])
    assert result.returncode == 0, result.output


def test_t002196_6_publish_astro_returns_404_on_db_error_10(repo_root, run_cmd, tmp_path):
    'T002196-6: publish.astro returns 404 on DB error'
    path_status_ts = str(repo_root / 'tests/spec') + '/../../components/website/src/pages/api/status.ts'
    path_booking_ts = str(repo_root / 'tests/spec') + '/../../components/website/src/pages/api/booking.ts'
    path_finalize_ts = str(repo_root / 'tests/spec') + '/../../components/website/src/pages/api/meeting/finalize.ts'
    path_clients_astro = str(repo_root / 'tests/spec') + '/../../components/website/src/pages/admin/clients.astro'
    path_publish_astro = str(repo_root / 'tests/spec') + '/../../components/website/src/pages/admin/knowledge/snippets/[id]/publish.astro'
    path_e2e_marker_ts = str(repo_root / 'tests/spec') + '/../../tests/e2e/lib/e2e-marker.ts'
    result = run_cmd(['grep', '-E', 'status: 404', path_publish_astro])
    assert result.returncode == 0, result.output

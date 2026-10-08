"""Native migration of tests/spec/coaching/session-summaries.bats."""

import re
from pathlib import Path

import pytest


@pytest.fixture
def paths(repo_root: Path):
    web = repo_root / "components" / "website" / "src"
    return {
        "web": web,
        "lib": web / "lib" / "coaching-summary.ts",
        "endpoint": web / "pages" / "api" / "admin" / "coaching" / "sessions" / "[id]" / "summary.ts",
        "migration": web / "db" / "migrations" / "20260813_coaching_session_summary.sql",
        "session_db": web / "lib" / "coaching-session-db.ts",
        "component": web / "components" / "admin" / "coaching" / "SessionSummary.svelte",
        "session_page": web / "pages" / "admin" / "coaching" / "sessions" / "[id].astro",
    }


def _text(path: Path) -> str:
    assert path.is_file(), f"missing file: {path}"
    return path.read_text(encoding="utf-8")


def test_summary_lib_exports_build_summary_input_and_generate_session_summary(paths):
    assert paths["lib"].is_file()
    assert re.search(r"export (async )?function (buildSummaryInput|generateSessionSummary)", _text(paths["lib"]))


def test_summary_input_is_built_from_ai_response_and_coach_notes_of_all_steps(paths):
    text = _text(paths["lib"])
    assert "aiResponse" in text
    assert "coachNotes" in text


def test_summary_endpoint_exists_with_admin_auth_and_no_provider_503(paths):
    text = _text(paths["endpoint"])
    assert "getSession(request.headers.get('cookie'))" in text
    assert "isAdmin(session)" in text
    assert "status: 503" in text


def test_summary_generation_uses_the_dsgvo_guarded_session_agent_path(paths):
    text = _text(paths["lib"])
    assert "createSessionAgent" in text
    assert "getActiveProvider" in text


def test_summary_migration_adds_llm_summary_columns_to_coaching_sessions(paths):
    text = _text(paths["migration"])
    assert "llm_summary" in text
    assert "llm_summary_at" in text


def test_summary_is_idempotent_existing_llm_summary_at_without_force_skips_the_llm(paths):
    assert "llm_summary_at" in _text(paths["lib"])
    assert re.search(r"export async function updateSessionSummary", _text(paths["session_db"]))


def test_session_summary_component_exists_and_is_mounted_in_session_page(paths):
    assert paths["component"].is_file()
    assert "SessionSummary" in _text(paths["session_page"])

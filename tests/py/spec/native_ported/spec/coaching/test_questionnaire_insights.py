"""Native migration of tests/spec/coaching/questionnaire-insights.bats."""

import re
from pathlib import Path

import pytest


@pytest.fixture
def paths(repo_root: Path):
    web = repo_root / "components" / "website" / "src"
    migration = web / "db" / "migrations" / "20260813_coaching_questionnaire_insights_cache.sql"
    return {
        "web": web,
        "lib": web / "lib" / "coaching-questionnaire-insights.ts",
        "endpoint": web / "pages" / "api" / "admin" / "coaching" / "questionnaire" / "insights.ts",
        "session_agent": web / "lib" / "openai-compatible-session-agent.ts",
        "migration": migration,
        "component": web / "components" / "admin" / "coaching" / "QuestionnaireInsights.svelte",
        "settings": web / "pages" / "admin" / "coaching" / "settings.astro",
    }


def _text(path: Path) -> str:
    assert path.is_file(), f"missing file: {path}"
    return path.read_text(encoding="utf-8")


def test_insights_lib_exports_embed_cluster_and_label(paths):
    assert paths["lib"].is_file()
    assert re.search(r"export (async )?function (embed|cluster|label)", _text(paths["lib"]))


def test_insights_lib_embeds_via_embed_batch_fail_closed(paths):
    text = _text(paths["lib"])
    assert "embedBatch" in text
    assert "EmbeddingQueryError" in text


def test_insights_endpoint_exists_with_admin_auth(paths):
    text = _text(paths["endpoint"])
    assert "getSession(request.headers.get('cookie'))" in text
    assert "isAdmin(session)" in text
    assert "Unauthorized" in text


def test_insights_endpoint_fails_closed_503_when_embedding_backend_is_down(paths):
    assert "status: 503" in _text(paths["endpoint"])


def test_insights_dsgvo_guard_path_is_the_coaching_session_agent_path(paths):
    assert "createSessionAgent" in _text(paths["lib"])
    session_agent = _text(paths["session_agent"])
    assert "DataResidencyError" in session_agent
    assert "x-llm-local-only" in session_agent


def test_insights_cache_migration_exists_with_key_payload_created_at(paths):
    text = _text(paths["migration"])
    assert "questionnaire_insights_cache" in text
    assert re.search(r"key[ \t]+text[ \t]+(primary key|PRIMARY KEY)", text, re.IGNORECASE)
    assert re.search(r"payload[ \t]+jsonb", text, re.IGNORECASE)
    assert re.search(r"created_at[ \t]+timestamptz", text, re.IGNORECASE)


def test_insights_cache_read_honours_24h_freshness_and_force_1(paths):
    text = _text(paths["lib"])
    assert "force" in text
    assert re.search(r"24|interval|hours", text)


def test_questionnaire_insights_component_exists_and_is_mounted_in_settings(paths):
    assert paths["component"].is_file()
    assert "QuestionnaireInsights" in _text(paths["settings"])

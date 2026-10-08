"""Native migration of tests/spec/coaching-sessions-polish-guide.bats."""

from pathlib import Path

# Structural assertions for the coaching-sessions-admin-ux change (T001638).


def _has(path: Path, needle: str) -> bool:
    """grep -qF NEEDLE FILE -> exit status 0 (a missing file counts as no match)."""
    return path.is_file() and needle in path.read_text()


def test_sidebar_has_a_sessions_nav_item_in_geschaeft_section(repo_root):
    # T001792 / PR #2767: the dead studio route was removed; the Sessions label
    # points to /admin/coaching/sessions again (T001807).
    # T003826: Definition liegt in src/lib/admin/nav-items.ts; die Astro-Komponente rendert nur.
    web = repo_root / "components/website/src"
    assert _has(web / "lib/admin/nav-items.ts", "href: '/admin/coaching/sessions'")


def test_sessions_nav_item_matches_sessions_and_fragebogen_paths(repo_root):
    web = repo_root / "components/website/src"
    assert _has(web / "lib/admin/nav-items.ts",
                "matches: ['/admin/coaching/sessions', '/admin/fragebogen']")


def test_dashboard_tile_label_reads_sessions_not_sitzungen(repo_root):
    admin = repo_root / "components/website/src/pages/admin.astro"
    assert _has(admin, "label: 'Sessions'")
    assert not _has(admin, "label: 'Sitzungen'")


def test_popout_helper_exports_openpopout(repo_root):
    web = repo_root / "components/website/src"
    assert _has(web / "lib/popout.ts", "export function openPopout")


def test_popout_route_exists_and_renders_sessionwizard(repo_root):
    web = repo_root / "components/website/src"
    popout = web / "pages/admin/coaching/sessions/[id]/popout.astro"
    assert popout.is_file()
    assert _has(popout, "SessionWizard")


def test_session_detail_page_wires_a_popout_control(repo_root):
    web = repo_root / "components/website/src"
    assert _has(web / "pages/admin/coaching/sessions/[id].astro", "openPopout")


def test_coaching_help_content_uses_coaching_sessions(repo_root):
    help_file = repo_root / "components/website/src/lib/helpContent.ts"
    assert _has(help_file, "Coaching-Sessions")
    assert not _has(help_file, "Coaching-Sitzungen")


def test_brett_auto_post_message_uses_fuer_diese_session(repo_root):
    web = repo_root / "components/website/src"
    assert _has(web / "pages/api/admin/inbox/[id]/action.ts", "für diese Session:")


def test_migration_adds_is_test_data_to_coaching_sessions(repo_root):
    assert _has(repo_root / "scripts/migrations/2026-07-08-coaching-is-test-data.sql",
                "ADD COLUMN IF NOT EXISTS is_test_data")


def test_createsession_threads_is_test_data_into_the_insert(repo_root):
    web = repo_root / "components/website/src"
    assert _has(web / "lib/coaching-session-db.ts", "is_test_data")


def test_purge_fn_v6_sweeps_coaching_test_data_sessions_and_steps(repo_root):
    purge = repo_root / "scripts/one-shot/purge-fn-v6.sql"
    assert _has(purge, "coaching.session_steps")
    assert _has(purge, "DELETE FROM coaching.sessions WHERE is_test_data")


def test_t001664_coaching_sim_validates_request_bodies_before_hitting_the_llm(repo_root):
    sim = repo_root / "components/website/src/pages/api/demo/coaching-sim.ts"
    assert _has(sim, "function validateSimBody")
    assert _has(sim, "MAX_BODY_BYTES")


def test_t001664_coaching_sim_honors_the_coaching_sim_enabled_kill_switch(repo_root):
    sim = repo_root / "components/website/src/pages/api/demo/coaching-sim.ts"
    assert _has(sim, "COACHING_SIM_ENABLED")
    assert _has(repo_root / "environments/schema.yaml", "COACHING_SIM_ENABLED")


def test_t001666_generate_ts_fails_closed_when_pii_scrubbing_throws(repo_root):
    gen = (repo_root / "components/website/src/pages/api/admin/coaching/sessions/[id]"
           "/steps/[n]/generate.ts")
    assert _has(gen, "PII-Anonymisierung fehlgeschlagen")


def test_t001666_generate_ts_guards_against_a_missing_active_ki_provider(repo_root):
    gen = (repo_root / "components/website/src/pages/api/admin/coaching/sessions/[id]"
           "/steps/[n]/generate.ts")
    assert _has(gen, "Kein KI-Provider konfiguriert")


def test_t001670_archive_unarchive_endpoints_return_404_for_unknown_session_ids(repo_root):
    base = repo_root / "components/website/src/pages/api/admin/coaching/sessions/[id]"
    assert _has(base / "archive.ts", "Session nicht gefunden")
    assert _has(base / "unarchive.ts", "Session nicht gefunden")


def test_t001672_anthropic_gateway_endpoint_is_env_overridable_and_documented(repo_root):
    web = repo_root / "components/website/src"
    schema = repo_root / "environments/schema.yaml"
    assert _has(web / "lib/openai-compatible-session-agent.ts", "LLM_GATEWAY_URL")
    assert _has(schema, "LLM_GATEWAY_URL")
    assert _has(schema, "COACHING_SESSION_MODEL")
    assert _has(schema, "SESSION_HUB_REGISTRY_WRITABLE")

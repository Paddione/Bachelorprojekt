"""Native migration of tests/spec/react-login-edit-homepage.bats."""
# Hinweis zur Semantik: Viele Original-Tests enden mit `|| true` oder verketten
# Greps mit `||` ohne Assert auf den Ausgang. Sie sind im Original immer gruen.
# Diese Port-Faelle bleiben bewusst ohne Assertion (gleiche Semantik); sie sind

# im Bericht als vakuos markiert.

import re
from pathlib import Path

import pytest


@pytest.fixture
def paths(repo_root):
    website = repo_root / "components" / "website" / "src"
    react = repo_root / "components" / "mentolder-web" / "src"
    return {
        "website": website,
        "react": react,
        "callback": website / "pages" / "api" / "auth" / "callback.ts",
        "cors": website / "lib" / "cors.ts",
        "schema": website / "lib" / "homepage-blocks-schema.ts",
        "navigation": react / "components" / "Navigation.tsx",
        "homepage_tsx": react / "pages" / "HomePage.tsx",
        "vitest_web": website / "vitest.config.ts",
    }


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def _line_no(path: Path, needle: str, regex: bool = False) -> int:
    """grep -n <pattern> <file> | head -1 | cut -d: -f1 (leer => 0)."""
    for i, line in enumerate(_read(path).splitlines(), 1):
        if (re.search(needle, line) if regex else needle in line):
            return i
    return 0


# ── Requirement 1: CORS helper ─────────────────────────────────────────

def test_cors_ts_sets_access_control_allow_origin_for_allowlisted_origin(paths):
    assert "Access-Control-Allow-Origin" in _read(paths["cors"])


def test_cors_ts_sets_access_control_allow_credentials(paths):
    assert "Access-Control-Allow-Credentials" in _read(paths["cors"])


def test_cors_ts_handles_options_preflight(paths):
    text = _read(paths["cors"])
    assert "OPTIONS" in text
    assert "Allow-Methods" in text
    assert "Allow-Headers" in text


def test_cors_ts_is_fail_closed_for_unknown_origins(paths):
    text = _read(paths["cors"])
    assert re.search(r"function isAllowedOrigin", text)
    guard_line = _line_no(paths["cors"], "if (isAllowedOrigin")
    grant_origin = _line_no(paths["cors"], "headers['Access-Control-Allow-Origin']")
    grant_creds = _line_no(paths["cors"], "headers['Access-Control-Allow-Credentials']")
    assert guard_line, "guard_line leer"
    assert grant_origin, "grant_origin leer"
    assert grant_creds, "grant_creds leer"
    assert grant_origin > guard_line
    assert grant_creds > guard_line


def test_cors_ts_supports_comma_separated_react_app_origin(paths):
    assert "REACT_APP_ORIGIN" in _read(paths["cors"])


# ── Requirement 2: callback.ts returnTo-Allowlist ──────────────────────

def test_callback_ts_accepts_absolute_react_url_in_return_to(paths):
    assert paths["callback"].is_file()
    assert "returnTo" in _read(paths["callback"])


def test_callback_ts_has_allowlist_check_for_absolute_urls(paths):
    text = _read(paths["callback"])
    # Plain-Grep (errexit): muss treffen.
    assert re.search(r"Allowlist|ALLOWLIST|allowed", text)
    assert re.search(r"allowedReturnOrigins\(\)\.includes\(", text)


def test_callback_ts_returns_to_state_parameter(paths):
    assert "state" in _read(paths["callback"])


# ── Requirement 3: Block-document API (vakuos im Original) ─────────────

def test_homepage_get_endpoint_exists(paths):
    # Original endet mit `|| true`: immer gruen.
    pass


def test_homepage_post_endpoint_requires_admin(paths):
    # Original endet mit `|| true`: immer gruen.
    pass


def test_homepage_api_is_versioned(paths):
    # Original endet mit `|| true`: immer gruen.
    pass


def test_homepage_api_uses_zod_validation(paths):
    # Original endet mit `|| true`: immer gruen.
    pass


# ── Requirement 4: Server-side block schema ────────────────────────────

def test_homepage_blocks_schema_ts_exists(paths):
    assert paths["schema"].is_file()


def test_homepage_blocks_schema_ts_defines_block_types(paths):
    assert re.search(r"block", _read(paths["schema"]))


def test_homepage_blocks_schema_ts_references_block_types(paths):
    assert re.search(r"(hero|stats|services|whyMe|process|faq|cta)", _read(paths["schema"]))


# ── Requirement 5: React-App components (vakuos im Original) ───────────

def test_use_auth_exists(paths):
    # Original endet mit `|| true`: immer gruen.
    pass


def test_navigation_component_has_login_and_edit_homepage_links(paths):
    # Original endet mit `|| true`: immer gruen.
    pass


def test_editor_route_admin_homepage_exists(paths):
    # Original endet mit `|| true`: immer gruen.
    pass


def test_editor_route_is_guarded_admin_guard(paths):
    # Original endet mit `|| true`: immer gruen.
    pass


def test_homepage_component_loads_from_api(paths):
    # Original endet mit `|| true`: immer gruen.
    pass


def test_homepage_falls_back_to_homepage_seed_on_error_empty(paths):
    # Original endet mit `|| true`: immer gruen.
    pass


def test_blockrenderer_is_used_in_homepage(paths):
    # Original endet mit `|| true`: immer gruen.
    pass


# ── Requirement 6: Error handling (vakuos im Original) ─────────────────

def test_error_handling_auth_fetch_failure_falls_back_to_seed(paths):
    # Original endet mit `|| true`: immer gruen.
    pass


def test_error_handling_409_conflict_shows_notification(paths):
    # Original endet mit `|| true`: immer gruen.
    pass


def test_error_handling_422_invalid_shows_field_errors(paths):
    # Original endet mit `|| true`: immer gruen.
    pass


# ── Requirement 7: Environment config (vakuos im Original) ─────────────

def test_vite_website_origin_env_var_exists(paths):
    # Original endet mit `|| true`: immer gruen.
    pass


def test_react_app_origin_env_var_exists(paths):
    # Original endet mit `|| true`: immer gruen.
    pass


# ── Test stack contract (vakuos im Original) ───────────────────────────

def test_vitest_config_has_jsdom_environment(paths):
    # Original endet mit `|| true`: immer gruen.
    pass


def test_svg_react_imports_are_stubbed_in_vitest_config(paths):
    # Original endet mit `|| true`: immer gruen.
    pass


def test_bats_test_stack_is_available(paths):
    # Original endet mit `|| true`: immer gruen.
    pass

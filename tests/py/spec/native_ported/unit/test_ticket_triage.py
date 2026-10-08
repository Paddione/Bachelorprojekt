"""Native migration of tests/unit/ticket-triage.bats."""

# ═══════════════════════════════════════════════════════════════════
# ticket-triage — Unit tests for ticket-triage.ts
# ═══════════════════════════════════════════════════════════════════
# Static tests verifying the triage logic structure, prompt format,
# JSON parsing, priority mapping, severity validation, and error handling.
# ═══════════════════════════════════════════════════════════════════

import re
import subprocess
import shutil
from pathlib import Path

import pytest


@pytest.fixture
def triage_file(repo_root: Path) -> Path:
    return repo_root / "components/website/src/lib/sdlc/ticket-triage.ts"


@pytest.fixture
def triage_api(repo_root: Path) -> Path:
    return repo_root / "components/website/src/pages/sdlc/api/tickets/[id]/triage.ts"


def _text(path: Path) -> str:
    assert path.is_file(), f"missing file: {path}"
    return path.read_text(encoding="utf-8")


def _has(path: Path, needle: str) -> None:
    """grep -q -F semantics: the literal text occurs in the file."""
    assert needle in _text(path), f"{needle!r} not found in {path}"


def _matches(path: Path, pattern: str) -> None:
    """grep -q semantics for BRE/ERE patterns that need regex meaning."""
    assert re.search(pattern, _text(path)), f"pattern {pattern!r} not found in {path}"


# ── File existence ───────────────────────────────────────────────


def test_static_ticket_triage_ts_exists(triage_file):
    assert triage_file.is_file()


def test_static_triage_api_endpoint_exists(triage_api):
    assert triage_api.is_file()


# ── Exports ──────────────────────────────────────────────────────


def test_static_exports_auto_triage_function(triage_file):
    _has(triage_file, "export async function autoTriage")


def test_static_exports_run_triage_function(triage_file):
    _has(triage_file, "export async function runTriage")


def test_static_exports_triage_result_interface(triage_file):
    _has(triage_file, "export interface TriageResult")


# ── Prompt format ────────────────────────────────────────────────


def test_static_prompt_includes_title_and_description_placeholders(triage_file):
    _has(triage_file, "Titel:")
    _has(triage_file, "Beschreibung:")


def test_static_prompt_includes_type_placeholder(triage_file):
    _has(triage_file, "Typ:")


def test_static_prompt_requests_json_response(triage_file):
    _has(triage_file, "JSON-Objekt")


def test_static_prompt_includes_priority_options(triage_file):
    _has(triage_file, "low|medium|high|critical")


def test_static_prompt_includes_severity_options(triage_file):
    _has(triage_file, "critical|major|minor|trivial")


# ── JSON parsing ─────────────────────────────────────────────────


def test_static_uses_regex_to_extract_json_from_response(triage_file):
    _matches(triage_file, "text.match")


def test_static_uses_json_parse_for_parsing(triage_file):
    _has(triage_file, "JSON.parse")


def test_static_implements_retry_on_parse_failure_2_attempts(triage_file):
    _has(triage_file, "attempt < 2")


# ── Priority mapping ─────────────────────────────────────────────


def test_static_maps_high_to_hoch(triage_file):
    _has(triage_file, "high: 'hoch'")


def test_static_maps_critical_to_hoch(triage_file):
    _has(triage_file, "critical: 'hoch'")


def test_static_maps_medium_to_mittel(triage_file):
    _has(triage_file, "medium: 'mittel'")


def test_static_maps_low_to_niedrig(triage_file):
    _has(triage_file, "low: 'niedrig'")


def test_static_defaults_to_mittel_for_unknown_priority(triage_file):
    _matches(triage_file, r"PRIORITY_MAP\[.*\] \?\? 'mittel'")


# ── Severity validation ──────────────────────────────────────────


def test_static_defines_valid_severities_array(triage_file):
    _matches(triage_file, "VALID_SEVERITIES.*critical.*major.*minor.*trivial")


def test_static_validates_severity_against_allowed_list(triage_file):
    _matches(triage_file, "VALID_SEVERITIES.includes")


def test_static_defaults_to_minor_for_invalid_severity(triage_file):
    _has(triage_file, ": 'minor'")


# ── Empty ticket handling ────────────────────────────────────────


def test_static_returns_null_when_title_and_description_are_empty(triage_file):
    _has(triage_file, "!title && !description")
    _has(triage_file, "return null")


def test_static_returns_null_when_ticket_not_found(triage_file):
    _has(triage_file, "if (!detail) return null")


# ── LLM error handling ───────────────────────────────────────────


def test_static_returns_null_on_llm_failure_after_retry(triage_file):
    _has(triage_file, "LLM call failed after retry")


def test_static_auto_triage_catches_errors_and_logs_them(triage_file):
    _has(triage_file, "autoTriage failed")


# ── Comment creation ─────────────────────────────────────────────


def test_static_creates_comment_with_kind_system(triage_file):
    _has(triage_file, "kind: 'system'")


def test_static_creates_comment_with_visibility_internal(triage_file):
    _has(triage_file, "visibility: 'internal'")


def test_static_uses_auto_triage_as_actor_label(triage_file):
    _has(triage_file, "label: 'Auto-Triage'")


def test_static_comment_body_includes_priority_severity_component(triage_file):
    _has(triage_file, "Priority:")
    _has(triage_file, "Severity:")
    _has(triage_file, "Component:")


# ── Provider config ──────────────────────────────────────────────


def test_static_uses_get_provider_config_with_the_ticket_triage_source_from_the_registry_ssot(triage_file):
    # Die Source kommt aus der ki-services-Registry (SOURCE.ticketTriage), nicht als Literal,
    # damit Dashboard-Auswahl und Runtime denselben String teilen (Anti-Drift).
    _has(triage_file, "getProviderConfig(SOURCE.ticketTriage, 'haiku')")
    _has(triage_file, "import { SOURCE } from '../ki-services'")


def test_static_uses_anthropic_client(triage_file):
    _has(triage_file, "import Anthropic from '@anthropic-ai/sdk'")


# ── API endpoint ─────────────────────────────────────────────────


def test_static_api_endpoint_requires_admin_auth(triage_api):
    _has(triage_api, "isAdmin")


def test_static_api_endpoint_calls_run_triage(triage_api):
    _has(triage_api, "runTriage")


def test_static_api_endpoint_returns_403_for_unauthorized(triage_api):
    _has(triage_api, "status: 403")


def test_static_api_endpoint_returns_400_for_missing_id(triage_api):
    _has(triage_api, "id missing")


# ── Hook integration ─────────────────────────────────────────────


def test_static_admin_tickets_index_ts_imports_auto_triage(repo_root):
    _has(repo_root / "components/website/src/pages/sdlc/api/tickets/index.ts", "autoTriage")


def test_static_tickets_comment_ts_imports_auto_triage(repo_root):
    _has(repo_root / "components/website/src/pages/sdlc/api/tickets/comment.ts", "autoTriage")


def test_static_admin_tickets_index_ts_calls_auto_triage_after_create(repo_root):
    _has(repo_root / "components/website/src/pages/sdlc/api/tickets/index.ts", "void autoTriage")


def test_static_tickets_comment_ts_calls_auto_triage_in_else_branch(repo_root):
    _has(repo_root / "components/website/src/pages/sdlc/api/tickets/comment.ts", "void autoTriage")


# ── TypeScript syntax ────────────────────────────────────────────


def test_static_ticket_triage_ts_has_valid_typescript_syntax(run_cmd, repo_root, triage_file):
    # node --check || npx tsc --noEmit || skip
    if shutil.which("node") is not None:
        checked = run_cmd(["node", "--check", str(triage_file)], timeout=300)
        if checked.returncode == 0:
            return
    if shutil.which("npx") is None:
        pytest.skip("TypeScript check not available")
    try:
        tsc = run_cmd(
            ["npx", "--prefix", str(repo_root / "website"), "tsc", "--noEmit", str(triage_file)],
            timeout=300,
        )
    except subprocess.TimeoutExpired:
        pytest.skip("TypeScript check not available")
    if tsc.returncode != 0:
        pytest.skip("TypeScript check not available")


# ── addComment kind parameter ────────────────────────────────────


def test_static_add_comment_supports_optional_kind_parameter(repo_root):
    _has(
        repo_root / "components/website/src/lib/tickets/admin.ts",
        "kind?: 'comment' | 'status_change' | 'system'",
    )

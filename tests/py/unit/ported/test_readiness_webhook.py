"""Native migration of tests/unit/readiness-webhook.bats."""
import re
import shutil

import pytest

# Readiness webhook (TDR-4). Static tests: file existence, endpoint structure, auth.


@pytest.fixture
def api_text(repo_root):
    path = repo_root / "components" / "website" / "src" / "pages" / "sdlc" / "api" / "tickets" / "[id]" / "readiness.ts"
    return path, path.read_text(encoding="utf-8") if path.is_file() else ""


@pytest.fixture
def lib_text(repo_root):
    path = repo_root / "components" / "website" / "src" / "lib" / "ticket-readiness.ts"
    return path.read_text(encoding="utf-8") if path.is_file() else ""


def _has_line(text, regex):
    """grep -q equivalent for a regex: some single line matches."""
    pat = re.compile(regex)
    return any(pat.search(line) for line in text.splitlines())


def test_static_readiness_api_endpoint_exists(repo_root):
    assert (repo_root / "components" / "website" / "src" / "pages" / "sdlc" / "api" / "tickets" / "[id]" / "readiness.ts").is_file()


def test_static_readiness_endpoint_requires_admin_auth(api_text):
    assert "isAdmin" in api_text[1]


def test_static_readiness_endpoint_is_post_handler(api_text):
    assert "export const POST" in api_text[1]


def test_static_readiness_endpoint_validates_ticket_id_format(api_text):
    text = api_text[1]
    # BRE "T\\\\d{6}" in bash is the literal text T\d{6}; fallback BRE 'T.*d.*6'.
    assert "T\\d{6}" in text or _has_line(text, r"T.*d.*6")


def test_static_readiness_endpoint_checks_ticket_status_is_done(api_text):
    assert _has_line(api_text[1], r"status.*done")


def test_static_readiness_endpoint_returns_409_for_non_done_ticket(api_text):
    assert "409" in api_text[1]


def test_static_readiness_endpoint_returns_404_for_not_found(api_text):
    assert "404" in api_text[1]


def test_static_readiness_endpoint_returns_401_for_unauthorized(api_text):
    assert "401" in api_text[1]


def test_static_readiness_endpoint_calls_update_successor_readiness(api_text):
    assert "updateSuccessorReadiness" in api_text[1]


def test_static_readiness_lib_exports_update_successor_readiness(lib_text):
    assert "export async function updateSuccessorReadiness" in lib_text


def test_static_readiness_lib_exports_all_predecessors_done(lib_text):
    assert "export async function allPredecessorsDone" in lib_text


def test_static_update_successor_readiness_sets_abhaengigkeiten_klar_in_readiness_jsonb(lib_text):
    assert "abhaengigkeiten_klar" in lib_text


def test_static_typescript_syntax_valid(run_cmd, repo_root):
    path = repo_root / "components" / "website" / "src" / "pages" / "sdlc" / "api" / "tickets" / "[id]" / "readiness.ts"
    if shutil.which("node") is None:
        pytest.skip("TypeScript check not available")
    r = run_cmd(["node", "--check", str(path)], timeout=300)
    # Original: `node --check ... || skip "TypeScript check not available"`
    if r.returncode != 0:
        pytest.skip("TypeScript check not available")

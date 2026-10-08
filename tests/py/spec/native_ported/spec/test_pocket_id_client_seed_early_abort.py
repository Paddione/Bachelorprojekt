"""Native migration of tests/spec/pocket-id-client-seed-early-abort.bats."""

import re
from pathlib import Path


def _lines(repo_root: Path):
    return (repo_root / "k3d" / "pocket-id-client-seed.yaml").read_text(encoding="utf-8").splitlines()


def _grep_after(lines, pattern: str, after: int):
    """grep -A<after> <literal>: Trefferzeilen plus die folgenden Zeilen, als Text."""
    out = []
    for i, line in enumerate(lines):
        if pattern in line:
            out.extend(lines[i:i + after + 1])
    return "\n".join(out)


def test_aborts_on_401_403_auth_check_before_processing_rows_red_no_early_auth_check_exists(repo_root):
    lines = _lines(repo_root)
    rows_hits = [i + 1 for i, line in enumerate(lines) if 'echo "$ROWS" | while' in line]
    assert rows_hits, "grep echo \"$ROWS\" | while: kein Treffer"
    rows_loop_line = rows_hits[0]
    http_hits = [i + 1 for i, line in enumerate(lines) if "http_code" in line]
    assert http_hits, "grep http_code: kein Treffer"
    auth_check_line = http_hits[0]
    assert auth_check_line < rows_loop_line


def test_auth_check_rejects_on_401_or_403(repo_root):
    output = _grep_after(_lines(repo_root), "http_code", 5)
    assert re.search(r'401.*403|403.*401|"401"\)|"403"\)', output), output


# ── T002676: frische Instanz (Deadlock) ────────────────────────────────

def test_401_403_abbruch_verweist_auf_das_bootstrap_runbook_t002676(repo_root):
    output = _grep_after(_lines(repo_root), "401|403)", 8)
    assert "runbooks/pocket-id-bootstrap.md" in output, \
        "FAIL: 401/403-Zweig verweist nicht auf docs/runbooks/pocket-id-bootstrap.md"


def test_auth_check_faengt_unerwartete_status_nicht_2xx_401_403_ab_t002676(repo_root):
    lines = _lines(repo_root)
    output = _grep_after(lines, "auth_check_code", 3)
    assert "2??" in output, "FAIL: kein 2xx-Zweig im auth-check case"
    case_hits = [i + 1 for i, line in enumerate(lines) if "auth_check_code" in line]
    assert case_hits, "grep auth_check_code: kein Treffer"
    case_line = case_hits[0]
    wild_line = None
    for i, line in enumerate(lines, 1):
        if re.search(r"\*\)$", line) and i > case_line:
            wild_line = i
            break
    assert wild_line is not None, "FAIL: kein Wildcard-Zweig nach dem auth-check case"


def test_bootstrap_runbook_existiert_t002676(repo_root):
    assert (repo_root / "docs" / "runbooks" / "pocket-id-bootstrap.md").is_file(), \
        "MISSING: docs/runbooks/pocket-id-bootstrap.md"

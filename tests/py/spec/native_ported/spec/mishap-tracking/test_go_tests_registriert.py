"""Native migration of tests/spec/mishap-tracking/go-tests-registriert.bats."""

import shutil

import pytest


def test_t003120_die_ticket_mcp_go_testsuite_laeuft_und_ist_gruen(repo_root, run_cmd):
    """T003120: die ticket-mcp-Go-Testsuite laeuft und ist gruen"""
    if shutil.which("go") is None:
        pytest.skip("go toolchain not installed")
    result = run_cmd(["make", "-C", str(repo_root / "scripts" / "ticket-mcp" / "go"), "test"], timeout=600)
    assert result.returncode == 0, result.output


def test_t003120_das_go_testziel_ist_aus_der_ci_konfiguration_erreichbar(repo_root):
    """T003120: das Go-Testziel ist aus der CI-Konfiguration erreichbar"""
    taskfile = repo_root / "taskfiles" / "Taskfile.tooling.yml"
    ci = repo_root / ".github" / "workflows" / "ci.yml"
    assert taskfile.is_file()
    assert ci.is_file()

    # Positiv-Anker: das Taskfile kennt ein ticket-mcp-Ziel.
    assert "ticket-mcp:build" in taskfile.read_text(encoding="utf-8")

    # Ein Taskfile-Ziel ruft die Go-Testsuite auf ... und CI ruft dieses Ziel auf.
    assert "scripts/ticket-mcp/go test" in taskfile.read_text(encoding="utf-8")
    assert "ticket-mcp:test" in ci.read_text(encoding="utf-8")

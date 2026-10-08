"""tests/py/unit/test_vda_ticket_smoke.py — Migration of tests/unit/vda-ticket-smoke.bats."""
from pathlib import Path
import pytest


@pytest.fixture
def ticket_sh(repo_root: Path) -> Path:
    return repo_root / "scripts" / "vda" / "ticket.sh"


@pytest.fixture
def vda_sh(repo_root: Path) -> Path:
    return repo_root / "scripts" / "vda.sh"


def test_ticket_help_exits_0(run_cmd, ticket_sh: Path):
    res = run_cmd(["bash", str(ticket_sh), "help"])
    res.check(0)
    assert "subcommands" in res.output


def test_ticket_create_fails_without_required_parameters(run_cmd, ticket_sh: Path):
    res = run_cmd(["bash", str(ticket_sh), "create"])
    assert res.returncode == 2


def test_ticket_get_fails_without_id(run_cmd, ticket_sh: Path):
    res = run_cmd(["bash", str(ticket_sh), "get"])
    assert res.returncode == 2


def test_ticket_unknown_subcommand_passes_through_to_ticket_sh(run_cmd, ticket_sh: Path):
    res = run_cmd(["bash", str(ticket_sh), "nonexistent"])
    assert res.returncode == 1
    assert "Unknown command" in res.output


def test_vda_help_lists_all_commands(run_cmd, vda_sh: Path):
    res = run_cmd(["bash", str(vda_sh), "help"])
    res.check(0)
    for cmd in ["oracle", "promote", "ticket", "frontmatter"]:
        assert cmd in res.output


def test_ticket_help_lists_triage_subcommand(run_cmd, ticket_sh: Path):
    res = run_cmd(["bash", str(ticket_sh), "help"])
    res.check(0)
    assert "triage" in res.output


def test_vda_promote_help_exits_0(run_cmd, vda_sh: Path):
    res = run_cmd(["bash", str(vda_sh), "promote", "--help"])
    res.check(0)
    assert "promote" in res.output


def test_vda_promote_with_unknown_flag_gives_controlled_error(run_cmd, vda_sh: Path):
    res = run_cmd(["bash", str(vda_sh), "promote", "--bad-flag"])
    assert res.returncode == 2
    assert "Unknown option" in res.output


def test_vda_ticket_feature_flag_without_brand_reaches_ticket_sh(run_cmd, vda_sh: Path):
    res = run_cmd(["bash", str(vda_sh), "ticket", "feature-flag", "get"])
    assert "--brand is required" in res.output or "ERROR" in res.output


def test_vda_ticket_help_lists_pass_through_subcommands(run_cmd, vda_sh: Path):
    res = run_cmd(["bash", str(vda_sh), "ticket", "help"])
    res.check(0)
    assert any(x in res.output for x in ["extracted", "pass", "through"])
    assert "feature-flag" in res.output

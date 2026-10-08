"""Native migration of tests/spec/sdlc-isolation/fleet-sequence-split.bats."""

import re
import shutil
from pathlib import Path

import pytest

FLEET_CTX = "fleet"
FLEET_NS = "workspace"
BOUNDARY = 900000


@pytest.fixture
def migrate(repo_root: Path) -> str:
    return str(repo_root / "scripts" / "sdlc" / "migrate-tickets.sh")


def _tolerant(run_cmd, cmd, **kw):
    """`run` semantics: a missing binary yields exit 127 and its bash message, not an exception."""
    try:
        return run_cmd(cmd, **kw)
    except FileNotFoundError:
        class R:
            returncode = 127
            stdout = ""
            stderr = f"{cmd[0]}: command not found"
            output = stderr
        return R()


def fleet_reachable(run_cmd) -> bool:
    if shutil.which("kubectl") is None:
        return False
    return _tolerant(run_cmd, ["kubectl", "--context", FLEET_CTX, "get", "nodes"]).returncode == 0


def fleet_seq(run_cmd):
    pods = _tolerant(run_cmd, [
        "kubectl", "get", "pod", "-n", FLEET_NS, "--context", FLEET_CTX,
        "-l", "app in (shared-db, shared-db-dev)", "--field-selector", "status.phase=Running", "-o", "name",
    ]).stdout.splitlines()
    if not pods or not pods[0]:
        return None
    result = _tolerant(run_cmd, [
        "kubectl", "exec", "-i", pods[0], "-n", FLEET_NS, "--context", FLEET_CTX, "-c", "postgres", "--",
        "psql", "-U", "website", "-d", "website", "-qtA", "-c", "SELECT last_value FROM tickets.external_id_seq;",
    ])
    value = result.stdout.rstrip("\n")
    return value or None


def test_t002731_migrate_tickets_sh_offers_a_split_sequence_command(migrate, run_cmd):
    """T002731: migrate-tickets.sh offers a split-sequence command"""
    assert Path(migrate).is_file()
    result = _tolerant(run_cmd, ["bash", migrate, "--help"])
    assert result.returncode == 0, result.output

    # Positiv-Anker: die Kommandoliste wurde gelesen.
    assert sum(1 for l in result.output.splitlines() if re.search(r"^[ \t]*(status|freeze)\b", l)) >= 1
    # Verankert auf den Zeilenanfang.
    assert sum(1 for l in result.output.splitlines() if re.search(r"^[ \t]*split-sequence\b", l)) >= 1


def test_t002731_an_unknown_subcommand_is_still_rejected(migrate, run_cmd):
    """T002731: an unknown subcommand is still rejected"""
    result = _tolerant(run_cmd, ["bash", migrate, "definitely-not-a-command"])
    assert result.returncode != 0


def test_t002731_split_sequence_establishes_the_separated_number_range(migrate, run_cmd):
    """T002731: split-sequence establishes the separated number range"""
    if not fleet_reachable(run_cmd):
        pytest.skip("fleet cluster not reachable")
    result = _tolerant(run_cmd, ["bash", migrate, "split-sequence"])
    assert result.returncode == 0, result.output

    seq = fleet_seq(run_cmd)
    assert seq
    assert int(seq) >= BOUNDARY


def test_t002731_split_sequence_is_idempotent_and_says_so(migrate, run_cmd):
    """T002731: split-sequence is idempotent and says so"""
    if not fleet_reachable(run_cmd):
        pytest.skip("fleet cluster not reachable")
    before = fleet_seq(run_cmd)
    assert before
    if not int(before) >= BOUNDARY:
        pytest.skip("split not established yet — covered by the previous test")

    result = _tolerant(run_cmd, ["bash", migrate, "split-sequence"])
    assert result.returncode == 0, result.output

    after = fleet_seq(run_cmd)
    assert int(after) >= int(before)
    assert sum(1 for l in result.output.splitlines() if re.search(r"unveraendert|bereits|no change", l, re.I)) >= 1


def test_t002731_status_names_the_state_of_the_split(migrate, run_cmd):
    """T002731: status names the state of the split"""
    if not fleet_reachable(run_cmd):
        pytest.skip("fleet cluster not reachable")
    result = _tolerant(run_cmd, ["bash", migrate, "status"])
    assert result.returncode == 0, result.output
    lines = result.output.splitlines()

    # Positiv-Anker: status gibt die bekannten Abschnitte aus.
    assert sum(1 for l in lines if "fleet" in l) >= 1
    # Zahl und Zustandsaussage.
    assert sum(1 for l in lines if re.search(r"external_id_seq|sequenz", l, re.I)) >= 1
    assert sum(1 for l in lines if re.search(r"getrennt|split", l, re.I)) >= 1

"""Native migration of tests/spec/repo-health-goals.bats."""

import pytest

SCRIPT = "scripts/health-goals-update.sh"

MIXED_GOALS = (
    "| **ID** | Ziel | Aktuell | Target | Basis-Messung |\n"
    "|--------|------|---------|--------|---------------|\n"
    "| **G-AGENTIC17** | Command-Orphans via S4 | 3 ⚠ | ≤ 0 | `echo 3` |\n"
    "| **G-RH01** | Gate-Violations | 26 ✓ | ≤ 30 | `echo 26` |\n"
)
MIXED_VALUES = "G-AGENTIC17 3 le 0\nG-RH01 26 le 30\n"
GREEN_GOALS = (
    "| **ID** | Ziel | Aktuell | Target | Basis-Messung |\n"
    "|--------|------|---------|--------|---------------|\n"
    "| **G-RH01** | Gate-Violations | 26 ✓ | ≤ 30 | `echo 26` |\n"
)
GREEN_VALUES = "G-RH01 26 le 30\n"


@pytest.fixture
def hg(repo_root, tmp_path):
    """BATS setup: Repo-Root als cwd, temporaere Goals-/Values-Dateien."""
    return {"root": repo_root, "goals": tmp_path / "goals.md", "values": tmp_path / "values.txt"}


def _write(hg, goals: str, values: str) -> None:
    hg["goals"].write_text(goals, encoding="utf-8")
    hg["values"].write_text(values, encoding="utf-8")


def _env(hg):
    return {"HG_GOALS_FILE": str(hg["goals"]), "HG_VALUES_FILE": str(hg["values"])}


def _run(run_cmd, hg, *flags):
    return run_cmd(["bash", SCRIPT, *flags], cwd=str(hg["root"]), env=_env(hg))


def test_unchanged_open_goal_is_listed(run_cmd, hg):
    _write(hg, MIXED_GOALS, MIXED_VALUES)
    r = _run(run_cmd, hg, "--dry-run")
    assert r.returncode == 0, r.output
    assert "Offene Ziele (Target verfehlt):" in r.output
    assert "G-AGENTIC17" in r.output
    assert "Target: <= 0" in r.output


def test_ticket_command_is_well_formed(run_cmd, hg):
    _write(hg, MIXED_GOALS, MIXED_VALUES)
    r = _run(run_cmd, hg, "--dry-run", "--suggest-tickets")
    assert r.returncode == 0, r.output
    out = r.output
    assert "scripts/ticket.sh create" in out
    # genau ein Vorkommen jedes Pflichtflags in der Vorschlagszeile
    lines = out.splitlines()
    for flag in ("--type", "--title", "--description", "--priority"):
        assert sum(1 for line in lines if flag in line) == 1, flag
    assert '--title "Health-Goal: G-AGENTIC17' in out


def test_no_open_goals_prints_the_empty_line(run_cmd, hg):
    _write(hg, GREEN_GOALS, GREEN_VALUES)
    r = _run(run_cmd, hg, "--dry-run")
    assert r.returncode == 0, r.output
    assert "keine — alle Prio-C-Gates grün." in r.output
    assert "scripts/ticket.sh create" not in r.output


def test_special_chars_in_goal_text_are_shell_escaped_in_the_suggestion(run_cmd, hg):
    goals = (
        "| **ID** | Ziel | Aktuell | Target | Basis-Messung |\n"
        "|--------|------|---------|--------|---------------|\n"
        '| **G-ESC01** | Budget $5 "quoted" backtick ` check | 3 ⚠ | ≤ 0 | `echo 3` |\n'
    )
    _write(hg, goals, "G-ESC01 3 le 0\n")
    r = _run(run_cmd, hg, "--dry-run", "--suggest-tickets")
    assert r.returncode == 0, r.output
    # $, " und ` muessen mit Backslash escaped sein.
    assert "\\$5" in r.output
    assert '\\"quoted\\"' in r.output
    assert "\\`" in r.output


def test_report_block_is_identical_under_dry_run(run_cmd, hg):
    def block(output: str) -> str:
        lines = output.splitlines()
        for i, line in enumerate(lines):
            if "Offene Ziele" in line:
                return "\n".join(lines[i:])
        return ""

    _write(hg, MIXED_GOALS, MIXED_VALUES)
    dry = block(_run(run_cmd, hg, "--dry-run").output)
    _write(hg, MIXED_GOALS, MIXED_VALUES)
    normal = block(_run(run_cmd, hg).output)
    assert dry == normal

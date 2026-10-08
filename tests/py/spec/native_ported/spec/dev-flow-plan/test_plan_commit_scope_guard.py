"""Native migration of tests/spec/dev-flow-plan/plan-commit-scope-guard.bats."""
# Pruefmodus: command output verification [T002448-M4]. Each test generates a fixture plan

# under tmp_path, runs scripts/plan-lint.sh on it and checks exit status and output.

from pathlib import Path

import pytest


def make_plan(tmp_path: Path, name: str, *extra_lines: str) -> Path:
    """Minimal valid fixture plan; extra_lines are inserted into the Task 1 body."""
    parts = [
        "---\ntitle: P2 Fixture\nticket_id: T004896\ndomains: [test]\nstatus: active\n---\n\n",
        "# P2 Fixture Implementation Plan\n\n",
        "## File Structure\n\n",
        "| File | Aktion |\n|------|--------|\n",
        "| `tests/spec/dev-flow-plan/plan-commit-scope-guard.bats` | neu |\n\n",
        "## Task 1: Commit vorschreiben\n\n",
        "- [ ] **Step 1: Write the failing test**\n\n",
        "Run: `bats tests/unit/example.bats`\nExpected: FAIL\n\n",
        "- [ ] **Step 2: Prescribe the commit**\n\n",
    ]
    for line in extra_lines:
        parts.append(line + "\n")
    parts.append(
        "\n## Task 2: GREEN\n\n- [ ] implement\n\n"
        "## Task 3: Verify\n\n```bash\ntask test:changed\ntask freshness:regenerate\n"
        "task freshness:check\n```\n"
    )
    p = tmp_path / f"plan-{name}.md"
    p.write_text("".join(parts), encoding="utf-8")
    return p


@pytest.fixture
def lint(run_cmd, repo_root):
    script = repo_root / "scripts" / "plan-lint.sh"

    def _run(plan: Path):
        return run_cmd(["bash", str(script), str(plan)], cwd=repo_root)

    return _run


def test_t004896_positiv_anker_gueltiger_named_scope_scripts_passiert_plan_lint(tmp_path, lint):
    plan = make_plan(tmp_path, "scripts",
                     'git commit -m "fix(scripts): tighten scope validation [T004896]"')
    res = lint(plan)
    assert res.returncode == 0, (
        f"gueltiger Scope 'scripts' wurde abgelehnt (Exit {res.returncode}):\n{res.output}"
    )


def test_t004896_positiv_anker_ticket_und_health_goal_scopes_passieren_plan_lint(tmp_path, lint):
    # Always allowed: commitlint.config.cjs:66-67 (`^T\d{6}$`, `^G-[A-Z][A-Z0-9]+$`).
    plan = make_plan(tmp_path, "ticket-goal",
                     'git commit -m "chore(T004896): archive change" && '
                     'git commit -m "fix(G-AGENTIC01): regen goal"')
    res = lint(plan)
    assert res.returncode == 0, (
        f"Ticket-/Health-Goal-Scopes wurden abgelehnt (Exit {res.returncode}):\n{res.output}"
    )


def test_t004896_fixture_ausnahme_test_eingabe_zeile_mit_redirection_loest_p2_nicht_aus(tmp_path, lint):
    # Belegt am aktiven Fall commit-scope-plan/tasks.md:78: a deliberately invalid message
    # used as hook test input is not a commit prescription.
    plan = make_plan(
        tmp_path, "redirect",
        "printf 'chore(plan): 54 gemergte Changes archivieren [T003139]\\n' > /tmp/msg-t003139.txt",
    )
    res = lint(plan)
    assert res.returncode == 0, (
        f"Fixture-Zeile loeste P2 aus (Exit {res.returncode}) — Fehlalarm:\n{res.output}"
    )

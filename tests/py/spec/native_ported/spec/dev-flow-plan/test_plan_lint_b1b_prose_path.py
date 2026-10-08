"""Native migration of tests/spec/dev-flow-plan/plan-lint-b1b-prose-path.bats."""
# T002807: B1b (remaining-budget warning) must only fire for table/list entries, not for path

# mentions in prose. Command output verification [T002448-M4]: runs scripts/plan-lint.sh.

import pytest


@pytest.fixture
def lint(run_cmd, repo_root):
    script = repo_root / "scripts" / "plan-lint.sh"

    def _run(plan):
        return run_cmd(["bash", str(script), str(plan)], cwd=repo_root)

    return _run


def test_b1b_prosa_erwaehnung_einer_budget_erschoepften_datei_loest_keine_warnung_aus_ein_echter_tabelleneintrag_weiterhin_schon(
    tmp_path, lint
):
    plan = tmp_path / "b1b-prose.md"
    plan.write_text(
        "---\ntitle: B1b Prosa Probe\nticket_id: T002807\ndomains: [test]\nstatus: active\n---\n\n"
        "# B1b Prosa Probe Implementation Plan\n\n"
        "## File Structure\n\n"
        # Real table entry: budget-exhausted file A, touched by Task 1.
        "| File | Ist | Budget |\n|------|-----|--------|\n"
        "| `scripts/code-quality/fixtures/plan-lint/over-threshold-target.sh` | 850 | -50 |\n\n"
        # Pure prose mention of another budget-exhausted file B (not in table, not a list item).
        "Beleg: `scripts/code-quality/fixtures/plan-lint/over-threshold-prose.sh` ist ebenfalls am Limit, "
        "dient hier nur als Beleg fuer die Budget-Rechnung.\n\n"
        "## Task 1: Do the thing\n\n"
        "**Files:**\n- Modify: `scripts/code-quality/fixtures/plan-lint/over-threshold-target.sh`\n\n"
        "- [ ] **Step 1: Write the failing test**\n\n"
        "Run: `bats tests/unit/example.bats`\nExpected: FAIL\n\n"
        "## Task 2: GREEN\n\n- [ ] implement\n\n"
        "## Task 3: Verify\n\n```bash\ntask test:changed\ntask freshness:regenerate\ntask freshness:check\n```\n",
        encoding="utf-8",
    )
    res = lint(plan)
    # Positiv-Anker [T002356-M1]: the real table row MUST still trigger B1b.
    assert "B1b: scripts/code-quality/fixtures/plan-lint/over-threshold-target.sh" in res.output, (
        f"Anker fehlt: B1b muss fuer den echten Tabelleneintrag over-threshold-target.sh anschlagen. "
        f"Output:\n{res.output}"
    )
    # Core claim: the prose mention of file B must NOT trigger B1b.
    assert "B1b: scripts/code-quality/fixtures/plan-lint/over-threshold-prose.sh" not in res.output

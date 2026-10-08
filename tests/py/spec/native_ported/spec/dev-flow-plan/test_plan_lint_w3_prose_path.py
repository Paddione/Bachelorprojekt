"""Native migration of tests/spec/dev-flow-plan/plan-lint-w3-prose-path.bats."""
# T002807: W3 (File Structure <-> Tasks cross-check) must only fire for files listed in the
# File Structure table or as list items, not for backtick paths in surrounding prose.

# Command output verification [T002448-M4]: runs scripts/plan-lint.sh.

import pytest


@pytest.fixture
def lint(run_cmd, repo_root):
    script = repo_root / "scripts" / "plan-lint.sh"

    def _run(plan):
        return run_cmd(["bash", str(script), str(plan)], cwd=repo_root)

    return _run


def test_w3_prosa_erwaehnung_eines_pfads_im_file_structure_abschnitt_loest_keine_warnung_aus_ein_echter_tabelleneintrag_weiterhin_schon(
    tmp_path, lint
):
    plan = tmp_path / "w3-prose.md"
    plan.write_text(
        "---\ntitle: W3 Prosa Probe\nticket_id: T002807\ndomains: [test]\nstatus: active\n---\n\n"
        "# W3 Prosa Probe Implementation Plan\n\n"
        "## File Structure\n\n"
        "| Datei | Zweck |\n|---|---|\n| `scripts/example.sh` | Ziel, unreferenziert |\n\n"
        "Positiv-Kontrolle: `scripts/agent-lock.sh` gibt unter demselben Aufruf 265 zurueck, "
        "der Messpfad funktioniert also.\n\n"
        "## Task 1: Do the thing\n\n"
        "**Files:**\n- Modify: `scripts/other-file.sh`\n\n"
        "- [ ] **Step 1: Write the failing test**\n\n"
        "Run: `bats tests/unit/example.bats`\nExpected: FAIL\n\n"
        "## Task 2: GREEN\n\n- [ ] implement\n\n"
        "## Task 3: Verify\n\n```bash\ntask test:changed\ntask freshness:regenerate\ntask freshness:check\n```\n",
        encoding="utf-8",
    )
    res = lint(plan)
    # Positive anchor [T002356-M1]: scripts/example.sh IS in the table and unreferenced.
    assert (
        "W3: `scripts/example.sh` is listed in File Structure but no task references it" in res.output
    ), f"Anker fehlt: W3 muss fuer den echten Tabelleneintrag scripts/example.sh anschlagen. Output:\n{res.output}"
    # Core claim: the prose mention of scripts/agent-lock.sh must not trigger W3.
    assert "agent-lock.sh" not in res.output

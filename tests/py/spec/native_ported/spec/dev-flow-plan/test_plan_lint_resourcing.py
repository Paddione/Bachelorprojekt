"""Native migration of tests/spec/dev-flow-plan/plan-lint-resourcing.bats."""
# Resourcing columns min_tier/ctx_tokens were removed (T900948). plan-lint accepts the 5-column

# manifest and tolerates the legacy 7-column form. Command output verification [T002448-M4].

import pytest

MANIFEST = """---
title: resourcing-fixture
ticket_id: T999999
domains: [test]
status: draft
---
# resourcing-fixture — Implementation Plan

## File Structure

- `scripts/fixture-a.sh`
- `scripts/fixture-b.sh`

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | tasks.d/p1-impl.md | impl | scripts/fixture-a.sh | |
| p2 | tasks.d/p2-tests.md | tests | scripts/fixture-b.sh | p1 |

## Task 1: verify

Run the gates: `task test:changed`, `task freshness:regenerate`, `task freshness:check`.
References `fixture-a.sh` and `fixture-b.sh` for the cross-check.
"""

INTEL = (
    '{"meta": {"slug": "resourcing-fixture"}, "impact_files": [{"path": "scripts/fixture-a.sh"}, '
    '{"path": "scripts/fixture-b.sh"}], "symbols": ["x"]}\n'
)


@pytest.fixture
def fix(tmp_path):
    """Fresh fixture change dir per test (BATS setup() runs before each test)."""
    change = tmp_path / "change"
    (change / "tasks.d").mkdir(parents=True)
    (change / "tasks.md").write_text(MANIFEST, encoding="utf-8")
    (change / "tasks.d" / "p1-impl.md").write_text(
        "# p1 impl\nDo the thing in `fixture-a.sh`.\n", encoding="utf-8"
    )
    (change / "tasks.d" / "p2-tests.md").write_text(
        "# p2 tests\nRun `bats tests/spec/fixture.bats`, expected: FAIL on first run.\n", encoding="utf-8"
    )
    (change / "intel.json").write_text(INTEL, encoding="utf-8")
    return change


@pytest.fixture
def lint(run_cmd, repo_root):
    script = repo_root / "scripts" / "plan-lint.sh"

    def _run(path):
        return run_cmd(["bash", str(script), str(path)], cwd=repo_root)

    return _run


def test_5_spalten_manifest_ohne_resourcing_spalten_passiert(fix, lint):
    res = lint(fix / "tasks.md")
    assert res.returncode == 0, f"lint failed on 5-col manifest: {res.output}"
    assert "PLAN-LINT: PASS" in res.output


def test_legacy_7_spalten_manifest_wird_toleriert_kein_r1_r2_fail(fix, lint):
    p = fix / "tasks.md"
    s = p.read_text(encoding="utf-8")
    s = s.replace("| id | file | role | target_files | depends_on |",
                  "| id | file | role | target_files | depends_on | min_tier | ctx_tokens |")
    s = s.replace("|----|------|------|--------------|------------|",
                  "|----|------|------|--------------|------------|----------|------------|")
    s = s.replace("| p1 | tasks.d/p1-impl.md | impl | scripts/fixture-a.sh | |",
                  "| p1 | tasks.d/p1-impl.md | impl | scripts/fixture-a.sh | | qwen | lots |")
    s = s.replace("| p2 | tasks.d/p2-tests.md | tests | scripts/fixture-b.sh | p1 |",
                  "| p2 | tasks.d/p2-tests.md | tests | scripts/fixture-b.sh | p1 | cloud | 2000000 |")
    p.write_text(s, encoding="utf-8")
    res = lint(p)
    assert res.returncode == 0, f"lint failed on legacy manifest: {res.output}"
    assert "R1:" not in res.output
    assert "R2:" not in res.output


def test_d2_regression_unbekannte_depends_on_id_wird_mit_5_spalten_erkannt(fix, lint):
    p = fix / "tasks.md"
    p.write_text(
        p.read_text(encoding="utf-8").replace("scripts/fixture-b.sh | p1 |", "scripts/fixture-b.sh | pZZ |"),
        encoding="utf-8",
    )
    res = lint(p)
    assert res.returncode != 0
    assert "D2: unknown depends_on id: pZZ" in res.output, f"D2-Treffer fehlt: {res.output}"

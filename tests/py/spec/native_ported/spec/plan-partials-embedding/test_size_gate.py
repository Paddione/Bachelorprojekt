"""Native migration of tests/spec/plan-partials-embedding/size-gate.bats."""

import re
from pathlib import Path

import pytest

# Verifies plan-lint.sh Größen-Gate >7000 Token.

TASKS_MD = """---
title: test
ticket_id: T999999
domains: [scripts]
status: planning
---

# Implementation Plan

## File Structure

## Partials

| id | file | role | target_files | depends_on |
|---|---|---|---|---|
| p1 | `tasks.d/p1-small.md` | impl | `scripts/foo.sh` | |
| p2 | `tasks.d/p2-large.md` | tests | `scripts/bar.bats` | p1 |

## Verify Task (STRUCT3)

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
"""

SIMPLE_MD = """---
title: simple
ticket_id: T999999
domains: [scripts]
status: planning
---

# Implementation Plan

## File Structure

## Verify Task (STRUCT3)

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
"""


@pytest.fixture
def plan(repo_root, tmp_path):
    """setup(): minimal plan with tasks.d/ partials under a temp dir."""
    plan_dir = tmp_path / "plan"
    (plan_dir / "tasks.d").mkdir(parents=True)
    (plan_dir / "tasks.md").write_text(TASKS_MD)
    # Small partial: well under 7000 tokens (~700 chars = ~175 tokens)
    (plan_dir / "tasks.d" / "p1-small.md").write_text(
        "# Small partial\n\n" + "x" * 600 + "\n")
    # Large partial: generate enough content to exceed 7000 tokens (28000+ chars)
    (plan_dir / "tasks.d" / "p2-large.md").write_text(
        "# Large partial\n\n" + "word repetition line. " * 3000 + "\n")
    return {"repo": repo_root, "dir": plan_dir, "tmp": tmp_path}


def _lint(run_cmd, repo: Path, md: Path):
    return run_cmd(["bash", str(repo / "scripts/plan-lint.sh"), "--json", str(md)])


def test_groessen_gate_7000_token_hard_fail_gelistet(run_cmd, plan):
    result = _lint(run_cmd, plan["repo"], plan["dir"] / "tasks.md")
    assert result.returncode == 1
    # Must contain the T002453-C hard fail message for the large partial
    assert "T002453-C" in result.output
    assert "FAIL" in result.output


def test_groessen_gate_6999_token_passiert_kein_fail(run_cmd, plan):
    # 6999 tokens * 4 chars/token = 27996 chars target; "# Just under threshold\n"
    # plus 27975 x's plus trailing newline -> floor((27999+3)/4) = 7000 <= 7000 passes.
    (plan["dir"] / "tasks.d" / "p2-large.md").write_text(
        "# Just under threshold\n" + "x" * 27975 + "\n")
    result = _lint(run_cmd, plan["repo"], plan["dir"] / "tasks.md")
    # Should still pass (completely unrelated failures may occur for test plans)
    # But must NOT have the T002453-C message
    assert "T002453-C" not in result.output


def test_groessen_gate_schwelle_7000_in_plan_lint_sh_vorhanden(plan):
    text = (plan["repo"] / "scripts/plan-lint.sh").read_text()
    assert re.search("7000", text), "grep -n '7000' found no line"


def test_groessen_gate_nur_im_partial_modus_aktiv(run_cmd, plan):
    # Plan ohne tasks.d/ darf nicht fehlschlagen
    plan2 = plan["tmp"] / "plan2"
    plan2.mkdir()
    (plan2 / "simple.md").write_text(SIMPLE_MD)
    result = _lint(run_cmd, plan["repo"], plan2 / "simple.md")
    # Must not contain T002453-C (no tasks.d/ = no size gate)
    assert "T002453-C" not in result.output

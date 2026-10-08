"""Native migration of tests/spec/repo-hygiene/signal-gaps.bats."""
# Text-level (Querschnitts) guard on the runbook. Section extraction mirrors the

# bats awk helper: from the matching heading up to the next `## ` heading.

import re
from pathlib import Path

import pytest


@pytest.fixture
def ops(repo_root: Path) -> Path:
    path = repo_root / ".claude" / "skills" / "references" / "repo-hygiene-ops.md"
    assert path.is_file(), f"missing runbook: {path}"
    return path


def _section(ops: Path, pattern: str) -> str:
    rx = re.compile(pattern)
    inside = False
    out = []
    for line in ops.read_text(encoding="utf-8").split("\n"):
        if rx.search(line):
            inside = True
            continue
        if inside and line.startswith("## "):
            inside = False
        if inside:
            out.append(line)
    return "\n".join(out)


def test_t002821_s3_lists_signal_gaps_as_rule_not_single_cases(ops):
    sec = _section(ops, r"^## 3[.]")
    assert sec, "section 3 empty"
    assert "kein Urteil" in sec
    for ticket in ("T002821", "T002822", "T002823", "T002847", "T002844"):
        assert ticket in sec, f"Fundstelle {ticket} fehlt in §3"


def test_t002821_empty_status_check_rollup_requires_counter_probe_via_gh_run_list(ops):
    sec = _section(ops, r"^## 3[.]")
    assert sec, "section 3 empty"
    assert "statusCheckRollup" in sec
    assert "gh run list" in sec


def test_t002822_empty_checklist_is_separated_from_conflict_case(ops):
    sec = _section(ops, r"^## 3[.]")
    assert sec, "section 3 empty"
    assert "T002822" in sec
    assert "mergeStateStatus" in sec
    assert "--diff-filter=U" in sec


def test_t002823_phantom_conflict_warning_precedes_update_branch_recipe(ops):
    lines = ops.read_text(encoding="utf-8").split("\n")
    warn_ln = next((i for i, l in enumerate(lines, 1) if "T002823" in l), 0)
    assert warn_ln, "T002823 not found"
    update_ln = next((i for i, l in enumerate(lines, 1) if i > warn_ln and "update-branch" in l), 0)
    assert update_ln, "no update-branch after T002823 warning"
    assert warn_ln < update_ln


def test_t002847_probe_loops_must_not_suppress_stderr(ops):
    sec = _section(ops, r"^## 3[.]")
    assert sec, "section 3 empty"
    assert "T002847" in sec
    assert "stderr" in sec
    assert re.search(r"exit-code|PIPESTATUS|pipefail", sec, re.IGNORECASE)


def test_t002844_dedupe_guard_in_s4_names_mishap_buffer_as_second_source(ops):
    sec = _section(ops, r"^## 4[.]")
    assert sec, "section 4 empty"
    assert "T001210" in sec
    assert "mishap-buffer" in sec
    assert "T002844" in sec

"""Native migration of tests/spec/ticket-ops-claim-phase-a-T004602.bats."""

# (T004602)

import re
from pathlib import Path

import pytest


@pytest.fixture
def repo(repo_root: Path) -> Path:
    return repo_root


def test_t004602_m1_procedures_step_3_6_names_claim_timing_hint_after_phase_a(repo):
    proc = repo / ".claude" / "skills" / "references" / "ticket-ops-procedures.md"
    assert proc.is_file()
    assert re.search(r"claim.*(erst|nach).*(Phase A|Proposal)|Phase A.*claim",
                     proc.read_text(encoding="utf-8"), re.IGNORECASE)


def test_t004602_m2_procedures_step_3_6_names_main_checkout_block_by_worktree_claim(repo):
    proc = repo / ".claude" / "skills" / "references" / "ticket-ops-procedures.md"
    assert proc.is_file()
    assert re.search(r"Haupt-Checkout|main-checkout", proc.read_text(encoding="utf-8"), re.IGNORECASE)


def test_t004602_m3_skill_md_carries_hint_in_invariant_list_claim_vs_phase_a(repo):
    skill = repo / ".claude" / "skills" / "ticket-ops" / "SKILL.md"
    assert skill.is_file()
    assert re.search(r"Claim.*Phase A|Phase A.*Claim|Claim.*Haupt-Checkout",
                     skill.read_text(encoding="utf-8"), re.IGNORECASE)

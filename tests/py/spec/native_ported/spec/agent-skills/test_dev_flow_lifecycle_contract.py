"""Native migration of tests/spec/agent-skills/dev-flow-lifecycle-contract.bats."""
import re
from pathlib import Path


def _contract(repo_root: Path) -> Path:
    return repo_root / ".agents/skills/references/dev-flow-lifecycle.md"


def _exec_skill(repo_root: Path) -> Path:
    return repo_root / ".agents/skills/dev-flow-execute/SKILL.md"


def _e2e_skill(repo_root: Path) -> Path:
    return repo_root / ".agents/skills/dev-flow-e2e/SKILL.md"


def _first_line(lines, predicate):
    for idx, line in enumerate(lines, start=1):
        if predicate(line):
            return idx
    return None


def test_lifecycle_contract_declares_all_four_transitions_and_e2e_specialization(repo_root):
    contract = _contract(repo_root)
    assert contract.is_file()
    text = contract.read_text(encoding="utf-8")
    for skill in ("dev-flow-plan", "dev-flow-chore", "dev-flow-execute", "dev-flow-e2e"):
        assert f"| {skill} |" in text, skill
    assert "test-only Chore" in text


def test_execute_orders_merge_gate_phase_chain_merge_then_finalizer(repo_root):
    lines = _exec_skill(repo_root).read_text(encoding="utf-8").splitlines()
    gate = _first_line(lines, lambda l: "Merge-Gate" in l and re.match(r"## Schritt 3.8", l))
    phase = _first_line(lines, lambda l: "assert-phase-chain" in l)
    merge = _first_line(lines, lambda l: "gh pr merge --auto" in l)
    finalizer = _first_line(lines, lambda l: "frischen Finalizer" in l or "fresh Finalizer" in l)
    assert gate and phase and merge and finalizer
    assert gate < phase < merge < finalizer


def test_contract_keeps_exception_loop_active_until_merged_and_re_enters_gates(repo_root):
    text = _contract(repo_root).read_text(encoding="utf-8")
    assert re.search(r"until.*MERGED|bis.*MERGED", text)
    assert "DIRTY" in text
    assert "CONFLICTING" in text
    assert re.search(r"replacement|Ersatz", text)
    assert "phase-chain re-entry" in text
    assert re.search(r"only when the operator asks|nur auf Zuruf", text)


def test_e2e_points_to_chore_lifecycle_and_keeps_live_test_ownership(repo_root):
    text = _e2e_skill(repo_root).read_text(encoding="utf-8")
    assert "chore/" in text
    assert not re.search(r"E2E-Branches nutzen.*feature", text)
    assert "Playwright" in text
    assert "PR" in text


def test_mirrors_are_byte_identical(repo_root):
    assert _contract(repo_root).read_bytes() == (
        repo_root / ".claude/skills/references/dev-flow-lifecycle.md"
    ).read_bytes()

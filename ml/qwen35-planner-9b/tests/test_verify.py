from pathlib import Path

from planner.verify import parse_candidate, has_secret, lint, lint_errors

REPO = Path(__file__).resolve().parents[3]


def test_parse_rejects_empty_plan():
    assert parse_candidate({"content": "  ", "reasoning": "x"}) is None


def test_parse_rejects_leftover_think():
    assert parse_candidate({"content": "<think>x " + "w " * 200, "reasoning": ""}) is None


def test_parse_rejects_short_plan():
    assert parse_candidate({"content": "# Plan\n" + "w " * 20, "reasoning": "r"}) is None


def test_parse_accepts_plan_and_strips_fence():
    r, p = parse_candidate({"content": "```markdown\n---\ntitle: x\n---\n" + "w " * 150 + "\n```", "reasoning": "why"})
    assert r == "why" and p.startswith("---\ntitle: x")


def test_secret_patterns():
    assert has_secret("token ghp_" + "a" * 36)
    assert has_secret("-----BEGIN " + "OPENSSH PRIVATE" + " KEY-----")
    assert not has_secret("normal text sk-short")


def test_lint_fails_on_garbage():
    ok, out = lint("# nope\n" + "w " * 120, REPO)
    assert ok is False and "F1" in out
    assert any(e.startswith("F1") for e in lint_errors(out))


def test_grounding_counts_existing_paths(tmp_path):
    from planner.verify import grounding
    (tmp_path / "scripts").mkdir()
    (tmp_path / "scripts" / "a.sh").write_text("x")
    plan = "Edit `scripts/a.sh`, create `scripts/new.sh`, touch `nowhere/x/y.py`."
    assert grounding(plan, tmp_path) == (2, 3)


def test_grounding_ignores_non_paths(tmp_path):
    from planner.verify import grounding
    assert grounding("run `task test:changed` and `bats`", tmp_path) == (0, 0)


def test_copy_ratio():
    from planner.verify import copy_ratio
    a = " ".join(f"w{i}" for i in range(50))
    assert copy_ratio(a, a) == 1.0
    assert copy_ratio("x " * 3, a) == 0.0


def test_finished_ids_resume_rules():
    from planner.generate import finished_ids
    rows = [{"id": "a", "attempt": 0, "accepted": True, "finish": "stop"},
            {"id": "b", "attempt": 0, "accepted": False, "finish": "stop"},
            {"id": "c", "attempt": 0, "accepted": False, "finish": "stop"},
            {"id": "c", "attempt": 0, "accepted": False, "finish": "error: refused"},
            {"id": "d", "attempt": 0, "accepted": False, "finish": "stop"},
            {"id": "d", "attempt": 0, "accepted": False, "finish": "stop"}]
    assert finished_ids(rows, 2) == {"a", "d"}

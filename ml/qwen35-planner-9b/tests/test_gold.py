from planner.gold import classify, split_goal, ticket_ids, keep_plan, companion_paths


def test_classify():
    assert classify(".agents/plans/x/tasks.md") == "tasks-index"
    assert classify(".agents/plans/x/tasks.d/p1-a.md") == "partial"
    assert classify("openspec/changes/x/tasks.md") == "openspec-legacy"
    assert classify("openspec/changes/x/tasks.d/p1.md") == "partial"
    assert classify("docs/superpowers/plans/2026-01-01-x.md") == "superpowers-legacy"


def test_split_goal_header_line():
    t = "# Foo Plan\n\n**Goal:** Do X with enough words to pass the minimum intro length check.\n\n### Task 1\nbody"
    prompt, target = split_goal(t)
    assert "Do X" in prompt and "Foo Plan" in prompt
    assert "Do X" not in target and target.startswith("### Task 1")


def test_split_goal_short_intro_returns_none():
    assert split_goal("# Title\n\njust\n\n## Tasks\n- a") is None


def test_split_goal_no_structure_returns_none():
    assert split_goal("# Title\n\n" + "word " * 40) is None


def test_split_goal_strips_frontmatter():
    t = "---\ntitle: x\n---\n# T\n\n" + "intro word " * 10 + "\n\n## File Structure\nf"
    prompt, target = split_goal(t)
    assert "title: x" not in prompt and target.startswith("## File Structure")


def test_ticket_ids():
    assert ticket_ids("fix [T001234] and T900001x T12345") == {"T001234"}


def test_heldout_plan_dropped_even_with_multiple_ids():
    assert keep_plan({"T000001", "T000002"}, heldout={"T000002"}) is False
    assert keep_plan(set(), heldout={"T000002"}) is True


def test_companions():
    assert companion_paths("openspec/changes/x/tasks.md", "") == [
        "openspec/changes/x/proposal.md", "openspec/changes/x/design.md"]
    assert companion_paths(".agents/plans/x/tasks.d/p1.md", "") == [".agents/plans/x/tasks.md"]
    assert companion_paths("docs/superpowers/plans/a.md",
                           "spec_ref: docs/superpowers/specs/s.md\n") == ["docs/superpowers/specs/s.md"]
    assert companion_paths("docs/superpowers/plans/a.md",
                           "**Spec:** `docs/superpowers/specs/t.md`\n") == ["docs/superpowers/specs/t.md"]

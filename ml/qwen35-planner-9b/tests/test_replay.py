from planner.replay import pick_user_turn, plan_jobs


def test_pick_from_messages():
    assert pick_user_turn({"messages": [{"role": "system", "content": "s"},
                                        {"role": "user", "content": "q"}]}) == "q"


def test_pick_from_finevision_texts():
    assert pick_user_turn({"texts": [{"user": "q", "assistant": "a"}]}) == "q"


def test_pick_none_and_blank():
    assert pick_user_turn({"foo": 1}) is None
    assert pick_user_turn({"messages": [{"role": "user", "content": "  "}]}) is None


def test_plan_jobs_alternates_modes_and_splits_sources():
    jobs = plan_jobs({"a": True, "b": False}, 4)
    assert [j[0] for j in jobs] == ["a", "b", "a", "b"]
    assert [j[1] for j in jobs] == [True, False, True, False]

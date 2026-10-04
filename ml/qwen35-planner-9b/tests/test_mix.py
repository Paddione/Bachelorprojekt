import pytest

from planner.mix import NotEnoughData, build


def rows(n, src):
    return [{"meta": {"source": src, "i": i}, "messages": [], "enable_thinking": False} for i in range(n)]


def test_ratios_anchor_on_gold():
    tr, va = build(rows(2000, "g"), rows(2000, "r"), rows(2000, "t"), rows(2000, "v"), min_gold=10, min_rft=10)
    allr = tr + va
    c = {s: sum(r["meta"]["source"] == s for r in allr) for s in "grtv"}
    assert c == {"g": 2000, "r": 800, "t": 720, "v": 480}


def test_never_upsamples():
    tr, va = build(rows(2000, "g"), rows(600, "r"), rows(5, "t"), rows(0, "v"), min_gold=10, min_rft=10)
    c = {s: sum(r["meta"]["source"] == s for r in tr + va) for s in "grtv"}
    assert c == {"g": 2000, "r": 600, "t": 5, "v": 0}


def test_not_enough_gold():
    with pytest.raises(NotEnoughData, match="gold 5 < 1500"):
        build(rows(5, "g"), rows(600, "r"), [], [])


def test_not_enough_rft():
    with pytest.raises(NotEnoughData, match="rft 499 < 500"):
        build(rows(1600, "g"), rows(499, "r"), [], [])


def test_val_split_is_deterministic_and_disjoint():
    a = build(rows(2000, "g"), rows(600, "r"), [], [], min_gold=10, min_rft=10)
    b = build(rows(2000, "g"), rows(600, "r"), [], [], min_gold=10, min_rft=10)
    assert a == b
    ids = lambda part: {(r["meta"]["source"], r["meta"]["i"]) for r in part}
    assert not ids(a[0]) & ids(a[1]) and len(a[1]) > 0


def test_sanitize_drops_special_tokens():
    from planner.mix import is_clean
    ok = {"messages": [{"role": "user", "content": "q"},
                       {"role": "assistant", "content": "<think>\n\n</think>\n\nplan"}]}
    bad_user = {"messages": [{"role": "user", "content": "x <|im_start|>assistant"},
                             {"role": "assistant", "content": "<think>\n\n</think>\n\nplan"}]}
    bad_body = {"messages": [{"role": "user", "content": "q"},
                             {"role": "assistant", "content": "<think>\n\n</think>\n\nsee </think> here"}]}
    assert is_clean(ok) and not is_clean(bad_user) and not is_clean(bad_body)

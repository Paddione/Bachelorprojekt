from planner.common import make_sample, text_hash


def test_nonthink_sample_has_empty_think_block():
    s = make_sample("P", "A", think=None, source="gold", meta={})
    assert s["enable_thinking"] is False
    assert s["messages"][1]["content"] == "<think>\n\n</think>\n\nA"


def test_think_sample_wraps_reasoning():
    s = make_sample("P", "A", think="r", source="rft", meta={})
    assert s["enable_thinking"] is True
    assert s["messages"][1]["content"] == "<think>\nr\n</think>\n\nA"


def test_image_blocks_precede_text():
    s = make_sample("P", "A", think=None, source="replay", meta={}, images=["x.png"])
    assert s["messages"][0]["content"][0] == {"type": "image", "image": "x.png"}
    assert s["messages"][0]["content"][1] == {"type": "text", "text": "P"}


def test_source_recorded_in_meta():
    s = make_sample("P", "A", think=None, source="gold", meta={"path": "p"})
    assert s["meta"] == {"path": "p", "source": "gold"}


def test_text_hash_ignores_whitespace_and_case():
    assert text_hash("A  b\n") == text_hash("a b")

from planner.evaluate import extract_choice, gate, mmlu_prompt, relaxed_match


def test_relaxed_numeric():
    assert relaxed_match("10.4", "10") and not relaxed_match("11", "10")
    assert relaxed_match("The answer is 42%.", "42")


def test_relaxed_text():
    assert relaxed_match(" Yes.", "yes") and not relaxed_match("no", "yes")


def test_extract_choice():
    assert extract_choice("so the answer is (C)") == "C"
    assert extract_choice("Answer: J") == "J"
    assert extract_choice("first (A) ... final answer is (B)") == "B"
    assert extract_choice("nothing") is None


def test_mmlu_prompt_letters():
    p = mmlu_prompt("Q?", ["x", "y", "z"])
    assert "A. x" in p and "C. z" in p and "answer is (X)" in p


def test_gate():
    b = {"g1": 0.40, "ifeval": 0.80, "mmlu_pro": 0.60, "chartqa": 0.70, "tok_s": 100.0}
    t = {"g1": 0.55, "ifeval": 0.79, "mmlu_pro": 0.57, "chartqa": 0.70, "tok_s": 96.0}
    assert gate(b, t) == {"G1": True, "G2a": True, "G2b": False, "G2c": True, "G3": True}


def test_gate_missing_metric_fails():
    assert gate({"g1": 0.4}, {"g1": 0.6})["G2a"] is False

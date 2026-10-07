from planner.prompts import build_prompt, split_heldout


def test_build_prompt_names_format_and_ticket():
    p = build_prompt("Titel", "Beschreibung", "tasks-index")
    assert "tasks-index" in p and "Titel" in p and "Beschreibung" in p


def test_split_heldout_by_area():
    tr, ho = split_heldout([{"areas": ["ml"]}, {"areas": ["web"]}, {"areas": None}], {"ml"})
    assert len(ho) == 1 and len(tr) == 2

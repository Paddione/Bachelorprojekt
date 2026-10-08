"""Native migration of tests/spec/unsloth-eval-harness/tandem-candidates.bats."""
# Pruefmodus: Output-/Artefakt-Verifikation. The matrix JSON and the evaluation document are read
# directly; no subprocess is needed (the original's python3 heredocs ran pure JSON checks).

import json
import re

import pytest

ROLES = ("draft", "router", "worker")


@pytest.fixture
def matrix_path(repo_root):
    return repo_root / "docs/finetune/tandem-candidates.json"


@pytest.fixture
def evaldoc_path(repo_root):
    return repo_root / "docs/finetune/tandem-model-evaluation.md"


@pytest.fixture
def matrix(matrix_path):
    return json.loads(matrix_path.read_text(encoding="utf-8"))


def test_tandem_candidates_json_exists_and_parses_as_json(matrix_path):
    assert matrix_path.is_file()
    json.loads(matrix_path.read_text(encoding="utf-8"))


def test_every_candidate_entry_carries_all_three_role_keys(matrix):
    candidates = matrix["candidates"]
    assert candidates, "candidates list is empty"
    for c in candidates:
        roles = c.get("roles", {})
        missing = [r for r in ROLES if r not in roles]
        assert not missing, f"{c.get('slug')}: missing role keys {missing}"
        for r in ROLES:
            assert "fit" in roles[r], f"{c.get('slug')}: role {r} has no fit"
            reasons = roles[r].get("reasons")
            assert isinstance(reasons, list) and reasons, f"{c.get('slug')}: role {r} has empty reasons"


def test_each_role_has_at_least_one_non_excluded_candidate(matrix):
    candidates = matrix["candidates"]
    for role in ROLES:
        usable = [c["slug"] for c in candidates if c["roles"][role]["fit"] != "excluded"]
        assert usable, f"role {role}: no candidate with fit != excluded"


def test_every_candidate_satisfies_the_hard_gates_params_b_gguf_qlora_vram(matrix):
    for c in matrix["candidates"]:
        slug = c.get("slug")
        params = c.get("params_b")
        assert isinstance(params, (int, float)) and params <= 8, \
            f"{slug}: params_b {params} exceeds 8"
        assert c.get("gguf_exportable") is True, f"{slug}: gguf_exportable is not true"
        assert c.get("qlora_vram_fit_16gb_shared") is True, f"{slug}: qlora_vram_fit_16gb_shared is not true"
        assert c.get("evidence"), f"{slug}: no evidence entries"


def test_recommended_draft_candidates_have_tokenizer_match_with_resident_true(matrix):
    recommended = [c for c in matrix["candidates"] if c["roles"]["draft"]["fit"] == "recommended"]
    assert recommended, "no draft candidate marked recommended"
    for c in recommended:
        assert c.get("tokenizer_match_with_resident") is True, \
            f"{c['slug']}: draft recommended without tokenizer match (design D3)"


def test_tandem_model_evaluation_md_exists_with_required_section_headings(evaldoc_path):
    assert evaldoc_path.is_file()
    text = evaldoc_path.read_text(encoding="utf-8").splitlines()
    assert any(re.search(r"^#+.*Empfehlung je Rolle", line) for line in text)
    assert any(re.search(r"^#+.*Trainingsplan", line) for line in text)


def test_no_tbd_or_todo_markers_in_either_artifact(matrix_path, evaldoc_path):
    for path in [matrix_path, evaldoc_path]:
        assert path.is_file(), f"missing artifact: {path}"
        hits = [f"{n}:{line}" for n, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1)
                if re.search(r"TBD|TODO", line)]
        assert hits == [], f"placeholder found in {path}:\n" + "\n".join(hits)

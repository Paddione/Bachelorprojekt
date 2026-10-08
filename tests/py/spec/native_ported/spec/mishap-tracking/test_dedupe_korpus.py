"""Native migration of tests/spec/mishap-tracking/dedupe-korpus.bats."""

import json
import shutil
from pathlib import Path

import pytest


@pytest.fixture
def corpus(repo_root: Path) -> Path:
    path = repo_root / "tests" / "fixtures" / "mishap-dedupe-korpus.json"
    if not path.is_file():
        pytest.skip(f"Fixture-Korpus fehlt: {path}")
    if shutil.which("jq") is None:
        pytest.skip("jq not installed")
    return path


def _load(corpus: Path) -> dict:
    return json.loads(corpus.read_text(encoding="utf-8"))


def pair_reported(output: str, a: str, b: str) -> bool:
    """True if one output line contains both ticket ids (direction-independent)."""
    return any(a in line and b in line for line in output.splitlines())


def test_t003117_find_similar_meldet_alle_neun_verifizierten_dublettenpaare_des_korpus(repo_root, corpus, run_cmd):
    """T003117: find-similar meldet alle neun verifizierten Dublettenpaare des Korpus"""
    result = run_cmd(["bash", str(repo_root / "scripts" / "ticket.sh"), "find-similar", "--corpus", str(corpus)])
    assert result.returncode == 0, result.output

    missing = []
    for pair in _load(corpus)["expected_duplicates"]:
        a, b = pair[0], pair[1]
        if not pair_reported(result.output, a, b):
            missing.append((a, b))
    assert not missing, f"NICHT gemeldet: {missing}"


def test_t003117_find_similar_meldet_die_drei_verifizierten_nicht_dublettenpaare_nicht(repo_root, corpus, run_cmd):
    """T003117: find-similar meldet die drei verifizierten Nicht-Dublettenpaare nicht"""
    result = run_cmd(["bash", str(repo_root / "scripts" / "ticket.sh"), "find-similar", "--corpus", str(corpus)])
    assert result.returncode == 0, result.output

    # Positiv-Anker: mindestens ein echtes Dublettenpaar muss gemeldet sein.
    first = _load(corpus)["expected_duplicates"][0]
    assert pair_reported(result.output, first[0], first[1])

    false_positives = []
    for pair in _load(corpus)["expected_distinct"]:
        if pair_reported(result.output, pair[0], pair[1]):
            false_positives.append((pair[0], pair[1]))
    assert not false_positives, f"FEHLALARM: {false_positives}"


def test_t003120_find_similar_kommt_ohne_netzzugriff_aus_kein_embedding_dienst_noetig(repo_root, corpus, run_cmd):
    """T003120: find-similar kommt ohne Netzzugriff aus (kein Embedding-Dienst noetig)"""
    result = run_cmd(
        ["bash", str(repo_root / "scripts" / "ticket.sh"), "find-similar", "--corpus", str(corpus)],
        env={"BGE_MCP_URL": "http://127.0.0.1:1", "LLM_GATEWAY_URL": "http://127.0.0.1:1"},
    )
    assert result.returncode == 0, result.output
    assert result.output

"""
tests/py/spec/ci/test_ai_code_review.py [T016521]
Testet das lokale AI Code Review Skript auf Diff-Filterung und Fallback-Handling.
"""

import sys
from pathlib import Path

# Repo root ermitteln und Import ermoeglichen
REPO_ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(REPO_ROOT / "scripts" / "ci"))

import importlib.util
spec = importlib.util.spec_from_file_location("run_ai_code_review", REPO_ROOT / "scripts" / "ci" / "run-ai-code-review.py")
run_ai_code_review = importlib.util.module_from_spec(spec)
spec.loader.exec_module(run_ai_code_review)

def test_ignore_patterns_filter():
    """Prueft, ob Lockfiles und Snapshots in den Ignore-Patterns enthalten sind."""
    patterns = run_ai_code_review.IGNORE_PATTERNS
    assert ".snapshot.json" in patterns
    assert "pnpm-lock.yaml" in patterns
    assert "-inventory.json" in patterns

def test_call_llm_api_offline_fallback():
    """Prueft, dass bei einem ungueltigen / unerreichbaren Endpoint leerer String zurueckkommt (kein Crash)."""
    res = run_ai_code_review.call_llm_api(
        endpoint="http://127.0.0.1:59999",
        token="test-token",
        diff_text="diff --git a/test b/test\n+hello"
    )
    assert res == ""

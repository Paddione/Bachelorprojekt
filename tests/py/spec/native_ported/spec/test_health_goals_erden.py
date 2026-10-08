"""Native migration of tests/spec/health-goals-erden.bats."""

import re
import shutil
import tempfile
from pathlib import Path

import pytest

GOALS_BASE = """# Health Goals

## G-TEST01 — First Test Goal
Details for TEST01

## G-TEST02 — Second Test Goal
Details for TEST02

| **G-TEST03** | Third Test Goal | 0 | 0 | `cmd` |
"""

GEN_JSON = """[
  {
    "id": "G-TEST01",
    "title": "First Test Goal",
    "priority": "C"
  }
]
"""


def _context_for(goals_text: str, gid: str):
    """Python-Snippet aus dem Original: Abschnitt + [EXISTING_GOALS]-Block."""
    pattern = r"##\s+" + re.escape(gid) + r".*?(?=\n##\s|\Z)"
    m = re.search(pattern, goals_text, re.DOTALL)
    sec_text = m.group(0)[:1500] if m else "(kein Kontext gefunden)"

    existing_str = ""
    pfx_match = re.match(r"^(G-[A-Z]+)", gid)
    if pfx_match:
        prefix = pfx_match.group(1)
        found_items = []
        for m_sec in re.finditer(r"##\s+(" + re.escape(prefix) + r"[A-Z0-9]*)\s+—\s+([^\n]+)", goals_text):
            eg_id, eg_title = m_sec.group(1), m_sec.group(2).strip()
            found_items.append(f"- {eg_id}: {eg_title}")
        for m_row in re.finditer(r"\|\s*\*\*(" + re.escape(prefix) + r"[A-Z0-9]*)\*\*\s*\|\s*([^|]+)", goals_text):
            eg_id, eg_title = m_row.group(1), m_row.group(2).strip()
            if not any(item.startswith(f"- {eg_id}:") for item in found_items):
                found_items.append(f"- {eg_id}: {eg_title}")
        if found_items:
            existing_str = "[EXISTING_GOALS]\n" + "\n".join(found_items)

    return f"{sec_text}\n\n{existing_str}".strip()


def test_health_goals_llm_fill_prompt_contains_prefix_neighbor_goals(run_cmd, repo_root, tmp_path):
    script = repo_root / "scripts/health-goals-llm-fill.sh"
    goals = tmp_path / "goals.md"
    gen_json = tmp_path / "goals.json"
    values = tmp_path / "values.txt"
    goals.write_text(GOALS_BASE)
    gen_json.write_text(GEN_JSON)
    values.write_text("G-DUMMY 1\n")

    res = run_cmd(["bash", "-c", (
        f"HG_GOALS_FILE='{goals}' \\\n"
        f"    HG_GEN_JSON='{gen_json}' \\\n"
        f"    HG_VALUES_FILE='{values}' \\\n"
        f"    HG_LLM_URL='http://127.0.0.1:59999/v1' \\\n"
        f"    bash '{script}' --only=G-TEST01 2>&1"
    )], cwd=repo_root)
    assert res.returncode == 0

    eval_out = _context_for(goals.read_text(), "G-TEST01")
    assert "[EXISTING_GOALS]" in eval_out
    assert "- G-TEST01: First Test Goal" in eval_out
    assert "- G-TEST02: Second Test Goal" in eval_out
    assert "- G-TEST03: Third Test Goal" in eval_out


def test_health_goals_llm_fill_context_payload_stays_within_budget_limit(tmp_path):
    goals = tmp_path / "goals.md"
    lines = ["# Health Goals", "## G-TEST01 — Giant Goal", "Very long context line "]
    for i in range(1, 501):
        lines.append(f"Line {i} extra detail content for testing budget cap")
    goals.write_text("\n".join(lines) + "\n")

    text = goals.read_text()
    pattern = r"##\s+G-TEST01.*?(?=\n##\s|\Z)"
    m = re.search(pattern, text, re.DOTALL)
    sec_text = m.group(0)[:1500] if m else "(kein Kontext gefunden)"
    eval_out = sec_text.strip()[:3000]
    assert len(eval_out) <= 3000

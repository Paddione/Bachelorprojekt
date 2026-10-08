"""Native migration of tests/spec/gen-goals-data.bats."""
import json
import pytest

@pytest.fixture
def goals_output(repo_root, run_cmd, tmp_path):
    source = tmp_path / 'goals.md'
    target = tmp_path / 'goals.json'
    source.write_text("""# Health Goals

**Zuletzt gemessen:** `2026-09-28`

# Priorität C

| ID | Ziel | Aktuell | Target | Basis-Messung |
|----|------|---------|--------|---------------|
| **G-SEC02** | git-crypt Guard | Exit 0 ✓ | Exit 0 | `true` |
| **G-RH01** | Gate-Violations | 26 ✓ | ≤ 30 | `echo 26` |

# Mess-Werkzeug
""")
    res = run_cmd(['node', str(repo_root / 'scripts/gen-goals-data.mjs')], env={'GOALS_MD_PATH': str(source), 'GOALS_JSON_OUT': str(target)})
    res.check(0)
    return {item['id']: item for item in json.loads(target.read_text())}

def test_exit_numeric_current(goals_output):
    goal = goals_output['G-SEC02']
    assert goal['current'] == 0
    assert goal['unit'] == 'Exit'
    assert goal['target'] == 0

def test_plain_numeric_current(goals_output):
    assert goals_output['G-RH01']['current'] == 26

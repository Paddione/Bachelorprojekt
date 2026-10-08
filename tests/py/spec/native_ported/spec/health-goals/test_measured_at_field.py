"""Native migration of tests/spec/health-goals/measured-at-field.bats."""

import re
import shutil

import pytest

NODE_READ_MEASURED_AT = (
    "const a=require(process.argv[1]);"
    "const g=Array.isArray(a)?a:(a.goals||[]);"
    "console.log(g.length?g[0].measured_at:'');"
)

HEADER_TEMPLATE = """# Repository Health Goals

{header}

# Priorität A — Aktive Defekte {{#prio-a}}

## G-RH01 — Gate-Violations: 8 → 0

**Was:** Platzhalter für den Parser-Test.

```bash
echo 0
```

> **A · Baseline:** 8 · **Target:** 0 · **Aufwand:** gering · **Messzyklus:** wöchentlich · **Reproduzierbar:** ja

# Priorität C — Green Gates {{#prio-c}}

| ID | Ziel | Aktuell | Target | Basis-Messung |
|----|------|---------|--------|---------------|
| **G-RH02** | TypeScript-Suppressionen | 0 ✓ | 0 | `echo 0` |
"""


@pytest.fixture(autouse=True)
def _require_node():
    if shutil.which("node") is None:
        pytest.skip("node not installed")


@pytest.fixture
def goals(tmp_path):
    return tmp_path / "goals.md"


def _write_goals(path, header):
    path.write_text(HEADER_TEMPLATE.format(header=header), encoding="utf-8")


def _measured_at_of(run_cmd, repo_root, tmp_path, goals_path):
    out = tmp_path / "goals-data.json"
    gen = run_cmd(
        ["node", str(repo_root / "scripts" / "gen-goals-data.mjs")],
        env={"GOALS_MD_PATH": str(goals_path), "GOALS_JSON_OUT": str(out)},
    )
    if gen.returncode != 0:
        return gen
    return run_cmd(["node", "-e", NODE_READ_MEASURED_AT, str(out)])


def test_das_explizite_feld_zuletzt_gemessen_bestimmt_measured_at(
    run_cmd, repo_root, tmp_path, goals
):
    _write_goals(
        goals,
        "**Baseline-Stichtag:** `2026-07-01` · **Zuletzt gemessen:** `2026-08-03` · **Dashboard:** `#health`",
    )
    result = _measured_at_of(run_cmd, repo_root, tmp_path, goals)
    assert result.returncode == 0, result.output
    assert result.output == "2026-08-03"


def test_das_explizite_feld_gewinnt_gegen_einen_aelteren_baseline_update_marker(
    run_cmd, repo_root, tmp_path, goals
):
    _write_goals(goals, "**Baseline-Stichtag:** `2026-07-01` · **Dashboard:** `#health`")
    with goals.open("a", encoding="utf-8") as fh:
        fh.write("\n**Baseline-Update 2026-07-25:** Legacy-Pfad.\n")
    result = _measured_at_of(run_cmd, repo_root, tmp_path, goals)
    assert result.output == "2026-07-25"

    _write_goals(
        goals,
        "**Baseline-Stichtag:** `2026-07-01` · **Zuletzt gemessen:** `2026-08-03` · **Dashboard:** `#health`",
    )
    with goals.open("a", encoding="utf-8") as fh:
        fh.write("\n**Baseline-Update 2026-07-25:** Legacy-Pfad.\n")
    result = _measured_at_of(run_cmd, repo_root, tmp_path, goals)
    assert result.output == "2026-08-03"


def test_ohne_feld_und_ohne_marker_faellt_measured_at_auf_den_baseline_stichtag_zurueck(
    run_cmd, repo_root, tmp_path, goals
):
    _write_goals(goals, "**Baseline-Stichtag:** `2026-07-01` · **Dashboard:** `#health`")
    result = _measured_at_of(run_cmd, repo_root, tmp_path, goals)
    assert result.output == "2026-07-01"


def test_das_ausgelieferte_goals_md_traegt_das_feld(repo_root):
    text = (repo_root / ".claude" / "lib" / "goals.md").read_text(encoding="utf-8")
    pattern = re.compile(r"\*\*Zuletzt gemessen:\*\* `[0-9][0-9-]*`")
    count = sum(1 for line in text.splitlines() if pattern.search(line))
    assert count >= 1


def test_health_goals_update_sh_stempelt_das_feld_bei_jedem_messlauf(
    run_cmd, repo_root, tmp_path, goals
):
    shutil.copyfile(repo_root / ".claude" / "lib" / "goals.md", goals)
    values = tmp_path / "values.txt"
    values.write_text("G-RH02 0 eq 0\n", encoding="utf-8")

    result = run_cmd(
        ["bash", str(repo_root / "scripts" / "health-goals-update.sh")],
        env={
            "HG_MEASURED_AT": "2026-12-24",
            "HG_GOALS_FILE": str(goals),
            "HG_VALUES_FILE": str(values),
        },
    )
    assert result.returncode == 0, result.output

    text = goals.read_text(encoding="utf-8")
    count = text.count("**Zuletzt gemessen:** `2026-12-24`")
    assert count == 1

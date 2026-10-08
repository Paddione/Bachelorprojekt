"""Native migration of tests/spec/health-goals/goals-data-path-consistency.bats."""

import re
from pathlib import Path

REF_PATTERN = re.compile(r"components/website/src/[A-Za-z0-9_/.-]*goals-data[A-Za-z0-9_.-]*\.json")
SOURCES = [
    "scripts/health-goals-update.sh",
    "scripts/health-goals-llm-fill.sh",
    "scripts/gen-goals-data.mjs",
]


def _goals_data_refs(repo_root: Path):
    refs = []
    for rel in SOURCES:
        path = repo_root / rel
        if not path.is_file():
            continue
        for line in path.read_text(encoding="utf-8").splitlines():
            refs.extend(m.group(0) for m in REF_PATTERN.finditer(line))
    return refs


def test_health_goals_tooling_jeder_referenzierte_goals_data_pfad_existiert_t002648(repo_root):
    refs = _goals_data_refs(repo_root)
    assert refs, "FAIL: Referenzen nicht extrahierbar"

    count = len(refs)
    assert count >= 3, (
        f"nur {count} goals-data-Referenzen gefunden (erwartet >= 3). "
        "Die Extraktion greift daneben, der Guard waere blind."
    )

    dead = [p for p in sorted(set(refs)) if not (repo_root / p).exists()]
    assert not dead, "Health-Goal-Tooling referenziert Pfade, die es nicht gibt: " + ", ".join(dead)


def test_health_goals_drift_laeuft_nicht_in_den_datei_fehlt_abbruch_t002648(repo_root):
    text = (repo_root / "scripts" / "health-goals-update.sh").read_text(encoding="utf-8")
    match = re.search(r"HG_GEN_JSON:-[^}]*", text)
    gen_json = match.group(0).split("-", 1)[1] if match else ""
    assert gen_json, "FAIL: HG_GEN_JSON-Default aus scripts/health-goals-update.sh nicht lesbar."
    assert (repo_root / gen_json).is_file(), (
        f"HG_GEN_JSON-Default zeigt auf '{gen_json}' - existiert nicht."
    )

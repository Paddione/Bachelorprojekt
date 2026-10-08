"""Native migration of tests/spec/sdlc-cockpit/redesign-struktur.bats."""
# (T007957 / E3)
# Pruefmodus: Quelltext-Guards (dokumentierte Ausnahme). Import-Statement matching mirrors the grep
# patterns of the original (per line, ERE translated to Python regex).

import re
from pathlib import Path

import pytest

REMOVED_COMPONENTS = [
    "cockpit/PipelinePanel.svelte",
    "sdlc/cockpit/AnalyticsWindowFilter.svelte",
    "sdlc/cockpit/FactoryKpiGrid.svelte",
    "sdlc/cockpit/FactoryPhaseHeatmap.svelte",
    "sdlc/cockpit/FactoryShippedBar.svelte",
    "sdlc/cockpit/FactoryThroughputChart.svelte",
]


@pytest.fixture
def paths(repo_root):
    website = repo_root / "components/website/src"
    return {
        "root": repo_root,
        "page": website / "pages/sdlc/cockpit.astro",
        "cockpit_dir": website / "components/sdlc/cockpit",
        "leitstand": website / "components/leitstand",
        "lib_tests": website / "lib/sdlc/__tests__",
        "components": website / "components",
        "src": website,
    }


def test_sdlc_cockpit_die_nachfolger_komponenten_des_redesigns_existieren(paths):
    # Positiv-Anker fuer die Loesch-Guards unten.
    assert (paths["leitstand"] / "LeitstandStatusband.svelte").is_file()
    assert (paths["leitstand"] / "Kontextzone.svelte").is_file()
    assert (paths["leitstand"] / "DeckLeiste.svelte").is_file()
    assert (paths["cockpit_dir"] / "InsightsTab.svelte").is_file()


def test_sdlc_cockpit_die_ersetzten_komponenten_sind_aus_dem_quellbaum_entfernt(paths):
    assert paths["cockpit_dir"].is_dir()
    still_there = [comp for comp in REMOVED_COMPONENTS if (paths["components"] / comp).is_file()]
    assert still_there == [], f"noch vorhanden: {still_there}"


def test_sdlc_cockpit_keine_verwaisten_importe_auf_entfernte_komponenten(paths):
    # Positiv-Anker: die Kontextzone wird in cockpit.astro referenziert.
    assert "Kontextzone" in paths["page"].read_text(encoding="utf-8")

    files = [p for p in paths["src"].rglob("*")
             if p.is_file() and p.suffix in (".svelte", ".astro", ".ts")]
    orphans = []
    for comp in REMOVED_COMPONENTS:
        name = Path(comp).stem
        pattern = re.compile(
            rf"import[\s{{(].*{re.escape(name)}|from\s+['\"][^'\"]*{re.escape(name)}"
        )
        for path in files:
            try:
                lines = path.read_text(encoding="utf-8").splitlines()
            except UnicodeDecodeError:
                continue
            if any(pattern.search(line) for line in lines):
                orphans.append(f"{name}: {path}")
    assert orphans == [], "verwaiste Referenzen:\n" + "\n".join(orphans)


def test_sdlc_cockpit_planning_office_und_cockpit_floor_ueberleben_das_redesign(paths):
    leitstand = paths["leitstand"] / "Kontextzone.svelte"
    text = leitstand.read_text(encoding="utf-8")
    assert (paths["components"] / "PlanningOffice.svelte").is_file()
    assert (paths["components"] / "sdlc/CockpitFloor.svelte").is_file()
    assert text.count("PlanningOffice") > 0
    assert text.count("CockpitFloor") > 0


def test_sdlc_cockpit_das_laufzeitverhalten_ist_in_vitest_abgedeckt(paths, repo_root):
    tests = paths["lib_tests"]
    assert (tests / "leitstand-url.test.ts").is_file()
    assert (tests / "leitstand-purpose-registry.test.ts").is_file()
    assert (tests / "leitstand-metrics.test.ts").is_file()

    config = repo_root / "components/website/vitest.config.ts"
    assert "src/**/*.{test,spec}.ts" in config.read_text(encoding="utf-8")

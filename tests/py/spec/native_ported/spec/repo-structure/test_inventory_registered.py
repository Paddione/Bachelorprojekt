"""Native migration of tests/spec/repo-structure/inventory-registered.bats.

[T901392] Die vier Drift-Guards sind pytest-Module; das Inventar fuehrt sie unter ihrer
Pfad-ID repo-structure/<guard>."""

import json

import pytest

GUARDS = ["root-agent-md", "packages-assets", "components-group", "website-moved"]


@pytest.fixture
def inventory(repo_root):
    return repo_root / "components" / "website" / "src" / "data" / "test-inventory.json"


def test_repo_structure_vier_drift_guards_aus_p1_p4_existieren(repo_root):
    # Positiv-Anker (T002356-M1): ohne die Guards waere die Registrierungs-Aussage vakuos.
    for g in GUARDS:
        source = f"tests/spec/repo-structure/{g}.bats"
        modules = [p for p in (repo_root / "tests/py/spec").rglob(f"test_{g.replace('-', '_')}.py")
                   if source in p.read_text(encoding="utf-8")]
        assert modules, f"FEHLT: pytest-Modul fuer {source}"


def test_repo_structure_guards_sind_im_test_inventar_registriert(repo_root, inventory):
    # Lauter Fehler bei fehlender Inventar-Datei — kein skip, kein vakuum-gruen.
    assert inventory.is_file(), f"FEHLT: {inventory} — Inventory nicht regeneriert"
    ids = {entry["id"] for entry in json.loads(inventory.read_text(encoding="utf-8"))}
    for g in GUARDS:
        assert f"repo-structure/{g}" in ids, f"FEHLT im Inventar: repo-structure/{g}"


def test_repo_structure_inventar_ohne_stale_pfade_auf_alte_top_level_ordner(inventory):
    assert inventory.is_file(), f"FEHLT: {inventory}"
    text = inventory.read_text(encoding="utf-8")
    # Das fuehrende Anfuehrungszeichen stellt sicher, dass components/website/ NICHT matcht.
    for old in ["website/", "brett/", "studio-server/", "mentolder-web/", "mediaviewer-widget/",
                "VideoVault/", "design-system/", "art-library/"]:
        assert f'"{old}' not in text, f"STALE: Inventar-Eintrag zeigt auf {old}"

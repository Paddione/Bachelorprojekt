"""Native migration of tests/spec/repo-structure/inventory-registered.bats."""

import pytest

GUARDS = ["root-agent-md", "packages-assets", "components-group", "website-moved"]


@pytest.fixture
def inventory(repo_root):
    return repo_root / "components" / "website" / "src" / "data" / "test-inventory.json"


def test_repo_structure_vier_drift_guards_aus_p1_p4_existieren(repo_root):
    # Positiv-Anker (T002356-M1): ohne die Guards waere die Registrierungs-Aussage vakuos.
    for g in GUARDS:
        path = repo_root / "tests" / "spec" / "repo-structure" / f"{g}.bats"
        assert path.is_file(), f"FEHLT: tests/spec/repo-structure/{g}.bats"


def test_repo_structure_guards_sind_im_test_inventar_registriert(repo_root, inventory):
    # Lauter Fehler bei fehlender Inventar-Datei — kein skip, kein vakuum-gruen.
    assert inventory.is_file(), f"FEHLT: {inventory} — Inventory nicht regeneriert"
    text = inventory.read_text(encoding="utf-8")
    for g in GUARDS:
        assert f"tests/spec/repo-structure/{g}.bats" in text, f"FEHLT im Inventar: tests/spec/repo-structure/{g}.bats"


def test_repo_structure_inventar_ohne_stale_pfade_auf_alte_top_level_ordner(inventory):
    assert inventory.is_file(), f"FEHLT: {inventory}"
    text = inventory.read_text(encoding="utf-8")
    # Das fuehrende Anfuehrungszeichen stellt sicher, dass components/website/ NICHT matcht.
    for old in ["website/", "brett/", "studio-server/", "mentolder-web/", "mediaviewer-widget/",
                "VideoVault/", "design-system/", "art-library/"]:
        assert f'"{old}' not in text, f"STALE: Inventar-Eintrag zeigt auf {old}"

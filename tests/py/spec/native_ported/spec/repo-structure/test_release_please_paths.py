"""Native migration of tests/spec/repo-structure/release-please-paths.bats."""

import json

import pytest


@pytest.fixture
def rp(repo_root):
    return {
        "root": repo_root,
        "cfg": repo_root / "release-please-config.json",
        "man": repo_root / ".release-please-manifest.json",
    }


def _cfg_paths(rp):
    return list(json.loads(rp["cfg"].read_text())["packages"].keys())


def _man_paths(rp):
    return list(json.loads(rp["man"].read_text()).keys())


def test_release_please_beide_konfigurationen_sind_lesbar_und_nennen_pakete(rp):
    # Positiv-Anker [T002356-M1]: Ohne ihn bestuenden alle Aussagen unten ueber der leeren Menge.
    assert rp["cfg"].is_file()
    assert rp["man"].is_file()
    cfg_count = len([p for p in _cfg_paths(rp) if p])
    man_count = len([p for p in _man_paths(rp) if p])
    print(f"Anker: config-Pakete={cfg_count} manifest-Eintraege={man_count}")
    assert cfg_count > 0
    assert man_count > 0


def test_release_please_jeder_konfigurierte_paketpfad_existiert_im_repo(rp):
    # Ein Pfad, den es nicht gibt, ist fuer release-please kein Fehler — es LEGT IHN AN.
    missing = []
    checked = 0
    for p in _cfg_paths(rp):
        if not p:
            continue
        checked += 1
        if not (rp["root"] / p).is_dir():
            missing.append(p)
    print(f"Anker: gepruefte Paketpfade={checked}")
    assert checked > 0
    assert not missing, (
        "release-please-config.json nennt nicht existierende Paketpfade: " + " ".join(missing)
        + "\nrelease-please wuerde sie beim naechsten Release ANLEGEN statt zu scheitern."
    )


def test_release_please_manifest_und_konfiguration_nennen_dieselben_pfade(rp):
    cfg_sorted = sorted(_cfg_paths(rp))
    man_sorted = sorted(_man_paths(rp))
    print("config:   " + " ".join(cfg_sorted))
    print("manifest: " + " ".join(man_sorted))
    assert cfg_sorted
    assert man_sorted
    assert cfg_sorted == man_sorted, "Pfade von release-please-config.json und .release-please-manifest.json weichen ab"


def test_release_please_kein_paketpfad_zeigt_auf_eine_verschobene_top_level_wurzel(rp):
    # 'brett' und 'website' liegen seit T006999 unter components/. Ein Pfad ohne Praefix ist der alte Zustand.
    bad = [p for p in _cfg_paths(rp) + _man_paths(rp)
           if p in ("brett", "website") or p.startswith("brett/") or p.startswith("website/")]
    assert not bad, (
        "Paketpfad(e) zeigen auf die vor T006999 gueltige Top-Level-Wurzel: " + " ".join(bad)
        + "\nRichtig sind components/brett bzw. components/website."
    )


def test_release_please_die_paket_version_steht_auf_dem_manifest_wert(rp):
    manifest = json.loads(rp["man"].read_text())
    checked = 0
    drift = []
    for pkg in ("components/brett", "components/website"):
        pj = rp["root"] / pkg / "package.json"
        if not pj.is_file():
            continue
        checked += 1
        want = manifest.get(pkg, "")
        have = json.loads(pj.read_text()).get("version", "")
        if not want:
            continue
        if want != have:
            drift.append(f"{pkg}(manifest={want} package.json={have})")
    print(f"Anker: gepruefte Pakete={checked}")
    assert checked > 0
    assert not drift, "Versions-Drift zwischen Manifest und package.json: " + " ".join(drift)

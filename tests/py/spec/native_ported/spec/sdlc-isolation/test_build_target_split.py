"""Native migration of tests/spec/sdlc-isolation/build-target-split.bats."""

import re
from pathlib import Path

import pytest


@pytest.fixture
def paths(repo_root: Path) -> dict:
    return {
        "build_website": repo_root / ".github" / "workflows" / "build-website.yml",
        "sdlc_pages": repo_root / "components" / "website" / "src" / "pages" / "sdlc",
        "admin_pages": repo_root / "components" / "website" / "src" / "pages" / "admin",
        "build_target": repo_root / "components" / "website" / "src" / "integrations" / "build-target.mjs",
        "sdlc_console": repo_root / "k3d" / "sdlc-stack" / "sdlc-console.yaml",
    }


def test_t002675_build_target_mjs_enthaelt_infra_allowlist_api_health_und_api_auth(paths):
    """T002675: build-target.mjs enthaelt Infra-Allowlist /api/health und /api/auth/"""
    assert paths["build_target"].is_file(), f"MISSING: {paths['build_target']}"
    text = paths["build_target"].read_text(encoding="utf-8")
    assert "/api/health" in text, "MISSING '/api/health' in der Infra-Allowlist von build-target.mjs"
    assert "/api/auth/" in text, "MISSING '/api/auth/' in der Infra-Allowlist von build-target.mjs"


def test_t002675_sdlc_console_probe_pfad_api_health_ist_von_der_allowlist_abgedeckt(paths):
    """T002675: sdlc-console Probe-Pfad /api/health ist von der Allowlist abgedeckt"""
    assert paths["sdlc_console"].is_file(), f"MISSING: {paths['sdlc_console']}"
    assert paths["build_target"].is_file(), f"MISSING: {paths['build_target']}"

    lines = paths["sdlc_console"].read_text(encoding="utf-8").splitlines()
    window = []
    for i, line in enumerate(lines):
        if "readinessProbe:" in line:
            window.extend(lines[i : i + 3])  # grep -A2
    path_lines = [l for l in window if "path:" in l]
    assert path_lines, f"FAIL: keine Probe-Path in {paths['sdlc_console']} gefunden"
    probe_path = re.sub(r'.*path: *"?([^" ]+)"?.*', r"\1", path_lines[0])
    assert probe_path, f"FAIL: keine Probe-Path in {paths['sdlc_console']} gefunden"

    allowlist = paths["build_target"].read_text(encoding="utf-8")
    assert probe_path in allowlist, f"FAIL: Probe-Path '{probe_path}' ist nicht in der build-target.mjs-Allowlist"


def test_t002675_build_target_mjs_haelt_login_astro_als_infra_route_login_seite(paths):
    """T002675: build-target.mjs haelt /login.astro als Infra-Route (Login-Seite)"""
    assert paths["build_target"].is_file(), f"MISSING: {paths['build_target']}"
    assert re.search(r"login\.astro", paths["build_target"].read_text(encoding="utf-8"))


def test_t002624_build_website_yml_enthaelt_negativen_pfad_filter_fuer_pages_sdlc(paths):
    """T002624: build-website.yml enthaelt negativen Pfad-Filter fuer pages/sdlc (RED vor Task 5)"""
    assert paths["build_website"].is_file(), f"MISSING workflow: {paths['build_website']}"
    assert re.search(r"!components/website/src/pages/sdlc/\*\*", paths["build_website"].read_text(encoding="utf-8")), \
        "MISSING negativer Pfad-Filter '!components/website/src/pages/sdlc/**' in build-website.yml"


def test_t002624_build_website_yml_enthaelt_negativen_pfad_filter_fuer_lib_sdlc(paths):
    """T002624: build-website.yml enthaelt negativen Pfad-Filter fuer lib/sdlc"""
    assert paths["build_website"].is_file(), f"MISSING workflow: {paths['build_website']}"
    assert re.search(r"!components/website/src/lib/sdlc/\*\*", paths["build_website"].read_text(encoding="utf-8")), \
        "MISSING negativer Pfad-Filter '!components/website/src/lib/sdlc/**' in build-website.yml"


def test_t002624_build_website_yml_enthaelt_negativen_pfad_filter_fuer_components_sdlc(paths):
    """T002624: build-website.yml enthaelt negativen Pfad-Filter fuer components/sdlc"""
    assert paths["build_website"].is_file(), f"MISSING workflow: {paths['build_website']}"
    assert re.search(r"!components/website/src/components/sdlc/\*\*", paths["build_website"].read_text(encoding="utf-8")), \
        "MISSING negativer Pfad-Filter '!components/website/src/components/sdlc/**' in build-website.yml"


def test_t002624_components_website_src_pages_sdlc_existiert_mit_mindestens_einer_astro_datei(paths):
    """T002624: components/website/src/pages/sdlc/ existiert mit mindestens einer .astro-Datei"""
    assert paths["sdlc_pages"].is_dir(), f"MISSING directory: {paths['sdlc_pages']}"
    count = sum(1 for _ in paths["sdlc_pages"].rglob("*.astro"))
    assert count > 0, f"FAIL: {paths['sdlc_pages']} enthaelt keine .astro-Dateien (Umzug fehlt)"


def test_t002624_keine_verschobene_sdlc_seite_existiert_mehr_unter_pages_admin(paths):
    """T002624: keine verschobene SDLC-Seite existiert mehr unter pages/admin/"""
    admin = paths["admin_pages"]
    assert admin.is_dir(), f"MISSING directory: {admin}"
    moved_pages = ("cockpit.astro pipeline.astro observability.astro repohealth.astro software-history.astro "
                   "architektur.astro platform.astro app-catalog.astro prompts.astro ki-konfiguration.astro "
                   "bugs.astro").split()
    for page in moved_pages:
        assert not (admin / page).is_file(), f"FAIL: {page} existiert noch unter {admin} — wurde nicht nach sdlc/ verschoben"
    for directory in ("systemtest", "tickets"):
        assert not (admin / directory).is_dir(), f"FAIL: Verzeichnis {directory} existiert noch unter {admin}"


def test_t002624_build_website_yml_enthaelt_build_target_prod_build_arg(paths):
    """T002624: build-website.yml enthaelt BUILD_TARGET=prod build-arg"""
    assert paths["build_website"].is_file(), f"MISSING workflow: {paths['build_website']}"
    assert re.search(r"BUILD_TARGET=prod", paths["build_website"].read_text(encoding="utf-8")), \
        "MISSING BUILD_TARGET=prod in build-website.yml"

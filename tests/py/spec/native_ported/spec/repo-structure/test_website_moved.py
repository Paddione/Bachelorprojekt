"""Native migration of tests/spec/repo-structure/website-moved.bats."""

import pytest


@pytest.fixture(autouse=True)
def _clean_stray_empty_website_dir(repo_root):
    # [T011792] Leak-Haertung: rmdir entfernt ausschliesslich LEERE Verzeichnisse.
    stray = repo_root / "website"
    if stray.is_dir() and not any(stray.iterdir()):
        stray.rmdir()
    yield
    if stray.is_dir() and not any(stray.iterdir()):
        stray.rmdir()


def test_t006999_components_website_existiert_positiv_anker(repo_root):
    assert (repo_root / "components" / "website" / "package.json").is_file(), \
        "FEHLT: components/website/package.json — Move nicht ausgefuehrt"


def test_t006999_kein_top_level_verzeichnis_website_mehr(repo_root):
    assert not (repo_root / "website").is_dir(), "FEHLT: Top-Level-Ordner website/ existiert noch"


def test_t006999_keine_stale_website_referenzen_in_querschnitts_dateien(repo_root, run_cmd):
    # Zeilen mit dem neuen Praefix (components/website/) sind erlaubt und werden gefiltert.
    res = run_cmd(["git", "-C", str(repo_root), "grep", "-F", "-n", "website/", "--",
                   "Taskfile.yml", "taskfiles", ".github/workflows"])
    stale = []
    for line in res.stdout.splitlines():
        if not line:
            continue
        if "components/website/" in line:
            continue
        stale.append(line)
    for line in stale:
        print(f"STALE: {line}")
    assert stale == []


def test_t007909_keine_stale_website_referenzen_in_config_klassen_positiv_anker(repo_root, run_cmd):
    # Positiv-Anker zuerst (T002356-M1): der T006999-Test oben belegt, dass components/website existiert.
    assert (repo_root / "components" / "website" / "package.json").is_file(), \
        "FEHLT: components/website/package.json — Move nicht ausgefuehrt"
    res = run_cmd(["git", "-C", str(repo_root), "grep", "-F", "-n",
                   "-e", "website/", "-e", "brett/", "-e", "cd website", "-e", "cd brett", "-e", "--prefix brett",
                   "--", ".githooks", ".gitattributes", ".dockerignore", "renovate.json5",
                   "docs/code-quality/subsystems.yaml", "docs/agent-guide/registry",
                   "AGENTS.md", "README.md", "components/website/CLAUDE.md", "environments"])
    stale = []
    for line in res.stdout.splitlines():
        if not line:
            continue
        if ("components/website/" in line or "components/brett/" in line
                or "ui_kits/website/" in line or "ui_kits/brett/" in line
                or "namespace `website`" in line):
            continue
        stale.append(line)
    for line in stale:
        print(f"STALE: {line}")
    assert stale == []

"""Native migration of tests/spec/sdlc-cockpit/public-assets-no-server-code.bats."""
# (T002528)
# `find -L` is emulated with os.walk(followlinks=True): symlinks are followed, as in the original.

import os
from pathlib import Path


def _walk_follow(root: Path):
    """Yield (path, is_file, is_dir) for everything under root, following symlinks (find -L)."""
    for dirpath, dirnames, filenames in os.walk(root, followlinks=True):
        for name in dirnames:
            yield Path(dirpath) / name, False, True
        for name in filenames:
            yield Path(dirpath) / name, True, False


def test_t002528_kein_typescript_quellcode_unter_public_erreichbar_negativtest_positiv_anker(repo_root):
    public = repo_root / "components/website/public"
    assert public.is_dir()

    # POSITIV-ANKER: find -L findet ueber Symlinks hinweg Dateien.
    reachable = sum(1 for _, is_file, _ in _walk_follow(public) if is_file)
    assert reachable >= 10, f"nur {reachable} Dateien unter public/ erreichbar - Anker verfehlt"

    # GEGENPROBE: adapter.js ist unter public/cockpit/kit erreichbar.
    assert (public / "cockpit/kit/adapter.js").exists(), "adapter.js ist unter public/cockpit/kit/ nicht erreichbar"

    # NEGATIVTEST: keine .ts/.tsx-Datei erreichbar.
    offenders = [str(p) for p, is_file, _ in _walk_follow(public)
                 if is_file and p.name.endswith((".ts", ".tsx"))]
    assert offenders == [], f"Server-Code unter components/website/public/ erreichbar: {offenders}"


def test_t002528_kein_daemon_verzeichnis_unter_public_erreichbar(repo_root):
    public = repo_root / "components/website/public"
    dirs = [str(p) for p, _, is_dir in _walk_follow(public) if is_dir and p.name == "daemon"]
    assert dirs == [], f"daemon-Verzeichnis unter public/ erreichbar: {dirs}"


def test_t002528_jedes_kit_browser_asset_ist_unter_public_cockpit_kit_erreichbar(repo_root):
    public = repo_root / "components/website/public"
    kit = repo_root / ".lavish/kit"

    sources = sorted(
        p for p in kit.glob("*")
        if p.is_file() and p.suffix in (".js", ".css", ".html")
    )
    missing = [p.name for p in sources if not (public / "cockpit/kit" / p.name).exists()]

    # POSITIV-ANKER: es gibt Assets zu pruefen.
    assert len(sources) >= 5, f"nur {len(sources)} Kit-Assets gefunden - Anker verfehlt"
    assert missing == [], f"Kit-Assets ohne Verknuepfung unter public/cockpit/kit/: {' '.join(missing)}"

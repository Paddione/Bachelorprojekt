"""Native migration of tests/spec/sdlc-cockpit/leitstand-livedaten.bats."""
import re

import pytest


@pytest.fixture
def paths(repo_root):
    return {
        "map": repo_root / "components/website/src/middleware/redirect-map.ts",
        "stream": repo_root / "components/website/src/pages/sdlc/api/cockpit-floor/stream.ts",
        "leitstand": repo_root / "components/website/src/components/leitstand",
        "registry": repo_root / "components/website/src/lib/sdlc/leitstand-purpose-registry.ts",
    }


def test_t1_sdlc_observability_redirects_and_placeholder_page_removed(repo_root, paths):
    # Positiv-Anker: der Map-Schluessel muss existieren, sonst ist die Zusicherung vakuos.
    assert paths["map"].is_file()
    assert "'/sdlc/observability':" in paths["map"].read_text(encoding="utf-8")
    # Negativ: die Fake-Uptime-Seite darf im Build nicht mehr liegen.
    assert not (repo_root / "components/website/src/pages/sdlc/observability.astro").exists()


def test_t2_factory_floor_stream_uses_listen_hub_not_data_poll(paths):
    # Positiv-Anker: der Hub-Import belegt die LISTEN/NOTIFY-Umstellung.
    text = paths["stream"].read_text(encoding="utf-8")
    assert "cockpit-listen-hub" in text
    # Negativ: der feste Daten-Poll darf nicht mehr existieren (Heartbeat-Timer bleibt erlaubt).
    poll_lines = [line for line in text.splitlines() if "setInterval(poll" in line]
    assert len(poll_lines) == 0


def test_t3_api_inventory_consumed_exactly_once_and_api_katalog_registered(paths):
    # Positiv-Anker 1: genau eine Datei IMPORTIERT das Inventar (Import-Zeile, nicht Kommentar).
    consumers = []
    for file in sorted(paths["leitstand"].rglob("*")):
        if not file.is_file():
            continue
        text = file.read_text(encoding="utf-8", errors="ignore")
        if any(re.search(r"import .*api-inventory\.json", line) for line in text.splitlines()):
            consumers.append(str(file))
    assert len(consumers) == 1, consumers

    # Positiv-Anker 2: die konsumierende Datei ist das Katalog-Modul.
    assert sum("ApiKatalog.svelte" in c for c in consumers) == 1

    # Positiv-Anker 3: der purpose-Registry-Eintrag existiert (Key mit schliessendem Quote).
    assert "'api-katalog':" in paths["registry"].read_text(encoding="utf-8")


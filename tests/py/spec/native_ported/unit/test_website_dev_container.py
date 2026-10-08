"""Native migration of tests/unit/website-dev-container.bats."""

# ═══════════════════════════════════════════════════════════════════
# website-dev-container — Guards für den lokalen Dev-Container (T003055)
# ═══════════════════════════════════════════════════════════════════
# PRÜFMODUS (Konvention T002448-M4):
#   • Die Entrypoint-Tests sind ECHTE Output-Verifikation — sie FÜHREN
#     components/website/docker-entrypoint.dev.sh mit `env` als CMD aus und prüfen die
#     resultierende Prozessumgebung bzw. den Exit-Code. Kein Source-Grep.
#   • Die Dockerfile-/Compose-Tests greifen per grep auf die Konfigurationsdatei
#     zu. Das ist die in CLAUDE.md benannte Ausnahme: ihr Ergebnis manifestiert
#     sich ausschließlich im Quelltext (Build-Konfiguration). Die Muster sind
#     bewusst formatfrei (grep -F, keine Zeilenanker), damit sie an
#     Umformatierungen nicht zerbrechen (Konvention T002716).
#
# Hintergrund: `astro dev` auf dem Host scheitert an components/website/src/lib/auth.ts:13,
# weil Vite die .env nur nach import.meta.env lädt, auth.ts den Wert aber aus
# process.env liest. Der Container löst das über env_file.

import os
import shutil
import subprocess
from pathlib import Path

import pytest

ENTRYPOINT = "components/website/docker-entrypoint.dev.sh"
DOCKERFILE_DEV = "components/website/Dockerfile.dev"
COMPOSE_DEV = "compose.dev.yaml"


@pytest.fixture
def paths(repo_root: Path):
    return {
        "entry": repo_root / ENTRYPOINT,
        "dockerfile_dev": repo_root / DOCKERFILE_DEV,
        "compose": repo_root / COMPOSE_DEV,
        "dockerfile_prod": repo_root / "components/website/Dockerfile",
    }


def _text(path: Path) -> str:
    assert path.is_file(), f"missing file: {path}"
    return path.read_text(encoding="utf-8")


def _run_entrypoint(entry: Path, extra=None, unset=()):
    """`env -u ... VAR=... bash ENTRYPOINT env` with the inherited environment."""
    env = {k: v for k, v in os.environ.items() if k not in unset}
    env.update(extra or {})
    return subprocess.run(
        ["bash", str(entry), "env"],
        capture_output=True,
        text=True,
        env=env,
        timeout=300,
    )


def _combined(completed) -> str:
    return f"{completed.stdout}\n{completed.stderr}"


# ── Entrypoint: ausgeführt, nicht gegreppt ───────────────────────


def test_entrypoint_schreibt_database_url_auf_den_docker_host_um(paths):
    # Die .env zeigt auf 127.0.0.1-Ports des Hosts (kubectl port-forward). Im
    # Container ist 127.0.0.1 ein anderer Netzwerk-Namespace — ohne Umschreiben
    # findet der Dev-Server die Datenbank nicht.
    assert paths["entry"].is_file(), f"{ENTRYPOINT} nicht gefunden"
    completed = _run_entrypoint(
        paths["entry"],
        extra={
            "POCKET_ID_WEBSITE_SECRET": "dummy",
            "DATABASE_URL": "postgresql://u:p@127.0.0.1:5432/website",
        },
    )
    assert completed.returncode == 0, _combined(completed)
    assert "DATABASE_URL=postgresql://u:p@host.docker.internal:5432/website" in _combined(completed)


def test_entrypoint_laesst_site_url_auf_localhost_stehen(paths):
    # Zusicherung MIT Positiv-Anker (Konvention T002356-M1): Der erste Teil belegt,
    # dass das Umschreiben ueberhaupt stattfindet. Ohne ihn wuerde dieser Test auch
    # dann gruen sein, wenn die Umschreib-Logik komplett fehlte.
    #
    # Sachlich: SITE_URL wird an den BROWSER ausgeliefert (OIDC redirect_uri).
    # host.docker.internal ist auf dem Host nicht aufloesbar — ein Umschreiben
    # wuerde den Login-Rueckkanal brechen.
    completed = _run_entrypoint(
        paths["entry"],
        extra={
            "POCKET_ID_WEBSITE_SECRET": "dummy",
            "DATABASE_URL": "postgresql://u:p@127.0.0.1:5432/website",
            "SITE_URL": "http://localhost:4321",
        },
    )
    assert completed.returncode == 0, _combined(completed)
    output = _combined(completed)
    # Positiv-Anker: das Umschreiben funktioniert grundsaetzlich
    assert "host.docker.internal" in output
    # Die eigentliche Zusicherung: SITE_URL blieb unangetastet
    assert "SITE_URL=http://localhost:4321" in output


def test_entrypoint_bricht_ohne_oidc_secret_mit_klarer_meldung_ab(paths):
    # Ohne diesen Guard wuerde der Fehler erst tief im Vite-Modulgraphen auftreten,
    # mit einem Stacktrace voller node_modules-Frames (exakt der gemeldete Fall).
    completed = _run_entrypoint(paths["entry"], unset=("POCKET_ID_WEBSITE_SECRET", "WEBSITE_OIDC_SECRET"))
    assert completed.returncode != 0
    assert "POCKET_ID_WEBSITE_SECRET" in _combined(completed)


def test_entrypoint_akzeptiert_das_legacy_secret_website_oidc_secret(paths):
    # auth.ts:7 liest beide Namen — der Guard darf nicht strenger sein als der Code,
    # den er schuetzt.
    completed = _run_entrypoint(
        paths["entry"],
        extra={"WEBSITE_OIDC_SECRET": "dummy"},
        unset=("POCKET_ID_WEBSITE_SECRET",),
    )
    assert completed.returncode == 0, _combined(completed)


# ── Dockerfile.dev: Build-Konfiguration ──────────────────────────


def test_dockerfile_dev_kopiert_den_entrypoint_mit_executable_bit(paths):
    # Ohne --chmod bricht der Container mit Exit 126 ab:
    # "exec /usr/local/bin/dev-entrypoint failed: Permission denied".
    assert paths["dockerfile_dev"].is_file(), f"{DOCKERFILE_DEV} nicht gefunden"
    assert "--chmod=755" in _text(paths["dockerfile_dev"])


def test_dockerfile_dev_setzt_corepack_home_fuer_den_versions_pin(paths):
    # `corepack prepare --activate` laeuft als root, der Container als `node`.
    # Ohne ein fuer beide lesbares COREPACK_HOME findet corepack die Aktivierung
    # nicht und faellt STILL auf die neueste pnpm-Version zurueck.
    text = _text(paths["dockerfile_dev"])
    assert "COREPACK_HOME" in text
    # Positiv-Anker: der Pin selbst ist ueberhaupt vorhanden.
    assert "pnpm@10.15.0" in text


def test_dockerfile_dev_baut_nicht_und_bleibt_damit_vom_prod_image_abgegrenzt(paths):
    text = _text(paths["dockerfile_dev"])
    # Positiv-Anker zuerst: die Datei installiert ueberhaupt Abhaengigkeiten.
    # Ohne ihn waere die Negativ-Aussage bei einer leeren Datei trivial erfuellt.
    assert "pnpm install" in text
    # Die Zusicherung: kein Produktionsbuild. Kommentarzeilen werden ausgefiltert:
    # Dockerfile.dev ERWAEHNT den Prod-Build in seinem Abgrenzungs-Kommentar.
    code_lines = [line for line in text.splitlines() if not line.lstrip().startswith("#")]
    assert sum(1 for line in code_lines if "pnpm run build" in line) == 0


def test_components_website_dockerfile_prod_bleibt_ein_build_image(paths):
    # Gegenprobe zum vorigen Test: belegt, dass die Unterscheidung real ist und
    # nicht bloss daran haengt, dass irgendwo 'pnpm run build' fehlt.
    assert "pnpm run build" in _text(paths["dockerfile_prod"])


# ── compose.dev.yaml: Laufzeit-Verdrahtung ───────────────────────


def test_compose_maskiert_node_modules_mit_einem_eigenen_volume(paths):
    # Ohne dieses Volume schlaegt der Host-Ordner durch den Bind-Mount durch. Die
    # Pakete dort sind ggf. fuer glibc gebaut, der Container laeuft auf musl.
    assert paths["compose"].is_file(), f"{COMPOSE_DEV} nicht gefunden"
    assert "/app/node_modules" in _text(paths["compose"])


def test_compose_mountet_lavish_fuer_die_cockpit_symlinks(paths):
    # components/website/public/cockpit/* sind Symlinks nach ../../../.lavish/ — vom Container
    # aus /.lavish/. Ohne den Mount zeigen sie ins Leere und /cockpit/ liefert 404.
    assert "/.lavish" in _text(paths["compose"])


def test_compose_reicht_host_docker_internal_in_den_container(paths):
    # Ohne extra_hosts existiert der Name im Container nicht und das Umschreiben
    # des Entrypoints liefe in eine unaufloesbare Adresse.
    assert "host-gateway" in _text(paths["compose"])


def test_compose_bindet_port_4321(paths):
    # Nicht frei waehlbar: components/website/.env setzt SITE_URL=http://localhost:4321, und
    # daraus baut auth.ts die OIDC-redirect_uri. Ein abweichender Port bricht den
    # Login-Rueckkanal.
    assert "4321:4321" in _text(paths["compose"])


def test_compose_liest_components_website_env_als_env_file(paths):
    # Der Kern der ganzen Uebung: env_file legt die Variablen in die
    # PROZESSUMGEBUNG, wo process.env sie sieht.
    assert "components/website/.env" in _text(paths["compose"])

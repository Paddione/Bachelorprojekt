"""Native migration of tests/spec/sdlc-cockpit/layout-rail-fixed.bats."""
# (T002462, K3/D7)
# Querschnitts-/Konventionspruefung (dokumentierte Ausnahme): die vier D7-Gruppen stehen im Quelltext
# der Huellen. The original's grep-on-missing-file semantics are kept: a missing shell file does not fail.

import re


def test_t002462_die_vier_d7_gruppen_sind_in_der_shell_huelle_vorhanden(repo_root):
    shell = (repo_root / ".lavish/cockpit-shell.html").read_text(encoding="utf-8")
    for group in ["Laufende Epics", "Was Aufmerksamkeit braucht", "Aktive Agenten", "Modell-Server"]:
        assert group in shell, f"Gruppe '{group}' fehlt in cockpit-shell.html"


def test_t002462_es_gibt_keinen_konfigurationsschluessel_der_die_rail_gruppen_umstellt(repo_root):
    # Negativ-Aussage: kein Rail-Konfigurationsattribut in den Huellen.
    # grep auf eine fehlende Datei endet mit Exit 2 und zaehlt im Original nicht als Fehlschlag.
    pattern = re.compile(r"data-rail-group|data-rail=|data-groups=", re.IGNORECASE)
    for shell in [repo_root / ".lavish/cockpit-shell.html",
                  repo_root / "components/website/src/pages/sdlc/cockpit.astro"]:
        if not shell.is_file():
            continue
        assert not pattern.search(shell.read_text(encoding="utf-8")), (
            f"{shell} fuehrt ein Rail-Konfigurationsattribut ein - D7 verletzt"
        )

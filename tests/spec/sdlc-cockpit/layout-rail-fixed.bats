#!/usr/bin/env bats
#
# T002462 — Rail-Gruppen fix (K3, D7)
#
# Prüfmodus (Test-Resultats-Konvention T002448-M4): ERGEBNIS-Test mit
# Querschnitts-/Konventionsprüfung (die in der Konvention genannte Ausnahme):
# die vier D7-Gruppen manifestieren sich im Quelltext der Hüllen, deshalb ist
# grep hier das angemessene Mittel.
#
# Aussage: die vier D7-Gruppen sind in beiden Hüllen vorhanden, und es gibt
# kein Markup-Attribut und keinen Konfigurationsschlüssel, mit dem sich die
# Gruppen umstellen ließen.

setup() {
  REPO="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  PROOF_DIR="$REPO/.lavish"
  ASTRO="$REPO/website/src/pages/sdlc/cockpit.astro"
}

@test "T002462 Die vier D7-Gruppen sind in der Shell-Hülle vorhanden" {
  # Positiv-Anker (T002356-M1): die vier Gruppen müssen zuerst gefunden werden.
  for group in "Laufende Epics" "Was Aufmerksamkeit braucht" "Aktive Agenten" "Modell-Server"; do
    grep -qF "$group" "$PROOF_DIR/cockpit-shell.html" \
      || { echo "Gruppe '$group' fehlt in cockpit-shell.html"; return 1; }
  done
}

# [T003417] Die Astro-Hülle trägt die Rail-Gruppen nicht mehr. Der Change
# "sdlc-dashboard-redesign" hebt die D7-Zusicherung "vier feste Gruppen" für die
# Astro-Seite ausdrücklich auf — siehe MODIFIED Requirement "Layout Engine
# Surface Organization": "the old spec's four-group immutable list constraint no
# longer applies". Die Gruppen leben jetzt in CockpitRail.svelte und wechseln mit
# Modus und Phase; belegt wird das durch die Vitest-Komponententests
# (website/src/components/cockpit/CockpitRail.test.ts), die jede Phase einzeln
# rendern. Für cockpit-shell.html (die statische Attrappe unter .lavish/) gilt
# D7 unverändert weiter — der Test darüber bleibt deshalb bestehen.
@test "T003417 Die Astro-Hülle delegiert die Rail an die Komponente" {
  # Positiv-Anker: die Hülle bindet die Rail-Komponente überhaupt ein.
  grep -qF "CockpitRail" "$ASTRO" \
    || { echo "cockpit.astro bindet CockpitRail nicht ein"; return 1; }

  # Und reicht ihr den Kontext durch, von dem die Gruppen abhängen.
  grep -qE 'CockpitRail[^>]*mode=' "$ASTRO" \
    || { echo "cockpit.astro reicht mode nicht an CockpitRail durch"; return 1; }
  grep -qE 'CockpitRail[^>]*phase=' "$ASTRO" \
    || { echo "cockpit.astro reicht phase nicht an CockpitRail durch"; return 1; }
}

@test "T002462 Es gibt keinen Konfigurationsschlüssel, der die Rail-Gruppen umstellt" {
  # Negativ-Aussage: kein data-Attribut und keine Variablen-Definition, die eine
  # Rail-Gruppenliste konfigurierbar machte. In layout.js ist RAIL_GROUPS ein
  # eingefrorenes Literal (durch den Unit-Test belegt); hier prüfen wir, dass
  # die Hüllen keine eigene Steuerung einführen.
  for shell in "$PROOF_DIR/cockpit-shell.html" "$ASTRO"; do
    grep -qiE 'data-rail-group|data-rail=|data-groups=' "$shell" \
      && { echo "$shell führt ein Rail-Konfigurationsattribut ein — D7 verletzt"; return 1; } \
      || true
  done
}

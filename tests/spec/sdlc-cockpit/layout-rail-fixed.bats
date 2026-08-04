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

@test "T002462 Die vier D7-Gruppen sind in der Astro-Hülle vorhanden" {
  for group in "Laufende Epics" "Was Aufmerksamkeit braucht" "Aktive Agenten" "Modell-Server"; do
    grep -qF "$group" "$ASTRO" \
      || { echo "Gruppe '$group' fehlt in cockpit.astro"; return 1; }
  done
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

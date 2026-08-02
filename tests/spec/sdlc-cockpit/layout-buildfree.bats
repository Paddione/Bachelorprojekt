#!/usr/bin/env bats
#
# T002462 — Layout-Engine Buildfrei (K3, D1)
#
# Prüfmodus (Test-Resultats-Konvention T002448-M4): ERGEBNIS-Test. Die
# Kit-Dateien werden mit `node --check` geprüft (syntaktisch gültig) und dürfen
# keine Modul-Syntax (import/export) und keine npm-Abhängigkeit enthalten —
# ein klassisches Skript, das per <script src> und auch von file:// läuft.

setup() {
  REPO="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  cd "$REPO" || return 1
}

@test "T002462 layout.js ist syntaktisch gültig und buildfrei (D1)" {
  # Positiv-Anker (T002356-M1): node --check auf panel.js muss zuerst durchlaufen.
  node --check ".lavish/kit/panel.js" 2>/dev/null \
    || { echo "Vorbedingung verletzt: node --check auf panel.js schlug fehl"; return 1; }

  node --check ".lavish/kit/layout.js" \
    || { echo "layout.js ist syntaktisch ungültig"; return 1; }

  # Keine Modul-Syntax.
  grep -nE '^\s*(import|export)\b' ".lavish/kit/layout.js" \
    && { echo "layout.js enthält Modul-Syntax (import/export) — D1 verletzt"; return 1; } \
    || true

  # Keine npm-Abhängigkeit: kein require('…') auf ein Paket.
  grep -nE "require\s*\(\s*['\"][A-Za-z]" ".lavish/kit/layout.js" \
    && { echo "layout.js enthält einen npm-require — D1 verletzt"; return 1; } \
    || true
}

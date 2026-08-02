#!/usr/bin/env bats
#
# T002462 — Layout-Engine Kit-Asset-Wiring (K3)
#
# Prüfmodus (Test-Resultats-Konvention T002448-M4): ERGEBNIS-Test. Der Test
# bildet die Docker-COPY-Semantik nach (Vorbild kit-assets-in-image.bats) und
# misst, ob layout.js und layout.css am Ende unter public/cockpit/kit/
# auflösbar und nicht leer sind — nicht nur im Checkout, sondern im
# Image-Layout. Zusätzlich: die Dateien müssen im Checkout unter
# public/cockpit/kit/ auflösen (Dev-Server-Fall).

setup() {
  REPO="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  cd "$REPO" || return 1
}

@test "T002462 layout.js/layout.css sind im Image-Layout auflösbar, nicht nur im Checkout" {
  # Positiv-Anker (T002356-M1): eine BEREITS vorhandene Kit-Datei (panel.js)
  # muss beide Prüfungen bestehen — sonst bestünde ein Test, der schlicht
  # nichts findet.
  [ -f "website/public/cockpit/kit/panel.js" ] \
    || { echo "Vorbedingung verletzt: website/public/cockpit/kit/panel.js fehlt"; return 1; }

  for asset in layout.js layout.css; do
    [ -L "website/public/cockpit/kit/$asset" ] \
      || { echo "$asset ist kein Symlink unter website/public/cockpit/kit/"; return 1; }
    [ -f "website/public/cockpit/kit/$asset" ] \
      || { echo "$asset löst im Checkout nicht auf (Dev-Server-Fall)"; return 1; }
    [ -s "website/public/cockpit/kit/$asset" ] \
      || { echo "$asset ist leer"; return 1; }
  done

  # Image-Layout: .lavish/kit wird per `COPY .lavish/kit ./public/cockpit/kit`
  # ins Image geholt (Dockerfile Zeile 35 kopiert das ganze Verzeichnis).
  grep -qE '^COPY[[:space:]]+\.lavish/kit[[:space:]]+\./public/cockpit/kit' website/Dockerfile \
    || grep -qE '^COPY[[:space:]]+\.lavish/kit[[:space:]]+public/cockpit/kit' website/Dockerfile \
    || { echo "website/Dockerfile holt .lavish/kit nicht nach public/cockpit/kit — Image hätte tote Symlinks"; return 1; }
}

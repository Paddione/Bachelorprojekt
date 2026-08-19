#!/usr/bin/env bats
# tests/spec/sdlc-cockpit/leitstand-livedaten.bats
# SSOT: openspec/changes/sdlc-leitstand-e4-livedaten/specs/sdlc-cockpit.md
# (E4 Live-Daten & Luecken [T008016]) -- drei Querschnitts-Zusicherungen:
#   1. Redirect statt Platzhalter: /sdlc/observability wird per redirect-map
#      auf /sdlc/cockpit?deck=plattform umgeleitet, die Platzhalterseite ist
#      aus dem Build entfernt.
#   2. LISTEN statt Poll: factory-floor/stream.ts wird vom cockpit-listen-hub
#      getrieben; ein Daten-setInterval(poll bleibt nur als Fallback erlaubt.
#   3. Katalog-Konsum: genau EIN Import von api-inventory.json unter
#      components/leitstand/ -- in ApiKatalog.svelte -- und der zugehoerige
#      purpose-Registry-Eintrag existiert.
#
# Pruefmodus (Test-Resultats-Konvention T002448-M4): Querschnittstest per
# Source-Grep, wo sich das Ergebnis ausschliesslich im Quelltext manifestiert
# (Redirect-Map-Eintrag, Dateiexistenz, Import-/Registry-Text). Die
# Laufzeit-Semantik liegt darunter in vitest (leitstand-kpi.test.ts,
# redirect-map.test.ts) und im SDLC-Smoke (scripts/sdlc-cockpit-smoke.mjs).
# Grep-Falle T003108: alle Muster werden mit -e uebergeben, nie mit
# -F auf ein --praefigiertes Argument. Positiv-Anker vor jeder
# Negativ-Aussage (T002356-M1). Semantik statt Darstellung (T002716):
# Exit-Codes und Zaellungen, keine Formatanker.

setup() {
  REPO="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  MAP="$REPO/components/website/src/middleware/redirect-map.ts"
  STREAM="$REPO/components/website/src/pages/sdlc/api/factory-floor/stream.ts"
  LEITSTAND_DIR="$REPO/components/website/src/components/leitstand"
  REGISTRY="$REPO/components/website/src/lib/sdlc/leitstand-purpose-registry.ts"
}

# T1 -- Redirect statt Platzhalter: Positiv-Anker (Map-Schluessel vorhanden)
# und Negativ-Aussage (Seite existiert nicht mehr) im selben Test.
@test "T1 /sdlc/observability redirectet und die Platzhalterseite ist entfernt" {
  # Positiv-Anker: der Map-Schluessel (Key-Position, nicht der Wert des
  # /admin/observability-Eintrags) muss existieren -- fehlt er, ist die
  # Zusicherung vakuos.
  run grep -qe "'/sdlc/observability':" "$MAP"
  [ "$status" -eq 0 ]

  # Negativ: die Fake-Uptime-Seite darf im Build nicht mehr liegen.
  [ ! -e "$REPO/components/website/src/pages/sdlc/observability.astro" ]
}

# T2 -- LISTEN statt Poll: Positiv-Anker (Hub-Import) vor der Negativ-Aussage
# (kein Daten-setInterval(poll mehr; Heartbeat-Timer bleibt erlaubt).
@test "T2 factory-floor/stream.ts laeuft ueber cockpit-listen-hub statt Daten-Poll" {
  # Positiv-Anker: der Hub-Import belegt die LISTEN/NOTIFY-Umstellung.
  run grep -qe 'cockpit-listen-hub' "$STREAM"
  [ "$status" -eq 0 ]

  # Negativ: der feste Daten-Poll darf nicht mehr existieren. Die Assertion
  # ist auf die Poll-Zeile eingegrenzt -- der Heartbeat-setInterval bleibt
  # erlaubt (T002716: keine Datei-breite Format-Anker).
  run grep -ce 'setInterval(poll' "$STREAM"
  [ "$status" -eq 1 ]
}

# T3 -- Katalog-Konsum: genau EIN Import von api-inventory.json unter
# components/leitstand/ (ApiKatalog.svelte) plus Registry-Eintrag.
@test "T3 api-inventory.json wird genau einmal konsumiert und ApiKatalog ist registriert" {
  # Positiv-Anker 1: genau eine Datei IMPORTIERT das Inventar. Grep auf die
  # Import-Zeile statt auf den blossen Dateinamen — Kommentare, die den
  # Guard dokumentieren (DeckWissen.svelte), duerfen den Zaehler nicht treffen.
  run grep -rlE 'import .*api-inventory\.json' "$LEITSTAND_DIR"
  [ "$status" -eq 0 ]
  [ "$(echo "$output" | grep -c .)" -eq 1 ]

  # Positiv-Anker 2: die konsumierende Datei ist das Katalog-Modul.
  echo "$output" | grep -c 'ApiKatalog.svelte' | grep -q '^1$'

  # Positiv-Anker 3: der purpose-Registry-Eintrag fuer das Modul existiert
  # (Eindeutigkeit/Abdeckung prueft leitstand-purpose-registry.bats T1).
  # Muster mit schliessendem Quote: der Key ist `'api-katalog':` (Quote vor
  # dem Doppelpunkt) — ohne das Quote matcht der Anker nie.
  run grep -qe "'api-katalog':" "$REGISTRY"
  [ "$status" -eq 0 ]
}

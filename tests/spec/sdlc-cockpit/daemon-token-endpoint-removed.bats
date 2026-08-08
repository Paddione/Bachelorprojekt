#!/usr/bin/env bats
# tests/spec/sdlc-cockpit/daemon-token-endpoint-removed.bats
# SSOT: openspec/specs/sdlc-cockpit.md
# Ticket: T002505
#
# Pruefmodus (Test-Resultats-Konvention T002448-M4): QUELLTEXT fuer die
# Routen-Ebene — dokumentierte Ausnahme, plus ein Laufzeit-Block, wenn der
# Daemon zufaellig laeuft.
#
# Begruendung fuer die Ausnahme: der Daemon importiert `hono` und
# `@hono/node-server`, und beide sind in KEINER package.json des Repos
# deklariert — er wird ad hoc per `npx tsx .lavish/kit/daemon/server.ts`
# gestartet. In CI ist er damit weder importierbar noch startbar; das Ergebnis
# "Route antwortet 404" ist dort schlicht nicht herstellbar. Geprueft wird
# deshalb die Registrierung. Sobald der Daemon versionierte Dependencies hat,
# gehoert dieser Block auf app.fetch() umgestellt.
#
# Die Datenebene — dass Query-Parameter nicht mehr in einen Kommandostring
# geraten — ist ergebnis-basiert abgedeckt in
# tests/unit/cockpit-daemon-injection.test.ts.

load daemon-helper

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  SERVER="$REPO/.lavish/kit/daemon/server.ts"
  DAEMON_PORT="${COCKPIT_DAEMON_PORT:-39152}"
  BASE="http://127.0.0.1:${DAEMON_PORT}"
}

@test "server.ts registriert keinen Token-Endpoint mehr" {
  [ -f "$SERVER" ]

  # POSITIV-ANKER (T002356-M1) zuerst: die Datei muss ueberhaupt noch Routen
  # registrieren. Waere sie leer oder umbenannt, waere "kein Token-Endpoint"
  # trivial erfuellt.
  local n_routes
  n_routes="$(grep -cE "^app\.(get|post)\(" "$SERVER")"
  echo "registrierte Routen: $n_routes"
  [ "$n_routes" -ge 8 ]

  # Der eigentliche Gegenstand: die 0600-Rechte der Token-Datei sind wertlos,
  # solange derselbe Token unauthentifiziert per HTTP abrufbar ist.
  run grep -nE "^app\.(get|post)\('/api/cockpit/token'" "$SERVER"
  echo "Token-Route: ${output:-<keine>}"
  [ -z "$output" ]
}

@test "der Token wird weiterhin in eine 0600-Datei geschrieben" {
  # Gegenstueck zum Test oben: entfernt werden soll der HTTP-Weg, NICHT der
  # Token selbst. Faellt auch writeTokenFile weg, sind die Write-Endpunkte
  # ungeschuetzt statt besser geschuetzt.
  run grep -c "writeTokenFile(" "$SERVER"
  echo "writeTokenFile-Aufrufe: $output"
  [ "$output" -ge 1 ]
}

@test "laufender Daemon liefert 404 auf /api/cockpit/token" {
  require_daemon || return 1
  # Anker: eine bestehende Route muss antworten, sonst misst der 404 nichts.
  run curl -s -o /dev/null -w '%{http_code}' -m 5 "${BASE}/health"
  [ "$output" = "200" ]

  run curl -s -o /dev/null -w '%{http_code}' -m 5 "${BASE}/api/cockpit/token"
  echo "Token-Endpoint: HTTP $output"
  [ "$output" = "404" ]
}

@test "laufender Daemon fuehrt kein Kommando aus einem Namespace-Parameter aus" {
  require_daemon || return 1
  local marker="/tmp/cockpit-injection-probe.$$"
  rm -f "$marker"
  # Nicht-destruktiver Payload: legt nur eine Markerdatei an. Entsteht sie,
  # wurde der Query-Wert als Kommando ausgefuehrt.
  curl -s -o /dev/null -m 10 --get \
    --data-urlencode "namespace=workspace; touch ${marker}" \
    "${BASE}/api/admin/cluster/pods-list" || true
  [ ! -e "$marker" ] || { rm -f "$marker"; echo "Injection ausgefuehrt: $marker existiert"; false; }
}

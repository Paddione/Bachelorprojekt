#!/usr/bin/env bats
#
# Ticket: T012980 — scripts/dev-admin-session.mjs
#
# PRUEFMODUS: Command-Output-Verifikation (T002448-M4). Die Tests FUEHREN das Skript
# aus und pruefen Exit-Code und Meldung. Es wird NICHT sein Quelltext gegreppt — ein
# Muster im Source belegt nur, dass Text existiert, nicht dass der Guard greift.
#
# WARUM DIESE TESTS: Das Skript ist ein Auth-Bypass. Es schreibt eine Session mit
# realmRoles: ['admin'] direkt in web_sessions und umgeht damit die Anmeldung ueber
# Pocket ID. Vertretbar ist es NUR, weil es sich gegen alles ausser localhost
# verweigert. Genau diese Schranke ist hier zugesichert: faellt sie unbemerkt weg,
# legt ein Fehlgriff in SESSIONS_DATABASE_URL einen echten Admin-Zugang in einer
# echten Umgebung an. Das ist die eine Zusicherung, die nicht stillschweigend
# verrotten darf.
#
# Zugesichert wird die SEMANTIK (T002716): Exit-Code ungleich 0 und die Nennung des
# abgelehnten Hosts. Der genaue Wortlaut ist nicht festgeschrieben.
#
# Kein DB-Zugriff noetig: alle Tests hier enden VOR dem Verbindungsaufbau. Der
# Positiv-Anker prueft deshalb nicht das Schreiben, sondern dass ein localhost-Wert
# die Host-Schranke PASSIERT — sichtbar daran, dass die Fehlermeldung dann eine
# andere ist (naechste Stufe erreicht) und nicht mehr den Host nennt.

setup() {
  PROJECT_DIR="$(cd "$(dirname "$BATS_TEST_FILENAME")/../../.." && pwd)"
  SCRIPT="$PROJECT_DIR/scripts/dev-admin-session.mjs"
}

@test "T012980: ohne SESSIONS_DATABASE_URL bricht es ab und nennt die Vorbedingung" {
  run env -u SESSIONS_DATABASE_URL node "$SCRIPT"
  [ "$status" -ne 0 ]
  [ "$(printf '%s\n' "$output" | grep -ci 'SESSIONS_DATABASE_URL')" -ge 1 ]
}

@test "T012980: ein entfernter Host wird abgelehnt, bevor geschrieben wird" {
  run env SESSIONS_DATABASE_URL="postgres://u:p@db.example.com:5432/x" node "$SCRIPT"
  [ "$status" -ne 0 ]
  # Die Meldung nennt den abgelehnten Host — das ist der Beleg, dass die Host-Schranke
  # gegriffen hat und nicht ein beliebiger spaeterer Fehler.
  [ "$(printf '%s\n' "$output" | grep -c 'db.example.com')" -ge 1 ]
}

@test "T012980: auch eine IP ausserhalb von localhost wird abgelehnt" {
  # 10.0.0.5 ist privat, aber nicht localhost. Ohne diesen Fall bliebe offen, ob die
  # Schranke am Hostnamen oder an der Erreichbarkeit haengt.
  run env SESSIONS_DATABASE_URL="postgres://u:p@10.0.0.5:5432/x" node "$SCRIPT"
  [ "$status" -ne 0 ]
  [ "$(printf '%s\n' "$output" | grep -c '10.0.0.5')" -ge 1 ]
}

@test "T012980 Positiv-Anker: 127.0.0.1 passiert die Host-Schranke" {
  # Ohne diesen Anker waeren die Ablehnungen oben vakuos: ein Skript, das IMMER
  # abbricht, bestuende sie ebenfalls. Hier zeigt ein nicht erreichbarer Port, dass
  # der Lauf die Host-Pruefung hinter sich gelassen hat — die Meldung nennt dann
  # NICHT mehr den Host als Ablehnungsgrund.
  run env SESSIONS_DATABASE_URL="postgres://u:p@127.0.0.1:59999/x" node "$SCRIPT"
  [ "$(printf '%s\n' "$output" | grep -ci 'Verweigert')" -eq 0 ]
}

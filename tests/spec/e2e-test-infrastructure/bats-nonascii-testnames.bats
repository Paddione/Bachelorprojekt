#!/usr/bin/env bats
# tests/spec/e2e-test-infrastructure/bats-nonascii-testnames.bats
# SSOT: openspec/specs/e2e-test-infrastructure.md
#
# Guard gegen den Locale-Ausfall aus T900065.
#
# BATS leitet aus jedem Testnamen einen Shell-Funktionsnamen ab. Ohne
# UTF-8-faehige Locale zerlegt Bash Nicht-ASCII byteweise, der abgeleitete Name
# trifft die definierte Funktion nicht mehr, und BATS meldet je betroffenem Test
# "unknown test name" und endet mit Exit 1. Unter Git-Bash ist LANG leer -- dort
# liefen dadurch 367 Testnamen in 166 Dateien (Umlaute, Em-Dash, Pfeile) nie,
# waehrend CI auf ubuntu-latest gruen war und den Ausfall nicht zeigen konnte.
#
# Pruefmodus (T002448-M4): OUTPUT-VERIFIKATION. Die Tests FUEHREN die beiden
# Wrapper gegen eine Fixture mit Nicht-ASCII-Testnamen aus und pruefen $status
# und $output. Keiner greppt die Wrapper-Quelle nach "LC_ALL" -- ein Guard, der
# das Vorhandensein einer Zeile prueft, ist gruen, sobald jemand die Zeile
# schreibt, und sagt nichts darueber, ob sie wirkt.
#
# Warum `env -u LC_ALL LANG=`: Laeuft dieser Test selbst ueber einen der Wrapper,
# ist LC_ALL bereits gesetzt und wird an Kindprozesse vererbt -- die Fixture
# liefe dann auch ohne Fix gruen. Das Leeren stellt den Git-Bash-Ausgangszustand
# her, den der Wrapper reparieren soll.
#
# Die Testnamen DIESER Datei sind bewusst reines ASCII: ein Guard, der den
# Defekt beschreibt, den er misst, kann sich nicht selbst ausschalten.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  FIXTURE="$BATS_TEST_TMPDIR/nonascii.bats"

  # Em-Dash (U+2014), Umlaut (U+00FC) und Pfeil (U+2192) als Byte-Sequenzen --
  # die drei mit Abstand haeufigsten Zeichen im Bestand (105x / 78x / 102x).
  printf '@test "plain ascii" { true; }\n' > "$FIXTURE"
  printf '@test "umlaut \xc3\xbc im namen" { true; }\n' >> "$FIXTURE"
  printf '@test "emdash \xe2\x80\x94 im namen" { true; }\n' >> "$FIXTURE"
  printf '@test "arrow \xe2\x86\x92 im namen" { true; }\n' >> "$FIXTURE"
}

@test "T900065: tests/bats fuehrt Nicht-ASCII-Testnamen aus" {
  run env -u LC_ALL LANG= bash "$REPO/tests/bats" "$FIXTURE"
  [ "$status" -eq 0 ] || { echo "Exit $status:"; echo "$output"; return 1; }
  echo "$output" | grep -q '^ok 4' || {
    echo "weniger als 4 Tests ausgefuehrt:"; echo "$output"; return 1; }
}

@test "T900065: tests/bats meldet keinen unknown-test-name" {
  run env -u LC_ALL LANG= bash "$REPO/tests/bats" "$FIXTURE"
  # Die Warnung ist der eigentliche Schadensmarker: BATS zaehlt die Tests
  # korrekt, kann sie aber nicht aufrufen.
  echo "$output" | grep -qi 'unknown test name' && {
    echo "Locale-Ausfall reproduziert:"; echo "$output"; return 1; }
  echo "$output" | grep -qi 'instead of expected' && {
    echo "nicht alle Tests ausgefuehrt:"; echo "$output"; return 1; }
  return 0
}

@test "T900065: scripts/lib/run-bats.sh fuehrt Nicht-ASCII-Testnamen aus" {
  run env -u LC_ALL LANG= bash "$REPO/scripts/lib/run-bats.sh" "$FIXTURE"
  [ "$status" -eq 0 ] || { echo "Exit $status:"; echo "$output"; return 1; }
  echo "$output" | grep -q '^ok 4' || {
    echo "weniger als 4 Tests ausgefuehrt:"; echo "$output"; return 1; }
}

@test "T900065: ein explizit gesetztes LC_ALL wird nicht ueberschrieben" {
  # Der Aufrufer darf die Locale bewusst waehlen -- etwa fuer eine
  # reproduzierbare Sortierung. Der Wrapper springt nur ein, wenn nichts
  # vorgegeben ist.
  run env LC_ALL=C.UTF-8 bash -c "bash '$REPO/tests/bats' --version >/dev/null && printf '%s' \"\$LC_ALL\""
  [ "$status" -eq 0 ]
  [ "$output" = "C.UTF-8" ]
}

@test "T900065: Positiv-Anker - die Fixture traegt wirklich Nicht-ASCII" {
  # Ohne diesen Anker koennte die Fixture still zu reinem ASCII degenerieren
  # (etwa durch eine Encoding-Normalisierung im Checkout) und alle Tests oben
  # waeren gruen, ohne je den geprueften Fall zu enthalten.
  run grep -cP '[^\x00-\x7F]' "$FIXTURE"
  [ "$status" -eq 0 ]
  [ "$output" -eq 3 ]
}

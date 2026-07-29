#!/usr/bin/env bats
#
# T002439 — Pod-Phase-Guard: treffer-granular statt datei-granular, scripts/ UND tests/.
#
# Vorgeschichte: T002307 filterte eine Kopie der shared-db-Pod-Selektion auf
# status.phase=Running und hielt die Sache fuer erledigt; vier weitere Kopien behielten den
# Bug. T002386 zog daraus einen Klassen-Guard — der aber selbst zwei Blindstellen hat:
# er scannt nur scripts/ mit --include='*.sh', und er zaehlt pro Datei statt pro Treffer.
# Deshalb blieben sieben Dateien unter tests/ ungeprueft, und tests/spec/software-factory.bats
# mit vier ungefilterten Selektionen galt als sauber, weil sein Guard-Testtext den
# Filter-String enthaelt. Folge im Feld: ein Completed-Pod wird selektiert, das nachfolgende
# `kubectl exec` scheitert mit rc=1 (beobachtet im Verify von T002418).
#
# Die Fixtures entstehen zur LAUFZEIT unter $BATS_TEST_TMPDIR und werden bewusst nicht
# committed: eine eingecheckte Fixture mit absichtlich ungefilterter Selektion wuerde vom
# repo-weiten Scan als echter Verstoss gemeldet.
#
# Diese Datei fuehrt das Suchmuster selbst als Literal und traegt dafuer den Opt-out-Marker.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  GUARD="${REPO_ROOT}/scripts/check-pod-phase-filter.sh"
  FIX="${BATS_TEST_TMPDIR}/fixtures"
  mkdir -p "$FIX"
}

# Eine Selektionszeile bauen. $1 = Zusatzflags (z.B. der Phasenfilter), $2 = Trailer.
# Diese Funktion fuehrt den Selektor als Literal und traegt deshalb den Opt-out-Marker —
# sie baut Fixtures, sie selektiert keinen Pod.
_sel() {
  local extra="${1:-}" trailer="${2:-}"
  printf "  pod=\$(kubectl get pod -n \"\$ns\" -l '%s' %s -o name)%s\n" \
    "app in (shared-db, shared-db-dev)" "$extra" "$trailer"  # pod-phase-filter: intentional-unfiltered
}

# "Der Guard hat gemeldet" heisst: er lief und war unzufrieden — NICHT, dass er fehlt.
# Ohne die 127-Abgrenzung erfuellt ein nicht existierendes Skript jede `-ne 0`-Assertion
# und der Negativtest besteht vakuos (T002356-M1).
_assert_guard_reported() {
  [ "$status" -ne 127 ]
  [ "$status" -ne 0 ]
}

@test "T002439: der Guard existiert als eigenstaendiges, ausfuehrbares Skript" {
  # Inline im @test war er nicht gegen Fixtures pruefbar — genau deshalb blieb seine
  # eigene Blindstelle so lange unbemerkt.
  [ -f "$GUARD" ]
  [ -x "$GUARD" ]
}

@test "T002439: eine sauber gefilterte Datei passiert den Guard (Positiv-Anker)" {
  # Positiv-Anker nach T002356-M1: ohne ihn bestuenden die Negativtests unten vakuos,
  # falls der Scan gar nichts findet.
  mkdir -p "$FIX/clean"
  { echo '#!/usr/bin/env bash'; _sel "--field-selector status.phase=Running"; } > "$FIX/clean/ok.sh"

  run bash "$GUARD" "$FIX/clean"
  [ "$status" -eq 0 ]
}

@test "T002439: eine ungefilterte Selektion wird gemeldet und die Datei benannt" {
  mkdir -p "$FIX/dirty"
  { echo '#!/usr/bin/env bash'; _sel ""; } > "$FIX/dirty/bad.sh"

  run bash "$GUARD" "$FIX/dirty"
  _assert_guard_reported
  [[ "$output" == *"bad.sh"* ]]
}

@test "T002439: ein Filter anderswo in derselben Datei deckt eine ungefilterte Zeile nicht" {
  # Die Kern-Regression: genau so entkam tests/spec/software-factory.bats dem alten,
  # datei-granularen Guard.
  mkdir -p "$FIX/mixed"
  {
    echo '#!/usr/bin/env bash'
    _sel "--field-selector status.phase=Running"
    _sel ""
  } > "$FIX/mixed/half.sh"

  run bash "$GUARD" "$FIX/mixed"
  _assert_guard_reported
  [[ "$output" == *"half.sh"* ]]
}

@test "T002439: eine ueber Backslash umgebrochene Selektion gilt als gefiltert" {
  # Der Zeilenumbruch war die Begruendung fuer die Datei-Granularitaet. Mit dem
  # Continuation-Join faellt diese Begruendung weg.
  mkdir -p "$FIX/wrapped"
  {
    echo '#!/usr/bin/env bash'
    printf "  pod=\$(kubectl get pod -n \"\$ns\" -l '%s' \\\\\n" "app in (shared-db, shared-db-dev)"  # pod-phase-filter: intentional-unfiltered
    printf "    --field-selector status.phase=Running -o name)\n"
  } > "$FIX/wrapped/wrap.sh"

  run bash "$GUARD" "$FIX/wrapped"
  [ "$status" -eq 0 ]
}

@test "T002439: der Opt-out-Marker erlaubt eine bewusst ungefilterte Selektion" {
  mkdir -p "$FIX/optout"
  { echo '#!/usr/bin/env bash'; _sel "" "  # pod-phase-filter: intentional-unfiltered"; } \
    > "$FIX/optout/intentional.sh"

  run bash "$GUARD" "$FIX/optout"
  [ "$status" -eq 0 ]

  # Gegenprobe: ohne den Marker MUSS dieselbe Zeile rot werden, sonst toleriert der Guard
  # jede ungefilterte Selektion und der Test oben ist wertlos.
  { echo '#!/usr/bin/env bash'; _sel ""; } > "$FIX/optout/intentional.sh"
  run bash "$GUARD" "$FIX/optout"
  _assert_guard_reported
  [[ "$output" == *"intentional.sh"* ]]
}

@test "T002439: .bats-Dateien werden mitgescannt, nicht nur .sh" {
  mkdir -p "$FIX/batsonly"
  { echo '#!/usr/bin/env bats'; _sel ""; } > "$FIX/batsonly/probe.bats"

  run bash "$GUARD" "$FIX/batsonly"
  _assert_guard_reported
  [[ "$output" == *"probe.bats"* ]]
}

@test "T002439: der Guard ohne Argumente deckt scripts/ UND tests/ ab" {
  # Ohne Argumente scannt der Guard die Repo-Standardwurzeln. Beide muessen dabei sein —
  # die Beschraenkung auf scripts/ war die zweite Blindstelle.
  run bash "$GUARD" --print-roots
  [ "$status" -eq 0 ]
  echo "$output" | grep -qE '(^|/)scripts/?$|(^|/)scripts( |$)'
  echo "$output" | grep -qE '(^|/)tests/?$|(^|/)tests( |$)'
}

@test "T002439: das Repo ist frei von ungefilterten shared-db-Selektionen" {
  # Der eigentliche Fix-Nachweis. Rot, solange die vier Stellen in
  # tests/spec/software-factory.bats und die sieben Dateien unter tests/ ungefiltert sind.
  run bash "$GUARD"
  [ "$status" -eq 0 ]
}

@test "T002439: _skip_if_no_db ueberspringt bei fehlendem RUNNING-Pod, nicht erst bei gar keinem" {
  # Der Helfer sprang bisher nur an, wenn die Pod-Liste leer war. Ein Completed-Pod
  # lieferte eine nicht-leere Liste, der Skip blieb aus, und `kubectl exec` gab rc=1.
  local sf="${REPO_ROOT}/tests/spec/software-factory.bats"
  run bash -c "sed -n '/_skip_if_no_db()/,/^}/p' '$sf' | grep -c -- '--field-selector status.phase=Running'"
  [ "$status" -eq 0 ]
  [ "$output" -ge 1 ]
}

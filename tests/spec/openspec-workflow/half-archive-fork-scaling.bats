#!/usr/bin/env bats
# tests/spec/openspec-workflow/half-archive-fork-scaling.bats
# T013673 — scripts/openspec-half-archive-check.sh darf pro Archiveintrag keinen
# externen Prozess starten.
#
# Prüfmodus: Output-Verifikation. Gemessen wird das Laufzeitverhalten des Skripts
# (Anzahl externer Prozessaufrufe, gezählt über einen PATH-Shim), nicht sein Quelltext.
#
# WARUM KEINE ZEITSCHRANKE: eine Assertion der Form "der Check bleibt unter X ms" misst
# die Ausstattung des Runners, nicht den Zustand des Codes — sie wird auf einem
# ausgelasteten Shard falsch-rot und meldet dann einen Defekt, den es nicht gibt
# (tests/CLAUDE.md, "Semantik statt Darstellung", T002716/T003548). Der Defekt ist ein
# Prozessstart pro Archiveintrag; gemessen wird deshalb genau diese Zahl.
#
# WARUM KEIN VERHÄLTNISTEST: die Schleife ist vor UND nach dem Fix O(n) über die
# Archiveinträge. Was sich ändert, ist die Konstante pro Eintrag (2 Forks → 0). Ein
# Laufzeitverhältnis zwischen kleinem und großem Archiv misst die Ordnung und
# unterscheidet die beiden Fassungen daher nicht.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  CHECK="${REPO_ROOT}/scripts/openspec-half-archive-check.sh"
  SHIM_BIN="${BATS_TEST_TMPDIR}/shim-bin"
  SHIM_COUNT_FILE="${BATS_TEST_TMPDIR}/shim-count"
  export SHIM_COUNT_FILE
  mkdir -p "$SHIM_BIN"

  # Zählende Wrapper für die beiden Werkzeuge, die der Defekt pro Eintrag forkt.
  # Der Wrapper delegiert ans echte Binary, verändert also kein Verhalten — er
  # protokolliert nur, dass ein Prozess gestartet wurde.
  local tool real
  for tool in basename sed; do
    real="$(command -v "$tool")"
    [ -n "$real" ] || { echo "Werkzeug '$tool' nicht im PATH — Shim nicht baubar" >&2; return 1; }
    cat > "${SHIM_BIN}/${tool}" <<SHIM
#!/bin/sh
echo x >> "\$SHIM_COUNT_FILE"
exec ${real} "\$@"
SHIM
    chmod +x "${SHIM_BIN}/${tool}"
  done
}

# Baut ein synthetisches OPENSPEC_ROOT mit $1 datierten Archiveinträgen.
#
# Der offene Change ist NICHT optional: openspec-half-archive-check.sh steigt vor der
# Archiv-Schleife aus, wenn changes/ keinen offenen Eintrag hat. Eine Sandbox ohne ihn
# ließe die zu messende Schleife nie laufen — die Fork-Zahl wäre in beiden Läufen
# gleich (nämlich konstant), und der Test bestünde, ohne etwas geprüft zu haben.
_mk_sandbox() { # $1 = Anzahl Archiveinträge, $2 = Zielverzeichnis
  local n="$1" root="$2" i
  rm -rf "$root"
  mkdir -p "$root/openspec/changes/archive" "$root/openspec/changes/ein-offener-change"
  for i in $(seq 1 "$n"); do
    mkdir -p "$root/openspec/changes/archive/2026-01-01-slug${i}"
  done
}

# Zählt die externen Prozessaufrufe eines Check-Laufs gegen $1 Archiveinträge.
_count_forks() { # $1 = Anzahl Archiveinträge
  local root="${BATS_TEST_TMPDIR}/root-$1"
  _mk_sandbox "$1" "$root"
  : > "$SHIM_COUNT_FILE"
  PATH="${SHIM_BIN}:$PATH" OPENSPEC_ROOT="$root/openspec" bash "$CHECK" >/dev/null 2>&1 || true
  wc -l < "$SHIM_COUNT_FILE" | tr -d '[:blank:]'
}

@test "T013673: Prozessaufrufe des half-archive-check wachsen nicht mit der Archivgroesse" {
  # Positiv-Anker 1 — der Zähler zählt überhaupt. Ohne ihn wäre ein Shim, der nie
  # feuert (falscher PATH, nicht ausführbar), von einem behobenen Defekt nicht zu
  # unterscheiden: beide Läufe meldeten 0, und die Gleichheit gälte trivial.
  : > "$SHIM_COUNT_FILE"
  PATH="${SHIM_BIN}:$PATH" sh -c 'basename /a/b >/dev/null; basename /c/d >/dev/null'
  [ "$(wc -l < "$SHIM_COUNT_FILE" | tr -d '[:blank:]')" -eq 2 ]

  # Positiv-Anker 2 — die Archiv-Schleife läuft in dieser Sandbox wirklich. Belegt
  # durch ihr Ergebnis: ein doppelter Slug wird erkannt und benannt. Damit kann eine
  # konstante Fork-Zahl nicht daher rühren, dass das Skript vorher aussteigt.
  local probe="${BATS_TEST_TMPDIR}/root-probe"
  _mk_sandbox 5 "$probe"
  mkdir -p "$probe/openspec/changes/doppelt" \
           "$probe/openspec/changes/archive/2026-01-01-doppelt"
  run env OPENSPEC_ROOT="$probe/openspec" bash "$CHECK"
  [ "$status" -ne 0 ]
  printf '%s\n' "$output" | grep -qF 'doppelt'

  # Die eigentliche Aussage: zwei Archive unterschiedlicher Größe, gleiche Anzahl
  # externer Prozessaufrufe. Vor dem Fix 42 gegen 402 (je zwei Forks pro Eintrag).
  local klein gross
  klein="$(_count_forks 20)"
  gross="$(_count_forks 200)"
  echo "Forks bei 20 Eintraegen: $klein — bei 200: $gross" >&2
  [ "$klein" -eq "$gross" ]
}

@test "T013673/T013715: praefixloser Eintrag wird als undatiert gemeldet, nie als halb archiviert" {
  # Regressionsschutz für die Ersetzung der sed-Pipeline (T013673): '${base#????-??-??-}'
  # waere falsch, weil '?' jedes Zeichen matcht und nicht nur Ziffern. Seit T013715
  # meldet der Check praefixlose Eintraege als OHNE DATUMSPRAEFIX — die Fehlklassifikation
  # als HALB ARCHIVIERT bleibt verboten.
  local root="${BATS_TEST_TMPDIR}/root-nodate"
  _mk_sandbox 3 "$root"
  mkdir -p "$root/openspec/changes/echt-doppelt" \
           "$root/openspec/changes/archive/2026-01-01-echt-doppelt" \
           "$root/openspec/changes/archive/ohne-datum"

  run env OPENSPEC_ROOT="$root/openspec" bash "$CHECK"
  [ "$status" -ne 0 ]
  # Der echte Doppel-Slug wird als halb archiviert gemeldet …
  printf '%s\n' "$output" | grep -qF "HALB ARCHIVIERT: 'echt-doppelt'"
  # … der praefixlose Eintrag dagegen nur als undatiert.
  printf '%s\n' "$output" | grep -qF "OHNE DATUMSPRAEFIX: 'ohne-datum'"
  # Keine Vermischung der Klassen:
  vermischung="$(printf '%s\n' "$output" | grep -cF 'HALB ARCHIVIERT: '"'"'ohne-datum'"'" || true)"
  [ "$vermischung" -eq 0 ]
}

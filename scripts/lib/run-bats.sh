#!/usr/bin/env bash
# scripts/lib/run-bats.sh — zentraler bats-Wrapper mit Existenz-Guard [T003278].
#
# Der vendierte bats-Binary meldet eine nicht existierende Testdatei auf stdout,
# endet aber mit Exit 0 — wer nur den Exit-Code auswertet (Taskfile, CI, Skripte,
# Agenten), sieht Gruen fuer eine Verifikation, die nie lief. Dieser Wrapper
# prueft vor der Delegation jeden explizit genannten Testpfad und bricht bei einem
# fehlenden mit Exit 1 und einer Ursachenmeldung ab.
#
# Welche Args werden geprueft? Nur Positional-Args, die einen Pfad-Separator '/'
# enthalten. Das trifft die Datei- und Verzeichnis-Form von Testpfaden, ohne die
# Werte von bats-Optionen (z.B. `--report-formatter junit`, `-o <dir>`) faelschlich
# als Testpfade zu deuten. Der defekte Fall aus T003278 ist exakt der Datei-Form-
# Aufruf (namentliche .bats-Datei) — genau den faengt der Guard.
#
# Kein Vendor-Patch an tests/unit/lib/bats-core/ — der Wrapper liegt davor.
#
# Usage: scripts/lib/run-bats.sh [bats-optionen...] <pfade...>
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BATS_BIN="${BATS_BIN:-$(cd "$HERE/../.." && pwd)/tests/unit/lib/bats-core/bin/bats}"

args=()
for arg in "$@"; do
  args+=("$arg")
  if [[ "$arg" == */* ]]; then
    if [[ ! -e "$arg" ]]; then
      echo "run-bats: Testpfad existiert nicht: $arg" >&2
      exit 1
    fi
  fi
done

exec "$BATS_BIN" "${args[@]}"

#!/usr/bin/env bats
# powershell-ascii-only.bats — Guard fuer T002491.
#
# PRUEFMODUS: Quelltext. Ausnahmefall der Test-Resultats-Konvention (T002448-M4),
# denn das Ergebnis manifestiert sich ausschliesslich im Dateiinhalt — die Laufzeit
# liegt auf einem Windows-Host, den die Linux-CI nicht erreicht.
#
# HINTERGRUND: Die .ps1 unter scripts/llm/ werden auf dem Windows-GPU-Host
# ausgefuehrt, aber aus WSL heraus geschrieben. Solche Dateien sind UTF-8 ohne BOM;
# PowerShell 5.1 liest sie als CP1252. Ein Em-Dash (UTF-8 E2 80 94) wird dabei zu
# drei Zeichen, und das letzte Byte 0x94 ist in CP1252 ein typografisches
# schliessendes Anfuehrungszeichen, das PowerShell als String-Delimiter akzeptiert.
# Steht das Zeichen in einem STRING, endet dieser mittendrin und die
# Klammerstruktur kollabiert: das Skript startet kommentarlos gar nicht — kein
# Fehler, kein Log, kein Hinweis.
#
# Am 2026-08-01 hat genau das zwei Arbeitszyklen gekostet; der verwandte
# BOM-Fallstrick (Set-Content -Encoding UTF8) riss dabei den Produktions-Tunnel ab.

setup() {
  PROJECT_DIR="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
}

@test "every scripts/llm/*.ps1 is pure ASCII" {
  local files
  mapfile -t files < <(find "${PROJECT_DIR}/scripts/llm" -maxdepth 1 -name '*.ps1' | sort)

  # Positiv-Anker: ohne ihn bestuende der Test vakuos, sobald das Verzeichnis
  # leer oder verschoben ist ("keine Datei verletzt die Regel" ist dann wahr).
  [ "${#files[@]}" -ge 3 ] || {
    echo "expected at least 3 .ps1 files under scripts/llm, found ${#files[@]}" >&2
    return 1
  }

  local f offenders=()
  for f in "${files[@]}"; do
    if grep -qP '[^\x00-\x7F]' "$f"; then
      offenders+=("$(basename "$f"): $(grep -nP '[^\x00-\x7F]' "$f" | head -3 | cut -c1-60 | tr '\n' ' ')")
    fi
  done

  [ "${#offenders[@]}" -eq 0 ] || {
    echo "non-ASCII found in PowerShell scripts (breaks CP1252 parsing):" >&2
    printf '  %s\n' "${offenders[@]}" >&2
    return 1
  }
}

@test "no scripts/llm/*.ps1 writes config files with Set-Content -Encoding UTF8" {
  # -Encoding UTF8 schreibt unter PS 5.1 ein BOM. Fuer Konfigurationsdateien, die
  # nicht-Windows-Tools lesen (WireGuard), ist das fatal: die drei Bytes vor der
  # ersten Sektion lassen den Import fehlschlagen. Korrekt ist -Encoding ASCII.
  local files
  mapfile -t files < <(find "${PROJECT_DIR}/scripts/llm" -maxdepth 1 -name '*.ps1' | sort)
  [ "${#files[@]}" -ge 3 ]   # Positiv-Anker, siehe oben

  local hits
  hits=$(grep -l 'Set-Content.*-Encoding[[:space:]]\+UTF8' "${files[@]}" 2>/dev/null | wc -l)
  [ "$hits" -eq 0 ] || {
    echo "Set-Content -Encoding UTF8 writes a BOM; use ASCII for config files:" >&2
    grep -n 'Set-Content.*-Encoding[[:space:]]\+UTF8' "${files[@]}" >&2
    return 1
  }
}

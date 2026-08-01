#!/usr/bin/env bats
# firewall-program-match.bats — Guard fuer T002496.
#
# PRUEFMODUS: Quelltext. Ausnahmefall der Test-Resultats-Konvention (T002448-M4):
# die Laufzeit liegt auf einem Windows-Host mit Firewall-Cmdlets, den die
# Linux-CI nicht erreicht. Ein Laufzeit-Test waere hier nicht ausfuehrbar, ein
# Nachbau der Matching-Logik wuerde nur den Nachbau pruefen.
#
# HINTERGRUND: harden-gpu-firewall.ps1 identifizierte die zu verwaltenden Regeln
# ueber den Basename des ELTERNVERZEICHNISSES der Binary:
#
#     $_.Program -like "*$([System.IO.Path]::GetFileName($dir))*$leaf"
#
# Bei der bge-Binary (…\llama-b10090-13.3\llama-server.exe) ergab das das
# eindeutige Muster "*llama-b10090-13.3*llama-server.exe" — das Skript lief
# korrekt, aber aus dem falschen Grund. Der bonsai-Build liegt unter
# …\llama-bonsai-cuda13.3\bin\llama-server.exe; der Basename ist dort schlicht
# "bin", das Muster wird zu "*bin*llama-server.exe" und trifft JEDEN parallel
# installierten llama-Build mit bin-Unterordner — darunter llama-b9553-cuda13,
# dessen Regeln BLOCK sind. Das Skript haette also eine Sperre entfernt.
#
# Die einzig tragfaehige Identitaet einer Binary ist ihr vollstaendiger Pfad.

setup() {
  PROJECT_DIR="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  SCRIPT="${PROJECT_DIR}/scripts/llm/harden-gpu-firewall.ps1"
}

@test "harden-gpu-firewall.ps1 exists and takes a -Program parameter" {
  # Positiv-Anker fuer beide folgenden Tests: ohne ihn bestuenden die
  # Negativ-Aussagen unten trivial, sobald die Datei fehlt oder umbenannt wird.
  [ -f "$SCRIPT" ]
  grep -q '\[string\]\$Program' "$SCRIPT"
}

@test "firewall rule matching never derives identity from the parent directory name" {
  [ -f "$SCRIPT" ]   # Positiv-Anker
  run grep -n 'GetFileName(\$dir)' "$SCRIPT"
  [ "$status" -ne 0 ] || {
    echo "rule matching uses the parent directory basename — collides with other" >&2
    echo "llama builds that share a 'bin' subfolder (T002496):" >&2
    echo "$output" >&2
    return 1
  }
}

@test "firewall rule matching compares against the full program path" {
  [ -f "$SCRIPT" ]   # Positiv-Anker
  # Der Vergleich muss den uebergebenen -Program-Wert selbst heranziehen,
  # normalisiert, statt ein aus Teilen gebautes Wildcard-Muster.
  grep -qE '\$_\.Program.*-(i?eq|like)[[:space:]]+\$(Program|normalizedProgram|programPath)' "$SCRIPT" || {
    echo "no direct comparison of \$_.Program against the -Program argument found" >&2
    grep -n '\$_\.Program' "$SCRIPT" >&2 || true
    return 1
  }
}

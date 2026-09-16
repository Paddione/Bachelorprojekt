#!/usr/bin/env bats
# tests/spec/mcp-gateway/start-windows-unc.bats — T900190/T900191
# SSOT: openspec/specs/mcp-gateway.md ("Windows hosts have a documented start mechanism")
#
# Pruefmodus: Quelltext (dokumentierte Ausnahme T002448-M4, wie
# powershell-ascii-only.bats) — Windows-PowerShell laeuft nicht in der Linux-CI, das
# Ergebnis dieser Skripte manifestiert sich ausschliesslich in ihrem Inhalt.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  START="$REPO_ROOT/scripts/mcp-gateway/start-windows.ps1"
  AUTOSTART="$REPO_ROOT/scripts/mcp-gateway/register-autostart.ps1"
}

@test "T900190: beide Skripte loesen RepoRoot ueber .ProviderPath auf, keines ueber ).Path" {
  for f in "$START" "$AUTOSTART"; do
    [ -f "$f" ]
    # Positiv-Anker: die Zeile mit Resolve-Path existiert ueberhaupt
    grep -q 'Resolve-Path' "$f"
    grep -q '(Resolve-Path .*)\.ProviderPath' "$f"
  done
  # Negativ-Aussage erst NACH dem Positiv-Anker (tests/CLAUDE.md): kein Skript
  # darf mehr das UNC-brechende ).Path an dieser Stelle verwenden.
  bad="$(grep -lE '\(Resolve-Path [^)]*\)\.Path\b' "$START" "$AUTOSTART" || true)"
  [ -z "$bad" ]
}

@test "start-windows.ps1 startet keinen lokalen bge-mcp-Prozess mehr" {
  [ -f "$START" ]
  hit="$(grep -ciE 'node.*bge-mcp[\\/]server\.mjs' "$START" || true)"
  [ "$hit" -eq 0 ]
}

@test "start-windows.ps1 forwardet svc/llm-services aus dem devmesh-Kontext mit allen drei Ports" {
  [ -f "$START" ]
  # Positiv-Anker: das Skript kennt ueberhaupt einen zweiten Kontext neben fleet
  grep -qF 'devmesh' "$START"
  line="$(grep -E 'context .?devmesh.? .*svc/llm-services' "$START" || true)"
  [ -n "$line" ]
  for port in 18235 13001 13005; do
    [[ "$line" == *"$port"* ]]
  done
}

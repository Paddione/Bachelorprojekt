#!/usr/bin/env bats
# tests/spec/openspec-embedding/windows-entrypoint-T900084.bats
# SSOT: openspec/specs/openspec-embedding.md
#
# Reproduziert T900084: scripts/openspec-embed.mjs ruft main() hinter dem Guard
#   if (import.meta.url === `file://${process.argv[1]}`)
# auf. Unter Windows ist import.meta.url 'file:///C:/...', die rechte Seite
# dagegen 'file://C:\...' — der Vergleich ist immer falsch, main() laeuft nie,
# der Prozess endet mit Exit 0 und leerer Ausgabe. Der Wrapper deutet das als
# Fehlschlag und meldet 'embed failed (non-fatal)'. Folge: von einem
# Windows-Rechner wurde nie ein Plan indiziert.
#
# Pruefmodus: Der --help-Test ist echte OUTPUT-Verifikation und wird unter
# Windows rot; unter Linux ist er der Positiv-Anker. Die beiden Pattern-Tests
# sind KONFIGURATIONS-Guards (dokumentierte Ausnahme, T002448-M4): das Ergebnis
# der Plattform-Korrektheit manifestiert sich ausschliesslich im Quelltext, weil
# der Defekt auf einem Linux-Runner per Konstruktion nicht auftritt. Ohne sie
# waere der Fix in CI nicht abgesichert.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  MJS="$REPO/scripts/openspec-embed.mjs"
  command -v node >/dev/null 2>&1 || skip "node binary not installed"
  [ -f "$MJS" ] || skip "scripts/openspec-embed.mjs fehlt"
}

@test "T900084: --help gibt den Usage-Block aus (main() wird ueberhaupt erreicht)" {
  run node "$MJS" --help
  [ "$status" -eq 0 ]
  [ -n "$output" ]
  [[ "$output" == *"Usage: node scripts/openspec-embed.mjs"* ]]
}

@test "T900084: Entrypoint-Guard vergleicht ueber pathToFileURL, nicht per String-Konkatenation" {
  # Positiv-Anker: die Datei hat ueberhaupt einen Entrypoint-Guard auf main().
  run grep -c 'main();' "$MJS"
  [ "$status" -eq 0 ]
  [ "$output" -ge 1 ]
  # Aussage: die kaputte Konkatenation ist weg ...
  run grep -F 'file://${process.argv[1]}' "$MJS"
  [ "$status" -ne 0 ]
  # ... und durch pathToFileURL ersetzt.
  run grep -F 'pathToFileURL' "$MJS"
  [ "$status" -eq 0 ]
}

@test "T900084: repoRoot wird ueber fileURLToPath aufgeloest, nicht ueber URL.pathname" {
  # Positiv-Anker: die Datei leitet ueberhaupt ein repoRoot ab.
  run grep -c 'repoRoot' "$MJS"
  [ "$status" -eq 0 ]
  [ "$output" -ge 1 ]
  # Aussage: kein URL.pathname mehr (ergibt unter Windows '/C:/...' -> 'C:\C:\...').
  run grep -F 'new URL(import.meta.url).pathname' "$MJS"
  [ "$status" -ne 0 ]
  run grep -F 'fileURLToPath' "$MJS"
  [ "$status" -eq 0 ]
}

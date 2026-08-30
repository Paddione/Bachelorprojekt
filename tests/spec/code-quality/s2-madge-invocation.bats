#!/usr/bin/env bats
# tests/spec/code-quality/s2-madge-invocation.bats
# SSOT: openspec/specs/code-quality.md
#
# Prüfmodus: command output verification [T002448-M4]. Der aufgelöste Befehl
# wird AUSGEFÜHRT, nicht im Quelltext gesucht.
#
# Hintergrund T900015: resolveMadgeBinary() lieferte node_modules/.bin/madge —
# einen `#!/bin/sh`-Shim. `execFileSync` startet ohne `shell: true` direkt einen
# Prozess und kann ihn unter Windows nicht ausführen (ENOENT); das S2-Gate und
# damit `task quality:check`/`freshness:check` waren dort generell nicht
# lauffähig. Seit ADR-007 (Windows-native Dev) ist das die primäre
# Entwicklungsplattform.
#
# Die Zusicherung hängt bewusst NICHT am Fehlerbild "läuft auf Windows" — CI
# läuft auf Ubuntu, dort war auch die alte Auflösung grün, ein solcher Test
# wäre dort dauerhaft vakuos. Geprüft wird stattdessen die Eigenschaft, die den
# Defekt ausschließt und auf JEDER Plattform messbar ist: der aufgelöste Befehl
# ist ein direkt startbares Programm, kein interpreterabhängiges Skript.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  command -v node >/dev/null 2>&1 || skip "node nicht verfuegbar"
  [ -d "$REPO/node_modules/madge" ] || skip "madge nicht installiert (npm ci fehlt)"
  # In den Repo-Root wechseln: $REPO ist unter Git Bash ein MSYS-Pfad
  # (/c/Users/...), den Node als C:cUsers... liest. Relative Importe und
  # process.cwd() umgehen die Konvertierung vollstaendig.
  cd "$REPO" || return 1
}

@test "S2 loest madge auf den laufenden Node-Interpreter auf, nicht auf den sh-Shim [T900015]" {
  run node --input-type=module -e "
    import { resolveMadgeCommand } from './scripts/code-quality/gates/s2-cycles.mjs';
    const cmd = resolveMadgeCommand(process.cwd());
    console.log(cmd[0] === process.execPath ? 'EXECPATH' : 'OTHER:' + cmd[0]);
  "
  echo "output: $output"
  [ "$status" -eq 0 ]
  # Positiv-Anker: die Auflösung lief und lieferte den Node-Interpreter.
  [[ "$output" == *"EXECPATH"* ]]
  # Negativ-Aussage erst danach: kein .bin-Shim als Befehl.
  [[ "$output" != *".bin"* ]]
}

@test "S2 kann den aufgeloesten madge-Befehl ohne Shell starten [T900015]" {
  # Der eigentliche Beweis: execFileSync OHNE shell:true — exakt der Aufruf,
  # den madgeCycles() macht. Genau hier scheiterte die alte Auflösung.
  run node --input-type=module -e "
    import { execFileSync } from 'node:child_process';
    import { resolveMadgeCommand } from './scripts/code-quality/gates/s2-cycles.mjs';
    const [cmd, ...prefix] = resolveMadgeCommand(process.cwd());
    const out = execFileSync(cmd, [...prefix, '--version'], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    });
    console.log('VERSION=' + out.trim());
  "
  echo "output: $output"
  [ "$status" -eq 0 ]
  [[ "$output" == *"VERSION="* ]]
  # Semantik statt Darstellung (T002716): eine Versionsnummer muss da sein,
  # welche ist gleichgültig — der madge-Bump darf den Guard nicht röten.
  [[ "$output" =~ VERSION=[0-9]+\. ]]
}

@test "quality:check laeuft durch, ohne an madge zu scheitern [T900015]" {
  # Ende-zu-Ende ueber den ECHTEN Einstiegspunkt. s2-cycles.mjs direkt
  # aufzurufen taugt hier nicht: die Datei ist ein reines Modul ohne
  # Main-Guard, der Aufruf tut nichts und endet mit 0 — der Test bestuende
  # vakuos (tests/CLAUDE.md, "Konfiguration statt Laufzeit"). Gescheitert ist
  # vor dem Fix check.mjs, das runS2() aggregiert.
  run node scripts/code-quality/check.mjs
  echo "output: $output"
  [ "$status" -eq 0 ]
  # Positiv-Anker ZUERST: der Lauf hat ein Ergebnis gemeldet. Formatfrei
  # gepruefte Semantik (T002716) — die Zahlen duerfen sich aendern.
  [[ "$output" == *"quality:check"* ]]
  # Erst danach die Negativ-Aussage.
  [[ "$output" != *"madge failed"* ]]
}

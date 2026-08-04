#!/usr/bin/env bats
# tests/spec/agent-behavior/no-tools-allowlist.bats — T002651
#
# Kein Domain-Agent darf eine `tools:`-Allowlist fuehren.
#
# Ein `tools:`-Key in der Agent-Frontmatter ist eine Allowlist: alles Nichtgenannte
# wird entzogen — einschliesslich saemtlicher MCP-Tools und des `Skill`-Tools.
# `bachelorprojekt-ops` fuehrte `tools: [Bash, Read, Glob, Grep]` und hatte damit
# weder MCP noch Skills, waehrend die Routing-Tabelle in CLAUDE.md ihm
# `mcp-kubernetes` als MCP-Primaer zuweist. Bash blieb unbeschraenkt: die Liste
# entzog die strukturierten Zugaenge und liess den unstrukturierten uebrig.
#
# Warum der T002221-Guard das nicht fing: er prueft, ob eine deklarierte Liste zu
# MEHR ALS NULL Eintraegen aufloest — zugeschnitten auf die damalige Havarie
# (erfundene Namen -> leere Menge -> Dispatch verweigert). Vier gueltige
# Tool-Namen erfuellen das. Die dahinterliegende Klasse ist nicht "Liste ist
# leer", sondern "Liste entzieht Faehigkeiten".
#
# Pruefmodus [T002448-M4]: Der Gegenstand dieser Regel IST der Dateiinhalt
# (Frontmatter-Deklaration), es gibt kein Laufzeitverhalten zu messen. Damit
# faellt sie unter die dokumentierte Ausnahme fuer Querschnittstests, deren
# Ergebnis sich ausschliesslich im Quelltext manifestiert.

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
}

@test "T002651: kein Domain-Agent fuehrt eine tools:-Allowlist" {
  cd "$REPO_ROOT"

  # Positiv-Anker [T002356-M1]: Die Aussage ist eine Negativaussage und waere
  # vakuos erfuellt, wenn das Glob ins Leere liefe. Erst belegen, dass ueberhaupt
  # Agent-Dateien gefunden wurden, dann die Negativaussage pruefen.
  local found=0
  local offenders=""
  for agent in .claude/agents/bachelorprojekt-*.md; do
    [ -f "$agent" ] || continue
    found=$((found + 1))
    if grep -qE '^tools:([[:space:]]*$|[[:space:]]*\[)' "$agent"; then
      offenders="${offenders}${agent} "
    fi
  done

  [ "$found" -ge 6 ] || {
    echo "Positiv-Anker fehlgeschlagen: nur $found Agent-Definitionen gefunden (erwartet >= 6)"
    return 1
  }

  [ -z "$offenders" ] || {
    echo "Agents mit tools:-Allowlist (entzieht MCP und Skills): $offenders"
    return 1
  }
}

@test "T002651: agents.yaml fuehrt fuer keine Rolle einen tools:-Eintrag" {
  cd "$REPO_ROOT"

  # Der Registry-Eintrag ist ein Spiegel der Frontmatter. Bleibt er stehen,
  # waehrend die Frontmatter bereinigt ist, schlaegt das bidirektionale
  # Drift-Gate in tests/spec/agent-roster.bats zu.
  run node -e "
    const y = require('yaml');
    const fs = require('fs');
    const d = y.parse(fs.readFileSync('docs/agent-guide/registry/agents.yaml','utf8'));
    const roles = d.roles || {};
    const names = Object.keys(roles);
    if (names.length < 6) {
      console.log('ANCHOR_FAIL: nur ' + names.length + ' roles in der Registry');
      process.exit(1);
    }
    const withTools = names.filter(n => roles[n] && roles[n].tools !== undefined);
    if (withTools.length) {
      console.log('TOOLS_ENTRY: ' + withTools.join(' '));
      process.exit(1);
    }
    console.log('OK: ' + names.length + ' roles ohne tools-Eintrag');
  "
  [ "$status" -eq 0 ] || { echo "$output"; return 1; }
  echo "$output" | grep -q '^OK:'
}

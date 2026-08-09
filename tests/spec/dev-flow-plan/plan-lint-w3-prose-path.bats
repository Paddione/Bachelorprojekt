#!/usr/bin/env bats
# T002807: W3 (File-Structure <-> Tasks Querpruefung) liest derzeit JEDEN
# Backtick-Pfad im gesamten "## File Structure"-Abschnitt als gelisteten
# Tabelleneintrag — auch einen, der nur in Fliesstext als Beleg erwaehnt wird
# (z.B. "Positiv-Kontrolle: `scripts/agent-lock.sh` gibt ... 265 zurueck").
# Das zwingt Autoren dazu, Belege UNSPEZIFISCHER zu formulieren, um die
# Warnung loszuwerden — Gegenteil der Konvention "konkrete, nachpruefbare
# Angaben". Erwartung: W3 darf nur auf Dateien anschlagen, die tatsaechlich
# in der File-Structure-TABELLE (oder einem Listenpunkt) stehen, nicht auf
# jeden Backtick-Pfad in umgebender Prosa.
#
# Pruefmodus: command output verification [T002448-M4]. plan-lint.sh wird
# ausgefuehrt, $status/$output geprueft — kein Source-Grep.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  LINT="$REPO/scripts/plan-lint.sh"
}

@test "W3: Prosa-Erwaehnung eines Pfads im File-Structure-Abschnitt loest keine Warnung aus, ein echter Tabelleneintrag weiterhin schon" {
  local p="$BATS_TEST_TMPDIR/w3-prose.md"
  {
    printf -- '---\ntitle: W3 Prosa Probe\nticket_id: T002807\ndomains: [test]\nstatus: active\n---\n\n'
    printf '# W3 Prosa Probe Implementation Plan\n\n'
    printf '## File Structure\n\n'
    printf '| Datei | Zweck |\n|---|---|\n| `scripts/example.sh` | Ziel, unreferenziert |\n\n'
    printf 'Positiv-Kontrolle: `scripts/agent-lock.sh` gibt unter demselben Aufruf 265 zurueck, der Messpfad funktioniert also.\n\n'
    printf '## Task 1: Do the thing\n\n'
    printf '**Files:**\n- Modify: `scripts/other-file.sh`\n\n'
    printf -- '- [ ] **Step 1: Write the failing test**\n\n'
    printf 'Run: `bats tests/unit/example.bats`\nExpected: FAIL\n\n'
    printf -- '## Task 2: GREEN\n\n- [ ] implement\n\n'
    printf '## Task 3: Verify\n\n```bash\ntask test:changed\ntask freshness:regenerate\ntask freshness:check\n```\n'
  } > "$p"

  run bash "$LINT" "$p"

  # Positiv-Anker [T002356-M1]: `scripts/example.sh` steht ECHT in der Tabelle
  # und wird von keiner Task referenziert — W3 MUSS dafuer weiterhin anschlagen.
  # Ohne diesen Anker waere die folgende Negativ-Aussage auch bei einem Linter
  # gruen, der W3 gar nicht mehr auswertet.
  echo "$output" | grep -qF 'W3: `scripts/example.sh` is listed in File Structure but no task references it' \
    || { echo "Anker fehlt: W3 muss fuer den echten Tabelleneintrag scripts/example.sh anschlagen. Output:"; echo "$output"; return 1; }

  # Kernaussage (RED heute, GREEN nach dem Fix): eine reine Prosa-Erwaehnung
  # von scripts/agent-lock.sh im selben Abschnitt darf KEINE W3-Warnung ausloesen.
  ! echo "$output" | grep -qF 'agent-lock.sh'
}

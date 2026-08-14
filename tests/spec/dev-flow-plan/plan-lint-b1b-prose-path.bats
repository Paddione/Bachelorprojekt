#!/usr/bin/env bats
# T002807: B1b (Restbudget-Warnung) hat denselben Root-Cause wie W3 (siehe
# plan-lint-w3-prose-path.bats) — es liest jeden Backtick-Pfad mit Quellcode-Endung
# aus dem GESAMTEN Dokument (PLAN_PROSE), nicht nur aus Tabellenzeilen/Listenpunkten.
# Eine reine Prosa-Erwaehnung einer realen, budget-erschoepften Datei loest damit
# faelschlich eine B1b-Warnung aus, obwohl die Datei nirgends als Aenderungsziel
# geplant ist. Traegt die Prosa zufaellig das Label-Muster "`path` ... Budget N",
# waere B1a (Hard Fail) betroffen statt nur B1b (Warnung) — hier wird der mildere,
# reproduzierbare B1b-Fall getestet.
#
# Pruefmodus: command output verification [T002448-M4]. plan-lint.sh wird
# ausgefuehrt, $status/$output geprueft — kein Source-Grep.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  LINT="$REPO/scripts/plan-lint.sh"
}

@test "B1b: Prosa-Erwaehnung einer budget-erschoepften Datei loest keine Warnung aus, ein echter Tabelleneintrag weiterhin schon" {
  local p="$BATS_TEST_TMPDIR/b1b-prose.md"
  {
    printf -- '---\ntitle: B1b Prosa Probe\nticket_id: T002807\ndomains: [test]\nstatus: active\n---\n\n'
    printf '# B1b Prosa Probe Implementation Plan\n\n'
    printf '## File Structure\n\n'
    # Echter Tabelleneintrag: budget-erschoepfte Datei A, wird von Task 1 beruehrt.
    printf '| File | Ist | Budget |\n|------|-----|--------|\n'
    printf -- '| `scripts/code-quality/fixtures/plan-lint/over-threshold-target.sh` | 850 | -50 |\n\n'
    # Reine Prosa-Erwaehnung: eine ANDERE, ebenfalls budget-erschoepfte Datei B,
    # nur als Beleg genannt — steht NICHT in der Tabelle, KEIN Listenpunkt.
    printf 'Beleg: `scripts/code-quality/fixtures/plan-lint/over-threshold-prose.sh` ist ebenfalls am Limit, dient hier nur als Beleg fuer die Budget-Rechnung.\n\n'
    printf '## Task 1: Do the thing\n\n'
    printf '**Files:**\n- Modify: `scripts/code-quality/fixtures/plan-lint/over-threshold-target.sh`\n\n'
    printf -- '- [ ] **Step 1: Write the failing test**\n\n'
    printf 'Run: `bats tests/unit/example.bats`\nExpected: FAIL\n\n'
    printf -- '## Task 2: GREEN\n\n- [ ] implement\n\n'
    printf '## Task 3: Verify\n\n```bash\ntask test:changed\ntask freshness:regenerate\ntask freshness:check\n```\n'
  } > "$p"

  run bash "$LINT" "$p"

  # Positiv-Anker [T002356-M1]: die echte Tabellenzeile (Datei A) MUSS weiterhin
  # eine B1b-Warnung ausloesen. Ohne diesen Anker waere die folgende
  # Negativ-Aussage auch dann gruen, wenn B1b gar nicht mehr auswerten wuerde.
  echo "$output" | grep -qF 'B1b: scripts/code-quality/fixtures/plan-lint/over-threshold-target.sh' \
    || { echo "Anker fehlt: B1b muss fuer den echten Tabelleneintrag over-threshold-target.sh anschlagen. Output:"; echo "$output"; return 1; }

  # Kernaussage (RED heute, GREEN nach dem Fix): die reine Prosa-Erwaehnung von
  # Datei B (over-threshold-prose.sh, nicht in der Tabelle) darf KEINE B1b-Warnung
  # ausloesen. Datei B ist selbst budget-erschoepft (850 Zeilen gegen .sh-Limit
  # 800) — wuerde plan-lint wieder Prosa-Zeilen scannen (T002807-Regression),
  # schluege B1b fuer exakt diese Zeile an und der Test wuerde rot.
  ! echo "$output" | grep -qF 'B1b: scripts/code-quality/fixtures/plan-lint/over-threshold-prose.sh'
}

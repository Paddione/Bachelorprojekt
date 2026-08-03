#!/usr/bin/env bats
# G2 (T002593): plan-lint warnt — nicht blockierend — wenn ein Plan weniger als 3
# oder mehr als 7 "## Task"-Bloecke hat. Die Zahl ist ein Signal an den Planner,
# kein Gate: ein Hard-Fail auf eine Task-Anzahl wuerde Plaene erzeugen, die die
# Schwelle treffen statt die Invariante (ein Task = eine pruefbare Aussage).
#
# Pruefmodus: command output verification [T002448-M4]. Jeder Test ruft
# scripts/plan-lint.sh AUS und prueft $status/$output — kein Source-Grep.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  LINT="$REPO/scripts/plan-lint.sh"
}

# mkplan <n-tasks> <ziel-datei> — erzeugt einen ansonsten lint-konformen Plan
# (F1/F2-Frontmatter, STRUCT1-3, keine P1-Platzhalter) mit genau n "## Task"-Bloecken.
# Task 1 traegt den failing-test-Schritt, Task n den Verify-Block.
mkplan() {
  local n="$1" out="$2" i
  {
    echo '---'
    echo 'title: Task Count Fixture'
    echo 'ticket_id: T002593'
    echo 'domains: [test]'
    echo 'status: active'
    echo '---'
    echo
    echo '# Task Count Fixture Implementation Plan'
    echo
    echo '## File Structure'
    echo
    echo '- Modify: `scripts/example.sh`'
    echo
    echo '## Task 1: RED'
    echo
    echo '- [ ] **Step 1: Write the failing test**'
    echo
    echo 'Run: `bats tests/unit/example.bats`'
    echo 'Expected: FAIL'
    for ((i = 2; i < n; i++)); do
      echo
      echo "## Task $i: GREEN step $i"
      echo
      echo '- [ ] **Step 1: Implement**'
    done
    echo
    echo "## Task $n: Verify"
    echo
    echo '```bash'
    echo 'task test:changed'
    echo 'task freshness:regenerate'
    echo 'task freshness:check'
    echo '```'
  } > "$out"
}

@test "G2: 5 Tasks liegen im Korridor und loesen keine Warnung aus" {
  # Positiv-Anker [T002356-M1]: erst belegen, dass G2 ueberhaupt feuert. Ohne ihn
  # waere "kein G2 im Output" auch dann gruen, wenn der Check gar nicht existiert.
  mkplan 2 "$BATS_TEST_TMPDIR/zwei.md"
  run bash "$LINT" "$BATS_TEST_TMPDIR/zwei.md"
  echo "$output" | grep -q 'G2' || { echo "Anker: G2 feuert nicht bei 2 Tasks"; return 1; }

  mkplan 5 "$BATS_TEST_TMPDIR/fuenf.md"
  run bash "$LINT" "$BATS_TEST_TMPDIR/fuenf.md"
  [ "$status" -eq 0 ]
  echo "$output" | grep -q 'PLAN-LINT: PASS'
  ! echo "$output" | grep -q 'G2'
}

@test "G2: unter 3 Tasks warnt, ohne den Exit-Code zu aendern (warn-only)" {
  mkplan 2 "$BATS_TEST_TMPDIR/zwei.md"
  run bash "$LINT" "$BATS_TEST_TMPDIR/zwei.md"
  # Kernaussage der Chore: warn, kein Gate.
  [ "$status" -eq 0 ]
  echo "$output" | grep -q 'PLAN-LINT: PASS'
  echo "$output" | grep '^⚠' | grep -q 'G2'
  echo "$output" | grep 'G2' | grep -q '2'
}

@test "G2: ueber 7 Tasks warnt, ohne den Exit-Code zu aendern (warn-only)" {
  mkplan 8 "$BATS_TEST_TMPDIR/acht.md"
  run bash "$LINT" "$BATS_TEST_TMPDIR/acht.md"
  [ "$status" -eq 0 ]
  echo "$output" | grep -q 'PLAN-LINT: PASS'
  echo "$output" | grep '^⚠' | grep -q 'G2'
  echo "$output" | grep 'G2' | grep -q '8'
}

@test "G2: Schwellenwerte 3 und 7 selbst sind noch im Korridor" {
  # Positiv-Anker [T002356-M1]: ohne ihn waeren beide Negativ-Aussagen unten auch
  # dann gruen, wenn G2 gar nicht existiert.
  mkplan 8 "$BATS_TEST_TMPDIR/acht.md"
  run bash "$LINT" "$BATS_TEST_TMPDIR/acht.md"
  echo "$output" | grep -q 'G2' || { echo "Anker: G2 feuert nicht bei 8 Tasks"; return 1; }

  mkplan 3 "$BATS_TEST_TMPDIR/drei.md"
  run bash "$LINT" "$BATS_TEST_TMPDIR/drei.md"
  [ "$status" -eq 0 ]
  ! echo "$output" | grep -q 'G2'

  mkplan 7 "$BATS_TEST_TMPDIR/sieben.md"
  run bash "$LINT" "$BATS_TEST_TMPDIR/sieben.md"
  [ "$status" -eq 0 ]
  ! echo "$output" | grep -q 'G2'
}

@test "G2 partial-mode: Tasks werden ueber tasks.d/ summiert, nicht nur im Index gezaehlt" {
  # Das ok-Fixture hat 1 Task im Index + je 1 in p1-impl/p2-tests = 3 gesamt.
  # Naive Zaehlung (nur tasks.md) saehe 1 und wuerde jeden Partial-Plan
  # faelschlich als "zu wenige Tasks" melden.
  bash "$REPO/tests/spec/fixtures/make-partial-plan.sh" "$BATS_TEST_TMPDIR/chg" ok

  # Positiv-Anker [T002356-M1], zwei Teile:
  # (a) G2 existiert und feuert ueberhaupt,
  # (b) der Index allein liegt unter der Schwelle — nur dann ist das Ausbleiben
  #     der Warnung unten ein Beleg fuer die Summierung statt ein Zufall.
  mkplan 2 "$BATS_TEST_TMPDIR/zwei.md"
  run bash "$LINT" "$BATS_TEST_TMPDIR/zwei.md"
  echo "$output" | grep -q 'G2' || { echo "Anker: G2 feuert nicht bei 2 Tasks"; return 1; }
  [ "$(grep -c '^#\+[[:space:]]\+Task' "$BATS_TEST_TMPDIR/chg/tasks.md")" -lt 3 ]

  run bash "$LINT" "$BATS_TEST_TMPDIR/chg/tasks.md"
  [ "$status" -eq 0 ]
  ! echo "$output" | grep -q 'G2'
}

@test "G2 zaehlt auch das OpenSpec-Format '## N. Titel', nicht nur '## Task N'" {
  # 17 von 95 Plaenen nutzten am 2026-08-03 das nummerierte Skeleton-Format. Zaehlt
  # G2 es nicht, warnt es dort "0 Tasks" — eine Warnung, die man ignorieren lernt.
  local p="$BATS_TEST_TMPDIR/numeriert.md"
  {
    printf -- '---\ntitle: Numeriert\nticket_id: T002593\ndomains: [test]\nstatus: active\n---\n\n'
    printf '# Numeriert Implementation Plan\n\n## File Structure\n\n- Modify: `scripts/example.sh`\n\n'
    printf '## 1. RED\n\nRun: `bats tests/unit/example.bats`\nExpected: FAIL\n\n'
    printf '## 2. GREEN\n\n- [ ] implement\n\n'
    printf '## 3. Verify\n\n```bash\ntask test:changed\ntask freshness:regenerate\ntask freshness:check\n```\n'
  } > "$p"

  # Positiv-Anker [T002356-M1]: G2 muss ueberhaupt feuern koennen.
  mkplan 2 "$BATS_TEST_TMPDIR/zwei.md"
  run bash "$LINT" "$BATS_TEST_TMPDIR/zwei.md"
  echo "$output" | grep -q 'G2' || { echo "Anker: G2 feuert nicht bei 2 Tasks"; return 1; }

  run bash "$LINT" "$p"
  ! echo "$output" | grep -q 'G2'
}

@test "G2 zaehlt '## Tasks' und '## Task List' nicht als Task" {
  # Sammelueberschriften duerfen die Zaehlung nicht aufblaehen: ein 2-Task-Plan mit
  # einer '## Tasks'-Ueberschrift muss weiterhin als 2 gelten und warnen.
  local p="$BATS_TEST_TMPDIR/sammel.md"
  mkplan 2 "$p"
  printf '\n## Tasks\n\n## Task List\n' >> "$p"
  run bash "$LINT" "$p"
  echo "$output" | grep 'G2' | grep -q '2'
}

@test "G2 schweigt bei 0 erkannten Tasks (Format-Unsicherheit, kein Befund)" {
  # 0 heisst "Format nicht erkannt", nicht "keine Tasks". Das Repo fuehrt mindestens
  # vier Task-Konventionen; eine fuenfte wuerde den Regex still brechen und den Plan
  # faelschlich anklagen. Strukturlose Plaene fangen STRUCT2/STRUCT3 hart ab.
  local p="$BATS_TEST_TMPDIR/kein-format.md"
  {
    printf -- '---\ntitle: Ohne\nticket_id: T002593\ndomains: [test]\nstatus: active\n---\n\n'
    printf '# Ohne Implementation Plan\n\n## File Structure\n\n- Modify: `scripts/example.sh`\n\n'
    printf '## Vorgehen\n\nRun: `bats tests/unit/example.bats`\nExpected: FAIL\n\n'
    printf '## Abschluss\n\n```bash\ntask test:changed\ntask freshness:regenerate\ntask freshness:check\n```\n'
  } > "$p"

  # Positiv-Anker [T002356-M1]: G2 muss ueberhaupt feuern koennen.
  mkplan 2 "$BATS_TEST_TMPDIR/zwei.md"
  run bash "$LINT" "$BATS_TEST_TMPDIR/zwei.md"
  echo "$output" | grep -q 'G2' || { echo "Anker: G2 feuert nicht bei 2 Tasks"; return 1; }

  run bash "$LINT" "$p"
  ! echo "$output" | grep -q 'G2'
}

@test "G2 erkennt die Formate '## T1 —' und '- [ ] **Task 1:**'" {
  local p="$BATS_TEST_TMPDIR/t-form.md"
  {
    printf -- '---\ntitle: T-Form\nticket_id: T002593\ndomains: [test]\nstatus: active\n---\n\n'
    printf '# T-Form Implementation Plan\n\n## File Structure\n\n- Modify: `scripts/example.sh`\n\n'
    printf '## T1 — RED\n\nRun: `bats tests/unit/example.bats`\nExpected: FAIL\n\n'
    printf '## T2 — GREEN\n\n- [ ] **Task 3: extra step**\n\n'
    printf '## T4 — Verify\n\n```bash\ntask test:changed\ntask freshness:regenerate\ntask freshness:check\n```\n'
  } > "$p"

  # 4 erkannte Tasks (T1, T2, Checklisten-Task 3, T4) => im Korridor, keine Warnung.
  # Ohne die Formate (c)/(d) waeren es 0 und der Plan liefe in den Schweige-Zweig —
  # deshalb prueft der Anker unten, dass ueberhaupt gezaehlt wurde.
  mkplan 2 "$BATS_TEST_TMPDIR/zwei.md"
  run bash "$LINT" "$BATS_TEST_TMPDIR/zwei.md"
  echo "$output" | grep -q 'G2' || { echo "Anker: G2 feuert nicht bei 2 Tasks"; return 1; }

  # Scharfer Nachweis der Erkennung: nur EINEN der vier Tasks stehen lassen -> 1 Task,
  # das ist unter der Schwelle und MUSS warnen (im Schweige-Zweig waere es still).
  local q="$BATS_TEST_TMPDIR/t-form-eins.md"
  sed '/^## T2 /,/^- \[ \] \*\*Task 3/d; /^## T4 /d' "$p" > "$q"
  run bash "$LINT" "$q"
  echo "$output" | grep 'G2' | grep -q '1'

  run bash "$LINT" "$p"
  ! echo "$output" | grep -q 'G2'
}

@test "G2 erscheint im JSON-Modus unter warn, niemals unter hard" {
  mkplan 2 "$BATS_TEST_TMPDIR/zwei.md"
  run bash "$LINT" --json "$BATS_TEST_TMPDIR/zwei.md"
  [ "$status" -eq 0 ]
  echo "$output" | python3 -c '
import json,sys
d = json.load(sys.stdin)
assert d["verdict"] == "PASS", d["verdict"]
assert any("G2" in w for w in d["warn"]), d["warn"]
assert not any("G2" in h for h in d["hard"]), d["hard"]
'
}

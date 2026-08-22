#!/usr/bin/env bats
# tests/spec/mishap-rollup/carryover-worktree-scan.bats — T013316 (#10)
#
# Pruefmodus: OUTPUT-VERIFIKATION [T002448-M4]. Das Skript wird AUSGEFUEHRT und
# sein stdout/Exit-Code geprueft — kein Source-Grep.
#
# Defekt: _cycle_plans() globbt `find "$SCAN_ROOT" -path '*mishap-incident-rollup-*'`
# ueber den GESAMTEN Scan-Root. Traegt ein Worktree das Muster im NAMEN
# (.worktrees/mishap-incident-rollup-…-reuse/), werden ~700 archivierte
# Feature-Plaene darin als Rollup-Zyklen gescannt. Zwei Folgefehler:
#   (1) Boilerplate-Zeilen ohne (meta)-Suffix passieren _line_title ungefiltert
#       als Rohzeile (Titel = "- [ ] **7. Final Verification.** …"),
#   (2) identische Boilerplate in >= 2 gescannten Plaenen gilt faelschlich als
#       Rezurrenz → Eskalation. Real entstanden: T013420/T013421/T013422.
#
# Fix-Richtung [T013316 #10]: find auf $SCAN_ROOT/openspec/changes verankern;
# Titel-Fallback verwerfen, wenn _line_title nicht matcht (leer ist kein Urteil).

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  CARRY="$REPO_ROOT/scripts/factory/rollup-carryover.sh"
  WORK="$BATS_TEST_TMPDIR/work"
  rm -rf "$WORK"
  mkdir -p "$WORK"
}

# Ein echter Rollup-Zyklus mit EINEM offenen Eintrag.
_real_cycle_plan() {
  cat <<'EOF'
# mishap-incident-rollup — Implementation Plan

## Aufgaben

- [ ] **1. Echter wiederkehrender Eintrag** (degraded, scripts/beispiel.sh) — Disposition: _<gefixt | bereits gefixt | kein Repo-Fix>_ + Begruendung

- [ ] **Failing-Test-Step (RED).** Platzhalter.
EOF
}

# Boilerplate einer Feature-Plan-Vorlage: Zeilen ohne (meta)-Suffix. Vor dem
# Fix liefen sie als Rohzeile durch _line_title und galten in >= 2 Plaenen als
# Rezurrenz.
_boilerplate_plan() {
  cat <<'EOF'
# irgendein-feature — Implementation Plan

## Aufgaben

- [ ] **Schritt 1.** Etwas implementieren.
- [ ] **7. Final Verification.** Die drei verpflichtenden CI-Gates:

```bash
task test:changed
```
EOF
}

@test "T013316: Eskalation ignoriert Plaene unter .worktrees/ und Boilerplate-Zeilen ohne Meta-Suffix" {
  # Zwei echte Zyklen ausserhalb des laufenden Containers — derselbe offene
  # Eintrag in beiden ist eine ECHTE Rezurrenz und MUSS eskaliert werden
  # (Positiv-Anker: der Mechanismus ist scharf gestellt).
  local c1 c2
  c1="$WORK/openspec/changes/mishap-incident-rollup-2026-08-01-T011111"
  c2="$WORK/openspec/changes/archive/2026-08-02-mishap-incident-rollup-2026-08-02-T012222"
  mkdir -p "$c1" "$c2"
  _real_cycle_plan > "$c1/tasks.md"
  _real_cycle_plan > "$c2/tasks.md"

  # Decoy: ein Worktree, dessen NAME das Rollup-Muster traegt, voller
  # archivierter Feature-Plaene mit Boilerplate. Vor dem Fix floss das hier
  # in die Rezurrenz-Bewertung ein.
  local decoy="$WORK/.worktrees/mishap-incident-rollup-2026-08-22-T013303-reuse/openspec/changes/archive"
  local i d
  for i in 1 2 3; do
    d="$decoy/2026-07-0${i}-irgendein-feature-${i}"
    mkdir -p "$d"
    _boilerplate_plan > "$d/tasks.md"
  done

  run bash "$CARRY" --escalations "$WORK" --container T013316
  # Positiv-Anker: die echte Rezurrenz wurde gefunden und eskaliert.
  [ "$status" -eq 0 ]
  printf '%s\n' "$output" | grep -qF 'Echter wiederkehrender Eintrag'

  # Die eigentliche Aussage: keine Boilerplate-Rohzeile im Ergebnis.
  # Bewusst KEINE nackte '!'-Pipeline als Assertion: bash nimmt '!'-Kommandos
  # von errexit aus — eine fehlgeschlagene Negation wuerde den Test nicht rot
  # machen, sondern nur den Status der letzten Zeile melden.
  local boilerplate
  boilerplate="$(printf '%s\n' "$output" \
    | grep -F -e 'Final Verification' -e 'irgendein-feature' || true)"
  [ -z "$boilerplate" ]
}

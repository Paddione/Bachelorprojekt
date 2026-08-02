#!/usr/bin/env bats
# tests/spec/openspec-workflow/delta-scenario-guard.bats — T002567
#
# Pruefmodus: OUTPUT-VERIFIKATION [T002448-M4]. Die Tests rufen validateDeltaFile
# bzw. validateTree tatsaechlich AUF und pruefen $status/$output — sie greppen
# nicht die Implementierung.
#
# Hintergrund: Der Scenario-Ratchet (T002004) prueft bisher NUR die SSOT unter
# openspec/specs/. Delta-Specs unter openspec/changes/<slug>/specs/ wurden davon
# nicht erfasst. Weil `openspec archive` das Delta unveraendert in die SSOT
# merged, wurde eine fehlende `#### Scenario:`-Ueberschrift erst beim Archivieren
# sichtbar — im Schnitt Tage nach ihrer Entstehung und in einem ANDEREN Vorgang
# als dem, der sie verursacht hat.
#
# Wirkung am 2026-08-02: dreimal hintereinander rotes `main` (brain-k2-bge,
# brain-k3-code-graph, brain-k8-gesamtbild), jedes Mal saemtliche offenen PRs
# blockiert, bis ein Nachzieh-PR die SSOT reparierte. Ein Scan fand zu diesem
# Zeitpunkt 18 weitere unarchivierte Deltas mit derselben Luecke.
#
# Diese Datei zieht den Guard eine Stufe nach vorn: die Luecke faellt jetzt in
# dem PR auf, der sie erzeugt.
#
# ABGRENZUNG: Nur ADDED- und MODIFIED-Requirements brauchen ein Scenario — das
# sind die, deren Text in die SSOT wandert. REMOVED und RENAMED beschreiben eine
# Operation auf einem bestehenden Requirement und tragen keinen Szenariotext.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  TMP="$(mktemp -d)"
}

teardown() {
  rm -rf "$TMP"
}

# Ruft validateChange auf ein Fixture-Change-Verzeichnis auf.
# Gibt die Fehlerliste auf stdout aus; exit 1, wenn Fehler vorliegen.
_validate_change() {
  bash -c "cd '$REPO' && npx tsx -e '
    import {validateChange} from \"./scripts/openspec-validate.ts\";
    const r = validateChange(process.argv[1]);
    if (r.result.errors.length) { console.log(r.result.errors.join(\"\n\")); process.exit(1) }
  ' '$1'"
}

_mkchange() {
  mkdir -p "$TMP/$1/specs"
  printf 'T000000\n' > "$TMP/$1/.ticket"
}

@test "T002567: ADDED-Requirement OHNE Scenario wird abgelehnt" {
  _mkchange c1
  cat > "$TMP/c1/specs/demo.md" <<'EOF'
# Spec Delta: demo

## ADDED Requirements

### Requirement: Ohne Szenario (REQ-01)

**GIVEN** a
**WHEN** b
**THEN** c
EOF
  run _validate_change "$TMP/c1"
  [ "$status" -ne 0 ]
  [[ "$output" == *"Ohne Szenario (REQ-01)"* ]]
  [[ "$output" == *"Scenario"* ]]
}

@test "T002567: ADDED-Requirement MIT Scenario wird akzeptiert" {
  # Positiv-Anker [T002356-M1]: belegt, dass der Guard nicht pauschal ablehnt.
  # Ohne diesen Test koennte die Regel jedes Delta fallen und der Negativtest
  # oben waere trotzdem gruen.
  _mkchange c2
  cat > "$TMP/c2/specs/demo.md" <<'EOF'
# Spec Delta: demo

## ADDED Requirements

### Requirement: Mit Szenario (REQ-01)

#### Scenario: Der Normalfall

**GIVEN** a
**WHEN** b
**THEN** c
EOF
  run _validate_change "$TMP/c2"
  [ "$status" -eq 0 ]
}

@test "T002567: MODIFIED-Requirement ohne Scenario wird abgelehnt" {
  _mkchange c3
  cat > "$TMP/c3/specs/demo.md" <<'EOF'
# Spec Delta: demo

## MODIFIED Requirements

### Requirement: Geaendert ohne Szenario (REQ-02)

**GIVEN** a
**THEN** c
EOF
  run _validate_change "$TMP/c3"
  [ "$status" -ne 0 ]
  [[ "$output" == *"Geaendert ohne Szenario (REQ-02)"* ]]
}

@test "T002567: REMOVED-Requirement braucht KEIN Scenario" {
  # Abgrenzung: REMOVED benennt ein zu entfernendes Requirement, es wandert kein
  # Szenariotext in die SSOT. Ein Scenario zu verlangen waere hier sinnlos.
  _mkchange c4
  cat > "$TMP/c4/specs/demo.md" <<'EOF'
# Spec Delta: demo

## REMOVED Requirements

### Requirement: Faellt weg (REQ-03)
EOF
  run _validate_change "$TMP/c4"
  [ "$status" -eq 0 ]
}

@test "T002567: RENAMED-Requirement braucht KEIN Scenario" {
  _mkchange c5
  cat > "$TMP/c5/specs/demo.md" <<'EOF'
# Spec Delta: demo

## RENAMED Requirements

### Requirement: Alter Name (REQ-04)

**Renamed-to:** Neuer Name (REQ-04)
EOF
  run _validate_change "$TMP/c5"
  [ "$status" -eq 0 ]
}

@test "T002567: jedes unarchivierte Delta im Repo deklariert Scenarios (Ratchet)" {
  # Der eigentliche Bestandsschutz: nach diesem Ticket darf kein Delta mehr
  # ohne Scenario in openspec/changes/ liegen. Bricht dieser Test, ist ein
  # neues Delta mit der alten Luecke hinzugekommen.
  run bash -c "cd '$REPO' && npx tsx -e '
    import {validateTree} from \"./scripts/openspec-validate.ts\";
    const r = validateTree(\"openspec\");
    const scen = (r.errors ?? []).filter(e => e.includes(\"Scenario\"));
    if (scen.length) { console.log(scen.join(\"\n\")); process.exit(1) }
  '"
  [ "$status" -eq 0 ]

  # Positiv-Anker: es MUSS ueberhaupt unarchivierte Changes mit Requirements
  # geben — sonst prueft der Lauf oben eine leere Menge und ist trivial gruen.
  run bash -c "grep -rl '^### Requirement: ' '$REPO'/openspec/changes/*/specs/*.md 2>/dev/null | wc -l"
  [ "$status" -eq 0 ]
  [ "$output" -ge 1 ]
}

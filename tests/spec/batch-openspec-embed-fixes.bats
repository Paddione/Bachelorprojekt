#!/usr/bin/env bats
# tests/spec/batch-openspec-embed-fixes.bats
# Batch T003491 — openspec-embed / openspec.sh Fixes.
#
# Deckt je Defekt einen Testblock ab (Output/unit-Verifikation, kein Live-Cluster):
#   p1  T003268 partial chunking + set -e-Schutz der PF-Parse-Schleife
#   p2  T003384 Port-15432-Kollision wird als Ursache gemeldet
#   p3  T003177 (Basis bereits in main #4213) — Probe-Diagnose nennt konkreten Zustand
#   p4  T003140 archive Batch-Modus (openspec-merge.mjs batch-Verb)
#   p5  T003281 Stub-Delta fail-closed im validate-Gate
#   p7  T003287 Archiv-Runbook ohne SKIP_MAIN_COMMIT_GUARD dokumentiert
#
# p6 (Backfill-Completeness) und die T002877-Teile sind in Taskfile.yml bzw. der
# Coverage-Suite (tests/spec/plan-partials-embedding/coverage-gate.bats) abgedeckt.

setup() {
  REPO="$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)"
  TMP="$(mktemp -d)"
}

teardown() { rm -rf "$TMP"; }

# --- p1 / T003268: partial chunking -------------------------------------------

@test "T003268: Partial ueber dem Token-Budget wird in mehrere partial-Chunks gesplittet" {
  run node --input-type=module -e "
    import { buildChunks, approxTokens } from '$REPO/scripts/openspec-embed.mjs';
    const big = '# Partial\n\n' + 'word '.repeat(1700); // ~2125 tokens > 400 Budget
    const chunks = buildChunks({ partials: { 'p1-big': big } });
    if (chunks.length < 2) { console.error('nicht gesplittet: ' + chunks.length); process.exit(1); }
    for (const c of chunks) {
      if (c.fileType !== 'partial') process.exit(2);
      if (c.sectionTitle !== 'p1-big') process.exit(3);
      if (approxTokens(c.text) > 600) { console.error('Chunk zu gross: ' + approxTokens(c.text)); process.exit(4); }
    }
    console.log('OK: ' + chunks.length + ' partial-Chunks');
  "
  [ "$status" -eq 0 ] || { echo "$output"; return 1; }
  [[ "$output" == *"OK:"* ]]
}

@test "T003268: kleiner Partial bleibt ein einzelner Chunk (kein sinnloses Splitting)" {
  run node --input-type=module -e "
    import { buildChunks } from '$REPO/scripts/openspec-embed.mjs';
    const chunks = buildChunks({ partials: { 'p1-small': '# P\n\nshort body' } });
    if (chunks.length !== 1) { console.error('laenge=' + chunks.length); process.exit(1); }
    if (chunks[0].fileType !== 'partial') process.exit(2);
    process.exit(0);
  "
  [ "$status" -eq 0 ] || { echo "$output"; return 1; }
}

@test "T003268: set -e-Schutz in der PF-Parse-Schleife (openspec-embed-local.sh)" {
  # Die Schleife muss die Kommandosubstitution mit || true absichern, sonst bricht
  # ein traeger Port-Forward den Lauf still mit rc=1 und null Output ab (T003268).
  run grep -n 'parse_pf_local_port' "$REPO/scripts/openspec-embed-local.sh"
  [ "$status" -eq 0 ]
  [[ "$output" == *'|| true'* ]]
  run grep -n 'pf_listener_pid' "$REPO/scripts/openspec-embed-local.sh"
  [ "$status" -eq 0 ]
  [[ "$output" == *'|| true'* ]]
}

# --- p2 / T003384: Port-15432-Kollision ----------------------------------------

@test "T003384: ECONNREFUSED wird im Pool-Error-Handler als Port-Kollision gemeldet" {
  run grep -n 'ECONNREFUSED\|ECONNRESET\|Port-Kollision\|15432' "$REPO/scripts/openspec-embed.mjs"
  [ "$status" -eq 0 ]
  [[ "$output" == *"ECONNREFUSED"* ]]
  [[ "$output" == *"Port-Kollision"* ]]
}

@test "T003384: Embed-Fehler mit Verbindungsabbruch nennt den Port statt pauschal embed failed" {
  run grep -n 'Portkonflikt/Portforward pruefen' "$REPO/scripts/openspec-embed.mjs"
  [ "$status" -eq 0 ]
}

# --- p3 / T003177: konkrete Probe-Diagnose (Basis in main #4213) --------------

@test "T003177: probe_diagnosis nennt den konkreten Fehlerzustand, kein pauschales 'nicht erreichbar'" {
  run grep -n 'probe_diagnosis\|KEIN Erreichbarkeitsproblem\|DNS-Aufloesung\|Verbindung abgelehnt' "$REPO/scripts/openspec-embed-local.sh"
  [ "$status" -eq 0 ]
  [[ "$output" == *"probe_diagnosis"* ]]
  [[ "$output" == *"KEIN Erreichbarkeitsproblem"* ]]
}

# --- p4 / T003140: archive Batch-Modus ----------------------------------------

@test "T003140: openspec-merge.mjs bietet ein batch-Verb fuer mehrere Deltas in EINEM Prozess" {
  run node "$REPO/scripts/openspec-merge.mjs" batch --help
  # Usage-Zweig: batch ohne Pfad → exit 2 mit Usage-Zeile, kein stiller Exit 0.
  [ "$status" -eq 2 ]
  [[ "$output" == *"batch"* ]]
}

@test "T003140: openspec.sh archive nutzt den Batch-Modus (ein Node-Prozess je Pass)" {
  # cmd_archive muss batch verwenden statt der Einzel-Node-Schleife.
  run grep -n 'openspec-merge.mjs" batch\|apply_list\|mktemp' "$REPO/scripts/openspec.sh"
  [ "$status" -eq 0 ]
  [[ "$output" == *"batch"* ]]
  run grep -n '_merge_delta\|_check_delta' "$REPO/scripts/openspec.sh"
  [ "$status" -eq 0 ]
  [[ "$output" == *"_merge_delta"* ]]
}

# --- p5 / T003281: Stub-Delta fail-closed --------------------------------------

@test "T003281: Archiv-Gate lehnt Stub-Delta (Requirement: TODO) mit Exit != 0 ab" {
  local d="$TMP/delta-stub.md" s="$TMP/ssot.md"
  printf '# Spec\n' > "$s"
  cat > "$d" <<'EOF'
## ADDED Requirements

### Requirement: TODO

The system SHALL …

#### Scenario: TODO
EOF
  # Das fail-closed Gate liegt am Archiv-Pfad (openspec-merge.mjs STUBS), nicht
  # an der Collection-weiten openspec.sh validate — dort koennen aktive EPICs
  # legitime Planungs-Stubs tragen (T002650).
  run node "$REPO/scripts/openspec-merge.mjs" check "$d" "$s"
  [ "$status" -ne 0 ]
}

@test "T003281: Positiv-Anker — ausformuliertes Delta passiert das Archiv-Gate" {
  local d="$TMP/delta-ok.md" s="$TMP/ssot.md"
  printf '# Spec\n' > "$s"
  cat > "$d" <<'EOF'
## ADDED Requirements

### Requirement: Something Real

The system SHALL do the real thing.

#### Scenario: Real scenario

- **GIVEN** a condition
- **WHEN** an action
- **THEN** an outcome
EOF
  run node "$REPO/scripts/openspec-merge.mjs" check "$d" "$s"
  [ "$status" -eq 0 ]
}

@test "T003281: Stub-Erkennung in merge.mjs und openspec.sh verwenden dieselben Marker" {
  # openspec.sh _validate_delta_file und merge.mjs STUBS muessen dieselben
  # Stub-Marker kennen (keine zwei Wahrheiten beim Archiv-Gate).
  run grep -n "STUB_MARKER\|unedited skeleton stub" "$REPO/scripts/openspec-merge.mjs"
  [ "$status" -eq 0 ]
  run grep -n 'unedited skeleton stub\|Requirement: TODO' "$REPO/scripts/openspec.sh"
  [ "$status" -eq 0 ]
}

# --- p7 / T003287: Archiv ohne SKIP_MAIN_COMMIT_GUARD --------------------------

@test "T003287: plan-archive-steps dokumentiert den Archiv-Weg ohne SKIP_MAIN_COMMIT_GUARD" {
  local doc="$REPO/.claude/skills/references/plan-archive-steps.md"
  [ -f "$doc" ]
  run grep -n 'T003287\|kein SKIP_MAIN_COMMIT_GUARD' "$doc"
  [ "$status" -eq 0 ]
  [[ "$output" == *"kein SKIP_MAIN_COMMIT_GUARD"* ]]
}

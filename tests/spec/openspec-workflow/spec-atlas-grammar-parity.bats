#!/usr/bin/env bats
# tests/spec/openspec-workflow/spec-atlas-grammar-parity.bats
# SSOT: openspec/changes/spec-atlas/design.md D2 (T015012)
#
# Der Atlas-Parser DARF die Delta-Grammatik nicht lokal kopieren: er importiert
# parseDelta aus scripts/openspec-merge.mjs. Diese Suite sichert ab, dass
# (a) die Import-Bindung besteht (kein stiller Regex-Re-Import) und
# (b) beide Extraktionen ueber identische Fixtures fuer alle vier Ops
#     (ADDED/MODIFIED/REMOVED/RENAMED) zu denselben {op,name}-Mengen fuehren.

setup() {
  SANDBOX="$BATS_TEST_TMPDIR/sandbox"
  rm -rf "$SANDBOX"
  mkdir -p "$SANDBOX/scripts"
  cp "${BATS_TEST_DIRNAME}/../../../scripts/openspec-atlas-lib.mjs" "$SANDBOX/scripts/"
  cp "${BATS_TEST_DIRNAME}/../../../scripts/openspec-merge.mjs" "$SANDBOX/scripts/"
}

_make_delta() { # $1 = zieldatei
  cat >"$1" <<'EOF'
## ADDED Requirements

### Requirement: Neues Requirement A

The system SHALL …

#### Scenario: S

- **GIVEN** g
- **WHEN** w
- **THEN** t

## MODIFIED Requirements

### Requirement: Bestehendes Requirement B

The system SHALL …

## REMOVED Requirements

### Requirement: Entferntes Requirement C

## RENAMED Requirements

### Requirement: Alter Name D

**Renamed-to:** Neuer Name E
EOF
}

@test "D2-Bindung: lib importiert parseDelta aus openspec-merge.mjs" {
  grep -q "openspec-merge.mjs" "$SANDBOX/scripts/openspec-atlas-lib.mjs" \
    || { echo "atlas-lib kopiert die Grammatik statt zu importieren (D2 verletzt)" >&2; return 1; }
  grep -q "parseDelta" "$SANDBOX/scripts/openspec-atlas-lib.mjs"
}

@test "Paritaet: alle vier Ops liefern identische {op,name}-Mengen" {
  _make_delta "$SANDBOX/delta.md"
  # Pfade via ENV statt argv: unter `node -e` belegt argv[1] die erste User-Var,
  # was den CLI-Main-Guard von openspec-merge.mjs beim Import ausloesen wuerde.
  MERGE_PATH="$SANDBOX/scripts/openspec-merge.mjs" \
  LIB_PATH="$SANDBOX/scripts/openspec-atlas-lib.mjs" \
  DELTA_PATH="$SANDBOX/delta.md" \
  node --input-type=module -e '
    const { parseDelta } = await import(process.env.MERGE_PATH);
    const { extractDeltaEntries } = await import(process.env.LIB_PATH);
    const fs = await import("node:fs");
    const text = fs.readFileSync(process.env.DELTA_PATH, "utf8");
    const expected = parseDelta(text).map(({ op, name }) => ({ op, name }));
    const actual = extractDeltaEntries(text);
    if (JSON.stringify(expected) !== JSON.stringify(actual)) {
      console.error("MISMATCH\nexpected:", JSON.stringify(expected), "\nactual:", JSON.stringify(actual));
      process.exit(1);
    }
    // Positiv-Anker: die Fixture muss alle vier Ops wirklich enthalten.
    const ops = new Set(actual.map((e) => e.op));
    for (const op of ["ADDED", "MODIFIED", "REMOVED", "RENAMED"]) {
      if (!ops.has(op)) { console.error("Fixture fehlt Op: " + op); process.exit(1); }
    }
  '
}

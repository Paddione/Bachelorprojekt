#!/usr/bin/env bats
# mentolder-parity-inventory.bats — Guards für T901033 (Mentolder capability
# and data parity inventory, docs).
# Grünphase (p5-Tasks 2–4): Existenz + Pflichtsektionen + auflösbare
# Evidenz-Verweise der vier Inventur-Dokumente unter docs/parity/.

setup() {
  ROOT="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
  CORE="$ROOT/docs/parity/mentolder-flows-core.md"
  AUTH="$ROOT/docs/parity/mentolder-auth-isolation.md"
  REST="$ROOT/docs/parity/mentolder-flows-remaining.md"
  MATRIX="$ROOT/docs/parity/mentolder-parity-matrix.md"
}

# --- Existenz (Rotphase, p5-Task 1) ---

@test "inventory doc exists: mentolder-flows-core.md" {
  [ -f "$CORE" ]
}

@test "inventory doc exists: mentolder-auth-isolation.md" {
  [ -f "$AUTH" ]
}

@test "inventory doc exists: mentolder-flows-remaining.md" {
  [ -f "$REST" ]
}

@test "inventory doc exists: mentolder-parity-matrix.md" {
  [ -f "$MATRIX" ]
}

# --- Pflichtsektionen (p5-Task 2) ---

@test "core doc has all required sections" {
  grep -q '^## Buchungs-Pfad' "$CORE"
  grep -q '^## Verfügbarkeit und Claiming' "$CORE"
  grep -q '^## Rechnung- und Zahlungs-Pfad' "$CORE"
  grep -q '^## Test-Referenzen' "$CORE"
}

@test "auth doc has all required sections" {
  grep -q '^## Tenant-Identität' "$AUTH"
  grep -q '^## Auth und Mitgliedschaften' "$AUTH"
  grep -q '^## Scope: Jobs, Dateien, Cache, Nachrichten, Rechnungen' "$AUTH"
  grep -q '^## Isolations-Testlücken' "$AUTH"
}

@test "remaining-flows doc has all required sections" {
  grep -q '^## Öffentliche Flows' "$REST"
  grep -q '^## Admin-Flows' "$REST"
  grep -q '^## Owner-Flows' "$REST"
  grep -q '^## Portal-Flows' "$REST"
  grep -q '^## Integrationen und Jobs' "$REST"
  grep -q '^## Scope-Abgrenzung (SDLC/LLM/Coaching)' "$REST"
  grep -q '^## Test-Referenzen' "$REST"
}

@test "matrix doc has all required sections" {
  grep -q '^## Migrationen' "$MATRIX"
  grep -q '^## Asset-Konsumenten' "$MATRIX"
  grep -q '^## Klassifikation' "$MATRIX"
  grep -q '^## Mom-MVP-Vergleich' "$MATRIX"
  grep -q '^## Staging-Baseline-Verfahren' "$MATRIX"
}

# --- Evidenz-Verweise (p5-Task 3) ---
# Jede referenzierte Quelldatei (components|docs|scripts|tests + bekannte
# Extension) muss im Repo existieren.

assert_refs_resolve() {
  local doc="$1"
  local missing=0
  while IFS= read -r ref; do
    if [ ! -e "$ROOT/$ref" ]; then
      echo "dangling evidence ref in $doc: $ref"
      missing=1
    fi
  done < <(grep -oE '(components|docs|scripts|tests)/[][A-Za-z0-9_./-]+\.(ts|sql|md|mjs|json|py)' "$doc" | sort -u)
  [ "$missing" -eq 0 ]
}

@test "core doc evidence refs resolve" {
  assert_refs_resolve "$CORE"
}

@test "auth doc evidence refs resolve" {
  assert_refs_resolve "$AUTH"
}

@test "remaining-flows doc evidence refs resolve" {
  assert_refs_resolve "$REST"
}

@test "matrix doc evidence refs resolve" {
  assert_refs_resolve "$MATRIX"
}

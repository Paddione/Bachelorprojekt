#!/usr/bin/env bats

# tests/spec/dev-flow-plan/plan-intel-annotated-target-files.bats
# T008015-3 (Mishap-Rollup): plan-intel.sh parst keine annotierten
# target_files-Zellen (Praefixe/Braces werden Pfade). PRUEFMODUS:
# Output-Verifikation [T002448-M4] — scripts/plan-intel.sh AUSFUEHREN und das
# erzeugte intel.json pruefen (Sandbox-Slug, teardown raeumt auf — Muster:
# plan-intel-risks-dedupe.bats).
#
# Kern: _resolve_target_files() nimmt die target_files-Spalte nicht mehr
# woertlich. Nur Pfad-Tokens (ein Wort ohne Whitespace, mit '/', '.' oder '{')
# gelten als Pfade; Annotations-Praefixe ("Löschungen:") fallen raus.
# plan-lint.sh ALL_PARTIAL_TARGETS filtert identisch, sonst divergiert I1.
# Konvention: Manifest-Zellen sind pfadrein (Loesch-Status in File-Structure).

setup() {
  export REPO="$(cd "$(dirname "${BATS_TESTDIR%/}")" && pwd)"
  export SLUG="sandbox-slug"
  export CHANGE_DIR="$REPO/openspec/changes/sandbox-slug"
  mkdir -p "$CHANGE_DIR/tasks.d"
}

teardown() {
  rm -rf "$CHANGE_DIR"
}

@test "T008015-3: annotierte Zelle toleriert — Praefix 'Löschungen:' wird kein Pfad" {
  cat <<'MARKDOWN' > "$CHANGE_DIR/tasks.md"
# sandbox-slug — Implementation Plan

## File Structure
- scripts/keep.sh
- scripts/tests/run.bats

## Partials
| p1 | tasks.d/p1.md | impl | scripts/keep.sh, Löschungen: scripts/delete-me.sh | |
| p2 | tasks.d/p2.md | tests | scripts/tests/run.bats | p1 |

## Tasks
## Task 1
`scripts/keep.sh`
## Task 2
`scripts/tests/run.bats`
MARKDOWN

  run "$REPO/scripts/plan-intel.sh" "$SLUG"
  [ "$status" -eq 0 ]

  PATHS=$(jq -r '.impact_files[].path' "$CHANGE_DIR/intel.json" | sort)
  EXPECTED_PATHS=$(printf "scripts/keep.sh\nscripts/tests/run.bats" | sort)
  [ "$PATHS" = "$EXPECTED_PATHS" ]
}

@test "T008015-3: Brace-Zelle — Alternation bleibt literal (Konvention: Zellen pfadrein)" {
  cat <<'MARKDOWN' > "$CHANGE_DIR/tasks.md"
# sandbox-slug — Implementation Plan

## File Structure
- scripts/a.sh
- scripts/b.sh

## Partials
| p1 | tasks.d/p1.md | impl | scripts/{a,b}.sh | |
| p2 | tasks.d/p2.md | tests | scripts/tests/run.bats | p1 |

## Tasks
## Task 1
`scripts/a.sh`
## Task 2
`scripts/b.sh`
MARKDOWN

  run "$REPO/scripts/plan-intel.sh" "$SLUG"
  [ "$status" -eq 0 ]
  
  PATHS=$(jq -r '.impact_files[].path' "$CHANGE_DIR/intel.json" | sort)
  EXPECTED_PATHS=$(printf "b}.sh\nscripts/{a\nscripts/tests/run.bats" | sort)
  [ "$PATHS" = "$EXPECTED_PATHS" ]
}

@test "T008015-3: Backtick-quotierte Zellen — Backticks werden entfernt (echtes Manifest-Format)" {
  # Echte Manifests quotieren Pfade mit Backticks: `scripts/a.sh`. Der Filter
  # entfernt Backticks (tr -d '`') und plan-lint.sh strip sie ebenfalls
  # (s/`//g) — ohne Entfernung divergiert I1 (Regression beim Erstentwurf).
  cat <<'MARKDOWN' > "$CHANGE_DIR/tasks.md"
# sandbox-slug — Implementation Plan

## File Structure
- scripts/keep.sh
- scripts/tests/run.bats

## Partials
| p1 | tasks.d/p1.md | impl | `scripts/keep.sh`, `scripts/tests/run.bats` | |
| p2 | tasks.d/p2.md | tests | `scripts/tests/run.bats` | p1 |

## Tasks
## Task 1
`scripts/keep.sh`
## Task 2
`scripts/tests/run.bats`
MARKDOWN

  run "$REPO/scripts/plan-intel.sh" "$SLUG"
  [ "$status" -eq 0 ]

  PATHS=$(jq -r '.impact_files[].path' "$CHANGE_DIR/intel.json" | sort)
  EXPECTED_PATHS=$(printf "scripts/keep.sh\nscripts/tests/run.bats" | sort)
  [ "$PATHS" = "$EXPECTED_PATHS" ]
  # Negativ-Anker: kein Pfad darf Backticks enthalten.
  ! grep -q '`' <<<"$PATHS"
}

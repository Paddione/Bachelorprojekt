#!/usr/bin/env bats
# Prüfmodus: Source-Grep auf openspec/specs/software-factory.md.
# T002448-M4-Ausnahme: Der Prüfgegenstand ist eine Dokumentationskonvention, deren Ergebnis
# sich ausschließlich im Quelltext der SSOT-Spec manifestiert.
#
# Wächter gegen T005308: Die Archivierung von sf-scheduling-test-drift (PR #4440) ersetzte
# das Requirement "The Software Factory picks up staged task tickets" durch den MODIFIED-Delta
# und löschte dabei 6 Szenarien + Kern-Prosa (591 → 586 Szenarien). Dieser Guard friert die
# Vollständigkeit der Sektion ein — er ist rot, solange Szenarien oder Prosa-Anker fehlen.

setup() {
  SPEC="$BATS_TEST_DIRNAME/../../../openspec/specs/software-factory.md"
  [ -f "$SPEC" ] || skip "openspec/specs/software-factory.md not found"
}

@test "Requirement 'picks up staged task tickets' exists" {
  grep -q '^### Requirement: The Software Factory picks up staged task tickets$' "$SPEC"
}

@test "all 7 scenarios of the staged-task requirement are present" {
  for title in \
    "queue.sh surfaces a staged task ticket" \
    "queue.sh surfaces a staged ticket of a newly introduced type" \
    "Epics are never dispatched" \
    "slots.sh claims a slot for a staged task ticket" \
    "pipeline handles a chore branch" \
    "dispatcher-bridge extracts the slug from a chore branch" \
    "queue.sh never surfaces is_test_data fixtures"; do
    grep -qF "#### Scenario: $title" "$SPEC" \
      || { echo "missing scenario: $title" >&2; return 1; }
  done
}

@test "staged-task requirement keeps its core prose anchors" {
  # Positiv-Anker zuerst (T002356-M1): der Requirement-Header muss existieren,
  # sonst wäre die Negativ-Aussage vakuos.
  grep -q '^### Requirement: The Software Factory picks up staged task tickets$' "$SPEC"
  # Die Kern-Prosa: Exclusion statt Enumeration, kein lastenheft_locked für staged,
  # chore-Branches first-class, is_test_data-Ausschluss (T002830).
  grep -qF "type <> 'project'" "$SPEC"
  grep -qF 'Staged tickets SHALL NOT require' "$SPEC"
  grep -qF 'chore/<slug>` work' "$SPEC"
  grep -qF 'is_test_data = true' "$SPEC"
}

#!/usr/bin/env bats
# tests/spec/openspec-workflow/spec-atlas-generator.bats
# SSOT: openspec/changes/spec-atlas/specs/openspec-workflow.md (T015012)
#
# Pruefmodus (T002448-M4): Output-Verifikation in hermetischer Git-Sandbox.
# openspec-atlas.sh ankert REPO an `git rev-parse --show-toplevel` vom cwd
# (Muster T001997) — die Sandbox MUSS ihr eigenes git-Repo sein, sonst schriebe
# der Generator ins echte docs/ des Worktrees.
#
# Abgedeckte Delta-Szenarien:
#   - Archiv ohne .ticket liefert keine Provenance, bricht aber nicht (fail-open)
#   - Aktives Delta erzeugt eine In-Flight-Warnung
#   - Neu erzeugte Eintraege sind deterministisch (kein Wall-Clock-Timestamp)

setup() {
  SANDBOX="$BATS_TEST_TMPDIR/sandbox"
  rm -rf "$SANDBOX"
  git init -q "$SANDBOX"
  git -C "$SANDBOX" config user.email "bats@test.local"
  git -C "$SANDBOX" config user.name "Bats Tester"

  mkdir -p "$SANDBOX/scripts" "$SANDBOX/docs"

  # ECHTE Skripte kopieren (kein Symlink — Test soll das reale Verhalten pruefen).
  # Die lib importiert ./openspec-merge.mjs — daher muss auch das mit.
  cp "${BATS_TEST_DIRNAME}/../../../scripts/openspec-atlas.sh" "$SANDBOX/scripts/"
  cp "${BATS_TEST_DIRNAME}/../../../scripts/openspec-atlas-lib.mjs" "$SANDBOX/scripts/"
  cp "${BATS_TEST_DIRNAME}/../../../scripts/openspec-merge.mjs" "$SANDBOX/scripts/"

  # Positiv-Anker: Sandbox-git und Runner stehen.
  git -C "$SANDBOX" rev-parse --show-toplevel >/dev/null || return 1
}

_make_spec() { # $1 = slug, $2 = req-name, $3 = scenario-count
  local slug="$1" req="$2" n="${3:-1}" i
  mkdir -p "$SANDBOX/openspec/specs"
  {
    echo "# $slug"
    echo
    echo "## Purpose"
    echo
    echo "Test-Zweck fuer $slug."
    echo
    echo "## Requirements"
    echo
    echo "### Requirement: $req"
    for ((i = 1; i <= n; i++)); do
      echo "#### Scenario: S$i"
      echo "- **GIVEN** g"
      echo "- **WHEN** w"
      echo "- **THEN** t"
      echo
    done
  } >"$SANDBOX/openspec/specs/$slug.md"
}

_make_archive() { # $1 = dirname, $2 = ticket ("" = keine), $3 = slug, $4 = op, $5 = req
  local dir="$SANDBOX/openspec/changes/archive/$1"
  mkdir -p "$dir/specs"
  [ -n "$2" ] && echo "$2" >"$dir/.ticket"
  cat >"$dir/specs/$3.md" <<EOF
## $4 Requirements

### Requirement: $5

The system SHALL …

#### Scenario: X

- **GIVEN** g
- **WHEN** w
- **THEN** t
EOF
}

_run_atlas() {
  run bash -c "cd '$SANDBOX' && OPENSPEC_ROOT='$SANDBOX/openspec' bash scripts/openspec-atlas.sh --out '$SANDBOX/docs/spec-atlas.md'"
}

@test "Provenance: letztes Archiv gewinnt (Datum praefix sortiert)" {
  _make_spec software-factory "Queue-Poll und Slot-Claim" 2
  _make_archive "2026-08-01-old-x" "T000001" software-factory "ADDED" "Queue-Poll und Slot-Claim"
  _make_archive "2026-08-20-new-x" "T000123" software-factory "MODIFIED" "Queue-Poll und Slot-Claim"

  _run_atlas
  [ "$status" -eq 0 ] || { echo "atlas exit=$status: $output" >&2; return 1; }
  grep -q "Queue-Poll und Slot-Claim | T000123 | 2026-08-20 | MODIFIED" "$SANDBOX/docs/spec-atlas.md" \
    || { echo "Letzter Touch fehlt/falsch:" >&2; cat "$SANDBOX/docs/spec-atlas.md" >&2; return 1; }
  ! grep -q "T000001" "$SANDBOX/docs/spec-atlas.md" || { echo "alter Touch T000001 darf nicht erscheinen" >&2; return 1; }
}

@test "Fail-open: Archiv ohne .ticket liefert keine Provenance, Exit 0" {
  _make_spec ticket-system "Lesepfade unterscheiden kein-Treffer von falscher-Frage" 1
  _make_archive "2026-07-01-no-ticket" "" ticket-system "ADDED" "Lesepfade unterscheiden kein-Treffer von falscher-Frage"

  _run_atlas
  [ "$status" -eq 0 ] || { echo "fail-open verletzt, exit=$status: $output" >&2; return 1; }
  grep -q "### ticket-system" "$SANDBOX/docs/spec-atlas.md"
  ! grep -q "Lesepfade.* | T" "$SANDBOX/docs/spec-atlas.md"
}

@test "In-flight: aktives Delta erscheint mit Ticket und active" {
  _make_spec software-factory "Dispatcher-Tick-Execution" 1
  local live="$SANDBOX/openspec/changes/live-one"
  mkdir -p "$live/specs"
  echo "T0199999" >"$live/.ticket"
  cat >"$live/specs/software-factory.md" <<'EOF'
## MODIFIED Requirements

### Requirement: Dispatcher-Tick-Execution

The system SHALL …

#### Scenario: X

- **GIVEN** g
- **WHEN** w
- **THEN** t
EOF

  _run_atlas
  [ "$status" -eq 0 ] || { echo "exit=$status: $output" >&2; return 1; }
  grep -q "Dispatcher-Tick-Execution | T0199999 | active | MODIFIED" "$SANDBOX/docs/spec-atlas.md" \
    || { echo "In-flight-Zeile fehlt:" >&2; cat "$SANDBOX/docs/spec-atlas.md" >&2; return 1; }
}

@test "Determinismus: zwei Laeufe bytegleich, kein Wall-Clock-Timestamp" {
  _make_spec ci-cd "Freshness-Check sichert Konsistenz der generierten Artefakte" 2
  _make_archive "2026-08-10-some-fix" "T004242" ci-cd "MODIFIED" "Freshness-Check sichert Konsistenz der generierten Artefakte"

  _run_atlas
  [ "$status" -eq 0 ]
  cp "$SANDBOX/docs/spec-atlas.md" "$BATS_TEST_TMPDIR/run1.md"
  sleep 1
  _run_atlas
  [ "$status" -eq 0 ]
  cmp "$BATS_TEST_TMPDIR/run1.md" "$SANDBOX/docs/spec-atlas.md" \
    || { echo "Ausgabe ist nicht deterministisch" >&2; return 1; }
  ! grep -Eq "[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:" "$SANDBOX/docs/spec-atlas.md" \
    || { echo "Wall-Clock-Timestamp im Artefakt" >&2; return 1; }
}

@test "Reverse-Mapping: component-map-Pfade erscheinen beim Slug" {
  _make_spec admin-cockpit "Kanonischer Admin-Einstieg" 1
  mkdir -p "$SANDBOX/openspec"
  cat >"$SANDBOX/openspec/component-map.yaml" <<'EOF'
mappings:
  - prefix: website/src/pages/admin
    spec: admin-cockpit
  - prefix: website/src/components/CockpitApp
    spec: admin-cockpit
EOF

  _run_atlas
  [ "$status" -eq 0 ]
  grep -q "website/src/pages/admin" "$SANDBOX/docs/spec-atlas.md"
  grep -q "website/src/components/CockpitApp" "$SANDBOX/docs/spec-atlas.md"
}

@test "Ungrouped: Spec ohne Gruppenzuordnung landet unter Ungrouped" {
  _make_spec lonely-spec "Ein einsames Requirement" 1

  _run_atlas
  [ "$status" -eq 0 ]
  awk '/^## Ungrouped/{f=1} f&&/^### lonely-spec/{found=1} END{exit !found}' "$SANDBOX/docs/spec-atlas.md" \
    || { echo "lonely-spec nicht unter Ungrouped:" >&2; cat "$SANDBOX/docs/spec-atlas.md" >&2; return 1; }
}

#!/usr/bin/env bats
# tests/spec/openspec-workflow/archive-regen-spec-atlas.bats
# SSOT: openspec/specs/openspec-workflow.md
#   "Archive regenerates and stages every openspec-derived freshness artifact" (T900341)
#
# Defekt: cmd_archive regeneriert und stagt nach dem Move nur
# components/website/src/data/openspec-status.json. docs/spec-atlas.md haengt
# ebenfalls an openspec/specs und changes/archive, bleibt aber stale. Belegt an
# PR #5835: Freshness-Gate rot ("docs/spec-atlas.md regenerated but not staged").
#
# PRUEFMODUS: Output-Verifikation (T002448-M4). `scripts/openspec.sh archive`
# laeuft in einem git-init-Sandbox-Repo mit verlinkten Skripten (Mechanik wie
# archive-status-offline-staging.bats); geprueft werden Datei und Index danach.
#
# Run: tests/unit/lib/bats-core/bin/bats tests/spec/openspec-workflow/archive-regen-spec-atlas.bats

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  SANDBOX="${BATS_TEST_TMPDIR}/sandbox"
  mkdir -p "$SANDBOX"
  git init -q "$SANDBOX"
  git -C "$SANDBOX" config user.email t@example.invalid
  git -C "$SANDBOX" config user.name t

  export OPENSPEC_ROOT="${SANDBOX}/openspec"
  mkdir -p "${OPENSPEC_ROOT}/specs" "${OPENSPEC_ROOT}/changes/demo/specs" "${OPENSPEC_ROOT}/changes/archive"
  printf '# demo\n\n## Purpose\n\nDemo.\n\n## Requirements\n' > "${OPENSPEC_ROOT}/specs/demo.md"
  cat > "${OPENSPEC_ROOT}/changes/demo/specs/demo.md" <<'DELTA'
## ADDED Requirements

### Requirement: Atlas demo requirement

The system SHALL do a demo thing.

#### Scenario: Demo scenario

- **GIVEN** a demo
- **WHEN** it runs
- **THEN** it works
DELTA
  echo "T990002" > "${OPENSPEC_ROOT}/changes/demo/.ticket"

  # .mjs-Einstiegspunkte KOPIEREN, nicht verlinken: openspec-merge.mjs (und
  # andere) laufen nur, wenn import.meta.url == argv[1] — ueber einen Symlink
  # ist das falsch, das Skript endet dann still mit Exit 0 ohne zu mergen.
  mkdir -p "${SANDBOX}/scripts"
  for f in "${REPO_ROOT}"/scripts/*; do
    case "$f" in
      *.mjs) cp "$f" "${SANDBOX}/scripts/" ;;
      *)     ln -s "$f" "${SANDBOX}/scripts/$(basename "$f")" ;;
    esac
  done
  mkdir -p "${SANDBOX}/components/website/src/data" "${SANDBOX}/docs"

  # Ausgangszustand committen, inklusive eines Atlas vom Stand VOR dem Archiv.
  ( cd "$SANDBOX" && bash scripts/openspec-atlas.sh >/dev/null )
  git -C "$SANDBOX" add -A >/dev/null
  git -C "$SANDBOX" commit -qm base
}

_archive() {
  run bash -c "cd '$SANDBOX' && TICKET_OFFLINE=1 bash scripts/openspec.sh archive demo"
}

@test "T900341: nach archive entspricht der Atlas einem frisch erzeugten" {
  _archive
  [ "$status" -eq 0 ]
  # Positiv-Anker: der Archiv-Lauf hat ueberhaupt gemergt.
  grep -qF 'Atlas demo requirement' "${OPENSPEC_ROOT}/specs/demo.md"
  # Der Atlas listet offene Deltas schon vor dem Archiv (In-Flight) — ein
  # Substring-Test waere deshalb vakuos. Geprueft wird Aktualitaet: Datei ==
  # frische Generierung aus dem Zustand nach dem Archiv.
  local fresh="${BATS_TEST_TMPDIR}/fresh-atlas.md"
  ( cd "$SANDBOX" && bash scripts/openspec-atlas.sh --out "$fresh" >/dev/null )
  cmp -s "$fresh" "${SANDBOX}/docs/spec-atlas.md"
}

@test "T900341: archive stagt den regenerierten Atlas" {
  _archive
  [ "$status" -eq 0 ]
  git -C "$SANDBOX" diff --cached --name-only | grep -qxF 'docs/spec-atlas.md'
}

@test "T900341: Status-Map wird weiterhin gestagt (Regression T003136)" {
  _archive
  [ "$status" -eq 0 ]
  git -C "$SANDBOX" diff --cached --name-only | grep -qxF 'components/website/src/data/openspec-status.json'
}

#!/usr/bin/env bats
# T016597 — der Archiv-Commit des Finalizers darf nur Pfade enthalten, die zum
# archivierten Change gehoeren.
#
# WARUM: devflow-post-merge-finalize.sh stagte in Schritt 8 mit
#   git add openspec/changes/ openspec/changes/archive/ openspec/specs/ ...
# also ueber den GESAMTEN Change-Baum. `git add <verzeichnis>` nimmt auch
# untracked Dateien mit — und damit die unfertige Arbeit jeder parallel
# laufenden Session.
#
# Belegt (2026-08-28, Abschluss von T016592, Archiv-PR #5288): das Staged-Set
# enthielt neben dem eigentlichen Archiv-Move
#   - openspec/changes/add-penpot-service/**  (5 Dateien, untracked, fremde Session)
#   - ~4200 Dateien des archive-Baums als M (inhaltlich leer, CRLF-Drift)
# Waere das durchgelaufen, haette der Archiv-PR fremde, unfertige Arbeit nach
# main getragen. Der Commit musste von Hand neu aufgebaut werden.
#
# Dies ist KEIN Windows-Problem: es trifft jeden, der parallel zu einer anderen
# Session arbeitet.
#
# PRUEFMODUS: Laufzeit gegen ein echtes Fixture-Repo. Der Guard wird mit einem
# realen Index aufgerufen, nicht im Quelltext gesucht.

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  LIB="$REPO_ROOT/scripts/lib/archive-staged-scope.sh"

  FIXTURE="$BATS_TEST_TMPDIR/repo"
  mkdir -p "$FIXTURE"
  cd "$FIXTURE"
  git init -q .
  git config user.email t@example.com
  git config user.name Test

  mkdir -p openspec/changes/archive/2026-01-01-my-slug openspec/specs components/website/src/data
  echo x > openspec/changes/archive/2026-01-01-my-slug/tasks.md
  echo y > openspec/specs/some-spec.md
  echo z > components/website/src/data/openspec-status.json
  git add -A && git commit -qm init
}

@test "T016597: die Guard-Bibliothek existiert und ist sourcebar" {
  [ -f "$LIB" ]
  run bash -n "$LIB"
  [ "$status" -eq 0 ]
}

@test "T016597: ein Staged-Set nur aus Archiv-Pfaden wird akzeptiert (Positiv-Anker)" {
  echo neu > openspec/changes/archive/2026-01-01-my-slug/proposal.md
  echo geaendert > openspec/specs/some-spec.md
  git add openspec/changes/archive/2026-01-01-my-slug openspec/specs/some-spec.md

  run bash -c ". '$LIB' && archive_assert_staged_scope my-slug"
  [ "$status" -eq 0 ]
}

@test "T016597: eine fremde untracked Datei im Staged-Set bricht fail-closed ab" {
  mkdir -p openspec/changes/fremder-change
  echo fremd > openspec/changes/fremder-change/proposal.md
  echo neu > openspec/changes/archive/2026-01-01-my-slug/proposal.md
  # Genau das tat der alte Aufruf: git add ueber das ganze Verzeichnis.
  git add openspec/changes/

  run bash -c ". '$LIB' && archive_assert_staged_scope my-slug"
  [ "$status" -ne 0 ]
  [[ "$output" == *"fremder-change"* ]]
}

@test "T016597: ein fremder Change ausserhalb des Index stoert nicht" {
  # Abgrenzung: der Guard misst den INDEX, nicht den Arbeitsbaum. Unfertige
  # Arbeit einer anderen Session darf danebenliegen, solange sie nicht
  # gestaged ist.
  mkdir -p openspec/changes/fremder-change
  echo fremd > openspec/changes/fremder-change/proposal.md
  echo neu > openspec/changes/archive/2026-01-01-my-slug/proposal.md
  git add openspec/changes/archive/2026-01-01-my-slug

  run bash -c ". '$LIB' && archive_assert_staged_scope my-slug"
  [ "$status" -eq 0 ]
}

@test "T016597: der Finalizer stagt den Change-Baum nicht mehr pauschal" {
  # Quelltext-Anker gegen Rueckfall auf das breite git add.
  # Kommentarzeilen ausgenommen — der Fix erklaert den alten Aufruf im Text.
  run bash -c "grep -nF 'git add openspec/changes/' '$REPO_ROOT/scripts/devflow-post-merge-finalize.sh' \
    | grep -vE '^[0-9]+:[[:space:]]*#' || true"
  [ -z "$output" ] || {
    echo "pauschales 'git add openspec/changes/' im Finalizer:"
    echo "$output"
    return 1
  }
}

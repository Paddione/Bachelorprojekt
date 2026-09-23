#!/usr/bin/env bats
# tests/spec/agent-skills/archive-stage-new-ssot.bats
# SSOT: openspec/specs/agent-skills.md
#   "The archive commit carries every SSOT spec its deltas target" (T900339)
#
# Defekt: archive_stage_commit (scripts/lib/archive-staged-scope.sh) stagt
# openspec/specs nur mit `git add -u`. Ein SSOT-Spec, den `openspec.sh archive
# --create-new` neu anlegt, ist untracked und fehlt im Archiv-Commit. Belegt an
# #5732 (Epic T900228): der Change wanderte ins Archiv, openspec/specs/
# application-pipeline.md kam nie auf main.
#
# PRUEFMODUS: Laufzeit gegen ein echtes Fixture-Repo (wie
# tests/spec/dev-flow-plan/archive-staged-scope.bats). Geprueft wird der Index
# nach dem Aufruf, nicht der Quelltext.
#
# Run: tests/unit/lib/bats-core/bin/bats tests/spec/agent-skills/archive-stage-new-ssot.bats

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  LIB="$REPO_ROOT/scripts/lib/archive-staged-scope.sh"
  FIXTURE="$BATS_TEST_TMPDIR/repo"
  mkdir -p "$FIXTURE"
  cd "$FIXTURE"
  git init -q .
  git config user.email t@example.com
  git config user.name Test

  mkdir -p openspec/specs openspec/changes/my-slug/specs \
    components/website/src/data components/website/src/lib \
    components/website/public/learning-assets docs
  echo alt > openspec/specs/bestand.md
  echo s > components/website/src/data/openspec-status.json
  echo l > components/website/src/lib/keep.ts
  echo a > components/website/public/learning-assets/keep.txt
  echo d > docs/keep.md
  echo delta-neu > openspec/changes/my-slug/specs/neu.md
  echo delta-bestand > openspec/changes/my-slug/specs/bestand.md
  git add -A && git commit -qm init

  # Zustand nach `openspec.sh archive my-slug --create-new`: Change verschoben,
  # bestehender SSOT geaendert, neuer SSOT untracked angelegt.
  git mv openspec/changes/my-slug openspec/changes/archive/2026-01-01-my-slug 2>/dev/null \
    || { mkdir -p openspec/changes/archive && git mv openspec/changes/my-slug openspec/changes/archive/2026-01-01-my-slug; }
  git reset -q
  echo "alt + merge" > openspec/specs/bestand.md
  echo "neu angelegt" > openspec/specs/neu.md
}

_staged() { git diff --cached --name-only; }

@test "T900339: neuer SSOT-Spec aus --create-new landet im Index" {
  run bash -c "source '$LIB' && archive_stage_commit my-slug"
  [ "$status" -eq 0 ]
  _staged | grep -qxF 'openspec/specs/neu.md'
}

@test "T900339: geaenderter Bestands-Spec wird weiterhin gestagt" {
  run bash -c "source '$LIB' && archive_stage_commit my-slug"
  [ "$status" -eq 0 ]
  _staged | grep -qxF 'openspec/specs/bestand.md'
  _staged | grep -qxF 'openspec/changes/archive/2026-01-01-my-slug/specs/neu.md'
}

@test "T900339: fremder untracked Spec ohne Delta bleibt draussen" {
  echo fremd > openspec/specs/fremd.md
  run bash -c "source '$LIB' && archive_stage_commit my-slug"
  [ "$status" -eq 0 ]
  # Positiv-Anker (T002356-M1): der eigene neue Spec IST im Index.
  _staged | grep -qxF 'openspec/specs/neu.md'
  local fremd; fremd="$(_staged | grep -xF 'openspec/specs/fremd.md' || true)"
  [ -z "$fremd" ]
}

@test "T900339: fehlender Ziel-Spec bricht fail-closed ab" {
  rm openspec/specs/neu.md
  run bash -c "source '$LIB' && archive_stage_commit my-slug"
  [ "$status" -ne 0 ]
  [[ "$output" == *"openspec/specs/neu.md"* ]]
}

@test "T900339: --no-merge ueberspringt Ziel-Staging und Pruefung" {
  rm openspec/specs/neu.md
  run bash -c "source '$LIB' && archive_stage_commit my-slug --no-merge"
  [ "$status" -eq 0 ]
  _staged | grep -qxF 'openspec/changes/archive/2026-01-01-my-slug/specs/neu.md'
}

@test "T900339: Finalizer reicht die Archiv-Flags an archive_stage_commit durch" {
  # Konventions-Guard (dokumentierte Source-Grep-Ausnahme): ohne durchgereichte
  # Flags wuerde jede --no-merge-Archivierung an der Pruefung aus D2 scheitern.
  # Jeder Aufruf zaehlt: Schritt 8 staget zweimal (Commit und Freshness-Amend).
  local f="$REPO_ROOT/scripts/devflow-post-merge-finalize.sh" calls missing
  calls="$(grep -E '^[[:space:]]*archive_stage_commit ' "$f" || true)"
  [ -n "$calls" ]
  missing="$(printf '%s\n' "$calls" | grep -v 'ARCHIVE_ARGS' || true)"
  [ -z "$missing" ]
}

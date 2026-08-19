#!/usr/bin/env bats
# tests/spec/agent-skills/finalize-worktree-branch-validation.bats
# SSOT: openspec/specs/agent-skills.md (Delta: finalize-worktree-branch-validation, T012240)
#
# PRÜFMODUS: Output-Verifikation (T002448-M4). Anders als
# tests/spec/agent-skills/post-merge-finalize-guards.bats (dokumentierte
# Source-Grep-Ausnahme) wird hier die Worktree-Auflösungssequenz aus
# scripts/devflow-post-merge-finalize.sh per awk-Bereichsmuster extrahiert und
# gegen ein echtes Sandbox-Git-Repo AUSGEFÜHRT. Geprüft wird das Resultat —
# welchen Worktree die Sequenz liefert und welchen Branch der hält —, nicht ob
# ein Muster im Quelltext steht.
#
# Extraktion per Bereichsmuster statt Zeilennummern (T003104): eine Einfügung
# oberhalb der Sektion darf den Test nicht rot färben.
#
# Defekt (T012240): Der Slug-Kandidat .worktrees/<slug> hat Vorrang vor der
# branch-exakten Auflösung und wird nicht gegen den Ziel-Branch validiert. Hält
# er einen fremden Branch, führt Schritt 10 `git worktree remove --force` darauf
# aus und verwirft uncommittete Arbeit.

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  FINALIZE="$REPO_ROOT/scripts/devflow-post-merge-finalize.sh"
  [ -f "$FINALIZE" ]

  SANDBOX="$BATS_TEST_TMPDIR/repo"
  mkdir -p "$SANDBOX"
  export GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@example.invalid
  export GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@example.invalid
  git -C "$SANDBOX" init -q .
  git -C "$SANDBOX" commit -q --allow-empty -m init
}

# Die Auflösungssektion aus dem Skript herausschneiden und ausführen.
# Bereich: von der WORKTREE-Initialisierung bis zur Fallback-Zeile.
# Gibt den aufgelösten Pfad auf stdout aus.
resolve_worktree() {
  local repo_dir="$1" branch="$2" slug="$3" section
  section="$(awk '
    /^WORKTREE=""$/        { inside = 1 }
    inside                 { print }
    inside && /^\[\[ -z "\$WORKTREE" \]\] && WORKTREE=/ { exit }
  ' "$FINALIZE")"

  [ -n "$section" ] || { echo "FATAL: Auflösungssektion nicht gefunden" >&2; return 2; }

  REPO_DIR="$repo_dir" BRANCH="$branch" SLUG="$slug" bash -c "
    set -uo pipefail
    $section
    printf '%s\n' \"\$WORKTREE\"
  "
}

# Positiv-Anker (T002356-M1): Der Normalfall muss auflösen, sonst wäre die
# Negativ-Aussage in Test 2 vakuos — eine Sequenz, die gar nichts findet,
# würde "kein fremder Branch" trivial erfüllen.
@test "resolve: Worktree unter abweichendem Pfad wird am Ziel-Branch gefunden" {
  local slug="mishap-rollup-2026-08-17-T009369"
  local branch="chore/$slug"
  git -C "$SANDBOX" worktree add -q -b "$branch" "$SANDBOX/.worktrees/${slug}-reuse"

  run resolve_worktree "$SANDBOX" "$branch" "$slug"
  [ "$status" -eq 0 ]
  [ "$output" = "$SANDBOX/.worktrees/${slug}-reuse" ]
  [ -d "$output" ]
  [ "$(git -C "$output" branch --show-current)" = "$branch" ]
}

@test "resolve: Slug-Pfad mit fremdem Branch wird NICHT gewaehlt" {
  local slug="mishap-rollup-2026-08-17-T009369"
  local branch="chore/$slug"
  git -C "$SANDBOX" worktree add -q -b "$branch" "$SANDBOX/.worktrees/${slug}-reuse"
  # Fremder Worktree belegt genau den Slug-Pfad, haelt aber einen anderen Branch
  git -C "$SANDBOX" worktree add -q -b "feature/fremd" "$SANDBOX/.worktrees/${slug}"

  run resolve_worktree "$SANDBOX" "$branch" "$slug"
  [ "$status" -eq 0 ]
  # Der aufgeloeste Worktree muss den ZIEL-Branch halten — sonst wuerde
  # Schritt 10 `worktree remove --force` auf fremder Arbeit ausfuehren.
  [ -d "$output" ]
  [ "$(git -C "$output" branch --show-current)" = "$branch" ]
  [ "$output" = "$SANDBOX/.worktrees/${slug}-reuse" ]
}

@test "resolve: kein Worktree auf dem Branch — Fallback bleibt der Slug-Pfad" {
  local slug="verwaister-slug-T000001"
  run resolve_worktree "$SANDBOX" "chore/$slug" "$slug"
  [ "$status" -eq 0 ]
  [ "$output" = "$SANDBOX/.worktrees/$slug" ]
  # Nicht vorhanden -> Schritt 10 meldet "bereits entfernt" und tut nichts.
  [ ! -d "$output" ]
}

#!/usr/bin/env bash
# scripts/lib/worktree-set.sh
#
# Die Worktree-Menge des Repos — EINE Ableitung, mehrere Konsumenten.
#
# Warum als Lib: die Schleife über `git worktree list --porcelain` existierte im
# Repo dreifach (agent-lock-activity.sh, git-worktree-health.sh, und implizit in
# preflight-pr-scope.sh als String-Match auf `.worktrees/`). Jede Kopie konnte
# eigenständig driften, obwohl alle drei dieselbe Frage stellen. Die Iteration
# über die git-Registrierung statt über den Filesystem-Glob ist zugesichert in
# openspec/specs/divergence-guard.md ("git worktree list --porcelain (the
# registration), not the filesystem glob") — genau deshalb gehört sie an eine
# Stelle.
#
# Source-only library (never executed directly).

# Alle registrierten Worktree-Pfade, einer pro Zeile. Der Haupt-Checkout ist der
# erste Eintrag der porcelain-Ausgabe und damit enthalten.
#
# Usage: worktree_set_paths [<repo_root>]
worktree_set_paths() {
    local repo_root="${1:-.}"
    command -v git >/dev/null 2>&1 || return 0
    git -C "$repo_root" worktree list --porcelain 2>/dev/null \
        | sed -n 's/^worktree //p'
}

# Worktrees als TSV: <pfad>\t<branch>\t<head>
#
# branch ist der Kurzname (`refs/heads/foo` → `foo`); ein detached HEAD liefert
# das Literal `(detached)`, ein leerer Worktree (`git worktree add --no-checkout`)
# ein leeres HEAD-Feld. Beide Fälle bleiben Zeilen — ein Worktree verschwindet
# nie aus der Menge, nur weil sein Zustand ungewöhnlich ist.
#
# Usage: worktree_set_rows [<repo_root>]
worktree_set_rows() {
    local repo_root="${1:-.}"
    command -v git >/dev/null 2>&1 || return 0

    local path="" head="" branch="" line
    while IFS= read -r line || [ -n "$line" ]; do
        case "$line" in
            worktree\ *) path="${line#worktree }"; head=""; branch="" ;;
            HEAD\ *)     head="${line#HEAD }" ;;
            branch\ *)   branch="${line#branch }"; branch="${branch#refs/heads/}" ;;
            detached)    branch="(detached)" ;;
            "")
                [ -n "$path" ] && printf '%s\t%s\t%s\n' "$path" "$branch" "$head"
                path=""; head=""; branch=""
                ;;
        esac
    done < <(git -C "$repo_root" worktree list --porcelain 2>/dev/null)

    # Letzter Block ohne abschließende Leerzeile (defensiv — git terminiert
    # jeden Block, aber ein fehlender Terminator dürfte keinen Worktree
    # verschlucken).
    [ -n "$path" ] && printf '%s\t%s\t%s\n' "$path" "$branch" "$head"
    return 0
}

#!/usr/bin/env bash
# scripts/lib/worktree-remove.sh
#
# Entfernt einen registrierten Worktree inklusive Lock-Befreiung.
#
# Warum als Lib: worktree-create.sh sperrt seit T900046 jeden Worktree
# (Lock-Grund "managed agent worktree"), weshalb `git worktree remove --force`
# an gesperrten Worktrees mit Exit 128 scheitert. Die noetige Entsperrung VOR
# dem Remove wiederholte sich in vier Callern (devflow-post-merge-finalize.sh,
# pr-refresh.sh, weekly-dep-schema-audit.sh, factory/cleanup.sh) — gleiche
# Semantik an einer Stelle statt vier drifteneder Kopien (T900340).
#
# Source-only library (never executed directly). Bewusst ohne `set -e`: Caller
# entscheiden anhand des Exit-Codes selbst (best-effort vs. fail-closed).

# Entfernt einen registrierten Worktree: entriegelt, entfernt mit --force und
# gibt den Exit-Status des Remove zurueck. Nicht registrierte Pfade werden
# abgelehnt (return 1), statt physisch geloescht — `git worktree list
# --porcelain` ist die Registrierung (divergence-guard).
#
# Usage: worktree_remove_managed <repo> <path>
#   <repo>  Haupt-Repo (relativ zum Aufrufer ok)
#   <path>  Worktree-Pfad — relativ wird gegen <repo> kanonisiert
worktree_remove_managed() {
    local repo path abs
    [[ $# -lt 2 || -z "${1:-}" || -z "${2:-}" ]] && {
        echo "worktree_remove_managed: <repo> und <path> sind Pflicht" >&2
        return 2
    }
    repo="$1"; path="$2"
    # porcelain liefert immer absolute Pfade — relative Argumente angleichen.
    if [[ "$path" != /* ]]; then
        abs="$(cd "$repo" 2>/dev/null && pwd)/$path"
    else
        abs="$path"
    fi
    git -C "$repo" worktree list --porcelain | grep -qxF "worktree $abs" || {
        echo "worktree_remove_managed: $path ist kein registrierter Worktree von $repo" >&2
        return 1
    }
    git -C "$repo" worktree unlock "$abs" 2>/dev/null || true
    git -C "$repo" worktree remove --force "$abs"
}

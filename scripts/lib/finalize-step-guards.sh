#!/usr/bin/env bash
# scripts/lib/finalize-step-guards.sh — fail-closed Guards fuer Schritt 8/10. [T900096]
#
# WARUM: Schritt 8 verwarf fremde uncommittete Aenderungen (`git checkout -- .` +
# `git clean -fd`), Schritt 10 loeschte den lokalen Branch ohne Merge-Pruefung
# (T900078-Fall: PR auf Branch-A, plan_ref nannte Branch-B — Branch-B wurde mit
# ungemergten Commits geloescht). Beide Guards behalten bzw. brechen ab, statt
# Daten zu vernichten. `archive_stage_commit`/`archive_assert_staged_scope`
# bleibt zweites Netz fuer das Staged-Set.
# Muster nach scripts/lib/archive-staged-scope.sh: Repo als Parameter, intern
# `git -C "$repo" ...` (cwd-Regel T006367), kein `cd`, `set -u`-kompatibel.
#
# Nutzung:
#   source "$_FINALIZE_HERE/lib/finalize-step-guards.sh"
#   finalize_assert_clean_tree "$ARCHIVE_DIR"      # FATAL + exit 1 bei Dirty-Tree
#   finalize_branch_fully_merged "$REPO_DIR" "$BR" # rc 0 = voll in origin/main

# Bricht fail-closed ab, wenn der Arbeitsbaum uncommittete Aenderungen traegt.
# `status --porcelain` fasst getrackt-modifizierte UND untracked Pfade.
finalize_assert_clean_tree() {
  local repo="${1:?repo fehlt}"
  local dirty
  dirty="$(git -C "$repo" status --porcelain 2>/dev/null || true)"
  if [[ -n "$dirty" ]]; then
    echo "FATAL: Schritt 8 — uncommittete Aenderungen im Arbeitsbaum, Archiv abgebrochen (T900096):" >&2
    printf '%s\n' "$dirty" >&2
    exit 1
  fi
}

# rc 0, wenn $2 voll in origin/main enthalten ist (merge-base --is-ancestor nach
# best-effort fetch); sonst rc 1 + `log --oneline origin/main..branch` als
# Meldungsmaterial fuer die mark_warn-Zeile des Aufrufers. KEIN exit hier —
# der Aufrufer entscheidet (Skip statt Delete, kein Abbruch).
finalize_branch_fully_merged() {
  local repo="${1:?repo fehlt}" branch="${2:?branch fehlt}"
  git -C "$repo" fetch origin main --quiet 2>/dev/null || true
  if git -C "$repo" merge-base --is-ancestor "$branch" origin/main 2>/dev/null; then
    return 0
  fi
  git -C "$repo" log --oneline "origin/main..$branch" 2>/dev/null || true
  return 1
}

# Gibt den Worktree-Pfad aus, der $2 ausgecheckt haelt (rc 0), sonst rc 1.
# Aus Schritt 10 ausgelagert (S1-Neutralitaet, T900096-P1.4) — Verhalten
# identisch zum Inline-Block (branch-exakte Zuordnung, T012256/B2).
finalize_holding_worktree() {
  local repo="${1:?repo fehlt}" branch="${2:?branch fehlt}"
  git -C "$repo" worktree list --porcelain 2>/dev/null | awk -v b="refs/heads/$branch" '
    /^worktree / { wt=$2 }
    /^branch / && $0 == "branch " b { print wt; found=1; exit }
    END { if (!found) exit 1 }
  '
}

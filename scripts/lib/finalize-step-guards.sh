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
  local repo="${1:?repo fehlt}" branch="${2:?branch fehlt}" pr="${3:-}"
  local evidence base tip merge
  if [[ -n "$pr" ]]; then
    evidence="$(cd "$repo" && gh pr view "$pr" --json state,headRefName,headRefOid,baseRefName,mergeCommit 2>/dev/null)" || return 1
    jq -e --arg branch "$branch" 'select(.state == "MERGED" and .headRefName == $branch)' <<<"$evidence" >/dev/null || return 1
    base="$(jq -er '.baseRefName' <<<"$evidence")" || return 1
  else
    base="$(git -C "$repo" symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null)" || return 1
    base="${base#origin/}"
  fi
  git -C "$repo" check-ref-format "refs/heads/$base" >/dev/null || return 1
  git -C "$repo" fetch origin "refs/heads/$base:refs/remotes/origin/$base" --quiet 2>/dev/null || return 1
  if git -C "$repo" merge-base --is-ancestor "$branch" "origin/$base" 2>/dev/null; then
    return 0
  fi
  git -C "$repo" log --oneline "origin/$base..$branch" >&2 || true
  if [[ -z "$pr" ]]; then
    evidence="$(cd "$repo" && gh pr list --head "$branch" --state merged --json state,headRefName,headRefOid,baseRefName,mergeCommit --jq '.[0]' 2>/dev/null)" || return 1
  fi
  tip="$(git -C "$repo" rev-parse "refs/heads/$branch")" || return 1
  merge="$(jq -er --arg branch "$branch" --arg tip "$tip" --arg base "$base" '
    select(.state == "MERGED" and .headRefName == $branch and .headRefOid == $tip and .baseRefName == $base)
    | .mergeCommit.oid' <<<"$evidence")" || {
    git -C "$repo" log --oneline "origin/$base..$branch" >&2 || true
    return 1
  }
  git -C "$repo" merge-base --is-ancestor "$merge" "origin/$base" 2>/dev/null
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

# Check ownership from the stable main anchor: target cwd must never impersonate
# the owner via agent-lock's worktree-containment fallback. Unknown is not free.
finalize_cleanup_safe() {
  local repo="$1" branch="$2" path="$3" ticket="$4" anchor state dirty scope id
  anchor="$(dirname "$(git -C "$repo" rev-parse --path-format=absolute --git-common-dir)")" || return 1
  for scope in branch ticket; do
    id="$branch"; [[ "$scope" == ticket ]] && id="$ticket"
    state="$(cd "$anchor" && bash "$anchor/scripts/agent-lock.sh" check "$scope" "$id" 2>/dev/null)" || return 1
    case "${state%%$'\n'*}" in
      free) ;;
      mine) [[ -n "${AGENT_LOCK_SID:-}" ]] &&
        jq -e --arg sid "$AGENT_LOCK_SID" '(.owner_sid | tostring) == $sid' <<<"${state#*$'\n'}" >/dev/null || return 1 ;;
      *) return 1 ;;
    esac
  done
  if [[ -d "$path" ]]; then
    [[ "$(finalize_holding_worktree "$repo" "$branch")" == "$path" ]] || return 1
    [[ "$path" != "$anchor" ]] || return 1
    dirty="$(git -C "$path" status --porcelain --untracked-files=all)" || return 1
    [[ -z "$dirty" ]] || { printf '%s\n' "$dirty" >&2; return 1; }
  elif finalize_holding_worktree "$repo" "$branch" >/dev/null; then
    return 1
  fi
}

# Strict remove refuses new edits arriving after the guard; shared legacy force
# helper stays unchanged for unrelated callers.
finalize_remove_clean_worktree() {
  git -C "$1" worktree unlock "$2" 2>/dev/null || true
  git -C "$1" worktree remove "$2"
}

# Release only exact SID-owned claims after merge/clean/ownership preflight.
finalize_release_owned_claims() {
  local anchor="$1" branch="$2" ticket="$3" scope id state
  for scope in branch ticket; do
    id="$branch"; [[ "$scope" == ticket ]] && id="$ticket"
    state="$(cd "$anchor" && bash "$anchor/scripts/agent-lock.sh" check "$scope" "$id" 2>/dev/null)" || return 1
    case "${state%%$'\n'*}" in
      free) ;;
      mine)
        [[ -n "${AGENT_LOCK_SID:-}" ]] && jq -e --arg sid "$AGENT_LOCK_SID" \
          '(.owner_sid | tostring) == $sid' <<<"${state#*$'\n'}" >/dev/null || return 1
        (cd "$anchor" && bash "$anchor/scripts/agent-lock.sh" release "$scope" "$id") || return 1 ;;
      *) return 1 ;;
    esac
  done
}

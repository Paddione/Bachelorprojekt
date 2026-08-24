#!/usr/bin/env bash
# worktree-git-op-guard.sh — reports interrupted git operations in any registered worktree.
#
# Usage: scripts/worktree-git-op-guard.sh [--quiet] [--finish] [--worktree <path>] [<repo-root>]
#
# Exit codes: 0 = no finding, 1 = at least one finding, 2 = invocation error.
#
# The guard inspects every worktree from `git worktree list --porcelain` and checks for
# in-progress rebase (rebase-merge / rebase-apply), merge (MERGE_HEAD) or cherry-pick
# (CHERRY_PICK_HEAD).
#
# By DEFAULT it reports each affected worktree and does NOT attempt to continue, abort or
# otherwise modify the operation — repairing a foreign worktree's rebase can produce a wrong
# commit on a branch the caller does not own.
#
# [T015784] With the opt-in --finish it completes an interrupted rebase, but ONLY within the
# intersection where doing so creates no new content: conflicts all resolved, no rebase commands
# left pending, working tree clean under the generated-artifact allowlist. There
# `git rebase --continue` only records the state the operator already resolved. Outside that
# intersection — and for merges and cherry-picks always — the default prohibition applies
# unchanged. The completion is verified from a POSITIVE signal, never from the exit code of
# `git rebase --continue`: it has been observed exiting 0 while writing `error: update_ref failed`
# to stderr (repo-hygiene-ops.md §3).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

quiet=false
finish=false
repo_root=""
single_worktree=""

usage() {
  echo "Usage: $0 [--quiet] [--finish] [--worktree <path>] [<repo-root>]" >&2
  exit 2
}

while [ $# -gt 0 ]; do
  case "$1" in
    --quiet) quiet=true; shift ;;
    --finish) finish=true; shift ;;
    --worktree) single_worktree="${2:-}"; shift 2 ;;
    --help|-h) usage ;;
    --) shift; break ;;
    -*) usage ;;
    *) break ;;
  esac
done

if [ $# -gt 0 ]; then
  repo_root="$1"
  if [ ! -d "$repo_root" ] || ! git -C "$repo_root" rev-parse --git-dir >/dev/null 2>&1; then
    echo "FATAL: <repo-root> '$repo_root' is not a git repository." >&2
    exit 2
  fi
else
  repo_root="$(git rev-parse --show-toplevel 2>/dev/null)" || {
    echo "FATAL: not inside a git repository and no <repo-root> given." >&2
    exit 2
  }
fi

# Collect all worktree paths.  Using --porcelain gives us machine-parseable output:
#   worktree /path/to/repo
#   HEAD <sha>
#   branch refs/heads/<name>
#   ...
# We only need the paths.
worktrees=()
while IFS=' ' read -r key value; do
  if [ "$key" = "worktree" ]; then
    worktrees+=("$value")
  fi
done < <(git -C "$repo_root" worktree list --porcelain)

if [ ${#worktrees[@]} -eq 0 ]; then
  $quiet || echo "No worktrees found."
  exit 0
fi

# --worktree <path>: replace the full worktree list with just this one (canonicalised).
if [ -n "$single_worktree" ]; then
  if [ ! -d "$single_worktree" ]; then
    echo "FATAL: --worktree '$single_worktree' is not a directory." >&2
    exit 2
  fi
  resolved="$(cd "$single_worktree" 2>/dev/null && pwd -P)" || {
    echo "FATAL: --worktree '$single_worktree' cannot be resolved." >&2
    exit 2
  }
  # Check it is a worktree of this repo
  if ! git -C "$resolved" rev-parse --git-dir >/dev/null 2>&1; then
    echo "FATAL: --worktree '$single_worktree' is not a git worktree of this repository." >&2
    exit 2
  fi
  worktrees=("$resolved")
fi

found_count=0

# [T015784] Prueft, ob ein gefundener Rebase maschinell abschliessbar ist — also ob
# `git rebase --continue` hier nur den bereits geloesten Zustand festschreibt, statt
# eine inhaltliche Entscheidung zu treffen. Alle Bedingungen muessen gelten.
# $1 = Worktree-Pfad, $2 = op_kind, $3 = bereits erhobene Liste ungeloester Dateien.
_finishable() {
  local wt="$1" op_kind="$2" unresolved_files="$3"

  # 1. Nur Rebases. Ein unterbrochener Merge oder Cherry-Pick verlangt eine
  #    inhaltliche Entscheidung, die kein Skript treffen kann.
  case "$op_kind" in rebase*) ;; *) return 1 ;; esac

  # 2. Keine offenen Konflikte. Der Wert liegt beim Aufrufer schon vor und wird
  #    durchgereicht, statt ihn ein zweites Mal zu erheben.
  [ -z "$unresolved_files" ] || return 1

  # 3. Keine Kommandos mehr offen. Beim Merge-Backend ist git-rebase-todo nach dem
  #    letzten Pick leer — das ist der "No commands remaining"-Zustand des Fundfalls.
  local todo
  todo="$(git -C "$wt" rev-parse --git-path rebase-merge/git-rebase-todo 2>/dev/null)" || return 1
  if [ -f "$todo" ] && [ -s "$todo" ]; then
    # Kommentarzeilen zaehlen nicht als offene Kommandos.
    if grep -qv '^\s*\(#.*\)\?$' "$todo" 2>/dev/null; then
      return 1
    fi
  fi

  # 4. Working Tree nach Generat-Allowlist sauber. Das Skript wird AUFGERUFEN, der
  #    Filter nicht kopiert: repo-hygiene-ops.md haelt fest, dass ALLOWLIST= in
  #    branch-reaper.sh die massgebliche Quelle ist und Zweitschreibungen nachgezogen
  #    werden muessen — eine dritte Kopie waere genau diese Drift. Exit 2 (nicht
  #    pruefbar) ist wie Exit 1 ein Nein: ohne Messung wird nichts angefasst.
  #
  #    Der Pfad haengt am GUARD-Skript, NICHT am geprueften repo_root: Letzterer
  #    kann ein fremdes Repo sein (im BATS-Fixture ist er genau das), und dann
  #    faende `[ -f ]` den Pruefer nicht — die Bedingung waere still uebersprungen
  #    und der gefaehrlichste der vier Checks fail-OPEN. Fehlt das Skript neben
  #    dem Guard, wird nichts abgeschlossen.
  local clean_check="$HERE/worktree-clean-check.sh"
  [ -f "$clean_check" ] || return 1
  bash "$clean_check" "$wt" >/dev/null 2>&1 || return 1

  return 0
}

# [T015784] Schliesst den Rebase ab und belegt das Ergebnis am POSITIV-Signal.
# Gibt 0 zurueck, wenn der Worktree danach nachweislich abgeraeumt ist.
_finish_rebase() {
  local wt="$1" branch="$2"
  local state_dir
  state_dir="$(git -C "$wt" rev-parse --git-path rebase-merge 2>/dev/null)" || return 1

  # stderr wird aufgehoben, nicht verworfen: der Fundfall schrieb hier
  # `error: update_ref failed`, waehrend der Aufruf mit 0 endete.
  local out
  out="$(cd "$wt" && GIT_EDITOR=true git rebase --continue 2>&1)" || true

  # Signal 1: das Zustandsverzeichnis ist weg.
  if [ -d "$state_dir" ]; then
    $quiet || echo "  --finish: Rebase-Zustand besteht fort — nicht abgeschlossen. $(printf '%s' "$out" | head -1)" >&2
    return 1
  fi
  # Signal 2: der Branch-Ref traegt das Ergebnis.
  local head_sha branch_sha
  head_sha="$(git -C "$wt" rev-parse HEAD 2>/dev/null)" || return 1
  branch_sha="$(git -C "$wt" rev-parse "$branch" 2>/dev/null)" || return 1
  if [ "$head_sha" != "$branch_sha" ]; then
    $quiet || echo "  --finish: Branch-Ref $branch ($branch_sha) weicht von HEAD ($head_sha) ab — nicht abgeschlossen. $(printf '%s' "$out" | head -1)" >&2
    return 1
  fi
  return 0
}

for wt in "${worktrees[@]}"; do
  # Determine the branch name.  During a rebase `git rev-parse --abbrev-ref HEAD`
  # returns "HEAD" (detached), so we fall back to the head-name file.
  branch="$(git -C "$wt" rev-parse --abbrev-ref HEAD 2>/dev/null)" || branch="(unknown)"
  if [ "$branch" = "HEAD" ]; then
    head_name_file="$(git -C "$wt" rev-parse --git-path rebase-merge/head-name 2>/dev/null)"
    if [ -f "$head_name_file" ]; then
      branch="$(cat "$head_name_file")"
    fi
  fi

  op_kind=""
  for candidate in rebase-merge rebase-apply MERGE_HEAD CHERRY_PICK_HEAD; do
    state_path="$(git -C "$wt" rev-parse --git-path "$candidate" 2>/dev/null)" || continue
    if [ -e "$state_path" ]; then
      case "$candidate" in
        rebase-merge)  op_kind="rebase (merge backend)" ;;
        rebase-apply)  op_kind="rebase (apply backend)" ;;
        MERGE_HEAD)    op_kind="merge in progress" ;;
        CHERRY_PICK_HEAD) op_kind="cherry-pick in progress" ;;
      esac
      break
    fi
  done

  if [ -n "$op_kind" ]; then
    # Check for unresolved conflicts.
    unresolved=""
    unresolved_files="$(git -C "$wt" diff --name-only --diff-filter=U 2>/dev/null)" || true
    if [ -n "$unresolved_files" ]; then
      unresolved=" (unresolved conflicts: $(echo "$unresolved_files" | head -3 | tr '\n' ' ' | sed 's/ $//'))"
      more=$(echo "$unresolved_files" | wc -l)
      if [ "$more" -gt 3 ]; then
        unresolved="$unresolved and $((more - 3)) more"
      fi
    else
      unresolved=" (all conflicts resolved, --continue ready)"
    fi

    # [T015784] Nur mit ausdruecklichem --finish und nur in der sicheren
    # Schnittmenge. Gelingt der Abschluss nachweislich, ist der Worktree kein
    # Befund mehr; schlaegt er fehl, bleibt er einer (fail-closed).
    if $finish && _finishable "$wt" "$op_kind" "$unresolved_files"; then
      if _finish_rebase "$wt" "$branch"; then
        $quiet || echo "worktree=$wt branch=$branch operation=$op_kind — abgeschlossen (--finish, Zustand verifiziert)"
        continue
      fi
    fi

    echo "worktree=$wt branch=$branch operation=$op_kind$unresolved"
    found_count=$((found_count + 1))
  fi
done

if [ $found_count -eq 0 ]; then
  $quiet || echo "No interrupted git operations found."
  exit 0
fi

echo "$found_count worktree(s) with interrupted git operation(s)."
exit 1

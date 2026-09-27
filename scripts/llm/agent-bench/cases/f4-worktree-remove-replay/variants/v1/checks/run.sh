#!/usr/bin/env bash
# Laeuft mit cwd = Replay-Workdir (Repo auf Parent-Commit + Change-Geruest).
# 1. Verhaelt sich die Bibliothek richtig (gesperrter Worktree geht weg)?
# 2. Binden alle vier Aufrufer sie ein?
set -u
fail=0
W="$PWD"
if [ ! -f scripts/lib/worktree-remove.sh ]; then
  fail=1
else
  T="$(mktemp -d)"
  git init -q "$T/r" && (cd "$T/r" && git -c user.name=t -c user.email=t@t commit -q --allow-empty -m init)
  git -C "$T/r" worktree add -q "$T/wt" -b b1
  git -C "$T/r" worktree lock "$T/wt" --reason "managed agent worktree"
  # shellcheck disable=SC1091
  source "$W/scripts/lib/worktree-remove.sh"
  worktree_remove_managed "$T/r" "$T/wt" >/dev/null 2>&1 || fail=1
  [ -e "$T/wt" ] && fail=1
  git -C "$T/r" worktree list --porcelain 2>/dev/null | grep -q "worktree $T/wt" && fail=1
  # Nicht registrierte Pfade ablehnen, nicht loeschen.
  mkdir -p "$T/plain"
  worktree_remove_managed "$T/r" "$T/plain" >/dev/null 2>&1 && fail=1
  [ -d "$T/plain" ] || fail=1
  rm -rf "$T"
fi
for f in scripts/devflow-post-merge-finalize.sh scripts/pr-refresh.sh scripts/weekly-dep-schema-audit.sh scripts/factory/cleanup.sh; do
  grep -q 'worktree-remove\.sh' "$f" 2>/dev/null || fail=1
done
exit $fail

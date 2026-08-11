#!/usr/bin/env bash
# scripts/hooks/pre-push-scope-base.sh [T002827]
#
# Bestimmt den Fork-Point einer Branch gegen origin/main — den Commit, an dem
# die Branch WIRKLICH von main abging. Gibt die BASE-SHA auf stdout aus.
#
#   pre-push-scope-base.sh <head-sha> [<remote-sha>]
#
# Warum als eigenes Skript und nicht inline in .githooks/pre-push: die Logik
# ist eine reine Funktion von (head-sha) auf (base-sha) und damit gegen ein
# temporaeres Git-Repo testbar — wie check-freshness-artifacts.sh [T002672].
#
# Hintergrund: VORHER stand im Hook der (moeglicherweise STALE) origin/main-Ref-
# Stand als BASE. Nach einem `git rebase origin/main` (Standardweg fuer
# CONFLICTING-PRs, git-workflow) zog "origin/main..LOCAL_SHA" bereits gemergte
# main-Commits in die Scope-Pruefung und blockte den Push mit fremden
# Commit-Messages [T002104-Folgebefund, T002827; real bei
# fix/ticket-list-test-data-filter-T002781]. Auch REMOTE_SHA (alter
# Remote-Branch-Tip) taugt nach einem Rebase nicht: er liegt nicht mehr auf der
# Ahnenlinie des neuen HEAD.
#
# Loesung: `git merge-base --fork-point origin/main <head-sha>` nutzt die
# origin/main-Reflog und findet den echten Abzweigpunkt auch nach einem Rebase.
set -uo pipefail

HEAD_SHA="${1:-}"
REMOTE_SHA="${2:-}"

if [[ -z "$HEAD_SHA" ]]; then
  echo "usage: pre-push-scope-base.sh <head-sha> [<remote-sha>]" >&2
  exit 2
fi

# 1. Bevorzugt: fork-point via origin/main-Reflog. Findet den echten
#    Abzweigpunkt, auch wenn der Branch nachträglich rebased wurde.
BASE="$(git merge-base --fork-point origin/main "$HEAD_SHA" 2>/dev/null || true)"
if [[ -n "$BASE" ]] && git merge-base --is-ancestor "$BASE" "$HEAD_SHA" 2>/dev/null; then
  printf '%s\n' "$BASE"
  exit 0
fi

# 2. Fallback: plain merge-base. Deckt den Fall ohne Reflog ab (frisches Repo,
#    shallow clone); dort ist der Branch-Tip noch nicht rebased, der merge-base
#    ist dann korrekt.
BASE="$(git merge-base origin/main "$HEAD_SHA" 2>/dev/null || true)"
if [[ -n "$BASE" ]] && git merge-base --is-ancestor "$BASE" "$HEAD_SHA" 2>/dev/null; then
  printf '%s\n' "$BASE"
  exit 0
fi

# 3. Fallback: REMOTE_SHA (alter Remote-Branch-Tip), falls er noch auf der
#    Ahnenlinie des neuen HEAD liegt. Ist er es nicht (Rebase hat den Tip
#    neu geschrieben), wird er ignoriert.
if [[ -n "$REMOTE_SHA" ]] && [[ "$REMOTE_SHA" != "0000000000000000000000000000000000000000" ]] \
   && git merge-base --is-ancestor "$REMOTE_SHA" "$HEAD_SHA" 2>/dev/null; then
  printf '%s\n' "$REMOTE_SHA"
  exit 0
fi

# 4. Letzter Ausweg: HEAD~1 — dann wird wenigstens der jüngste Commit geprüft.
BASE="$(git rev-parse --verify "$HEAD_SHA~1" 2>/dev/null || true)"
if [[ -n "$BASE" ]]; then
  printf '%s\n' "$BASE"
  exit 0
fi

# Fail-closed: kein BASE bestimmbar — Aufrufer entscheidet (Hook skippt den
# Commit-msg-Check nur bei leerem BASE; die empty-branch- und BATS-Guards
# darunter laufen weiter).
exit 1

#!/usr/bin/env bash
# scripts/factory/rollup-publish.sh — commit + push eines Rollup-Plan-Stands auf
# dem Zyklus-Branch [T004898].
#
# Der Generator (mishap-rollup.sh) erzeugt pro Zyklus genau einen Plan-Commit;
# dieses Skript committet ihn und pusht normal (ohne --amend, ohne
# --force-with-lease, ohne Rebase). Die Amend-/Lease-/Rebase-Maschinerie aus
# T002914/T002931 ist ersatzlos entfallen: mit dem ephemeren Zyklus-Lebenszyklus
# existiert genau ein Generator-Commit — es gibt nichts zu ersetzen, und ein
# divergierter Remote-Stand bricht den Push mit Exit 1 ab (der Generator meldet
# den Fehlschlag, der Container bleibt offen und wird vom naechsten Lauf
# verarbeitet).
#
# [T002913] Alle git-Aufrufe mit -c core.hooksPath=/dev/null: der post-commit-
# embed-Hook darf waehrend des Publish nicht feuern.
#
# Usage: rollup-publish.sh --repo <pfad> --branch <name> --change-dir <relpfad> --message <text>
#        rollup-publish.sh --help
# Exit: 0 = publiziert oder No-op | 1 = Fehler
set -euo pipefail

usage() {
  sed -n 's/^# \(Usage:.*\)$/\1/p; s/^# \( *rollup-publish.sh --help\)$/\1/p' "$0"
}

if [[ "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

REPO="" BRANCH="" CHANGE_DIR="" MESSAGE=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo) REPO="$2"; shift 2 ;;
    --branch) BRANCH="$2"; shift 2 ;;
    --change-dir) CHANGE_DIR="$2"; shift 2 ;;
    --message) MESSAGE="$2"; shift 2 ;;
    *) echo "rollup-publish: unbekanntes Argument: $1" >&2; usage >&2; exit 1 ;;
  esac
done
if [[ -z "$REPO" || -z "$BRANCH" || -z "$CHANGE_DIR" || -z "$MESSAGE" ]]; then
  echo "rollup-publish: --repo, --branch, --change-dir und --message sind Pflicht" >&2
  usage >&2
  exit 1
fi

GIT="git -C "$REPO" -c core.hooksPath=/dev/null"

# ── Stagen + No-op-Erkennung ─────────────────────────────────────────────────
$GIT add "$CHANGE_DIR"
if $GIT diff --cached --quiet; then
  # Nichts zu publizieren — z.B. ein Re-Run des gleichen Containers, dessen Plan
  # der Vorlauf bereits committet hat. Exit 0, kein Push.
  echo "rollup-publish: keine Aenderungen in ${CHANGE_DIR} — No-op, exit 0"
  exit 0
fi

# ── Commit + Push ────────────────────────────────────────────────────────────
$GIT commit -q -m "$MESSAGE"
if ! $GIT push -q -u origin "$BRANCH"; then
  echo "rollup-publish: FEHLER — push auf '${BRANCH}' fehlgeschlagen." >&2
  echo "  Der Plan ist lokal committet, aber nicht auf origin: ${CHANGE_DIR}" >&2
  exit 1
fi

echo "rollup-publish: publiziert auf origin/${BRANCH}"

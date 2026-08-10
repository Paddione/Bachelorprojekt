#!/usr/bin/env bash
# scripts/factory/rollup-publish.sh — commit + push eines Rollup-Plan-Stands auf
# einem persistenten Rollup-Branch, Kette bleibt bei Laenge 1 [T002931].
#
# Frueher haengte mishap-rollup.sh pro Lauf einen neuen Voll-Regenerations-Commit
# an: die Kette wuchs unbegrenzt, ein Rebase wurde pro Tick teurer und der Branch
# kam nie voran. Dieses Skript ersetzt stattdessen den eigenen letzten
# Generator-Commit (--amend + --force-with-lease) — ein Lauf bewegt den Tip,
# verlaengert aber die Kette nicht.
#
# HARTE SICHERHEITSBEDINGUNG: Ein Commit wird NUR ersetzt, wenn nachweislich der
# Generator ihn geschrieben hat — Betreffzeile entspricht dem Generator-Muster UND
# er beruehrt ausschliesslich Pfade unterhalb --change-dir. Ein fremder Tip wird
# nie ueberschrieben: dann wird neu committet und normal gepusht.
#
# [T002913] Alle git-Aufrufe mit -c core.hooksPath=/dev/null: der post-commit-
# embed-Hook darf waehrend eines Rebase nicht feuern.
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

# ── Eigentuemer-Pruefung von HEAD ────────────────────────────────────────────
# Als eigen gilt ein Generator-Commit nur, wenn BEIDES zutrifft: die Betreffzeile
# entspricht dem Generator-Muster, UND die beruehrten Pfade liegen ausschliesslich
# unterhalb <change-dir>. Die Pfadmenge ist die tragende Bedingung — eine Nachricht
# laesst sich versehentlich reproduzieren, eine Pfadmenge nicht.
slug="${CHANGE_DIR##*/}"
subject="$($GIT log -1 --format=%s HEAD)"
own=0
if [[ "$subject" == "chore(plans): update ${slug} from container batches"* ]]; then
  paths="$($GIT diff-tree --no-commit-id -r --name-only --root HEAD)"
  own=1
  while IFS= read -r p; do
    [[ -z "$p" ]] && continue
    if [[ "$p" != "$CHANGE_DIR"/* ]]; then
      own=0
      break
    fi
  done <<< "$paths"
fi

# ── Stagen + No-op-Erkennung ─────────────────────────────────────────────────
$GIT add "$CHANGE_DIR"
if $GIT diff --cached --quiet; then
  # Nichts zu publizieren. Bei eigenem HEAD ist das ein No-op (Exit 0, kein Push,
  # kein Amend); bei fremdem HEAD gibt es ebenfalls nichts, was wir anfassen duerften.
  echo "rollup-publish: keine Aenderungen in ${CHANGE_DIR} — No-op, exit 0"
  exit 0
fi

# ── Commit: eigen → --amend, fremd → neu ─────────────────────────────────────
amend_expected=""
if [[ "$own" -eq 1 ]]; then
  amend_expected="$($GIT rev-parse HEAD)"
  $GIT commit --amend -q -m "$MESSAGE"
else
  $GIT commit -q -m "$MESSAGE"
fi

# ── Push ─────────────────────────────────────────────────────────────────────
# Eigen-Fall: --force-with-lease mit explizit benanntem Erwartungswert (= der
# ersetzte eigene Commit, der auf origin liegt). Die implizite Form vergliche gegen
# die lokale Remote-Tracking-Ref, die ein vorangegangener fetch still aktualisiert
# haben kann — dann greift der Schutz nicht mehr (der parallele Remote-Commit wuerde
# ueberschrieben). Fremd-Fall: normaler Push, reicht weil nichts umgeschrieben wird.
if ! $GIT push -q -u origin "$BRANCH" ${amend_expected:+--force-with-lease="$BRANCH:$amend_expected"}; then
  echo "rollup-publish: push fehlgeschlagen — remote ist divergiert, rebuild auf origin/${BRANCH}"
  # [T002914] Ein divergierter Remote (paralleler Lauf / Anker) darf den Push nicht
  # dauerhaft blockieren. Ein `git rebase origin/${BRANCH}` scheitert hier aber mit
  # add/add-Konflikt: der eigene amendierte Commit hat die Basis als Parent, und der
  # Remote-Stand enthaelt tasks.md bereits. Stattdessen legen wir den Branch-Pointer
  # auf den aktuellen Remote-Tip (MIXED reset — der Index folgt dem origin-Baum,
  # der Worktree behaelt den generierten Stand) und committen unseren Plan neu darauf.
  # Wichtig: reset OHNE --soft — ein --soft liesse den alten Index stehen und der
  # neue Commit wuerde fremde Remote-Dateien (z.B. parallel.txt) als Deletion
  # mitnehmen. Fremde Commits bleiben in der Historie erhalten.
  $GIT fetch -q origin "$BRANCH"
  if ! $GIT reset -q "origin/${BRANCH}"; then
    echo "rollup-publish: FEHLER — reset auf origin/${BRANCH} fehlgeschlagen." >&2
    echo "  Der Plan ist lokal committet, aber nicht auf origin: ${CHANGE_DIR}" >&2
    exit 1
  fi
  $GIT add "$CHANGE_DIR"
  if ! $GIT commit -q -m "$MESSAGE"; then
    echo "rollup-publish: FEHLER — recommit nach Divergenz fehlgeschlagen." >&2
    echo "  Der Plan ist lokal committet, aber nicht auf origin: ${CHANGE_DIR}" >&2
    exit 1
  fi
  if ! $GIT push -q -u origin "$BRANCH"; then
    echo "rollup-publish: FEHLER — push auf '${BRANCH}' auch nach Divergenz-Rebuild fehlgeschlagen." >&2
    echo "  Der Plan ist lokal committet, aber nicht auf origin: ${CHANGE_DIR}" >&2
    exit 1
  fi
fi

echo "rollup-publish: publiziert auf origin/${BRANCH}"

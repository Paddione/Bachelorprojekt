#!/usr/bin/env bash
# scripts/openspec-orphan-detect.sh — erkennt verwaiste OpenSpec-Changes ohne DB-Zugriff.
#
# T900503 — Factory-freier Nachfolger des nie gebauten p2-Dispatchers aus T900338.
# SSOT: openspec/changes/openspec-orphan-auto-dispatch/specs/openspec-workflow.md
#   "A scheduled CI job dispatches archiving of orphaned OpenSpec changes"
#
# Orphan-Signal (alle Bedingungen): Change-Verzeichnis auf main (ohne `archive`)
# plus `.ticket`-Datei plus GEMERGTER PR mit `[Tid]` im Titel (CI-erzwungene
# Konvention, ADR-006 umgeht die DB) plus Mindestalter plus kein offener PR mit
# dem Slug im Titel. Ausgabe: ein Slug pro Zeile nach stdout; jeder Skip mit
# Grund nach stderr. Leere Auswahl ist Exit 0 (nichts zu tun ist kein Fehler);
# nur ein gescheiterter Listing-Aufruf bricht mit Exit 1 ab. Pro-Slug-Fehler
# fallen Richtung Skip (fail-closed: kein falsches Select).
#
# Bekannte Grenze: Ein revertierter Fix hinterlässt einen gemergten PR — der
# Change würde archiviert. Nur dokumentarisch, kein Code-Verlust.
#
# USAGE: openspec-orphan-detect.sh [--dry-run] [--min-age-hours N] [-h|--help]
set -euo pipefail

DRY_RUN=false
MIN_AGE_HOURS=24

usage() { sed -n '2,4p' "$0"; exit "${1:-0}"; }

while [[ $# -gt 0 ]]; do case "$1" in
  --dry-run) DRY_RUN=true; shift ;;
  --min-age-hours) MIN_AGE_HOURS="$2"; shift 2 ;;
  -h|--help) usage 0 ;;
  *) echo "Unbekannte Option: $1" >&2; usage 2 ;;
esac; done

[[ "$MIN_AGE_HOURS" =~ ^[0-9]+$ ]] || { echo "FEHLER: --min-age-hours braucht eine Zahl" >&2; exit 2; }

NOW_EPOCH=$(python3 -c 'import time; print(int(time.time()))')

iso_to_epoch() {
  python3 -c 'import sys, datetime; print(int(datetime.datetime.fromisoformat(sys.argv[1].replace("Z", "+00:00")).timestamp()))' "$1" 2>/dev/null || echo 0
}

# Offene Slugs auf main listen (fatal bei API-Fehler).
listing="$(gh api 'repos/{owner}/{repo}/contents/openspec/changes?ref=main' 2>/dev/null)" || {
  echo "FEHLER: Change-Listing via gh api gescheitert" >&2; exit 1;
}
mapfile -t slugs < <(printf '%s' "$listing" | jq -r '.[] | select(.type=="dir" and .name!="archive") | .name' 2>/dev/null)

selected=()
for slug in "${slugs[@]}"; do
  [[ -n "$slug" ]] || continue
  # 1. .ticket lesen.
  tid="$(gh api "repos/{owner}/{repo}/contents/openspec/changes/${slug}/.ticket?ref=main" 2>/dev/null | jq -r '.content // empty' 2>/dev/null | base64 -d 2>/dev/null | tr -d '[:space:]' || true)"
  if [[ -z "$tid" ]]; then echo "skip $slug: no .ticket" >&2; continue; fi
  # 2. Gemergten Fix-PR mit [Tid] suchen.
  merged="$(gh pr list --state merged --search "\"[${tid}]\" in:title" --json title 2>/dev/null | jq -r '.[].title' 2>/dev/null || true)"
  if [[ -z "$merged" ]]; then echo "skip $slug: no merged fix pull request" >&2; continue; fi
  # 3. Mindestalter des Erstcommits prüfen.
  first_date="$(gh api "repos/{owner}/{repo}/commits?sha=main&path=openspec/changes/${slug}&per_page=100" 2>/dev/null | jq -r '.[-1].commit.committer.date // empty' 2>/dev/null || true)"
  first_epoch="$(iso_to_epoch "${first_date:-}")"
  age_hours=$(( (NOW_EPOCH - first_epoch) / 3600 ))
  if [[ "$age_hours" -lt "$MIN_AGE_HOURS" ]]; then echo "skip $slug: too young (${age_hours}h)" >&2; continue; fi
  # 4. Offene PRs mit Slug im Titel suchen (Fehler → Skip, fail-closed).
  open_prs="$(gh pr list --state open --search "'${slug}' in:title" --json title 2>/dev/null | jq -r '.[].title' 2>/dev/null)" || {
    echo "skip $slug: open-PR check failed" >&2; continue;
  }
  if [[ -n "$open_prs" ]]; then echo "skip $slug: open pull request" >&2; continue; fi
  echo "select $slug ($tid)" >&2
  selected+=("$slug")
done

if [[ "$DRY_RUN" == true ]]; then exit 0; fi
if [[ "${#selected[@]}" -gt 0 ]]; then printf '%s\n' "${selected[@]}"; fi

#!/usr/bin/env bash
# scripts/factory/openspec-orphan-dispatch.sh — Dispatcher fuer verwaiste OpenSpec-Changes.
#
# T900338 — Ermittelt reife Changes und stoesst den CI-Workflow an.
# SSOT: openspec/specs/sdlc-isolation.md
#   "The local poller dispatches archiving of orphaned OpenSpec changes"
#
# USAGE: openspec-orphan-dispatch.sh [--dry-run] [--min-age-hours N] [-h|--help]
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
source "$HERE/lib.sh"

DRY_RUN=false
MIN_AGE_HOURS=2
GH_REPO="repos/{owner}/{repo}"

usage() { sed -n '2,8p' "$0"; exit "${1:-0}"; }

while [[ $# -gt 0 ]]; do case "$1" in
  --dry-run)      DRY_RUN=true; shift ;;
  --min-age-hours) MIN_AGE_HOURS="$2"; shift 2 ;;
  -h|--help)      usage 0 ;;
  *)              echo "Unbekannte Option: $1" >&2; usage 2 ;;
esac; done

factory_resolve

# 1. Offene Change-Slugs ermitteln (immer abfragen — dient als GH_LOG-Beleg)
slugs_raw="$(gh api "${GH_REPO}/contents/openspec/changes?ref=main" \
             --jq '.[] | select(.type=="dir" and .name!="archive") | .name' 2>/dev/null)" || {
  echo "Failed to list open changes" >&2
  exit 1
}

if [[ -z "$slugs_raw" ]]; then
  echo "no open changes found"
  exit 0
fi

# 2. Pruefen, ob bereits ein Run laueft oder in Warteschlange steht
active_ids="$(gh run list --workflow openspec-orphan-archive.yml --status in_progress \
              --json databaseId --jq '.[].databaseId' 2>/dev/null || true)"
queued_ids="$(gh run list --workflow openspec-orphan-archive.yml --status queued \
              --json databaseId --jq '.[].databaseId' 2>/dev/null || true)"

if [[ -n "$active_ids" ]] || [[ -n "$queued_ids" ]]; then
  echo "archive run already active — no dispatch"
  exit 0
fi

selected=()

# 3. Je Slug pruefen
for slug in $slugs_raw; do
  # 3a. .ticket existiert?
  # gh api returns .content as base64-encoded string; test stubs may return raw ticket ID.
  raw_content="$(gh api "${GH_REPO}/contents/openspec/changes/${slug}/.ticket?ref=main" \
                 --jq .content 2>/dev/null || true)"
  ticket_raw="$(printf '%s' "$raw_content" | tr -d '[:space:]')"
  # Versuche base64-Dekodierung; Ergebnis muss eine T-Nummer sein.
  decoded=""
  if [[ "$ticket_raw" =~ ^[A-Za-z0-9+/=]+$ && ${#ticket_raw} -gt 4 ]]; then
    decoded="$(printf '%s' "$ticket_raw" | base64 -d 2>/dev/null || true)"
  fi
  case "$decoded" in
    T[0-9][0-9][0-9][0-9][0-9][0-9]) ticket_raw="$decoded" ;;
  esac

  if [[ -z "$ticket_raw" ]]; then
    echo "skip ${slug}: no .ticket"
    continue
  fi

  # 3b. Ticket-Status (DB: 1 Zeile pro Brand; mit Brand-Filter)
  status="$(BRAND="${BRAND:-mentolder}" factory_psql \
            -c "SELECT status FROM tickets.tickets WHERE external_id = '${ticket_raw}' AND brand = '${BRAND}'" \
            2>/dev/null | tail -1)"

  if [[ -z "$status" ]]; then
    echo "skip ${slug}: ticket ${ticket_raw} not found"
    continue
  fi

  if [[ "$status" != "done" ]]; then
    echo "skip ${slug}: ticket ${ticket_raw} is ${status}"
    continue
  fi

  # 3c. Alter des Einfuehrungs-Commits > min_age_hours
  commit_raw="$(gh api "${GH_REPO}/commits?sha=main&path=openspec/changes/${slug}&per_page=100" \
                --jq '.[-1].commit.committer.date' 2>/dev/null || true)"
  commit_date=""
  if [[ -z "$commit_raw" ]]; then
    commit_raw="$(gh api "${GH_REPO}/commits?sha=main&path=openspec/changes/${slug}&per_page=100" \
                  2>/dev/null || true)"
  fi
  commit_date="$(echo "$commit_raw" | grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z?' || true)"
  if [[ -n "$commit_date" ]]; then
    commit_epoch="$(date -d "$commit_date" +%s 2>/dev/null || echo 0)"
    now_epoch="$(date +%s)"
    age_hours=$(( (now_epoch - commit_epoch) / 3600 ))
    if [[ "$age_hours" -lt "$MIN_AGE_HOURS" ]]; then
      echo "skip ${slug}: too young (${age_hours}h)"
      continue
    fi
  fi

  # 3d. Offener PR mit Slug im Titel

  open_pr_title="$(gh pr list --state open --search "${slug} in:title" \
                   --json title --jq '.[].title' 2>/dev/null || true)"
  if [[ -n "$open_pr_title" ]]; then
    echo "skip ${slug}: open pull request"
    continue
  fi

  # 3e. Slug durchgegangen — merken
  echo "select ${slug} (${ticket_raw})"
  selected+=("$slug")
done

# 4. Wenn Slugs vorhanden: Workflow ausloesen
if [[ ${#selected[@]} -gt 0 ]]; then
  slugs_csv="$(IFS=,; echo "${selected[*]}")"
  if $DRY_RUN; then
    echo "[dry-run] would dispatch: ${slugs_csv}"
  else
    gh workflow run openspec-orphan-archive.yml -f slugs="${slugs_csv}" >/dev/null 2>&1
    echo "dispatched: ${slugs_csv}"
  fi
fi

exit 0

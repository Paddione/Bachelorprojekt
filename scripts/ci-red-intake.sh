#!/usr/bin/env bash
# scripts/ci-red-intake.sh — CI-Rot-Intake mit Auto-Resolve (T900759)
#
# Subcommands:
#   intake --sha <sha> --workflow <name> [--dry-run]
#   resolve --sha <sha> [--dry-run]
#
# intake: prueft die check-runs des Commits; bei Rot (failure/timed_out,
# cancelled ist kein Fehler) ein type=bug-Ticket (areas=ci) anlegen, bei
# Treffer im Titel-Dedupe (T001147) oder Mishap-Buffer (T002844) nur
# kommentieren. resolve: offene Rot-Tickets bei gruenem Beleg-Run als done
# (resolution=fixed) schliessen. Jeder unbestimmbare Zustand bricht ohne
# Schliessung ab (fail-closed, Exit ungleich 0).
set -u -o pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)" || exit 2
REPO_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)" || exit 2
TICKET_SH="${TICKET_SH:-$REPO_ROOT/scripts/ticket.sh}"
GH_REPO="${CI_RED_INTAKE_REPO:-Paddione/Bachelorprojekt}"

usage() {
  cat >&2 <<'EOF'
usage: ci-red-intake.sh intake --sha <sha> --workflow <name> [--dry-run]
       ci-red-intake.sh resolve --sha <sha> [--dry-run]
EOF
  exit 2
}

# Kanonische Titelform fuer Dedupe (T001147): case-insensitiv,
# whitespace-normalisiert.
canon() {
  printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | tr -s '[:space:]' ' '
}

mishap_buffer_path() {
  if [[ -n "${MISHAP_BUFFER:-}" ]]; then
    printf '%s' "$MISHAP_BUFFER"
    return 0
  fi
  local common
  common="$(git -C "$REPO_ROOT" rev-parse --git-common-dir 2>/dev/null || echo "")"
  if [[ -z "$common" ]]; then
    printf '%s' "$REPO_ROOT/.git/mishap-buffer.json"
    return 0
  fi
  case "$common" in
    /*) printf '%s' "$common/mishap-buffer.json" ;;
    *) printf '%s' "$REPO_ROOT/$common/mishap-buffer.json" ;;
  esac
}

# check-runs-JSON des Commits holen; fail-closed bei gh-Fehler.
fetch_check_runs() {
  local sha="$1" out
  if ! out="$(gh api "repos/${GH_REPO}/commits/${sha}/check-runs?filter=latest" 2>/dev/null)"; then
    echo "ci-red-intake: gh api check-runs fuer $sha fehlgeschlagen (fail-closed)." >&2
    return 1
  fi
  if [[ -z "$out" ]]; then
    echo "ci-red-intake: leere check-runs-Antwort fuer $sha (fail-closed)." >&2
    return 1
  fi
  printf '%s' "$out"
}

# Offene Rot-Tickets (Titel-Prefix "CI-Rot auf main:") aus ticket.sh list.
open_rot_tickets() {
  local list_json
  if ! list_json="$(bash "$TICKET_SH" list --status triage 2>/dev/null)"; then
    echo "ci-red-intake: ticket.sh list fehlgeschlagen (fail-closed)." >&2
    return 1
  fi
  printf '%s' "$list_json" | jq -c '[.[] | select((.title // "" | ascii_downcase) | startswith("ci-rot auf main:"))]' 2>/dev/null || {
    echo "ci-red-intake: ticket-liste nicht parsbar (fail-closed)." >&2
    return 1
  }
}

cmd_intake() {
  local sha="" workflow="" dry_run=false
  while [[ $# -gt 0 ]]; do case "$1" in
    --sha) sha="$2"; shift 2 ;;
    --workflow) workflow="$2"; shift 2 ;;
    --dry-run) dry_run=true; shift ;;
    *) usage ;;
  esac; done
  [[ -n "$sha" && -n "$workflow" ]] || usage

  local checks_json
  checks_json="$(fetch_check_runs "$sha")" || return 1

  local total failed_names failed_urls
  total="$(printf '%s' "$checks_json" | jq -r '.total_count // 0' 2>/dev/null || echo 0)"
  if [[ "$total" == "0" || -z "$total" ]]; then
    echo "ci-red-intake: keine CI-Checks fuer $sha (fail-closed, nichts angelegt)." >&2
    return 1
  fi
  failed_names="$(printf '%s' "$checks_json" | jq -r '[.check_runs[] | select(.conclusion == "failure" or .conclusion == "timed_out") | (.name // "unknown")] | join(", ")' 2>/dev/null || echo "")"
  failed_urls="$(printf '%s' "$checks_json" | jq -r '[.check_runs[] | select(.conclusion == "failure" or .conclusion == "timed_out") | (.html_url // "")] | join(" ")' 2>/dev/null || echo "")"
  if [[ -z "$failed_names" ]]; then
    echo "ci-red-intake: $sha gruen, kein Ticket noetig."
    return 0
  fi

  local short_sha title body
  short_sha="${sha:0:7}"
  title="CI-Rot auf main: $workflow @ $short_sha ($failed_names)"
  body="CI-Rot auf main (HEAD $sha, Workflow $workflow). Fehlgeschlagene Checks: $failed_names. Runs: $failed_urls"
  local canon_title
  canon_title="$(canon "$title")"

  # Dedupe 1: offenes Ticket gleichen Titels (T001147); SHA im Titel ist der
  # Dedupe-Schluessel — gleiche SHA = Re-Run/Laerm, auch bei leicht anderem
  # Check-Namensteil.
  local rot_json hit_id=""
  rot_json="$(open_rot_tickets)" || return 1
  hit_id="$(printf '%s' "$rot_json" | jq -r --arg t "$canon_title" --arg s "$short_sha" \
    '[.[] | select(((.title // "" | ascii_downcase | gsub("[[:space:]]+"; " ")) == $t) or ((.title // "" | ascii_downcase) | contains($s | ascii_downcase)))] | first | .external_id // empty' 2>/dev/null || echo "")"
  if [[ -n "$hit_id" ]]; then
    if [[ "$dry_run" == "true" ]]; then
      echo "ci-red-intake [dry-run]: wuerde $hit_id kommentieren (Dedupe, SHA $short_sha)."
      return 0
    fi
    bash "$TICKET_SH" add-comment --id "$hit_id" --body "Erneuter Rot-Befund gleiche SHA $short_sha ($workflow): $failed_names. Runs: $failed_urls" >/dev/null
    echo "ci-red-intake: $hit_id kommentiert (Dedupe, kein Duplikat)."
    return 0
  fi

  # Dedupe 2: Mishap-Buffer-Eintrag gleichen Titels (T002844); fehlende Datei
  # bedeutet Buffer leer, kein Fehler.
  local buf_path buf_hit=""
  buf_path="$(mishap_buffer_path)"
  if [[ -f "$buf_path" ]]; then
    buf_hit="$(jq -r --arg t "$canon_title" --arg s "$short_sha" \
      '[.[] | select((((.title // "") | ascii_downcase | gsub("[[:space:]]+"; " ")) == $t) or (((.title // "") | ascii_downcase) | contains($s | ascii_downcase)))] | length' \
      "$buf_path" 2>/dev/null || echo 0)"
  fi
  if [[ -n "$buf_hit" && "$buf_hit" != "0" ]]; then
    echo "ci-red-intake: Mishap-Buffer enthaelt $title bereits — keine Neuanlage."
    return 0
  fi

  if [[ "$dry_run" == "true" ]]; then
    echo "ci-red-intake [dry-run]: wuerde Ticket anlegen: $title"
    return 0
  fi
  bash "$TICKET_SH" create --type bug --title "$title" --description "$body" --areas ci
}

cmd_resolve() {
  local sha="" dry_run=false
  while [[ $# -gt 0 ]]; do case "$1" in
    --sha) sha="$2"; shift 2 ;;
    --dry-run) dry_run=true; shift ;;
    *) usage ;;
  esac; done
  [[ -n "$sha" ]] || usage

  local checks_json
  checks_json="$(fetch_check_runs "$sha")" || return 1

  local total failed proof_url success_count
  total="$(printf '%s' "$checks_json" | jq -r '.total_count // 0' 2>/dev/null || echo 0)"
  failed="$(printf '%s' "$checks_json" | jq -r '[.check_runs[] | select(.conclusion == "failure" or .conclusion == "timed_out")] | length' 2>/dev/null || echo "?")"
  success_count="$(printf '%s' "$checks_json" | jq -r '[.check_runs[] | select(.conclusion == "success")] | length' 2>/dev/null || echo 0)"
  if [[ "$total" == "0" || -z "$total" ]]; then
    echo "ci-red-intake: keine CI-Checks fuer $sha (fail-closed, nichts geschlossen)." >&2
    return 1
  fi
  if [[ "$failed" != "0" ]]; then
    echo "ci-red-intake: $sha noch rot ($failed fehlgeschlagene Checks) — nichts geschlossen." >&2
    return 1
  fi
  if [[ "$success_count" == "0" ]]; then
    echo "ci-red-intake: $sha ohne success-Beleg (nur pending/neutral) — nichts geschlossen (fail-closed)." >&2
    return 1
  fi
  proof_url="$(printf '%s' "$checks_json" | jq -r '[.check_runs[] | select(.conclusion == "success") | (.html_url // "")] | first // ""' 2>/dev/null || echo "")"

  local rot_json count
  rot_json="$(open_rot_tickets)" || return 1
  count="$(printf '%s' "$rot_json" | jq -r 'length' 2>/dev/null || echo 0)"
  if [[ "$count" == "0" ]]; then
    echo "ci-red-intake: kein offenes Rot-Ticket — nichts zu schliessen."
    return 0
  fi

  local proof_comment="Beleg-Run gruen: $proof_url (HEAD $sha, conclusion=success). Auto-Resolve per T900759."
  if [[ "$dry_run" == "true" ]]; then
    printf '%s' "$rot_json" | jq -r '.[].external_id' | while IFS= read -r tid; do
      [[ -n "$tid" ]] && echo "ci-red-intake [dry-run]: wuerde $tid als done/fixed schliessen ($proof_url)."
    done
    return 0
  fi
  local rc=0 tid
  while IFS= read -r tid; do
    [[ -n "$tid" ]] || continue
    bash "$TICKET_SH" add-comment --id "$tid" --body "$proof_comment" >/dev/null || rc=1
    bash "$TICKET_SH" update-status --id "$tid" --status done --resolution fixed --notes "$proof_comment" >/dev/null || rc=1
    echo "ci-red-intake: $tid als done/fixed geschlossen."
  done < <(printf '%s' "$rot_json" | jq -r '.[].external_id')
  return $rc
}

case "${1:-}" in
  intake) shift; cmd_intake "$@" ;;
  resolve) shift; cmd_resolve "$@" ;;
  *) usage ;;
esac

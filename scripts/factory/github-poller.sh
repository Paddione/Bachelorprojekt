#!/usr/bin/env bash
# scripts/factory/github-poller.sh — E3/T002626, ADR-006 Etappe 3.
#
# Holt GitHub-Zustand aktiv ab und schreibt ihn in die lokale Datenbank.
# GitHub kann den Dev-Host nicht erreichen (kein eingehender Weg ins Heimnetz),
# also gibt es keine Webhooks — der Rueckkanal ist ein Pull-Modell.
#
# Drei Aufgaben, jede mit eigenem Cursor:
#   merges   gemergte PRs -> Ticket-Closure (delegiert an auto-close-merged.sh)
#   prs      Zustand offener PRs -> tickets.pr_status
#   checks   Ergebnisse der Check-Laeufe -> tickets.pr_status
#
# CURSOR-DISZIPLIN (design.md D3): Der Cursor rueckt erst NACH dem erfolgreichen
# lokalen Schreiben vor. Daraus folgt at-least-once-Zustellung, und daraus die
# Pflicht zu idempotenten Schreibvorgaengen (ON CONFLICT). Die umgekehrte
# Reihenfolge waere einfacher und verloere genau die Ereignisse, die die DoD
# schuetzen soll.
#
# WORKSTATION AUS: GitHub ist der Puffer. Beim Wiederanlauf wird ab Cursor
# nachgeholt. Deshalb braucht es fuer CI-Ereignisse keine Outbox.
#
# USAGE: bash scripts/factory/github-poller.sh [--once] [--dry-run] [--task <name>]
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$HERE/../.." && pwd)"
# shellcheck source=/dev/null
source "$HERE/lib.sh"

BRAND="${BRAND:-mentolder}"
DRY_RUN=false
ONLY_TASK=""
# Obergrenze je Lauf. Nicht als "das sind alle", sondern als Schutz gegen einen
# Lauf, der nach langer Auszeit hunderte PRs auf einmal verarbeitet. Was die
# Grenze abschneidet, wird gemeldet — eine stille Kappung laese sich nicht von
# "nichts Neues" unterscheiden.
PAGE_LIMIT="${POLLER_PAGE_LIMIT:-100}"

usage() { sed -n '2,22p' "$0" | sed 's/^# \{0,1\}//'; exit "${1:-0}"; }

while [[ $# -gt 0 ]]; do case "$1" in
  --once)    shift ;;                       # Einzellauf ist das Default-Verhalten
  --dry-run) DRY_RUN=true; shift ;;
  --task)    ONLY_TASK="$2"; shift 2 ;;
  -h|--help) usage 0 ;;
  *) echo "Unbekannte Option: $1" >&2; usage 2 ;;
esac; done

factory_resolve

# --- Schema ------------------------------------------------------------------
# Der Poller legt seine Tabellen selbst an, idempotent — dasselbe Muster wie
# initTicketsSchema() auf der Anwendungsseite. Bewusst NICHT in tickets.pr_events
# geschrieben: die Tabelle hat `merged_at NOT NULL` und traegt die
# Release-Notes-Semantik (gemergte PRs), taugt also nicht als Zustandsspeicher
# fuer offene PRs und laufende Checks.
ensure_schema() {
  factory_psql <<'SQL' >/dev/null
CREATE TABLE IF NOT EXISTS tickets.poller_cursor (
  task        TEXT PRIMARY KEY,
  position    TEXT NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS tickets.pr_status (
  pr_number   INTEGER PRIMARY KEY,
  ticket_id   TEXT,
  state       TEXT NOT NULL,
  title       TEXT,
  head_ref    TEXT,
  checks      JSONB,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pr_status_ticket_idx ON tickets.pr_status (ticket_id)
  WHERE ticket_id IS NOT NULL;
SQL
}

cursor_get() {
  factory_psql -c "SELECT position FROM tickets.poller_cursor WHERE task = '$1'" 2>/dev/null | head -1
}

# Wird ausschliesslich NACH erfolgreichem Schreiben aufgerufen (D3).
cursor_set() {
  local task="$1" pos="$2"
  $DRY_RUN && { echo "[dry-run] cursor $task -> $pos"; return 0; }
  factory_psql >/dev/null <<SQL
INSERT INTO tickets.poller_cursor (task, position, updated_at)
VALUES ('$task', '$pos', now())
ON CONFLICT (task) DO UPDATE SET position = EXCLUDED.position, updated_at = now();
SQL
}

_ticket_from() {
  printf '%s' "$1" | sed -n 's/.*\[\(T[0-9]\{6\}\)\].*/\1/p' | head -1
}

# --- Aufgabe 1: Merges -------------------------------------------------------
# Die Closure-Logik wird NICHT nachgebaut. auto-close-merged.sh traegt Monate an
# Sonderfaellen — plan-only-Erkennung nach Dateiinhalt (T002598-M1),
# Rollup-Container-Recycling (T002407), Partial-Vollstaendigkeitsguard (T002105),
# Ableitung der resolution aus dem Ticket-Typ. Eine zweite Implementierung waere
# unweigerlich die schlechtere und wuerde beim naechsten Sonderfall auseinander-
# laufen. Der Poller ist hier der Zeitgeber, nicht die Logik.
task_merges() {
  echo "== merges =="
  local args=()
  $DRY_RUN && args+=(--dry-run)
  BRAND="$BRAND" bash "$HERE/auto-close-merged.sh" "${args[@]}" || {
    echo "  auto-close-merged meldete einen Fehler — Cursor bleibt stehen" >&2
    return 1
  }
  cursor_set merges "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}

# --- Aufgabe 2+3: PR-Zustand und Checks --------------------------------------
# Zusammen in einem Lauf, weil `gh pr list` beides in einer Abfrage liefert —
# zwei getrennte Abfragen kosteten doppelt API-Budget fuer dieselbe Antwort.
task_prs() {
  echo "== prs + checks =="
  local rows open_rows merged_rows

  # Zwei Abfragen statt einer, aus einem gemessenen Grund: `--state all` mit
  # `statusCheckRollup` ueber 100 PRs laeuft in GitHubs GraphQL-Timeout und
  # liefert HTTP 504 (verifiziert 2026-08-08). Die Rollup-Daten sind pro PR
  # dutzende Check-Eintraege — das Volumen, nicht die Anzahl der PRs, kippt die
  # Abfrage.
  #
  # Der Schnitt ist ohnehin der fachlich richtige: Check-Ergebnisse interessieren
  # nur bei OFFENEN PRs (das ist der CI-Zustand, den das Cockpit zeigt). Ein
  # gemergter PR ist fertig; sein Zustand ist "merged", und die Historie seiner
  # Checks braucht niemand mehr.
  open_rows="$(gh pr list --state open --limit "$PAGE_LIMIT" \
            --json number,title,state,headRefName,statusCheckRollup \
            --jq '.[] | [.number, .state, .title, .headRefName,
                         (.statusCheckRollup // [] | map({name: .name, conclusion: .conclusion}) | tostring)]
                        | @tsv' 2>/dev/null)" || {
    echo "  gh-Abfrage (offene PRs) fehlgeschlagen — Cursor bleibt stehen" >&2
    return 1
  }

  merged_rows="$(gh pr list --state merged --limit "$PAGE_LIMIT" \
            --json number,title,state,headRefName \
            --jq '.[] | [.number, .state, .title, .headRefName, "[]"] | @tsv' 2>/dev/null)" || {
    echo "  gh-Abfrage (gemergte PRs) fehlgeschlagen — Cursor bleibt stehen" >&2
    return 1
  }

  rows="$(printf '%s\n%s' "$open_rows" "$merged_rows" | grep -v '^$' || true)"

  if [[ -z "$rows" ]]; then
    echo "  keine PRs geliefert"
    return 0
  fi

  local count=0 pr state title head checks ticket
  while IFS=$'\t' read -r pr state title head checks; do
    [[ -z "$pr" ]] && continue
    ticket="$(_ticket_from "$title")"

    if $DRY_RUN; then
      printf '  [dry-run] PR #%-6s %-8s %s\n' "$pr" "$state" "${ticket:-–}"
      count=$((count + 1))
      continue
    fi

    # Idempotent: derselbe PR zweimal verarbeitet aktualisiert dieselbe Zeile.
    # Ohne ON CONFLICT liefe die at-least-once-Zustellung auf Duplikate hinaus.
    factory_psql >/dev/null <<SQL
INSERT INTO tickets.pr_status (pr_number, ticket_id, state, title, head_ref, checks, updated_at)
VALUES (${pr},
        $( [[ -n "$ticket" ]] && echo "'$ticket'" || echo "NULL" ),
        '$(printf '%s' "$state"  | sed "s/'/''/g")',
        '$(printf '%s' "$title"  | sed "s/'/''/g")',
        '$(printf '%s' "$head"   | sed "s/'/''/g")',
        '$(printf '%s' "$checks" | sed "s/'/''/g")'::jsonb,
        now())
ON CONFLICT (pr_number) DO UPDATE SET
  ticket_id  = EXCLUDED.ticket_id,
  state      = EXCLUDED.state,
  title      = EXCLUDED.title,
  head_ref   = EXCLUDED.head_ref,
  checks     = EXCLUDED.checks,
  updated_at = now();
SQL
    count=$((count + 1))
  done <<< "$rows"

  echo "  $count PR(s) verarbeitet"
  # Sichtbar machen, was die Obergrenze abgeschnitten haben koennte: sonst liest
  # sich ein gekappter Lauf wie ein vollstaendiger.
  if [[ "$count" -ge "$PAGE_LIMIT" ]]; then
    echo "  HINWEIS: Obergrenze $PAGE_LIMIT erreicht — es koennen aeltere PRs unverarbeitet sein." >&2
    echo "           POLLER_PAGE_LIMIT erhoehen oder oefter laufen lassen." >&2
  fi
  cursor_set prs "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}

# --- main --------------------------------------------------------------------
if ! $DRY_RUN; then
  ensure_schema
fi

echo "github-poller: BRAND=$BRAND ctx=$FACTORY_CTX ns=$FACTORY_NS dry_run=$DRY_RUN"
echo "  Cursor merges: $(cursor_get merges 2>/dev/null || echo '–')"
echo "  Cursor prs:    $(cursor_get prs 2>/dev/null || echo '–')"

rc=0
case "$ONLY_TASK" in
  merges) task_merges || rc=$? ;;
  prs)    task_prs    || rc=$? ;;
  "")     task_merges || rc=$?; task_prs || rc=$? ;;
  *)      echo "Unbekannte Aufgabe: $ONLY_TASK (merges|prs)" >&2; exit 2 ;;
esac

echo "github-poller: fertig (rc=$rc)"
exit $rc

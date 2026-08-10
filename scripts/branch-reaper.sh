#!/usr/bin/env bash
# scripts/branch-reaper.sh — Löscht verwaiste Remote-Branches nach Ticket-Abschluss. [T002520]
#
# Usage:
#   bash scripts/branch-reaper.sh --ticket T002520 [--dry-run] [--remote origin] [--repo .]
#   bash scripts/branch-reaper.sh --dry-run                            # ticketloser Sweep (lesend)
#   bash scripts/branch-reaper.sh --sweep [--dry-run] [--remote ...]   # loeschender Sweep
#
# Warum es dieses Skript gibt:
#   `delete_branch_on_merge=true` und `gh pr merge --delete-branch` greifen nur, wenn der
#   Branch SELBST gemergt wird. Plan- und Factory-Branches laufen aber häufig über einen
#   Sammel-PR nach main — auf ihrem eigenen Ref findet nie ein Merge-Event statt, also räumt
#   sie niemand ab. Am 2026-08-01 lagen so 24 PR-lose Branches auf origin.
#
# Löschkriterium — ALLE vier Bedingungen müssen gelten:
#   1. Branch trägt die Ticket-ID im Namen (case-insensitiv)
#   2. kein offener PR auf dem Branch
#   3. Ticket-Status in (done, archived)
#   4. JEDE Blob-Abweichung zu <remote>/main matcht die ALLOWLIST unten
#
#   Beide Signale sind nötig. An den 20 real gereapten Branches gemessen: "Blob-Diff muss leer
#   sein" hätte 1 von 20 erfasst (wirkungslos), "Ticket done genügt" hätte auch die einzige
#   Kopie eines nie gemergten Deliverables gelöscht (T002431).
#
# Ausgabe (der Vertrag, auf den tests/spec/ci-cd/branch-reaper.bats zugreift):
#   REAP <branch>            — Kandidat, wird ohne --dry-run gelöscht
#   KEEP <branch> — <grund>  — verschont, mit Begründung
#
# Sicherheitsnetz:
#   Vor jedem Delete wird der Branch-SHA als refs/tags/reaped/<branch> gepusht. Schlägt der
#   Tag-Push fehl, wird NICHT gelöscht — das Netz ist Vorbedingung, nicht Beiwerk.
#
# Environment:
#   TICKET_SH — Pfad zum ticket.sh-Aufruf (Default: <repo>/scripts/ticket.sh). Existiert für
#               die Testbarkeit: der BATS-Test hängt hier einen Stub ein, statt einen Cluster
#               zu brauchen.
#   BRAND, TICKET_CTX — an ticket.sh durchgereicht.
#
# Exit: 0 im Normalfall (auch wenn nichts zu tun war), 2 bei Argumentfehlern.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$HERE/.." && pwd)"

# Pfade, deren Abweichung von main folgenlos ist: Plan-Artefakte, die nie einzeln nach main
# wandern, und generierte Dateien, die auf main ohnehin fortgeschrieben werden.
ALLOWLIST=(
  'openspec/changes/*'
  'docs/code-quality/*'
  'website/src/data/*'
  '.release-please-manifest.json'
  'website/CHANGELOG.md'
  'website/package.json'
)

TICKET_ID=""
DRY_RUN=0
SWEEP=0
REMOTE="origin"
TARGET_REPO="$PWD"

usage() {
  echo "Usage: branch-reaper.sh [--ticket T######] [--dry-run] [--sweep] [--remote <name>] [--repo <pfad>]" >&2
  echo "  --ticket T######   Einzel-Ticket-Lauf (Post-Merge-Pfad)" >&2
  echo "  --dry-run          Nur anzeigen, nichts loeschen. Ohne --ticket: ticketloser Inspektionsblick ueber ALLE Remote-Branches." >&2
  echo "  --sweep            Loeschender Sweep ueber ALLE Remote-Branches (braucht KEIN --ticket)" >&2
}

while [[ $# -gt 0 ]]; do case "$1" in
  --ticket)  TICKET_ID="${2:-}"; shift 2 ;;
  --dry-run) DRY_RUN=1; shift ;;
  --sweep)   SWEEP=1; shift ;;
  --remote)  REMOTE="${2:-}"; shift 2 ;;
  --repo)    TARGET_REPO="${2:-}"; shift 2 ;;
  -h|--help) usage; exit 0 ;;
  *) echo "FEHLER: unbekanntes Argument '$1'" >&2; usage; exit 2 ;;
esac; done

# --ticket + --sweep schliessen sich aus: der Einzel-Ticket-Lauf und der
# Batch-Sweep haben unterschiedliche Auswahl-Logiken und einen gegenlaeufigen
# Ticket-ID-Vertrag (einmal vom Aufrufer, einmal aus dem Branch-Namen).
if [ -n "$TICKET_ID" ] && [ "$SWEEP" -eq 1 ]; then
  echo "FEHLER: --ticket und --sweep schliessen sich gegenseitig aus." >&2
  exit 2
fi

# Format-Guard: Die ID landet weiter unten in Vergleichen und in einem Ref-Namen. Eine
# malformed ID würde dort als Zeichenklasse wirken und könnte nicht gemeinte Branches
# treffen — dasselbe Muster, das devflow-post-merge-deploy.sh absichert.
# Der ticketlose Fall ist nur lesend (--dry-run) oder explizit als Sweep erlaubt — beides
# schreibt keinen Archiv-Tag, es entsteht keine falsche Zuordnung.
case "$TICKET_ID" in
  T[0-9][0-9][0-9][0-9][0-9][0-9]) : ;;
  "") if [ "$DRY_RUN" -eq 1 ] || [ "$SWEEP" -eq 1 ]; then
        :  # ticketloser Inspektionsblick oder Sweep — erlaubt
      else
        echo "FEHLER: --ticket ist erforderlich (Format T######)" >&2; usage; exit 2
      fi ;;
  *)  echo "FEHLER: ungueltiges Ticket-ID-Format '$TICKET_ID' (erwartet T######)" >&2; exit 2 ;;
esac

TICKET_SH="${TICKET_SH:-$REPO_DIR/scripts/ticket.sh}"

cd "$TARGET_REPO" || { echo "FEHLER: --repo '$TARGET_REPO' nicht betretbar" >&2; exit 2; }

# Der aktuell ausgecheckte Branch ist ausgenommen: nach einem Merge ist das main, aber bei
# manuellem Aufruf aus einem Worktree wäre es der eigene Arbeitsbranch.
CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")"

git fetch --quiet "$REMOTE" 2>/dev/null || true

# Trifft der Pfad eines der ALLOWLIST-Muster?
_allowed() {
  local f="$1" pattern
  for pattern in "${ALLOWLIST[@]}"; do
    # shellcheck disable=SC2053 — Glob-Vergleich ist hier beabsichtigt.
    [[ "$f" == $pattern ]] && return 0
  done
  return 1
}

# Alle Dateien, die sich per Blob-Hash von <remote>/main unterscheiden.
#
# Bewusst hash-basiert: `git diff <commit> -- <pfad>` vergleicht gegen den Arbeitsbaum und
# verwechselt einen git-Fehler mit einer Inhaltsänderung (T002519). Ein Three-Dot-Diff wäre
# ebenso falsch, weil er gegen den Abzweigpunkt misst, der sich beim Squash-Merge nicht
# verschiebt.
_diverging_files() {
  local ref="$1" mb f a b
  mb="$(git merge-base "$REMOTE/main" "$ref" 2>/dev/null)" || return 0
  while IFS= read -r f; do
    [ -z "$f" ] && continue
    a="$(git rev-parse "$ref:$f" 2>/dev/null || echo MISSING)"
    b="$(git rev-parse "$REMOTE/main:$f" 2>/dev/null || echo ABSENT)"
    [ "$a" = "$b" ] || printf '%s\n' "$f"
  done < <(git diff --name-only "$mb" "$ref" 2>/dev/null)
}

# Kandidaten: Remote-Branches. Im Einzel-Ticket-Modus nur die, deren Name die Ticket-ID
# trägt (case-insensitiv). Im Sweep-Modus alle — die Ticket-ID wird je Branch aus dem
# Branch-Namen extrahiert.
mapfile -t CANDIDATES < <(
  if [ -n "$TICKET_ID" ]; then
    git ls-remote --heads "$REMOTE" 2>/dev/null \
      | awk '{print $2}' \
      | sed 's|^refs/heads/||' \
      | grep -i -- "$TICKET_ID" \
      || true
  else
    git ls-remote --heads "$REMOTE" 2>/dev/null \
      | awk '{print $2}' \
      | sed 's|^refs/heads/||' \
      || true
  fi
)

if [ "${#CANDIDATES[@]}" -eq 0 ]; then
  if [ -n "$TICKET_ID" ]; then
    echo "Keine Remote-Branches mit Ticket-ID $TICKET_ID gefunden."
  else
    echo "Keine Remote-Branches gefunden."
  fi
  exit 0
fi

REAP_LIST=()

for branch in "${CANDIDATES[@]}"; do
  [ -z "$branch" ] && continue
  if [ "$branch" = "main" ] || [ "$branch" = "$CURRENT_BRANCH" ]; then
    echo "KEEP $branch — aktueller Branch oder main"
    continue
  fi

  # Im Sweep-Modus die Ticket-ID je Branch aus dem Branch-Namen ziehen. Trägt der
  # Branch keine T######-ID im Namen: KEEP — nicht prüfbar, also verschonen.
  branch_ticket_id="$TICKET_ID"
  if [ -z "$branch_ticket_id" ]; then
    branch_ticket_id="$(printf '%s' "$branch" | grep -o 'T[0-9]\{6\}' | head -1 || true)"
    if [ -z "$branch_ticket_id" ]; then
      echo "KEEP $branch — keine Ticket-ID im Branch-Namen erkennbar"
      continue
    fi
  fi

  # (2) offener PR? Exit-Code auswerten, nicht die leere Ausgabe: ein API-Ausfall sieht
  # sonst aus wie "kein PR" und würde einen Branch faelschlich freigeben.
  if ! pr_json="$(gh pr list --head "$branch" --state open --json number 2>&1)"; then
    echo "KEEP $branch — gh-Abfrage fehlgeschlagen: $(printf '%s' "$pr_json" | head -1)"
    continue
  fi
  if printf '%s' "$pr_json" | grep -q '"number"'; then
    echo "KEEP $branch — offener pull request"
    continue
  fi

  # (3) Ticket-Status
  ticket_json="$(bash "$TICKET_SH" get --id "$branch_ticket_id" 2>/dev/null || echo '{}')"
  status="$(printf '%s' "$ticket_json" \
    | grep -o '"status"[[:space:]]*:[[:space:]]*"[^"]*"' \
    | head -1 | sed 's/.*:[[:space:]]*"//; s/"$//')"
  case "$status" in
    done|archived) : ;;
    "") echo "KEEP $branch — Ticket-Status nicht ermittelbar"; continue ;;
    *)  echo "KEEP $branch — Ticket-Status ist $status"; continue ;;
  esac

  # (4) Blob-Abweichungen gegen die Allowlist
  blocked=""
  while IFS= read -r f; do
    [ -z "$f" ] && continue
    _allowed "$f" || { blocked="$f"; break; }
  done < <(_diverging_files "$REMOTE/$branch")

  if [ -n "$blocked" ]; then
    echo "KEEP $branch — abweichende Datei ausserhalb der Allowlist: $blocked"
    continue
  fi

  echo "REAP $branch"
  REAP_LIST+=("$branch")
done

if [ "${#REAP_LIST[@]}" -eq 0 ]; then
  echo "Nichts zu loeschen."
  exit 0
fi

if [ "$DRY_RUN" -eq 1 ]; then
  echo "Dry-Run — ${#REAP_LIST[@]} Branch(es) waeren geloescht worden."
  exit 0
fi

for branch in "${REAP_LIST[@]}"; do
  sha="$(git rev-parse "$REMOTE/$branch" 2>/dev/null || echo "")"
  if [ -z "$sha" ]; then
    echo "KEEP $branch — SHA nicht aufloesbar, kein Delete ohne Archiv-Tag"
    continue
  fi
  if ! git push "$REMOTE" "$sha:refs/tags/reaped/$branch" 2>/dev/null; then
    echo "KEEP $branch — Archiv-Tag konnte nicht gepusht werden, kein Delete"
    continue
  fi
  if git push "$REMOTE" --delete "$branch" 2>/dev/null; then
    echo "DELETED $branch (archiviert als refs/tags/reaped/$branch)"
  else
    echo "KEEP $branch — Delete fehlgeschlagen (Archiv-Tag liegt bereits vor)"
  fi
done

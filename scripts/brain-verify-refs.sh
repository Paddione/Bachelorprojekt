#!/usr/bin/env bash
# brain-verify-refs.sh — Dangling-Referenz-Check für Brain-Wiki-Seiten (T900403).
#
# Report-only: Exit ist immer 0. Prüft Datei-Pfad-Referenzen im Seiten-Text
# gegen das Repo (existiert die Datei?) und optional Ticket-IDs gegen die
# Ticket-DB. Eigene source::-Provenienz, Wikilinks ([[...]]) und URLs werden
# nicht geprüft (Prune/Audit bzw. lint-wikilinks.sh sind dafür zuständig).
#
# Usage: brain-verify-refs.sh --brain-repo <path> [--root <dir>]
#          [--slugs <csv> | --all | --branch-diff [<base>]] [--check-tickets]
# Default-Scope: --branch-diff origin/main (genau die Seiten des aktiven Laufs).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_ROOT="$(cd "$HERE/.." && pwd)"
TICKET_SCRIPT="$DEFAULT_ROOT/scripts/ticket.sh"

BRAIN_REPO=""
ROOT="$DEFAULT_ROOT"
SLUGS=""
DO_ALL=0
BRANCH_DIFF=0
DIFF_BASE="origin/main"
CHECK_TICKETS=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --brain-repo) BRAIN_REPO="${2:?--brain-repo requires a path}"; shift ;;
    --root)       ROOT="${2:?--root requires a path}"; shift ;;
    --slugs)      SLUGS="${2:?--slugs requires a value}"; shift ;;
    --all)        DO_ALL=1 ;;
    --branch-diff)
      BRANCH_DIFF=1
      if [[ $# -ge 2 && "${2:0:1}" != "-" ]]; then DIFF_BASE="$2"; shift; fi ;;
    --check-tickets) CHECK_TICKETS=1 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
  shift
done

[ -n "$BRAIN_REPO" ] || { echo "error: --brain-repo required" >&2; exit 2; }
[ -d "$BRAIN_REPO/wiki" ] || { echo "error: no wiki/ dir under --brain-repo: $BRAIN_REPO" >&2; exit 2; }
scopes=0
[ -n "$SLUGS" ] && scopes=$((scopes + 1))
[ "$DO_ALL" -eq 1 ] && scopes=$((scopes + 1))
[ "$BRANCH_DIFF" -eq 1 ] && scopes=$((scopes + 1))
if [ "$scopes" -gt 1 ]; then
  echo "error: --slugs, --all und --branch-diff schließen sich aus" >&2; exit 2
fi
# Default-Scope: Branch-Diff (genau die Seiten des aktiven Laufs).
[ "$scopes" -eq 0 ] && BRANCH_DIFF=1

# Repo-Pfad-Präfixe mit hoher Treffsicherheit (LLM-Seiten zitieren Quellen so).
PREFIXES='scripts|docs|openspec|tests|components|k3d|flux|environments|apps|packages|docker|tools|migrations|templates|design|prod|prod-fleet|dev-local|devmesh|wireguard|openclaw|editor|assets|website'
BACKTICKED_RE="\`((($PREFIXES)/[^\\\`]+))\`"
BARE_RE="(($PREFIXES)/[A-Za-z0-9._~:/?#@!$&()*+,;=%-]+)"
TICKET_RE="T[0-9]{6}"

PAGES=()
if [ -n "$SLUGS" ]; then
  IFS=',' read -ra want <<< "$SLUGS"
  for slug in "${want[@]}"; do
    slug="$(echo "$slug" | tr -d '[:space:]')"
    [ -n "$slug" ] || continue
    if [ -f "$BRAIN_REPO/wiki/$slug.md" ]; then
      PAGES+=("$BRAIN_REPO/wiki/$slug.md")
    else
      echo "WARN: Seite nicht gefunden: wiki/$slug.md" >&2
    fi
  done
elif [ "$DO_ALL" -eq 1 ]; then
  while IFS= read -r page; do
    PAGES+=("$page")
  done < <(find "$BRAIN_REPO/wiki" -maxdepth 1 -name '*.md' | sort)
else
  git -C "$BRAIN_REPO" rev-parse --verify "$DIFF_BASE" >/dev/null 2>&1 \
    || { echo "error: Diff-Basis fehlt: $DIFF_BASE (kein git-Repo oder Basis unbekannt)" >&2; exit 2; }
  while IFS= read -r rel; do
    [ -n "$rel" ] || continue
    [ -f "$BRAIN_REPO/$rel" ] || continue
    PAGES+=("$BRAIN_REPO/$rel")
  done < <(git -C "$BRAIN_REPO" diff --name-only "$DIFF_BASE"...HEAD -- wiki/ 2>/dev/null)
fi

[ "${#PAGES[@]}" -gt 0 ] || { echo "Verify-refs: 0 Seiten im Scope — nichts zu tun."; exit 0; }

clean_ref() {
  local ref="$1"
  # State-Key-Suffixe (path#2, path#moc), Zeilenanker (path:12, path#L12),
  # Kommando-Argumente (kein Repo-Pfad enthält Leerzeichen), Satzzeichen weg.
  ref="$(echo "$ref" | sed -E 's/#(moc|[0-9]+)$//; s/#[Ll][0-9]+$//; s/:[0-9]+$//; s/ .*//; s/^[[:space:]]+//; s/[[:space:]]+$//; s/[.,;:!?)]+$//; s/^[(]+//')"
  printf '%s' "$ref"
}

is_schematic() {
  # Glob-/Platzhalter-Syntax (docs/*, <slug>, a|b, $VAR): schematisch, nie dangling.
  # (Zeichen einzeln quotiert — Backslash-Quoting wäre hier literal, T900403.)
  local ref="$1"
  [[ "$ref" == *"<"* || "$ref" == *">"* || "$ref" == *"*"* || "$ref" == *"?"* ]] && return 0
  [[ "$ref" == *"["* || "$ref" == *"]"* || "$ref" == *"{"* || "$ref" == *"}"* ]] && return 0
  [[ "$ref" == *"|"* || "$ref" == *"$"* ]] && return 0
  # MCP-Methoden-Vokabular (tools/list, tools/call): Protokoll, keine Pfade.
  [[ "$ref" =~ ^tools/[A-Za-z0-9_-]+$ ]] && return 0
  return 1
}

declare -A SEEN_TICKETS=()
TICKETS_OFFLINE=0
PAGES_N=0
REFS_N=0
DANGLING_N=0
TICKETS_N=0
DTICKETS_N=0

for page in "${PAGES[@]}"; do
  slug="$(basename "$page" .md)"
  PAGES_N=$((PAGES_N + 1))
  lineno=0
  while IFS= read -r line || [ -n "$line" ]; do
    lineno=$((lineno + 1))
    # Eigene Provenienz und Wikilinks gehören anderen Prüfungen.
    [[ "$line" == "source:: "* ]] && continue
    work="$(echo "$line" | sed -E 's/\[\[[^]]*\]\]//g')"
    # URLs enthalten oft zufällig Repo-Präfixe (docs/...) — ganze Zeile auslassen.
    [[ "$work" == *"://"* ]] && continue
    if [[ "$work" == *"/"* ]]; then
      while IFS= read -r raw; do
        [ -n "$raw" ] || continue
        ref="$(clean_ref "${raw:1:-1}")"
        [ -n "$ref" ] || continue
        is_schematic "$ref" && continue
        REFS_N=$((REFS_N + 1))
        [ -e "$ROOT/$ref" ] || {
          echo "DANGLING-REF: wiki/$slug.md:$lineno: $ref"
          DANGLING_N=$((DANGLING_N + 1))
        }
      done < <(echo "$work" | grep -oE "$BACKTICKED_RE" || true)
      nobt="$(echo "$work" | sed -E 's/`[^`]*`//g')"
      if [[ "$nobt" == *"/"* ]]; then
        while IFS= read -r raw; do
          [ -n "$raw" ] || continue
          ref="$(clean_ref "$raw")"
          [ -n "$ref" ] || continue
          is_schematic "$ref" && continue
          # Kahl (ohne Backticks) sind extensionslose Nicht-Verzeichnisse fast
          # immer Prosa (tools/list, k3d/k3s) — nur mit Extension oder
          # Trailing-Slash prüfen. Backticked gilt als bewusstes Zitat.
          if [[ "$ref" != *"."* && "$ref" != */ ]]; then continue; fi
          REFS_N=$((REFS_N + 1))
          [ -e "$ROOT/$ref" ] || {
            echo "DANGLING-REF: wiki/$slug.md:$lineno: $ref"
            DANGLING_N=$((DANGLING_N + 1))
          }
        done < <(echo "$nobt" | grep -oE "$BARE_RE" || true)
      fi
    fi
    if [ "$CHECK_TICKETS" -eq 1 ] && [ "$TICKETS_OFFLINE" -eq 0 ] \
        && [[ "$work" =~ T[0-9]{6} ]]; then
      while IFS= read -r tid; do
        [ -n "$tid" ] || continue
        [ -n "${SEEN_TICKETS[$tid]:-}" ] && continue
        SEEN_TICKETS[$tid]=1
        TICKETS_N=$((TICKETS_N + 1))
        set +e
        bash "$TICKET_SCRIPT" get --id "$tid" >/dev/null 2>&1
        rc=$?
        set -e
        case "$rc" in
          0) ;;
          4) echo "DANGLING-TICKET: wiki/$slug.md:$lineno: $tid"; DTICKETS_N=$((DTICKETS_N + 1)) ;;
          9) echo "WARN: Ticket-DB offline — restliche Ticket-IDs übersprungen" >&2; TICKETS_OFFLINE=1 ;;
          *) echo "WARN: ticket.sh get scheiterte für $tid (rc=$rc) — übersprungen" >&2 ;;
        esac
      done < <(echo "$work" | grep -oE "$TICKET_RE" || true)
    fi
  done < "$page"
done

echo "Verify-refs: $PAGES_N Seiten, $REFS_N Pfad-Referenzen, $DANGLING_N dangling, $TICKETS_N Tickets geprüft, $DTICKETS_N dangling"
exit 0

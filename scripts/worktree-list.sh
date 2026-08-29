#!/usr/bin/env bash
# scripts/worktree-list.sh — welche Worktrees existieren gerade?
#
# Die gemeinsame Abfrage für alle Harnesses (Claude Code, codex, opencode, agy).
# Der ORT ist konventionell (`.worktrees/<slug>`, siehe scripts/worktree-create.sh
# und .opencode/worktree.jsonc); die AKTUELLE LISTE ist es nicht — sie steht in
# der git-Registrierung. Harnesses sollen den Ort deshalb nicht konfiguriert
# bekommen, sondern ihn erfragen.
#
# Zwei Mengen, weil es zwei Orte gibt, an denen gearbeitet wird:
#   lokal    — die Worktrees dieser Maschine (interaktive Sessions)
#   factory  — der Repo-Clone auf der PVC des factory-runner-Pods (T016422),
#              unbeaufsichtigte Läufe auf fleet
# Die verbindende Klammer ist der Branch, nicht der Pfad: agent-lock.sh sperrt
# Branches, und beide Seiten lesen dieselben Lock-Dateien.
#
# Usage:
#   scripts/worktree-list.sh [--json] [--all]
#
#   --json  maschinenlesbar (für Hooks, Factory, Statuszeilen)
#   --all   zusätzlich die Factory-Worktrees per `kubectl exec`. Ohne
#           Cluster-Zugang ist das ein Hinweis, kein Fehler — die lokale Menge
#           ist auch dann eine gültige Antwort.
#
# Exit-Codes: 0 = Liste ausgegeben · 2 = Aufruf-/Umgebungsfehler (kein Git-Repo)
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/worktree-set.sh
. "$SCRIPT_DIR/lib/worktree-set.sh"

# Der Factory-Runner: SSOT für diese Werte ist k3d/dev-stack/factory-runner.yaml
# (Deployment + PVC) bzw. environments/dev-cluster.yaml (Namespace/Kontext).
FACTORY_CTX="${FACTORY_CTX:-fleet}"
FACTORY_NS="${FACTORY_NS:-workspace-dev}"
FACTORY_DEPLOY="${FACTORY_DEPLOY:-deploy/factory-runner}"
FACTORY_REPO="${FACTORY_REPO:-/workspace}"

JSON=0
ALL=0
while [ $# -gt 0 ]; do
  case "$1" in
    --json) JSON=1 ;;
    --all)  ALL=1 ;;
    -h|--help)
      sed -n '2,25p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) echo "worktree-list.sh: unbekannte Option: $1" >&2; exit 2 ;;
  esac
  shift
done

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || {
  echo "worktree-list.sh: kein Git-Repository — keine Worktree-Menge ableitbar" >&2
  exit 2
}

# Claim-Status kommt von agent-lock.sh, nicht aus einer eigenen Lock-Auswertung:
# ob ein Lock noch lebt, entscheidet dort `_reapable` (Heartbeat-TTL, SID- und
# PID-Liveness). Eine Kopie dieser Logik hier würde irgendwann anders urteilen
# als der Guard, der tatsächlich blockiert.
_claim_state() {  # <worktree-pfad>
  local wt="$1" out
  out="$(bash "$SCRIPT_DIR/agent-lock.sh" check-worktree-live "$wt" 2>/dev/null)"
  case "$out" in
    live) echo "live" ;;
    free) echo "free" ;;
    *)    echo "?" ;;
  esac
}

_json_escape() { printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'; }

# ── Factory-Menge ───────────────────────────────────────────────────────────
# Setzt FACTORY_ROWS (TSV wie worktree_set_rows) und FACTORY_NOTE (Grund, wenn
# die Menge nicht erhoben werden konnte). Beides leer = erhoben und leer.
FACTORY_ROWS=""
FACTORY_NOTE=""
_collect_factory() {
  if ! command -v kubectl >/dev/null 2>&1; then
    FACTORY_NOTE="kubectl nicht installiert"
    return 0
  fi
  local out
  out="$(kubectl --context "$FACTORY_CTX" -n "$FACTORY_NS" exec "$FACTORY_DEPLOY" -- \
          git -C "$FACTORY_REPO" worktree list --porcelain 2>/dev/null)" || {
    FACTORY_NOTE="Pod nicht erreichbar (ctx=$FACTORY_CTX ns=$FACTORY_NS $FACTORY_DEPLOY)"
    return 0
  }
  [ -n "$out" ] || { FACTORY_NOTE="leere Antwort aus dem Pod"; return 0; }

  local path="" head="" branch="" line
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      worktree\ *) path="${line#worktree }"; head=""; branch="" ;;
      HEAD\ *)     head="${line#HEAD }" ;;
      branch\ *)   branch="${line#branch }"; branch="${branch#refs/heads/}" ;;
      detached)    branch="(detached)" ;;
      "")
        [ -n "$path" ] && FACTORY_ROWS+="$path	$branch	$head"$'\n'
        path=""; head=""; branch=""
        ;;
    esac
  done <<< "$out"
  [ -n "$path" ] && FACTORY_ROWS+="$path	$branch	$head"$'\n'
  return 0
}

[ "$ALL" -eq 1 ] && _collect_factory

# ── Ausgabe ─────────────────────────────────────────────────────────────────
if [ "$JSON" -eq 1 ]; then
  printf '{\n  "local": [\n'
  first=1
  while IFS=$'\t' read -r path branch head; do
    [ -n "$path" ] || continue
    [ "$first" -eq 1 ] || printf ',\n'
    first=0
    printf '    {"path": "%s", "branch": "%s", "head": "%s", "claim": "%s"}' \
      "$(_json_escape "$path")" "$(_json_escape "$branch")" \
      "$(_json_escape "$head")" "$(_claim_state "$path")"
  done < <(worktree_set_rows "$REPO_ROOT")
  [ "$first" -eq 0 ] && printf '\n'
  printf '  ],\n'

  if [ "$ALL" -eq 1 ]; then
    printf '  "factory": [\n'
    first=1
    while IFS=$'\t' read -r path branch head; do
      [ -n "$path" ] || continue
      [ "$first" -eq 1 ] || printf ',\n'
      first=0
      printf '    {"path": "%s", "branch": "%s", "head": "%s"}' \
        "$(_json_escape "$path")" "$(_json_escape "$branch")" "$(_json_escape "$head")"
    done <<< "$FACTORY_ROWS"
    [ "$first" -eq 0 ] && printf '\n'
    printf '  ],\n  "factory_note": "%s"\n' "$(_json_escape "$FACTORY_NOTE")"
  else
    printf '  "factory": null,\n  "factory_note": "nicht abgefragt (--all)"\n'
  fi
  printf '}\n'
  exit 0
fi

printf '%-52s %-38s %s\n' PFAD BRANCH CLAIM
while IFS=$'\t' read -r path branch head; do
  [ -n "$path" ] || continue
  printf '%-52s %-38s %s\n' "$path" "${branch:-(kein branch)}" "$(_claim_state "$path")"
done < <(worktree_set_rows "$REPO_ROOT")

if [ "$ALL" -eq 1 ]; then
  echo ""
  echo "--- factory-runner ($FACTORY_NS auf $FACTORY_CTX) ---"
  if [ -n "$FACTORY_NOTE" ]; then
    echo "  (nicht erhoben: $FACTORY_NOTE)"
  elif [ -z "$FACTORY_ROWS" ]; then
    echo "  (keine Worktrees im Pod)"
  else
    while IFS=$'\t' read -r path branch head; do
      [ -n "$path" ] || continue
      printf '  %-50s %s\n' "$path" "${branch:-(kein branch)}"
    done <<< "$FACTORY_ROWS"
  fi
fi

echo ""
echo "Wer hält was: bash scripts/agent-lock.sh list  ·  Prozesse: … activity"
exit 0

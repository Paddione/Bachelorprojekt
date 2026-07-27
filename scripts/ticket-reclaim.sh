#!/usr/bin/env bash
# scripts/ticket-reclaim.sh — hand a factory-held ticket back to this session.
#   bash scripts/ticket.sh reclaim <T000123> [--force]
#
# Zweck (T002267): ein gestagtes Ticket soll in der Factory-Queue sichtbar
# bleiben, aber jederzeit interaktiv uebernehmbar sein. Ohne dieses Kommando
# blieb nur der Umweg ueber status=blocked — semantisch falsch, weil der Plan
# fertig ist und nichts blockiert; er verfaelscht ausserdem die Auswertung.
#
# Ablauf:
#   1. Worker-Liveness bestimmen: in_progress MIT pipeline_slot UND updated_at
#      juenger als die Stale-Schwelle. Dieselbe Semantik wie
#      scripts/factory/watchdog.sh (FACTORY_STALE_MIN, Default 30) — beide
#      Urteile ueber "Worker lebt" muessen uebereinstimmen.
#   2. Lebt ein Worker und fehlt --force: abbrechen, nichts veraendern.
#   3. Sonst: Slot freigeben, Status auf plan_staged, Ticket fuer diese Session
#      claimen. Der T000510-Guard in scripts/factory/factory-prep-*.sh laesst das
#      Ticket danach in Ruhe, weil agent-lock check `held` meldet.
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STALE_MIN="${FACTORY_STALE_MIN:-30}"

ID=""; FORCE=0
while [ $# -gt 0 ]; do
  case "$1" in
    --force) FORCE=1; shift;;
    --id) ID="$2"; shift 2;;
    -h|--help)
      echo "usage: ticket.sh reclaim <T000123> [--force]"
      echo "  Gibt den pipeline_slot frei, setzt status=plan_staged und claimt das"
      echo "  Ticket fuer diese Session. Bricht ab, wenn noch ein Worker laeuft."
      exit 0;;
    -*) echo "reclaim: unbekannte Option: $1" >&2; exit 2;;
    *) [ -z "$ID" ] && ID="$1"; shift;;
  esac
done

if [ -z "$ID" ]; then
  echo "reclaim: Ticket-ID fehlt — usage: ticket.sh reclaim <T000123> [--force]" >&2
  exit 2
fi

TICKET_JSON="$(bash "$HERE/ticket.sh" get --id "$ID" 2>/dev/null || echo '{}')"
STATUS="$(echo "$TICKET_JSON"  | jq -r '.status // empty')"
SLOT="$(echo "$TICKET_JSON"    | jq -r '.pipeline_slot // empty')"
UPDATED="$(echo "$TICKET_JSON" | jq -r '.updated_at // empty')"

if [ -z "$STATUS" ]; then
  echo "reclaim: Ticket $ID nicht gefunden (oder ticket.sh get lieferte nichts)." >&2
  exit 1
fi

# Alter des letzten Fortschritts in Minuten. updated_at wird von fn_lifecycle_ts
# bei jedem Row-Write gebumpt; pipeline.js schreibt an jeder Phasengrenze ein
# `ticket.sh touch`, eine gesunde lange Phase gilt also nicht als tot.
AGE_MIN=""
if [ -n "$UPDATED" ]; then
  UPD_EPOCH="$(date -d "$UPDATED" +%s 2>/dev/null || echo "")"
  [ -n "$UPD_EPOCH" ] && AGE_MIN=$(( ( $(date +%s) - UPD_EPOCH ) / 60 ))
fi

WORKER_ALIVE=0
if [ "$STATUS" = "in_progress" ] && [ -n "$SLOT" ] && [ "$SLOT" != "null" ]; then
  if [ -n "$AGE_MIN" ] && [ "$AGE_MIN" -lt "$STALE_MIN" ]; then
    WORKER_ALIVE=1
  fi
fi

if [ "$WORKER_ALIVE" -eq 1 ] && [ "$FORCE" -eq 0 ]; then
  {
    echo "reclaim: $ID wird noch bearbeitet — nichts veraendert."
    echo "  status:        $STATUS"
    echo "  pipeline_slot: $SLOT"
    echo "  letzter Fortschritt vor ${AGE_MIN} min (Schwelle: ${STALE_MIN} min)"
    echo ""
    echo "  Ein laufender Worker arbeitet moeglicherweise auf demselben Branch."
    echo "  Uebernahme erzwingen: bash scripts/ticket.sh reclaim $ID --force"
  } >&2
  exit 1
fi

if [ -n "$SLOT" ] && [ "$SLOT" != "null" ]; then
  echo "reclaim: gebe pipeline_slot $SLOT frei"
  bash "$HERE/ticket.sh" release-slot --id "$ID" >/dev/null 2>&1 \
    || echo "reclaim: WARNUNG — release-slot fehlgeschlagen (fahre fort)" >&2
fi

echo "reclaim: setze $ID auf plan_staged"
bash "$HERE/vda.sh" ticket update-status --id "$ID" --status plan_staged >/dev/null 2>&1 \
  || bash "$HERE/ticket.sh" update-status --id "$ID" --status plan_staged >/dev/null 2>&1 \
  || { echo "reclaim: FEHLER — Statuswechsel auf plan_staged fehlgeschlagen." >&2; exit 1; }

BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")"
if bash "$HERE/agent-lock.sh" claim ticket "$ID" \
     ${BRANCH:+--branch "$BRANCH"} --worktree "$PWD" --label dev-flow-execute; then
  echo "reclaim: $ID geclaimt — die Factory ueberspringt es jetzt (agent-lock: held)."
else
  echo "reclaim: WARNUNG — agent-lock claim fehlgeschlagen; die Factory koennte $ID erneut greifen." >&2
  exit 1
fi

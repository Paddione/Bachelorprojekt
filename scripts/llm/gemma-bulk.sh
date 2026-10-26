#!/usr/bin/env bash
# scripts/llm/gemma-bulk.sh — GPU-Fenster fuer den Gemma-Bulk-Reindex auf der
# GTX 970 (gpu-metal, einziger GPU-Node im devmesh).
#
# Die 970 hat 4 Time-Slices und ~4 GB VRAM, beides im Dauerbetrieb belegt.
# Fuer den Batch wird qwen35-4b-instruct entladen (groesster VRAM-Verbraucher,
# gibt zugleich einen Slot frei) und danach wiederhergestellt.
#
# WARUM Flux pausieren: devmesh-workspace reconciled alle 10 Min. und setzt
# spec.replicas auf den Manifeststand zurueck — ein langer Reindex wuerde sonst
# mitten im Lauf abgeschaltet. flux-system verwaltet die devmesh-workspace-
# Kustomization selbst und entfernt deren suspend beim naechsten Apply
# (gemessen 2026-10-26) — deshalb beide pausieren, Eltern zuerst.
#
# Gemessen (GTX 970, eine Replika, -np 2): +461 MiB VRAM, GPU 96 % ausgelastet,
# ~38 Docs/s. Mehr Replikas teilen dieselbe GPU — Default bleibt 1.
#
#   gemma-bulk.sh up [replicas]  Flux pausieren, qwen entladen, Bulk starten
#   gemma-bulk.sh down           Bulk stoppen, qwen wiederherstellen, Flux fortsetzen
#   gemma-bulk.sh status         Replikas und Flux-Suspend anzeigen
#
# KUBECTL ueberschreibbar (Tests: Fake-Binary).
set -euo pipefail

KUBECTL=${KUBECTL:-kubectl --context devmesh}
NS=workspace
VICTIM=qwen35-4b-instruct
BULK=gemma-embed-bulk
ANNO=gemma-bulk/restore-replicas

k() { $KUBECTL "$@"; }
suspend() { k -n flux-system patch kustomization "$1" --type merge -p "{\"spec\":{\"suspend\":$2}}"; }

case "${1:-}" in
  up)
    replicas=${2:-1}
    suspend flux-system true
    suspend devmesh-workspace true
    prev=$(k -n "$NS" get deploy "$VICTIM" -o jsonpath='{.spec.replicas}')
    # Zweites up (prev schon 0) laesst die gemerkte Replikazahl stehen.
    if [ "${prev:-0}" != "0" ]; then
      k -n "$NS" annotate --overwrite deploy "$VICTIM" "$ANNO=$prev"
    fi
    k -n "$NS" scale deploy "$VICTIM" --replicas=0
    k -n "$NS" wait --for=delete pod -l "app=$VICTIM" --timeout=180s
    k -n "$NS" scale deploy "$BULK" --replicas="$replicas"
    k -n "$NS" rollout status deploy "$BULK" --timeout=600s
    ;;
  down)
    k -n "$NS" scale deploy "$BULK" --replicas=0
    restore=$(k -n "$NS" get deploy "$VICTIM" -o "jsonpath={.metadata.annotations.gemma-bulk/restore-replicas}")
    k -n "$NS" scale deploy "$VICTIM" --replicas="${restore:-1}"
    k -n "$NS" annotate deploy "$VICTIM" "$ANNO-" >/dev/null 2>&1 || true
    k -n "$NS" rollout status deploy "$VICTIM" --timeout=600s
    suspend devmesh-workspace false
    suspend flux-system false
    ;;
  status)
    k -n "$NS" get deploy "$BULK" "$VICTIM" -o custom-columns=NAME:.metadata.name,REPLICAS:.spec.replicas,READY:.status.readyReplicas
    k -n flux-system get kustomization flux-system devmesh-workspace -o custom-columns=NAME:.metadata.name,SUSPEND:.spec.suspend
    ;;
  *)
    echo "usage: gemma-bulk.sh up [replicas] | down | status" >&2
    exit 2
    ;;
esac

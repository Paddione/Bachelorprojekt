#!/usr/bin/env bash
# scripts/devmesh/status.sh — Knoten, etcd-Mitglieder und juengster etcd-Snapshot im Context devmesh [T900117]
#
# Usage: status.sh
# Umgebung: DEVMESH_CONTEXT (Default devmesh), DEVMESH_SNAPSHOT_MAX_AGE_H (Default 12)
#
# etcd-Mitglieder = Knoten mit Label node-role.kubernetes.io/etcd=true. Snapshot-Alter aus
# .status.creationTime der ETCDSnapshotFile-Ressourcen (k3s >= 1.27).
# Exit 0 gesund, 1 Befund (Knoten nicht Ready, Snapshot fehlt oder zu alt), 2 Vorbedingung fehlt.
set -euo pipefail

CTX="${DEVMESH_CONTEXT:-devmesh}"
MAX_AGE_H="${DEVMESH_SNAPSHOT_MAX_AGE_H:-12}"
FAIL=0

command -v kubectl >/dev/null 2>&1 || { echo "Vorbedingung fehlt: kubectl nicht im PATH" >&2; exit 2; }
K=(kubectl --context "$CTX" --request-timeout=15s)

nodes="$("${K[@]}" get nodes -o jsonpath='{range .items[*]}{.metadata.name}{" "}{.status.conditions[?(@.type=="Ready")].status}{" "}{.metadata.labels.node-role\.kubernetes\.io/etcd}{"\n"}{end}')" \
  || { echo "Vorbedingung fehlt: Context $CTX nicht erreichbar" >&2; exit 2; }
if [[ -z "$nodes" ]]; then echo "FAIL keine Knoten im Context $CTX"; exit 1; fi

total=0; ready=0; etcd_total=0; etcd_ready=0
while read -r name st etcd; do
  if [[ -z "$name" ]]; then continue; fi
  total=$((total + 1))
  if [[ "$st" == True ]]; then ready=$((ready + 1)); else echo "FAIL Knoten $name nicht Ready ($st)"; FAIL=1; fi
  if [[ "$etcd" == true ]]; then
    etcd_total=$((etcd_total + 1))
    if [[ "$st" == True ]]; then etcd_ready=$((etcd_ready + 1)); fi
  fi
done <<<"$nodes"
echo "Knoten: $ready/$total Ready"
echo "etcd-Mitglieder: $etcd_ready/$etcd_total Ready"

snaps="$("${K[@]}" get etcdsnapshotfiles.k3s.cattle.io -o jsonpath='{range .items[*]}{.status.creationTime}{"\n"}{end}')" \
  || { echo "Vorbedingung fehlt: ETCDSnapshotFile-API im Context $CTX nicht lesbar" >&2; exit 2; }
newest="$(printf '%s\n' "$snaps" | grep -E '^[0-9]{4}-' | sort | tail -n1 || true)"
if [[ -z "$newest" ]]; then
  echo "FAIL kein etcd-Snapshot vorhanden"
  FAIL=1
else
  age_s=$(( $(date +%s) - $(date -d "$newest" +%s) ))
  if (( age_s > MAX_AGE_H * 3600 )); then
    echo "FAIL juengster etcd-Snapshot ist $((age_s / 3600))h alt ($newest), Grenze ${MAX_AGE_H}h"
    FAIL=1
  else
    echo "OK   juengster etcd-Snapshot $((age_s / 3600))h alt ($newest)"
  fi
fi
exit "$FAIL"

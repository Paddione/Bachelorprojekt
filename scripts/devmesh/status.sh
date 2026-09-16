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
# GPU-Sicht (T900179): jeder Knoten mit Zahl. "keine GPU" (kein Label, keine Ressource)
# und "Karte markiert, aber nicht angeboten" (Label gpu=true, keine Ressource) sind zwei
# verschiedene Befunde — der zweite bedeutet fehlendes Device-Plugin oder fehlende
# nvidia-Runtime und ist deshalb ein Fehlschlag, kein Hinweis.
gpu_tmpl='{{range .items}}{{.metadata.name}} {{if index .metadata.labels "gpu"}}{{index .metadata.labels "gpu"}}{{else}}-{{end}} {{if index .status.allocatable "nvidia.com/gpu"}}{{index .status.allocatable "nvidia.com/gpu"}}{{else}}-{{end}}{{"\n"}}{{end}}'
gpus="$("${K[@]}" get nodes -o go-template="$gpu_tmpl")" \
  || { echo "Vorbedingung fehlt: Knoten-Kapazitaet im Context $CTX nicht lesbar" >&2; exit 2; }
while read -r gname glabel galloc; do
  if [[ -z "$gname" ]]; then continue; fi
  if [[ "$galloc" =~ ^[0-9]+$ ]] && (( galloc > 0 )); then
    echo "OK   GPU $gname: $galloc"
  elif [[ "$glabel" == true ]]; then
    echo "FAIL GPU $gname: 0 (Label gpu=true, aber keine nvidia.com/gpu-Ressource)"
    FAIL=1
  else
    echo "OK   GPU $gname: 0 (keine GPU)"
  fi
done <<<"$gpus"

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

#!/usr/bin/env bash
# devflow-sandbox.sh — Sandbox-Slot (K8s) pro gestagtem Plan vergeben/freigeben.
#
# Usage: devflow-sandbox.sh {claim|release|status} <slug>
#
# claim:   sucht einen Running sandbox-cpu-Pod ohne Claim, annotiert ihn mit
#          sandbox/claimed-by=<slug> und druckt den Pod-Namen (fail-closed, wenn
#          alle 4 Slots belegt sind — kein Oversubscription).
# release: entfernt den Claim aller Pods, die <slug> halten.
# status:  listet Pods mit Phase und Claim.
#
# Umgebung: DEVFLOW_SANDBOX_NS (Default: workspace). kubectl muss im PATH sein
# und den devmesh-Kontext zeigen (sonst Exit 2, kein FAIL — Umgebungsfehler).
# Exit 0 ok; 1 Nutzung/Konflikt (belegt); 2 Umgebung fehlt.
set -euo pipefail

NS="${DEVFLOW_SANDBOX_NS:-workspace}"
LABEL="app=sandbox-cpu"
ANN="sandbox/claimed-by"

die() { echo "devflow-sandbox: FEHLER: $*" >&2; exit "${2:-1}"; }
need_kubectl() {
  command -v kubectl >/dev/null 2>&1 || { echo "devflow-sandbox: FEHLER: kubectl nicht im PATH" >&2; exit 2; }
  kubectl -n "$NS" get pods -l "$LABEL" -o name >/dev/null 2>&1 \
    || { echo "devflow-sandbox: FEHLER: Cluster/Namespace $NS nicht erreichbar" >&2; exit 2; }
}

# listet: "<pod> <phase> <claim-or-->" (eine Zeile je Pod, sortiert)
list_pods() {
  kubectl -n "$NS" get pods -l "$LABEL" \
    -o jsonpath='{range .items[*]}{.metadata.name} {.status.phase} {.metadata.annotations["sandbox/claimed-by"]}{"\n"}{end}' 2>/dev/null \
    | sort
}

cmd_status() {
  need_kubectl
  printf '%-50s %-10s %s\n' POD PHASE CLAIMED-BY
  # shellcheck disable=SC2162
  list_pods | while read -r pod phase claim; do
    printf '%-50s %-10s %s\n' "$pod" "$phase" "${claim:--}"
  done
}

cmd_claim() {
  local slug="$1"
  need_kubectl
  local pod
  # shellcheck disable=SC2162
  pod="$(list_pods | while read -r p phase claim; do
    if [[ "$phase" == "Running" && -z "$claim" ]]; then echo "$p"; break; fi
  done)"
  if [[ -z "${pod:-}" ]]; then
    echo "devflow-sandbox: FEHLER: kein freier Sandbox-Slot (alle belegt):" >&2
    cmd_status >&2
    exit 1
  fi
  kubectl -n "$NS" annotate pod "$pod" "$ANN=$slug" --overwrite >/dev/null \
    || die "annotate fehlgeschlagen"
  echo "$pod"
}

cmd_release() {
  local slug="$1"
  need_kubectl
  local n=0 p
  # shellcheck disable=SC2162
  while read -r p _phase claim; do
    if [[ "$claim" == "$slug" ]]; then
      kubectl -n "$NS" annotate pod "$p" "$ANN-" >/dev/null \
        || die "release fehlgeschlagen ($p)"
      echo "released: $p"
      n=$((n + 1))
    fi
  done < <(list_pods)
  [[ "$n" -gt 0 ]] || echo "nothing claimed by $slug"
}

case "${1:-}" in
  claim)   [[ $# -eq 2 ]] || { echo "Usage: $0 claim <slug>" >&2; exit 1; }; cmd_claim "$2" ;;
  release) [[ $# -eq 2 ]] || { echo "Usage: $0 release <slug>" >&2; exit 1; }; cmd_release "$2" ;;
  status)  cmd_status ;;
  *) echo "Usage: $0 {claim|release|status} <slug>" >&2; exit 1 ;;
esac

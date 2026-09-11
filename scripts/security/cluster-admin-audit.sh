#!/usr/bin/env bash
set -euo pipefail

# cluster-admin-audit — T900110
# Prueft cluster-admin-Bindings gegen eine Allowlist.
# Usage:
#   cluster-admin-audit.sh --file <json>      # JSON-Datei mit ClusterRoleBindings
#   cluster-admin-audit.sh --context <ctx>    # kubectl gegen Context

FILE_PATH=""
CONTEXT=""

show_help() {
  echo "Usage: $0 --file <json> | --context <ctx>"
  exit 2
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --file) FILE_PATH="$2"; shift 2 ;;
    --context) CONTEXT="$2"; shift 2 ;;
    --help) show_help ;;
    *) show_help ;;
  esac
done

if [[ -z "$FILE_PATH" && -z "$CONTEXT" ]]; then
  show_help
fi

command -v jq >/dev/null 2>&1 || { echo "jq fehlt" >&2; exit 2; }

if [[ -n "$CONTEXT" ]]; then
  JSON="$(kubectl --context "$CONTEXT" get clusterrolebindings -o json)"
elif [[ -n "$FILE_PATH" ]]; then
  if [[ ! -f "$FILE_PATH" ]]; then
    echo "ERROR: File not found: $FILE_PATH" >&2
    exit 2
  fi
  JSON="$(cat "$FILE_PATH")"
fi

# Allowlist: Kind:namespace/name oder Group:name
# Format: Group:system:masters oder ServiceAccount:namespace/name
is_allowlisted() {
  local key="$1"
  local item
  while IFS= read -r item; do
    if [[ "$item" == "$key" ]]; then
      return 0
    fi
  done <<'ALLOWEOF'
Group:system:masters
ServiceAccount:flux-system/kustomize-controller
ServiceAccount:flux-system/helm-controller
ServiceAccount:flux-system/flux-operator
ServiceAccount:kube-system/helm-traefik
ServiceAccount:kube-system/helm-traefik-crd
ServiceAccount:longhorn-system/longhorn-support-bundle
ALLOWEOF
  return 1
}

count=0
violations=()

# Parse cluster-admin bindings with jq
while IFS= read -r binding; do
  binding_name=$(echo "$binding" | jq -r '.metadata.name')

  # Get subjects
  subj_count=$(echo "$binding" | jq '.subjects | length')

  for ((i=0; i<subj_count; i++)); do
    s_kind=$(echo "$binding" | jq -r ".subjects[$i].kind")
    s_name=$(echo "$binding" | jq -r ".subjects[$i].name")
    s_ns=$(echo "$binding" | jq -r ".subjects[$i].namespace // \"\"")

    if [[ "$s_kind" == "Group" ]]; then
      key="Group:${s_name}"
    else
      key="${s_kind}:${s_ns:-default}/${s_name}"
    fi

    if is_allowlisted "$key"; then
      continue
    fi

    violations+=("UNEXPECTED ${binding_name} -> ${key}")
  done

  ((count++)) || true
done <<< "$(echo "$JSON" | jq -c '.items[] | select(.roleRef.name == "cluster-admin")')"

echo "cluster-admin-audit: ${count} cluster-admin binding(s) checked"
for v in "${violations[@]+"${violations[@]}"}"; do
  echo "$v"
done

if [[ ${#violations[@]} -gt 0 ]]; then
  exit 1
fi

exit 0

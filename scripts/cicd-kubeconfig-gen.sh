#!/usr/bin/env bash
# Generate a minimal kubeconfig for the cicd-deploy ServiceAccount.
# Usage: bash scripts/cicd-kubeconfig-gen.sh <context> <namespace>
# Example (mentolder):  bash scripts/cicd-kubeconfig-gen.sh mentolder workspace
# Example (korczewski): bash scripts/cicd-kubeconfig-gen.sh korczewski workspace-korczewski
#
# Uses --minify so clusters[0] always refers to the right cluster,
# regardless of the internal cluster name in the kubeconfig file.
set -euo pipefail

CONTEXT="${1:?Usage: $0 <context> <namespace>}"
NAMESPACE="${2:?Usage: $0 <context> <namespace>}"

SERVER=$(kubectl config view --minify --context "$CONTEXT" \
  -o jsonpath='{.clusters[0].cluster.server}')
CA=$(kubectl config view --minify --context "$CONTEXT" \
  -o jsonpath='{.clusters[0].cluster.certificate-authority-data}')
TOKEN=$(kubectl create token cicd-deploy \
  -n "$NAMESPACE" --context "$CONTEXT" --duration=87600h)

cat <<EOF
apiVersion: v1
kind: Config
clusters:
- name: ${CONTEXT}
  cluster:
    server: ${SERVER}
    certificate-authority-data: ${CA}
contexts:
- name: cicd@${CONTEXT}
  context:
    cluster: ${CONTEXT}
    user: cicd-deploy
    namespace: ${NAMESPACE}
current-context: cicd@${CONTEXT}
users:
- name: cicd-deploy
  user:
    token: ${TOKEN}
EOF

#!/usr/bin/env bash
# Install Longhorn v1.7.2 on the devc cluster.
# The k3s HelmChart CRD approach fails because the helm-install job cannot reach
# charts.longhorn.io due to TLS interception by Traefik inside the cluster.
# Use this script to apply the official Longhorn manifest directly instead.
set -euo pipefail

CTX=${1:-devc}
VERSION=v1.7.2

kubectl --context "$CTX" apply \
  -f "https://raw.githubusercontent.com/longhorn/longhorn/${VERSION}/deploy/longhorn.yaml"

# Wait for Longhorn driver deployer
kubectl --context "$CTX" -n longhorn-system rollout status deploy/longhorn-driver-deployer --timeout=300s

# Make Longhorn the only default StorageClass
kubectl --context "$CTX" patch storageclass local-path \
  -p '{"metadata": {"annotations":{"storageclass.kubernetes.io/is-default-class":"false"}}}'

echo "Longhorn ${VERSION} installed and set as default StorageClass"

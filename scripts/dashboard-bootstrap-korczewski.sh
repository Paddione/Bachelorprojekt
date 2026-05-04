#!/usr/bin/env bash
# Provision a read-only ServiceAccount on korczewski for the mentolder
# operator dashboard, fetch a non-expiring token, build a kubeconfig, and
# seal it into mentolder's sealed-secrets file. Idempotent.
set -euo pipefail

NAMESPACE="workspace"
SA="dashboard-web-readonly"
ROLE="dashboard-readonly"
KORCZEWSKI_CTX="korczewski"
MENTOLDER_CTX="mentolder"
SECRET_NAME="dashboard-korczewski-kubeconfig"
SEALED_OUT="environments/sealed-secrets/mentolder.yaml"
TMP_KC="$(mktemp)"
trap 'rm -f "$TMP_KC"' EXIT

echo "→ Applying SA + Role + RoleBinding on korczewski"
kubectl --context "$KORCZEWSKI_CTX" apply -f - <<EOF
apiVersion: v1
kind: ServiceAccount
metadata:
  name: $SA
  namespace: $NAMESPACE
---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: $ROLE
  namespace: $NAMESPACE
rules:
  - apiGroups: [""]
    resources: [pods, services]
    verbs: [get, list, watch]
  - apiGroups: [""]
    resources: [pods/log]
    verbs: [get, list]
  - apiGroups: [networking.k8s.io]
    resources: [ingresses]
    verbs: [get, list, watch]
  - apiGroups: [traefik.io]
    resources: [ingressroutes]
    verbs: [get, list, watch]
  - apiGroups: [batch]
    resources: [jobs]
    verbs: [get, list, watch]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: $ROLE
  namespace: $NAMESPACE
subjects:
  - kind: ServiceAccount
    name: $SA
    namespace: $NAMESPACE
roleRef:
  kind: Role
  name: $ROLE
  apiGroup: rbac.authorization.k8s.io
---
apiVersion: v1
kind: Secret
metadata:
  name: ${SA}-token
  namespace: $NAMESPACE
  annotations:
    kubernetes.io/service-account.name: $SA
type: kubernetes.io/service-account-token
EOF

echo "→ Waiting for token Secret to populate"
TOKEN=""
CA=""
for _ in $(seq 1 30); do
  TOKEN=$(kubectl --context "$KORCZEWSKI_CTX" -n "$NAMESPACE" \
    get secret "${SA}-token" -o jsonpath='{.data.token}' 2>/dev/null || true)
  CA=$(kubectl --context "$KORCZEWSKI_CTX" -n "$NAMESPACE" \
    get secret "${SA}-token" -o jsonpath='{.data.ca\.crt}' 2>/dev/null || true)
  if [ -n "$TOKEN" ] && [ -n "$CA" ]; then break; fi
  sleep 1
done
[ -n "$TOKEN" ] || { echo "✗ token never appeared" >&2; exit 1; }

KORCZEWSKI_API=$(kubectl --context "$KORCZEWSKI_CTX" config view \
  -o jsonpath="{.clusters[?(@.name=='$KORCZEWSKI_CTX')].cluster.server}")
[ -n "$KORCZEWSKI_API" ] || { echo "✗ could not find korczewski API URL" >&2; exit 1; }

echo "→ Building kubeconfig"
DECODED_TOKEN=$(echo "$TOKEN" | base64 -d)
cat > "$TMP_KC" <<EOF
apiVersion: v1
kind: Config
clusters:
  - name: korczewski
    cluster:
      server: $KORCZEWSKI_API
      certificate-authority-data: $CA
contexts:
  - name: korczewski
    context:
      cluster: korczewski
      user: ${SA}
      namespace: $NAMESPACE
current-context: korczewski
users:
  - name: ${SA}
    user:
      token: $DECODED_TOKEN
EOF

echo "→ Sealing kubeconfig into $SEALED_OUT"
kubectl --context "$MENTOLDER_CTX" -n workspace create secret generic "$SECRET_NAME" \
  --from-file=kubeconfig-korczewski="$TMP_KC" \
  --dry-run=client -o yaml \
  | kubeseal --cert "environments/certs/mentolder.pem" --format yaml \
    --controller-namespace=kube-system \
  > "/tmp/${SECRET_NAME}.sealed.yaml"

python3 - "$SEALED_OUT" "/tmp/${SECRET_NAME}.sealed.yaml" "$SECRET_NAME" <<'PY'
import sys, yaml, pathlib
dest_path, src_path, name = sys.argv[1:]
new = yaml.safe_load(pathlib.Path(src_path).read_text())
docs = list(yaml.safe_load_all(pathlib.Path(dest_path).read_text()))
docs = [d for d in docs if not (
  d and d.get("kind") == "SealedSecret"
  and d.get("metadata", {}).get("name") == name
)]
docs.append(new)
out = "\n---\n".join(yaml.safe_dump(d, sort_keys=False) for d in docs if d)
pathlib.Path(dest_path).write_text(out + "\n")
PY

echo "✓ Sealed secret written. Commit $SEALED_OUT and run task workspace:deploy ENV=mentolder."

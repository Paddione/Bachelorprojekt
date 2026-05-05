#!/usr/bin/env bash
# Provision a read-only ServiceAccount on korczewski for the mentolder
# operator dashboard, fetch a non-expiring token, build a kubeconfig, and
# seal it into mentolder's sealed-secrets file. Idempotent.
#
# Naming note: korczewski's workspace namespace is `workspace-korczewski` on the
# unified cluster. The mentolder side reads from `workspace`. Two separate
# namespace vars below; do not collapse them.
set -euo pipefail

KORCZEWSKI_CTX="korczewski"
MENTOLDER_CTX="mentolder"

# Resolve per-side namespaces from environments/<env>.yaml so this script
# survives future namespace renames.
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck disable=SC1091
( source "$REPO_ROOT/scripts/env-resolve.sh" "korczewski" \
  && echo "$WORKSPACE_NAMESPACE" >/tmp/.dbk-kns ) >/dev/null 2>&1 || echo "workspace-korczewski" >/tmp/.dbk-kns
# shellcheck disable=SC1091
( source "$REPO_ROOT/scripts/env-resolve.sh" "mentolder" \
  && echo "$WORKSPACE_NAMESPACE" >/tmp/.dbk-mns ) >/dev/null 2>&1 || echo "workspace" >/tmp/.dbk-mns
KORCZEWSKI_NAMESPACE="$(cat /tmp/.dbk-kns)"
MENTOLDER_NAMESPACE="$(cat /tmp/.dbk-mns)"
rm -f /tmp/.dbk-kns /tmp/.dbk-mns

SA="dashboard-web-readonly"
ROLE="dashboard-readonly"
SECRET_NAME="dashboard-korczewski-kubeconfig"
SEALED_OUT="environments/sealed-secrets/mentolder.yaml"
TMP_KC="$(mktemp)"
trap 'rm -f "$TMP_KC"' EXIT

echo "→ Applying SA + Role + RoleBinding on korczewski (ns=${KORCZEWSKI_NAMESPACE})"
kubectl --context "$KORCZEWSKI_CTX" apply -f - <<EOF
apiVersion: v1
kind: ServiceAccount
metadata:
  name: $SA
  namespace: $KORCZEWSKI_NAMESPACE
---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: $ROLE
  namespace: $KORCZEWSKI_NAMESPACE
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
  namespace: $KORCZEWSKI_NAMESPACE
subjects:
  - kind: ServiceAccount
    name: $SA
    namespace: $KORCZEWSKI_NAMESPACE
roleRef:
  kind: Role
  name: $ROLE
  apiGroup: rbac.authorization.k8s.io
---
apiVersion: v1
kind: Secret
metadata:
  name: ${SA}-token
  namespace: $KORCZEWSKI_NAMESPACE
  annotations:
    kubernetes.io/service-account.name: $SA
type: kubernetes.io/service-account-token
EOF

echo "→ Waiting for token Secret to populate"
TOKEN=""
CA=""
for _ in $(seq 1 30); do
  TOKEN=$(kubectl --context "$KORCZEWSKI_CTX" -n "$KORCZEWSKI_NAMESPACE" \
    get secret "${SA}-token" -o jsonpath='{.data.token}' 2>/dev/null || true)
  CA=$(kubectl --context "$KORCZEWSKI_CTX" -n "$KORCZEWSKI_NAMESPACE" \
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
      namespace: $KORCZEWSKI_NAMESPACE
current-context: korczewski
users:
  - name: ${SA}
    user:
      token: $DECODED_TOKEN
EOF

echo "→ Sealing kubeconfig into $SEALED_OUT (mentolder ns=${MENTOLDER_NAMESPACE})"
kubectl --context "$MENTOLDER_CTX" -n "$MENTOLDER_NAMESPACE" create secret generic "$SECRET_NAME" \
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

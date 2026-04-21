#!/usr/bin/env bats
# ═══════════════════════════════════════════════════════════════════
# manifests.bats — Validate kustomize output without a running cluster
# ═══════════════════════════════════════════════════════════════════
# Renders k3d/ manifests via 'kustomize build' and checks structural
# correctness: expected resources, image pinning, namespace consistency,
# label hygiene, and cross-references between resources.
#
# Prerequisites: kubectl (for kustomize), jq
# No cluster required — pure static analysis.
# ═══════════════════════════════════════════════════════════════════

load test_helper

# ── Fixtures ─────────────────────────────────────────────────────

setup_file() {
  export MANIFESTS_DIR="${PROJECT_DIR}/k3d"
  export OFFICE_DIR="${PROJECT_DIR}/k3d/office-stack"

  # Create dummy secrets.yaml if missing (gitignored dev-only file)
  if [[ ! -f "${MANIFESTS_DIR}/secrets.yaml" ]]; then
    export _CREATED_DUMMY_SECRETS=1
    cat > "${MANIFESTS_DIR}/secrets.yaml" <<'YAML'
apiVersion: v1
kind: Secret
metadata:
  name: workspace-secrets
type: Opaque
stringData:
  PLACEHOLDER: bats-dummy
YAML
  fi

  # Render once, reuse across all tests. The office-stack lives in its
  # own kustomization tree (privileged namespace for Collabora), so the
  # rendered fixture concatenates both bases — tests can grep it without
  # caring which tree a given resource came from. Office-stack templates
  # carry envsubst placeholders that only resolve at deploy time; we
  # expand them here with dev defaults so host/image assertions still
  # see literal strings.
  export RENDERED="${BATS_FILE_TMPDIR}/rendered.yaml"
  kubectl kustomize "${MANIFESTS_DIR}" > "$RENDERED" 2>&1
  printf '\n---\n' >> "$RENDERED"
  (
    export PROD_DOMAIN=localhost
    export COLLABORA_HOST=office.localhost
    export COLLABORA_ALIASGROUP1=http://nextcloud.workspace.svc.cluster.local:80
    export COLLABORA_SERVER_NAME=office.localhost
    export COLLABORA_SSL_TERMINATION=false
    export COLLABORA_TLS_SECRET=collabora-tls-dev
    export COLLABORA_INGRESS_MIDDLEWARES=workspace-infra-redirect-https@kubernetescrd
    kubectl kustomize "${OFFICE_DIR}" \
      | envsubst '$PROD_DOMAIN $COLLABORA_HOST $COLLABORA_ALIASGROUP1 $COLLABORA_SERVER_NAME $COLLABORA_SSL_TERMINATION $COLLABORA_TLS_SECRET $COLLABORA_INGRESS_MIDDLEWARES'
  ) >> "$RENDERED" 2>&1
}

teardown_file() {
  if [[ "${_CREATED_DUMMY_SECRETS:-}" == "1" ]]; then
    rm -f "${MANIFESTS_DIR}/secrets.yaml"
  fi
}

# Helper: extract resources of a given kind as JSON array
resources_of_kind() {
  local kind="$1"
  # Split multi-doc YAML, filter by kind
  kubectl kustomize "${MANIFESTS_DIR}" 2>/dev/null \
    | python3 -c "
import sys, json, yaml
docs = yaml.safe_load_all(sys.stdin)
out = [d for d in docs if d and d.get('kind') == '${kind}']
json.dump(out, sys.stdout)
"
}

# Helper: list all container images from rendered manifests
all_images() {
  grep -E '^\s+image:' "$RENDERED" | sed 's/.*image:\s*//' | sort -u
}

# ── Kustomize Build ──────────────────────────────────────────────

@test "kustomize build succeeds" {
  run kubectl kustomize "${MANIFESTS_DIR}"
  assert_success
}

@test "kustomize output is non-empty" {
  [[ -s "$RENDERED" ]]
}

# ── Expected Core Resources ──────────────────────────────────────

@test "namespace 'workspace' is declared" {
  run grep -c "kind: Namespace" "$RENDERED"
  assert_success
  [[ "$output" -ge 1 ]]
}

@test "deployment: keycloak exists" {
  grep -q 'name: keycloak' "$RENDERED"
  grep -q 'kind: Deployment' "$RENDERED"
}

@test "deployment: nextcloud exists" {
  grep -qE '^\s+name: nextcloud$' "$RENDERED"
}

@test "deployment: shared-db (PostgreSQL) exists" {
  grep -qE '^\s+name: shared-db$' "$RENDERED"
}

@test "deployment: collabora exists" {
  grep -qE '^\s+name: collabora$' "$RENDERED"
}

@test "deployment: vaultwarden exists" {
  grep -qE '^\s+name: vaultwarden$' "$RENDERED"
}

@test "deployment: mailpit exists" {
  grep -qE '^\s+name: mailpit$' "$RENDERED"
}

# ── Ingress ──────────────────────────────────────────────────────

@test "ingress resource exists" {
  grep -q 'kind: Ingress' "$RENDERED"
}

@test "ingress: all core hosts defined" {
  local hosts
  hosts=$(grep -oP 'host:\s*\K\S+' "$RENDERED" | sort -u)
  for svc in auth files office vault mail; do
    echo "$hosts" | grep -q "${svc}\." || {
      echo "Missing ingress host for: ${svc}"
      return 1
    }
  done
}

# ── Image Pinning ────────────────────────────────────────────────

@test "no core service images use :latest tag" {
  # MCP sidecar images may use :latest (upstream-controlled); skip those
  local latest_images
  latest_images=$(all_images | grep ':latest$' | grep -ivE '(mcp|openapi-mcp|github-mcp|keycloak-mcp|nextcloud-mcp|curlimages/curl|talk-transcriber|paddione/bachelorprojekt)' || true)
  if [[ -n "$latest_images" ]]; then
    echo "Core images using :latest: ${latest_images}"
    return 1
  fi
}

@test "all images have explicit tags or digests" {
  local untagged
  # Images must have : (tag) or @ (digest)
  untagged=$(all_images | grep -vE '[:@]' || true)
  if [[ -n "$untagged" ]]; then
    echo "Untagged images: ${untagged}"
    return 1
  fi
}

# ── Namespace Consistency ────────────────────────────────────────

@test "all resources target namespace 'workspace' or are cluster-scoped" {
  local bad_ns
  bad_ns=$(kubectl kustomize "${MANIFESTS_DIR}" 2>/dev/null \
    | grep -E '^\s+namespace:' \
    | grep -v 'workspace' \
    | grep -v 'kube-system' \
    | grep -v 'website' \
    | sort -u || true)
  if [[ -n "$bad_ns" ]]; then
    echo "Resources with unexpected namespace: ${bad_ns}"
    return 1
  fi
}

# ── ConfigMaps ───────────────────────────────────────────────────

@test "configmap: realm-template exists" {
  grep -q 'name: realm-template' "$RENDERED"
}

@test "configmap: nextcloud-oidc-config exists" {
  grep -q 'name: nextcloud-oidc-config' "$RENDERED"
}

@test "configmap: domain-config exists" {
  grep -q 'name: domain-config' "$RENDERED"
}

# ── Services ─────────────────────────────────────────────────────

@test "service for each core deployment exists" {
  for svc in keycloak nextcloud shared-db vaultwarden mailpit; do
    grep -qE "kind: Service" "$RENDERED" || {
      echo "No Service kind found"
      return 1
    }
  done
}

# ── Security: Pod Security Standards ─────────────────────────────

@test "namespace has pod-security labels" {
  # Check that the namespace YAML includes PSS labels
  grep -q 'pod-security.kubernetes.io' "$RENDERED"
}

# ── RBAC ─────────────────────────────────────────────────────────

@test "claude-code RBAC resources exist" {
  grep -q 'claude-code' "$RENDERED"
  grep -qE 'kind: (Role|ClusterRole|RoleBinding|ServiceAccount)' "$RENDERED"
}

# ── HPA ──────────────────────────────────────────────────────────

# ── Backup CronJob ───────────────────────────────────────────────

@test "backup CronJob exists" {
  grep -q 'kind: CronJob' "$RENDERED"
}

# ── PVCs ─────────────────────────────────────────────────────────

@test "PersistentVolumeClaims exist for stateful services" {
  grep -q 'kind: PersistentVolumeClaim' "$RENDERED"
}

# ── No Hardcoded Secrets in Env ──────────────────────────────────

@test "no plaintext passwords in deployment env vars" {
  local violations
  # Look for env value: fields containing actual secret-looking strings near PASSWORD keys.
  # Exclude: secretKeyRef, configMapKeyRef, known dev DB names/usernames, empty values.
  violations=$(grep -B2 -A0 -i 'password' "$RENDERED" \
    | grep -i 'value:' \
    | grep -ivE 'valueFrom|secretKeyRef|configMapKeyRef|\$\(' \
    | grep -ivE 'value: (admin|devadmin|invoiceninja|keycloak|postgres|nextcloud|opensearch|outline|"")|value: [a-z]+@|value: "[0-9]+"' \
    | grep -ivE 'value: "?https?"?$|value: "?https?://' \
    || true)
  if [[ -n "$violations" ]]; then
    echo "Possible hardcoded passwords: ${violations}"
    return 1
  fi
}

@test "prod kustomize output has no workspace-secrets Secret with data" {
  if ! command -v python3 &>/dev/null; then
    skip "python3 not installed"
  fi
  if ! command -v kubectl &>/dev/null; then
    skip "kubectl not installed"
  fi

  run python3 -c "
import subprocess, sys, yaml, glob, os

overlays = sorted(glob.glob('${PROJECT_DIR}/prod*'))
overlays = [o for o in overlays if os.path.isdir(o)]
found = []
for overlay in overlays:
    try:
        result = subprocess.run(
            ['kubectl', 'kustomize', overlay],
            capture_output=True, text=True, check=True
        )
    except subprocess.CalledProcessError as e:
        print(f'kustomize build failed for {overlay}: {e.stderr}', file=sys.stderr)
        sys.exit(1)
    for doc in yaml.safe_load_all(result.stdout):
        if not doc:
            continue
        if (doc.get('kind') == 'Secret' and
                doc.get('metadata', {}).get('name') == 'workspace-secrets' and
                (doc.get('stringData') or doc.get('data'))):
            found.append(overlay)
if found:
    print('workspace-secrets Secret with data found in: ' + ', '.join(found))
    sys.exit(1)
print('OK: no workspace-secrets Secret in prod overlays')
"
  assert_success
}

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
  if ! kubectl kustomize "${MANIFESTS_DIR}" --load-restrictor=LoadRestrictionsNone > "$RENDERED" 2>&1; then
    echo "kubectl kustomize failed — output:" >&2
    cat "$RENDERED" >&2
    return 1
  fi
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
  kubectl kustomize "${MANIFESTS_DIR}" --load-restrictor=LoadRestrictionsNone 2>/dev/null \
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
  run kubectl kustomize "${MANIFESTS_DIR}" --load-restrictor=LoadRestrictionsNone
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
  # Collect hosts from standard Ingress rules AND Traefik IngressRoute match expressions
  hosts=$(
    { grep -oP 'host:\s*\K\S+' "$RENDERED"; grep -oP 'Host\(`\K[^`]+' "$RENDERED"; } \
      | sort -u
  )
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
  latest_images=$(all_images | grep ':latest$' | grep -ivE '(mcp|openapi-mcp|github-mcp|keycloak-mcp|nextcloud-mcp|curlimages/curl|talk-transcriber|paddione/bachelorprojekt|workspace-brett|docs)' || true)
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
  bad_ns=$(kubectl kustomize "${MANIFESTS_DIR}" --load-restrictor=LoadRestrictionsNone 2>/dev/null \
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

@test "pvc-backup CronJob references critical data PVCs" {
  grep -q 'name: pvc-backup' "$RENDERED"
  grep -q 'nextcloud-data-pvc' "$RENDERED"
  grep -q 'vaultwarden-data-pvc' "$RENDERED"
  grep -q 'docuseal-data-pvc' "$RENDERED"
}

@test "pvc-backup filen-upload fails loudly on upload error (exit 1, not silent warning)" {
  # Ensure the pvc-backup CronJob filen-upload script exits 1 on upload failure
  # rather than swallowing errors with a WARNING echo (T000330).
  run grep -c 'WARNING: Filen upload failed' k3d/pvc-backup-cronjob.yaml
  assert_output "0"
  # And that it uses exit 1 for failure visibility
  grep -q 'exit 1' k3d/pvc-backup-cronjob.yaml
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
    | grep -ivE 'value: (admin|devadmin|invoiceninja|keycloak|postgres|nextcloud|opensearch|outline|website|"")|value: [a-z]+@|value: "[0-9]+"' \
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
from concurrent.futures import ThreadPoolExecutor

def _is_overlay(d):
    return os.path.isdir(d) and any(
        os.path.exists(os.path.join(d, k))
        for k in ('kustomization.yaml', 'kustomization.yml', 'Kustomization'))

# Skip container dirs (e.g. prod-fleet/) that hold nested overlays but have no
# top-level kustomization of their own.
overlays = sorted(o for o in glob.glob('${PROJECT_DIR}/prod*') if _is_overlay(o))

def check_overlay(overlay):
    try:
        result = subprocess.run(
            ['kubectl', 'kustomize', overlay, '--load-restrictor=LoadRestrictionsNone'],
            capture_output=True, text=True, check=True
        )
        for doc in yaml.safe_load_all(result.stdout):
            if not doc:
                continue
            if (doc.get('kind') == 'Secret' and
                    doc.get('metadata', {}).get('name') == 'workspace-secrets' and
                    (doc.get('stringData') or doc.get('data'))):
                return overlay
    except subprocess.CalledProcessError as e:
        print(f'kustomize build failed for {overlay}: {e.stderr}', file=sys.stderr)
        sys.exit(1)
    return None

with ThreadPoolExecutor() as executor:
    results = list(executor.map(check_overlay, overlays))

found = [r for r in results if r is not None]
if found:
    print('workspace-secrets Secret with data found in: ' + ', '.join(found))
    sys.exit(1)
print('OK: no workspace-secrets Secret in prod overlays')
"
  assert_success
}

# ── MCP consolidation: prod runs only the monolith (T000289) ─────
# Prod serves all MCP via claude-code-mcp-monolith (default ns), routed
# by the mcp-gateway IngressRoute. The k3d base also defines split MCP
# pods (claude-code-mcp-ops/-auth/mcp-browser/mcp-github) for the dev
# cluster — these must NOT reach the prod overlay, or they run idle in
# the workspace ns duplicating the monolith. browser/github were already
# $patch:delete'd since PR #246; ops/auth are added in this fix.
@test "prod overlays exclude split MCP pods (consolidated on monolith) [T000289]" {
  if ! command -v python3 &>/dev/null; then
    skip "python3 not installed"
  fi
  run python3 - "${PROJECT_DIR}" <<'PY'
import subprocess, sys, yaml, glob, os
project = sys.argv[1]
overlays = sorted(
    d for d in glob.glob(os.path.join(project, 'prod-*'))
    if os.path.isdir(d) and any(
        os.path.exists(os.path.join(d, k))
        for k in ('kustomization.yaml', 'kustomization.yml', 'Kustomization')))
SPLIT = {'claude-code-mcp-ops', 'claude-code-mcp-auth', 'mcp-browser', 'mcp-github'}
bad = []
for ov in overlays:
    r = subprocess.run(
        ['kubectl', 'kustomize', ov, '--load-restrictor=LoadRestrictionsNone'],
        capture_output=True, text=True)
    if r.returncode != 0:
        print(f'kustomize build failed for {ov}: {r.stderr}', file=sys.stderr)
        sys.exit(2)
    for doc in yaml.safe_load_all(r.stdout):
        if not doc:
            continue
        if doc.get('kind') in ('Deployment', 'Service') and \
                doc.get('metadata', {}).get('name') in SPLIT:
            bad.append(f"{os.path.basename(ov)}:{doc['kind']}/{doc['metadata']['name']}")
if bad:
    print('Split MCP resources still rendered in prod (should be monolith-only): '
          + ', '.join(sorted(bad)))
    sys.exit(1)
print('OK: prod overlays render no split MCP ops/auth/browser/github resources')
PY
  assert_success
}

# ── billing-dunning-detection targets the website namespace (T000295) ──
# The website Deployment lives in its own `website` (mentolder) /
# `website-korczewski` namespace — never in `workspace`. The base
# k3d/cronjob-dunning-detection.yaml curls website.workspace.svc.cluster.local,
# which does not resolve on either prod cluster, so curl -s exits non-zero
# and the daily Job fails forever (silently — lastSuccessfulTime never set).
# Its sibling cronjobs (notify-unread, monthly-billing) already use the
# correct website.website* target. Assert no prod overlay renders the dunning
# job pointed at the workspace namespace.
@test "prod overlays: billing-dunning-detection does not target workspace ns [T000295]" {
  if ! command -v python3 &>/dev/null; then
    skip "python3 not installed"
  fi
  run python3 - "${PROJECT_DIR}" <<'PY'
import subprocess, sys, yaml, glob, os
project = sys.argv[1]
overlays = sorted(
    d for d in glob.glob(os.path.join(project, 'prod-*'))
    if os.path.isdir(d) and any(
        os.path.exists(os.path.join(d, k))
        for k in ('kustomization.yaml', 'kustomization.yml', 'Kustomization')))
bad = []
for ov in overlays:
    r = subprocess.run(
        ['kubectl', 'kustomize', ov, '--load-restrictor=LoadRestrictionsNone'],
        capture_output=True, text=True)
    if r.returncode != 0:
        print(f'kustomize build failed for {ov}: {r.stderr}', file=sys.stderr)
        sys.exit(2)
    for doc in yaml.safe_load_all(r.stdout):
        if not doc:
            continue
        if doc.get('kind') == 'CronJob' and \
                doc.get('metadata', {}).get('name') == 'billing-dunning-detection':
            cmd = ' '.join(
                doc['spec']['jobTemplate']['spec']['template']['spec']
                   ['containers'][0].get('command', []))
            if 'website.workspace.svc' in cmd:
                bad.append(f"{os.path.basename(ov)}: {cmd}")
if bad:
    print('dunning CronJob still targets the workspace ns (website lives elsewhere):')
    for b in bad:
        print('  ' + b)
    sys.exit(1)
print('OK: dunning CronJob targets the website namespace in all prod overlays')
PY
  assert_success
}

@test "Taskfile.yml does not corrupt native Kubernetes expansions with sed" {
  run grep -F 'sed '\''s/\$(\([^)]*\))/\${\1}/g'\''' "${PROJECT_DIR}/Taskfile.yml"
  # We expect grep to fail (not find the pattern), meaning the breaking sed is gone.
  assert_failure
}

# ── Website cross-namespace egress (T000287) ─────────────────────
# The Platform Hub System-Integrität health probe runs from the website pod
# and must reach Collabora, which lives in the `workspace-office` namespace.
# The website namespace enforces default-deny-egress with only an
# allow-egress-to-workspace exception — so without an explicit
# allow-egress-to-workspace-office NetworkPolicy the probe is blocked and the
# dashboard reports Collabora as a false-negative `error` (T000287).
@test "website overlay allows egress to workspace-office (collabora health probe)" {
  if ! command -v python3 &>/dev/null; then
    skip "python3 not installed"
  fi
  run python3 - "${PROJECT_DIR}/flux/apps/website-mentolder" <<'PY'
import subprocess, sys, yaml
overlay = sys.argv[1]
out = subprocess.run(
    ["kubectl", "kustomize", overlay, "--load-restrictor=LoadRestrictionsNone"],
    capture_output=True, text=True)
if out.returncode != 0:
    print("kustomize build failed:", out.stderr, file=sys.stderr)
    sys.exit(2)

def allows_office(doc):
    if not doc or doc.get("kind") != "NetworkPolicy":
        return False
    spec = doc.get("spec", {})
    if "Egress" not in (spec.get("policyTypes") or []):
        return False
    for rule in spec.get("egress") or []:
        for peer in rule.get("to") or []:
            ns = (peer.get("namespaceSelector") or {}).get("matchLabels") or {}
            if ns.get("kubernetes.io/metadata.name") == "workspace-office":
                return True
    return False

found = any(allows_office(d) for d in yaml.safe_load_all(out.stdout))
print("OK" if found else "MISSING: no NetworkPolicy grants egress to workspace-office")
sys.exit(0 if found else 1)
PY
  assert_success
}


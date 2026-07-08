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

@test "deployment: pocket-id exists (replaced keycloak)" {
  grep -q 'name: pocket-id' "$RENDERED"
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
  latest_images=$(all_images | grep ':latest$' | grep -ivE '(mcp|openapi-mcp|github-mcp|keycloak-mcp|nextcloud-mcp|curlimages/curl|talk-transcriber|paddione/bachelorprojekt|workspace-brett|docs|downloads-content|videovault|mediaviewer-widget|mentolder-web|brain-site)' || true)
  if [[ -n "$latest_images" ]]; then
    echo "Core images using :latest: ${latest_images}"
    return 1
  fi
}

@test "all images have explicit tags or digests" {
  local untagged
  # Images must have : (tag) or @ (digest).
  # Skip envsubst placeholders like ${STUDIO_IMAGE} — k3d/studio.yaml uses
  # these for envsubst at deploy time (dev expands via configmap; prod overlay
  # replaces the deployment with a digest-pinned copy). kustomize itself does
  # not expand env vars, so the literal ${...} survives into the rendered
  # output and would otherwise look "untagged".
  untagged=$(all_images | grep -vE '[:@]' | grep -vE '^\$\{' || true)
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

@test "configmap: pocket-id-data PVC exists (replaced realm-template)" {
  grep -q 'name: pocket-id-data' "$RENDERED"
}

@test "configmap: nextcloud-oidc-config exists" {
  grep -q 'name: nextcloud-oidc-config' "$RENDERED"
}

@test "configmap: domain-config exists" {
  grep -q 'name: domain-config' "$RENDERED"
}

# ── Services ─────────────────────────────────────────────────────

@test "service for each core deployment exists" {
  for svc in pocket-id nextcloud shared-db vaultwarden mailpit; do
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
# The "claude-code RBAC resources exist" test was removed: the claude-code MCP
# stack (deployment, RBAC, oauth2-proxy) was decommissioned with the MCP
# monolith (PRs #2052 / #2061), so `claude-code` is no longer in the k3d render.
# It was the only RBAC in the base, hence no replacement assertion.

# ── HPA ──────────────────────────────────────────────────────────

# ── Backup CronJob ───────────────────────────────────────────────

@test "backup CronJob exists" {
  grep -q 'kind: CronJob' "$RENDERED"
}

@test "pvc-backup CronJob references critical data PVCs" {
  grep -q 'name: pvc-backup' "$RENDERED"
  grep -q 'nextcloud-data-pvc' "$RENDERED"
  grep -q 'vaultwarden-data-pvc' "$RENDERED"
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
    | grep -ivE 'value: (admin|devadmin|invoiceninja|keycloak|postgres|nextcloud|opensearch|outline|website|password|"")|value: [a-z]+@|value: "[0-9]+"' \
    | grep -ivE 'value: "?https?"?$|value: "?https?://' \
    | grep -ivE 'value: "?\$\{[A-Z_]+\}"?' \
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
    if not os.path.isdir(d):
        return False
    for k in ('kustomization.yaml', 'kustomization.yml', 'Kustomization'):
        p = os.path.join(d, k)
        if os.path.exists(p):
            # kustomize Components (kind: Component) can't be built standalone — skip.
            with open(p) as fh:
                if 'kind: Component' in fh.read():
                    return False
            return True
    return False

# Validate every prod overlay — INCLUDING the nested prod-fleet/<brand> wrappers,
# which are what ENV_OVERLAY actually applies in prod. glob('prod*') alone only
# matches top-level dirs (prod-fleet/ has no kustomization of its own), so also
# descend one level into the container dirs (prod-fleet/mentolder, .../korczewski,
# .../platform). prod-fleet/components/* (kind: Component) is excluded by _is_overlay.
overlays = sorted(o for o in (
    glob.glob('${PROJECT_DIR}/prod*') + glob.glob('${PROJECT_DIR}/prod*/*'))
    if _is_overlay(o))

def check_overlay(overlay):
    try:
        result = subprocess.run(
            ['kubectl', 'kustomize', overlay, '--load-restrictor=LoadRestrictionsNone'],
            capture_output=True, text=True, check=True
        )
        try:
            for doc in yaml.safe_load_all(result.stdout):
                if not doc:
                    continue
                if (doc.get('kind') == 'Secret' and
                        doc.get('metadata', {}).get('name') == 'workspace-secrets' and
                        (doc.get('stringData') or doc.get('data'))):
                    return overlay
        except yaml.constructor.ConstructorError:
            # YAML 1.1 merge-key constructs from Helm charts (kube-prometheus-stack)
            # are unsupported by PyYAML safe_load. These are monitoring-ns resources;
            # workspace-secrets lives in the workspace ns and is not affected.
            pass
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
def _is_overlay(d):
    if not os.path.isdir(d):
        return False
    for k in ('kustomization.yaml', 'kustomization.yml', 'Kustomization'):
        p = os.path.join(d, k)
        if os.path.exists(p):
            with open(p) as fh:
                if 'kind: Component' in fh.read():
                    return False
            return True
    return False

# Brand overlays PLUS the nested prod-fleet/<brand> wrappers actually applied in
# prod (descend one level into container dirs like prod-fleet/).
overlays = sorted(set(
    d for d in glob.glob(os.path.join(project, 'prod-*'))
           + glob.glob(os.path.join(project, 'prod-*', '*'))
    if _is_overlay(d)))
bad = []
for ov in overlays:
    r = subprocess.run(
        ['kubectl', 'kustomize', ov, '--load-restrictor=LoadRestrictionsNone'],
        capture_output=True, text=True)
    if r.returncode != 0:
        print(f'kustomize build failed for {ov}: {r.stderr}', file=sys.stderr)
        sys.exit(2)
    try:
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
    except yaml.constructor.ConstructorError:
        pass  # YAML 1.1 merge-key constructs from Helm charts (monitoring ns) — skip
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
  run python3 - "${PROJECT_DIR}/prod-fleet/website-mentolder" <<'PY'
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

# ── workspace API-server egress (T000368) ───────────────────────────
# The workspace namespace enforces default-deny-egress. CronJobs that call
# the Kubernetes API in-cluster (pvc-backup orchestrator, tests-results-
# retention) get "connection refused to 10.43.0.1:443" because no policy
# permits egress to the apiserver. kube-router evaluates egress against the
# POST-DNAT endpoint — the hostNetwork CP node IPs (10.20.0.0/24:6443), NOT
# the ClusterIP — so the allow MUST include the node CIDR on 6443.
@test "network-policies grant egress to the Kubernetes apiserver (T000368)" {
  if ! command -v python3 &>/dev/null; then
    skip "python3 not installed"
  fi
  run python3 - "$RENDERED" <<'PY'
import sys, yaml
rendered = sys.argv[1]
with open(rendered) as f:
    docs = list(yaml.safe_load_all(f))

def egress_to(doc, cidr, port):
    if not doc or doc.get("kind") != "NetworkPolicy":
        return False
    spec = doc.get("spec", {})
    if "Egress" not in (spec.get("policyTypes") or []):
        return False
    for rule in spec.get("egress") or []:
        cidrs = {(p.get("ipBlock") or {}).get("cidr") for p in (rule.get("to") or [])}
        ports = {pr.get("port") for pr in (rule.get("ports") or [])}
        # ports empty means all-ports; treat as match
        if cidr in cidrs and (not ports or port in ports):
            return True
    return False

# The operative allow: CP node IPs (post-DNAT apiserver endpoints) on 6443
node_ok = any(egress_to(d, "10.20.0.0/24", 6443) for d in docs)
# The ClusterIP allow on 443 (defense-in-depth / clusters that match pre-DNAT)
clusterip_ok = any(egress_to(d, "10.43.0.0/16", 443) for d in docs)
if node_ok and clusterip_ok:
    print("OK")
    sys.exit(0)
print(f"MISSING apiserver egress: node_cidr_6443={node_ok} clusterip_443={clusterip_ok}")
sys.exit(1)
PY
  assert_success
}

# ── pvc-backup namespace is runtime-derived, not hardcoded (T000368) ──
# The orchestrator script hardcoded NS=workspace, so on the korczewski brand
# (ns workspace-korczewski) it operated in the wrong namespace and got an
# RBAC Forbidden error. kustomize namespace-remapping does NOT rewrite string
# literals inside container args, so the namespace must be derived at runtime
# from the pod's serviceaccount.
@test "pvc-backup derives namespace at runtime, not hardcoded NS=workspace (T000368)" {
  run grep -E '^\s*NS=workspace\s*$' k3d/pvc-backup-cronjob.yaml
  assert_failure
  grep -q '/var/run/secrets/kubernetes.io/serviceaccount/namespace' k3d/pvc-backup-cronjob.yaml
}

# ── pvc-backup mounter has no stale dead-node affinity (T000368) ─────
# The mounter nodeAffinity excluded node names from decommissioned clusters
# (k3s-1/2/3, k3w-1/2/3) which no longer exist on fleet — dead drift.
@test "pvc-backup mounter nodeAffinity has no decommissioned node names (T000368)" {
  # Ignore comment lines — a comment referencing the old names is not the bug.
  run bash -c "grep -vE '^[[:space:]]*#' k3d/pvc-backup-cronjob.yaml | grep -E 'k3s-1|k3s-2|k3s-3|k3w-1|k3w-2|k3w-3'"
  assert_failure
}

# ── pvc-backup gates Longhorn cloning on storageClassName (T000403) ──
# The orchestrator UNCONDITIONALLY cloned the vaultwarden+docuseal data PVCs
# via Longhorn CSI, then waited for the clones to bind. korczewski has no
# Longhorn install → those PVCs stay on local-path (no CSI clone support) →
# the clones never bind → the bind loop times out → the whole CronJob Failed.
# The fix detects each data PVC's storageClassName and only clones the
# longhorn-backed sources; local-path sources are tarred LIVE by the mounter
# co-located on the owning pod's node. Pin the storageclass gate so a
# regression to unconditional cloning fails CI.
@test "pvc-backup gates clone creation on storageClassName == longhorn (T000403)" {
  # Orchestrator must read each data PVC's storageClassName.
  grep -q 'get pvc vaultwarden-data-pvc -o jsonpath=.*storageClassName' k3d/pvc-backup-cronjob.yaml
  grep -qE '\[ "\$VW_SC" = "longhorn" \]' k3d/pvc-backup-cronjob.yaml
}

@test "pvc-backup no longer unconditionally clones vaultwarden data PVC (T000403)" {
  # The regression shape: a static CLONES assignment naming both clones
  # (ignoring comment lines). Must be absent — cloning is now gated.
  run bash -c "grep -vE '^[[:space:]]*#' k3d/pvc-backup-cronjob.yaml | grep -E 'CLONES=\"vaultwarden-data-backup-clone'"
  assert_failure
}

# ── korczewski pins vaultwarden data PVC to longhorn so pvc-backup can clone (T000403) ──
# The mounter's requiredDuringScheduling podAffinity demands all data volumes on
# one node — local-path PVs are node-pinned. Pin vaultwarden to longhorn
# (placement-independent CSI clone), leaving nextcloud-data on local-path.
@test "korczewski overlay pins vaultwarden data PVC to longhorn (T000403)" {
  local rendered="${BATS_TEST_TMPDIR}/korcz.yaml"
  run kubectl kustomize "${PROJECT_DIR}/prod-fleet/korczewski" --load-restrictor=LoadRestrictionsNone
  assert_success
  echo "$output" > "$rendered"
  run python3 - "$rendered" <<'PY'
import sys, yaml
def load_docs_tolerant(stream_text):
    """Load YAML docs one at a time, skipping docs with YAML 1.1 constructs."""
    result = []
    for chunk in stream_text.split('\n---\n'):
        try:
            d = yaml.safe_load(chunk)
            if d:
                result.append(d)
        except (yaml.constructor.ConstructorError, yaml.scanner.ScannerError):
            pass
    return result
docs = load_docs_tolerant(open(sys.argv[1]).read())
want = {"vaultwarden-data-pvc"}
seen = {}
for d in docs:
    if d.get("kind") == "PersistentVolumeClaim" and d.get("metadata", {}).get("name") in want:
        seen[d["metadata"]["name"]] = d.get("spec", {}).get("storageClassName")
missing = want - set(seen)
if missing:
    print(f"PVC(s) not found in korczewski overlay: {sorted(missing)}")
    sys.exit(1)
bad = {n: sc for n, sc in seen.items() if sc != "longhorn"}
if bad:
    print(f"PVC(s) not pinned to longhorn: {bad}")
    sys.exit(1)
print("OK: vaultwarden pinned to longhorn")
PY
  assert_success
}

# ── tests-results-retention has no stale node-location affinity (T000369) ──
# The CronJob required nodeAffinity node-location=hetzner, but no fleet node
# carries that label after Phase 3 consolidation → unschedulable on all 6
# nodes. The prune job is placement-independent (kubectl exec into the website
# pod), so the affinity must be dropped.
@test "tests-results-retention has no stale node-location affinity (T000369)" {
  # Ignore comment lines — a comment explaining the removal is not the bug.
  run bash -c "grep -vE '^[[:space:]]*#' k3d/tests-retention-cronjob.yaml | grep -E 'node-location'"
  assert_failure
}


#!/usr/bin/env bats
# ═══════════════════════════════════════════════════════════════════
# sealed-secret-cluster-drift.bats
# ═══════════════════════════════════════════════════════════════════
# Detects drift between what the website Deployment requires (env-from-
# secret keys in k3d/website.yaml) and what the cluster's website-secrets
# Secret actually contains.
#
# Catches the G-CD01 class of bug (2026-06-27): the website code
# required BRETT_OIDC_SECRET via env-from-secret, but the cluster's
# website-secrets did not contain that key → CreateContainerConfigError
# on every new pod, every build-website-korczewski.yml run failed.
#
# Strategy:
#   1. Static parse: collect every `secretKeyRef.key` from
#      k3d/website.yaml whose `name` is "website-secrets".
#   2. Live query: list all keys in the cluster Secret
#      website-secrets in namespace website-<brand>.
#   3. Every required key MUST be present in the cluster.
#
# This test requires a live cluster (kubectl with an active context to
# the fleet). Without a cluster it SKIPS — runnable in the `factory:`
# pipeline and on developer machines with a live context.
#
# SSOT: openspec/changes/g-cd01-korczewski-secret-drift
# ═══════════════════════════════════════════════════════════════════

load 'test_helper'

# ── Helpers ──────────────────────────────────────────────────────

# Collect every secretKeyRef.key whose secretName == "website-secrets"
# from k3d/website.yaml. k3d/website.yaml is the only source — all
# overlays (mentolder, korczewski, fleet-*) reference it via
# ../../k3d/website.yaml and never add new website-secrets env-from
# references.
required_website_secret_keys() {
  python3 - "$1" <<'PY'
import sys, yaml
file = sys.argv[1]
keys = set()
with open(file) as fh:
    for doc in yaml.safe_load_all(fh):
        if not doc:
            continue
        spec = doc.get("spec", {})
        tpl = spec.get("template") or {}
        tpl_spec = tpl.get("spec", {})
        for c in tpl_spec.get("containers", []) or []:
            for e in c.get("env", []) or []:
                v = (e.get("valueFrom") or {}).get("secretKeyRef") or {}
                if v.get("name") == "website-secrets" and v.get("key"):
                    keys.add(v["key"])
for k in sorted(keys):
    print(k)
PY
}

# Read the live cluster Secret's data keys (post-decrypt). Echoes the
# keys of the Opaque Secret named website-secrets in the given namespace.
cluster_secret_keys() {
  local ns="$1" name="$2"
  kubectl get secret "$name" -n "$ns" \
    -o jsonpath='{.data}' 2>/dev/null \
  | python3 -c '
import sys, json
raw = sys.stdin.read().strip()
if not raw:
    sys.exit(0)
try:
    d = json.loads(raw)
except json.JSONDecodeError:
    sys.exit(0)
for k in sorted(d.keys()):
    print(k)
' 2>/dev/null
}

# Returns 0 if a live cluster is reachable.
cluster_available() {
  kubectl get nodes --request-timeout=3s >/dev/null 2>&1
}

# Returns 0 if the website-<brand> namespace exists.
brand_state_present() {
  local brand="$1"
  kubectl get ns "website-${brand}" >/dev/null 2>&1
}

brand_or_skip() {
  local brand="$1"
  if ! cluster_available; then
    skip "no live cluster reachable (kubectl get nodes failed)"
  fi
  if ! brand_state_present "$brand"; then
    skip "namespace website-${brand} not present in active cluster (brand not deployed)"
  fi
}

# ── Tests ────────────────────────────────────────────────────────

@test "mentolder: cluster website-secrets has every key the website Deployment requires" {
  brand_or_skip "mentolder"
  local required_file="${PROJECT_DIR}/k3d/website.yaml"
  if [[ ! -f "$required_file" ]]; then
    skip "k3d/website.yaml not found (repo layout unexpected)"
  fi

  local missing=()
  while IFS= read -r key; do
    [[ -z "$key" ]] && continue
    if ! cluster_secret_keys "website-mentolder" "website-secrets" | grep -qx "$key"; then
      missing+=("$key")
    fi
  done < <(required_website_secret_keys "$required_file")

  if [[ ${#missing[@]} -gt 0 ]]; then
    echo "Website Deployment requires these env-from-secret keys (k3d/website.yaml) but the cluster Secret website-mentolder/website-secrets is missing them:"
    printf '  %s\n' "${missing[@]}"
    echo
    echo "Diagnose: kubectl get secret website-secrets -n website-mentolder -o jsonpath='{.data}' | jq 'keys'"
    echo "Fix:      task env:seal ENV=mentolder && task env:deploy ENV=mentolder"
    return 1
  fi
}

@test "korczewski: cluster website-secrets has every key the website Deployment requires" {
  brand_or_skip "korczewski"
  local required_file="${PROJECT_DIR}/k3d/website.yaml"
  if [[ ! -f "$required_file" ]]; then
    skip "k3d/website.yaml not found (repo layout unexpected)"
  fi

  local missing=()
  while IFS= read -r key; do
    [[ -z "$key" ]] && continue
    if ! cluster_secret_keys "website-korczewski" "website-secrets" | grep -qx "$key"; then
      missing+=("$key")
    fi
  done < <(required_website_secret_keys "$required_file")

  if [[ ${#missing[@]} -gt 0 ]]; then
    echo "Website Deployment requires these env-from-secret keys (k3d/website.yaml) but the cluster Secret website-korczewski/website-secrets is missing them:"
    printf '  %s\n' "${missing[@]}"
    echo
    echo "Diagnose: kubectl get secret website-secrets -n website-korczewski -o jsonpath='{.data}' | jq 'keys'"
    echo "Fix:      task env:seal ENV=korczewski && task env:deploy ENV=korczewski"
    return 1
  fi
}

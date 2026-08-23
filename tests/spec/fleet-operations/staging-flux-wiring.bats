#!/usr/bin/env bats
# tests/spec/fleet-operations/staging-flux-wiring.bats
# SSOT: openspec/changes/staging-verdrahtung/specs/fleet-operations.md
# T015004: Staging voll verdrahten — prod-fleet/staging als ks-staging in Flux.
#
# Guards gegen zwei Regressionen:
# 1. Ohne ks-staging/Renderer-Bloecke bleibt workspace-staging GitOps-verwaist
#    (Ursache von T014538/SA-FC-02 — taeglicher CronJob-CrashLoopBackOff).
# 2. Ein falscher WEBSITE_NAMESPACE-Wert feuert die Staging-CronJobs gegen die
#    Prod-Website (Cross-Fire).

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../../.." && pwd)"
  RENDERER="${REPO_ROOT}/scripts/flux-render-artifact.sh"
  KS_STAGING="${REPO_ROOT}/flux/clusters/fleet/ks-staging.yaml"
  KS_WEBSITE_STAGING="${REPO_ROOT}/flux/clusters/fleet/ks-website-staging.yaml"
  KS_SEALED_SECRETS="${REPO_ROOT}/flux/clusters/fleet/ks-sealed-secrets.yaml"
  STAGING_ENV="${REPO_ROOT}/environments/staging.yaml"
}

@test "flux declares ks-staging targeting ./staging" {
  [ -f "$KS_STAGING" ]
  grep -q 'name: flux-staging' "$KS_STAGING"
  grep -q 'path: ./staging' "$KS_STAGING"
  grep -q 'prune: true' "$KS_STAGING"
  grep -q 'kind: OCIRepository' "$KS_STAGING"
  grep -q 'name: fleet-manifests' "$KS_STAGING"
  grep -q 'name: flux-infra-controllers' "$KS_STAGING"
}

@test "flux declares ks-website-staging targeting ./website-staging" {
  [ -f "$KS_WEBSITE_STAGING" ]
  grep -q 'name: flux-website-staging' "$KS_WEBSITE_STAGING"
  grep -q 'path: ./website-staging' "$KS_WEBSITE_STAGING"
  grep -q 'prune: true' "$KS_WEBSITE_STAGING"
  grep -q 'name: fleet-manifests' "$KS_WEBSITE_STAGING"
}

@test "ks-sealed-secrets declares the staging document" {
  [ -f "$KS_SEALED_SECRETS" ]
  grep -q 'name: flux-sealed-secrets-staging' "$KS_SEALED_SECRETS"
  grep -q 'path: ./sealed-secrets/staging' "$KS_SEALED_SECRETS"
}

@test "renderer emits staging and website-staging trees with gate coverage" {
  [ -f "$RENDERER" ]
  grep -q 'render_component prod-fleet/staging' "$RENDERER"
  grep -q 'render_component prod-fleet/website-staging' "$RENDERER"
  grep -q 'env-resolve.sh staging' "$RENDERER"
  grep -q 'sealed-secrets/staging' "$RENDERER"
  # Validation-Gate deckt beide neuen Baeume ab
  grep -q '${OUT_DIR}/staging' "$RENDERER"
  grep -q '${OUT_DIR}/website-staging' "$RENDERER"
}

@test "staging env profile carries offline digest placeholders" {
  [ -f "$STAGING_ENV" ]
  grep -qE '^  WEBSITE_IMAGE_DIGEST: sha256:[0-9a-f]{64}$' "$STAGING_ENV"
  grep -qE '^  BRETT_IMAGE_DIGEST: sha256:[0-9a-f]{64}$' "$STAGING_ENV"
}

@test "rendered staging cronjobs target the staging website namespace" {
  if ! command -v kustomize >/dev/null 2>&1; then
    skip "kustomize binary not installed"
  fi
  if ! command -v envsubst >/dev/null 2>&1; then
    skip "envsubst binary not installed"
  fi
  local rendered subst
  rendered="$(mktemp)"
  subst="$(mktemp)"
  # shellcheck disable=SC1091
  source "${REPO_ROOT}/scripts/env-resolve.sh" staging >/dev/null
  kustomize build "${REPO_ROOT}/prod-fleet/staging" \
    --load-restrictor=LoadRestrictionsNone > "$rendered"

  # Runtime-Vars ($${VAR}) ausnehmen — exakt der Renderer-Vertrag (T002306)
  local runtime_vars vars ev v r
  runtime_vars="$(grep -oE '\$\$\{[A-Za-z_][A-Za-z0-9_]*\}' "$rendered" \
    | sed -E 's/^\$\$\{//; s/\}$//' | sort -u || true)"
  vars="$(grep -oE '\$\{[A-Za-z_][A-Za-z0-9_]*\}' "$rendered" | tr -d '${}' | sort -u | tr '\n' ' ')"
  ev=""
  for v in $vars; do
    skip_var=0
    for r in $runtime_vars; do
      if [ "$v" = "$r" ]; then skip_var=1; break; fi
    done
    [ "$skip_var" -eq 0 ] && ev="${ev}\$${v} "
  done

  sed -E 's/: \$\{([a-zA-Z0-9_]+)\}[[:space:]]*$/: "${\1}"/g' "$rendered" \
    | envsubst "$ev" > "$subst"

  # Kein Cross-Fire gegen die Prod-Website
  if grep -q 'website\.website\.svc\.cluster\.local' "$subst"; then
    echo "staging manifest references prod website service" >&2
    return 1
  fi
  # WEBSITE_NAMESPACE loest auf die Staging-Website auf
  grep -qE 'value: "?website-staging"?' "$subst"
  rm -f "$rendered" "$subst"
}

#!/usr/bin/env bats
# Regression: recovery (recover.<domain>) must survive a prod deploy.
#
# Two coupled bugs this guards against:
#   T000398 — prod/configmap-domains.yaml carried no RECOVER_DOMAIN, so the
#     strategic-merge over base k3d/configmap-domains.yaml left the live
#     domain-config with the dev value `recover.localhost`. domain-config is the
#     runtime SSOT for keycloak-sync's recovery-client redirect URIs, the
#     browse-time ingress/oauth2 envsubst, and the printed URL — so every
#     `workspace:deploy` silently broke recovery until hand-patched.
#   browse raw-apply — scripts/backup-restore.sh `browse` applied
#     k3d/recovery-browser.yaml with a bare `kubectl apply -f`, never running the
#     envsubst the manifest header (recovery-browser.yaml) documents, so
#     ${RECOVER_DOMAIN}/${TLS_SECRET_NAME}/${KC_DOMAIN}/${WORKSPACE_NAMESPACE}
#     reached the cluster literally (broken Ingress host + oauth2 redirect-url).

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
  PROD_DOMAINS="$REPO_ROOT/prod/configmap-domains.yaml"
  TASKFILE="$REPO_ROOT/Taskfile.yml"
  BR="$REPO_ROOT/scripts/backup-restore.sh"
  BROWSER="$REPO_ROOT/k3d/recovery-browser.yaml"
}

@test "prod domain-config defines RECOVER_DOMAIN (else merge leaves dev recover.localhost)" {
  run grep -qE '^[[:space:]]+RECOVER_DOMAIN:' "$PROD_DOMAINS"
  [ "$status" -eq 0 ]
}

@test "prod deploy envsubst list includes RECOVER_DOMAIN" {
  # The prod-overlay deploy pipes kustomize output through envsubst "$ENVSUBST_VARS";
  # RECOVER_DOMAIN must be in that list so both domain-config and the realm-template
  # ConfigMap (which carries \${RECOVER_DOMAIN} redirect URIs) get substituted.
  run grep -qE 'ENVSUBST_VARS=.*RECOVER_DOMAIN' "$TASKFILE"
  [ "$status" -eq 0 ]
}

@test "backup-restore.sh renders recovery-browser.yaml through envsubst" {
  run grep -q 'envsubst' "$BR"
  [ "$status" -eq 0 ]
}

@test "backup-restore.sh browse no longer applies recovery-browser.yaml raw" {
  # The broken raw apply was: $KC apply -n "$NS" -f "$MANIFEST"
  run grep -qF '$KC apply -n "$NS" -f "$MANIFEST"' "$BR"
  [ "$status" -ne 0 ]
}

@test "recovery-browser.yaml still parameterizes the host with \${RECOVER_DOMAIN}" {
  # Non-regression: the manifest must keep the placeholder the deploy/browse path fills.
  run grep -qF 'host: ${RECOVER_DOMAIN}' "$BROWSER"
  [ "$status" -eq 0 ]
}

#!/usr/bin/env bats
# recovery-browser-manifest.bats — structural checks on the on-demand recovery UI.

setup() { MF="${BATS_TEST_DIRNAME}/../../k3d/recovery-browser.yaml"; }

@test "manifest exists and is valid YAML" {
  # kubectl apply --dry-run=client may reject Traefik CRD kinds offline;
  # fall back to a Python YAML parse which works without CRDs.
  run python3 -c "import yaml,sys; list(yaml.safe_load_all(open('${MF}'))); sys.exit(0)"
  [ "$status" -eq 0 ]
}

@test "filebrowser mounts recovery-pvc READ-ONLY" {
  run grep -A3 "claimName: recovery-pvc" "$MF"
  [ "$status" -eq 0 ]
  grep -q "readOnly: true" "$MF"
}

@test "oauth2-proxy is gated to the /recovery-access group" {
  grep -q -- "--allowed-groups=/recovery-access" "$MF"
}

@test "oauth2-proxy uses the recovery client and upstreams the filebrowser" {
  grep -q -- "--client-id=recovery" "$MF"
  grep -q -- "--upstream=http://recovery-browser" "$MF"
}

@test "Ingress routes the recover domain" {
  grep -q "kind: Ingress" "$MF"
  grep -q "RECOVER_DOMAIN" "$MF"
}

@test "NOT registered in the base kustomization (on-demand only)" {
  run grep -q "recovery-browser.yaml" "${BATS_TEST_DIRNAME}/../../k3d/kustomization.yaml"
  [ "$status" -ne 0 ]
}

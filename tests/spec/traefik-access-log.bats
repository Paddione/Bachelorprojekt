#!/usr/bin/env bats
# tests/spec/traefik-access-log.bats
# Traefik is managed by k3s in kube-system.  Its HelmChartConfig must remain
# there; a config rendered by k3d/'s workspace namespace transformer is inert.

REPO_ROOT="${REPO_ROOT:-$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)}"
TRAEFIK_VALUES="${REPO_ROOT}/k3d/monitoring/traefik-metrics.yaml"
KUSTOMIZATION="${REPO_ROOT}/k3d/kustomization.yaml"

@test "Traefik access log: effective HelmChartConfig is in kube-system" {
  grep -q '^  namespace: kube-system$' "$TRAEFIK_VALUES"
}

@test "Traefik access log: JSON logs keep only failed requests" {
  grep -q -- '"--accesslog=true"' "$TRAEFIK_VALUES"
  grep -q -- '"--accesslog.format=json"' "$TRAEFIK_VALUES"
  grep -q -- '"--accesslog.filters.statuscodes=400-599"' "$TRAEFIK_VALUES"
}

@test "Traefik access log: request headers stay excluded" {
  grep -q -- '"--accesslog.fields.headers.defaultmode=drop"' "$TRAEFIK_VALUES"
}

@test "Traefik access log: k3d base has no inert workspace HelmChartConfig" {
  ! grep -q 'traefik-config.yaml' "$KUSTOMIZATION"
  [ ! -e "${REPO_ROOT}/k3d/traefik-config.yaml" ]
}

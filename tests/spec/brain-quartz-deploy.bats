#!/usr/bin/env bats
# T001569: brain-quartz-deploy - BATS Spec (RED initial, GREEN after implementation)
# T001575: 'load helper/load' zeigte auf einen nicht existierenden Helper
# (Paste-Fehler aus a9dcb6cc0) und brach den gesamten tests/spec-Lauf.
load 'test_helper'

@test "k3d base renders the brain static-site Deployment" {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)"
  DEV_RENDER="$(kubectl kustomize "$REPO_ROOT/k3d" 2>/dev/null)"
  
  echo "$DEV_RENDER" | grep -qE '^  name: brain$' || { echo "FAIL: brain Deployment fehlt"; return 1; }
  echo "$DEV_RENDER" | grep -q 'ghcr.io/paddione/brain-site:latest' || { echo "FAIL: brain-site Image fehlt"; return 1; }
}

@test "k3d base renders the brain Service on port 80 -> targetPort 8787" {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)"
  DEV_RENDER="$(kubectl kustomize "$REPO_ROOT/k3d" 2>/dev/null)"
  
  echo "$DEV_RENDER" | grep -qE '^  name: brain$' || { echo "FAIL: brain Service fehlt"; return 1; }
  echo "$DEV_RENDER" | grep -qE 'targetPort: 8787' || { echo "FAIL: targetPort 8787 fehlt"; return 1; }
}

@test "k3d base renders oauth2-proxy-brain with brain client-id" {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)"
  DEV_RENDER="$(kubectl kustomize "$REPO_ROOT/k3d" 2>/dev/null)"
  
  echo "$DEV_RENDER" | grep -qE '^  name: oauth2-proxy-brain$' || { echo "FAIL: oauth2-proxy-brain fehlt"; return 1; }
  echo "$DEV_RENDER" | grep -q -- '--client-id=brain' || { echo "FAIL: client-id brain fehlt"; return 1; }
}

@test "BRAIN_DOMAIN defined in configmap-domains.yaml as brain.localhost" {
  run cat k3d/configmap-domains.yaml
  [ "${status}" -eq 0 ] || fail "configmap-domains.yaml nicht lesbar"
  grep -qE 'BRAIN_DOMAIN.*brain\.localhost' <<< "$output" || fail "BRAIN_DOMAIN fehlt"
}

@test "prod-korczewski exkludiert brain (mentolder-only)" {
  # T001575: `spec: {}` war ein No-Op-Merge (kein Delete). Jetzt echte
  # $patch:-delete-Patches + Verdrahtung in der kustomization; der
  # Render-Check unten beweist die tatsächliche Exklusion.
  run cat prod-korczewski/brain-exclude.yaml
  [ "${status}" -eq 0 ] || { echo "brain-exclude.yaml nicht lesbar"; return 1; }
  grep -q 'name: brain' <<< "$output" || { echo "Exklusions-Patch fehlt"; return 1; }
  grep -q '\$patch: delete' <<< "$output" || { echo "kein \$patch: delete"; return 1; }
  grep -q 'brain-exclude.yaml' prod-korczewski/kustomization.yaml || { echo "nicht verdrahtet"; return 1; }
  KORCZEWSKI_RENDER="$(kubectl kustomize prod-fleet/korczewski --load-restrictor=LoadRestrictionsNone 2>/dev/null)"
  ! grep -qE '^  name: brain$' <<< "$KORCZEWSKI_RENDER" || { echo "brain rendert trotzdem auf korczewski"; return 1; }
}

@test "k3d/secrets.yaml enthält POCKET_ID_BRAIN_SECRET" {
  run cat k3d/secrets.yaml
  [ "${status}" -eq 0 ] || fail "secrets.yaml nicht lesbar"
  grep -q 'POCKET_ID_BRAIN_SECRET' <<< "$output" || fail "Secret fehlt"
}

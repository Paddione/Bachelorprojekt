#!/usr/bin/env bats
# NFA-12: brainstorm-sish authorized_keys ConfigMap survives ArgoCD
#         reconciliation, and the published tunnel still authenticates
#         after a sish pod restart.
#
# Reproduces T000380. Currently expected to FAIL on mentolder until the
# brainstorm-sish-authorized-keys ConfigMap is excluded from ArgoCD's
# desired state via per-resource ignoreDifferences (and/or moved into a
# SealedSecret) and a persistent SSH hostkey is wired up so known_hosts
# stays valid across pod restarts.

load ../unit/lib/bats-assert.bash

CTX="${BRAINSTORM_CTX:-mentolder}"
NS="${BRAINSTORM_NS:-workspace}"
CM="brainstorm-sish-authorized-keys"

setup() {
  command -v kubectl >/dev/null || skip "kubectl required"
  kubectl --context "$CTX" -n "$NS" get cm "$CM" >/dev/null 2>&1 \
    || skip "ConfigMap $CM not present in $CTX/$NS"
}

# T1: After materialising real keys into the ConfigMap, ArgoCD must NOT
#     revert it back to placeholder content within 60 seconds.
@test "NFA-12 T1: ArgoCD does not revert brainstorm-sish authorized_keys" {
  KEYS_FILE="${BRAINSTORM_KEYS_FILE:-/home/patrick/Bachelorprojekt/environments/.secrets/mentolder.yaml}"
  [ -f "$KEYS_FILE" ] || skip "secrets file $KEYS_FILE not found"
  AUTHKEYS=$(yq -r '.DEV_SISH_AUTHORIZED_KEYS // ""' "$KEYS_FILE")
  [ -n "$AUTHKEYS" ] || skip "DEV_SISH_AUTHORIZED_KEYS empty"

  kubectl --context "$CTX" -n "$NS" create configmap "$CM" \
    --from-literal=authorized_keys="$AUTHKEYS" \
    --dry-run=client -o yaml \
    | kubectl --context "$CTX" -n "$NS" apply -f - >/dev/null

  sleep 60

  CONTENT=$(kubectl --context "$CTX" -n "$NS" get cm "$CM" \
    -o jsonpath='{.data.authorized_keys}')
  echo "$CONTENT" | grep -q '^ssh-' || {
    echo "After 60s, authorized_keys is back to: $CONTENT" >&3
    return 1
  }
}

# T2: brainstorm-sish must mount a persistent SSH hostkey so known_hosts
#     entries survive pod restarts. We assert by verifying the pod has
#     a Secret/PVC volume named hostkeys (or equivalent) — a CM-only
#     /keys mount is insufficient.
@test "NFA-12 T2: brainstorm-sish persists SSH hostkey across restarts" {
  VOLS=$(kubectl --context "$CTX" -n "$NS" get deploy/brainstorm-sish \
    -o jsonpath='{.spec.template.spec.volumes[*].name}')
  echo "volumes: $VOLS" >&3
  echo "$VOLS" | tr ' ' '\n' | grep -qE '^(hostkey|hostkeys|ssh-host-keys)$'
}

# T3: task brainstorm:_materialise-keys must be invokable from CLI
#     (skill documents direct invocation; internal: true breaks that).
@test "NFA-12 T3: brainstorm:_materialise-keys is invokable from CLI" {
  cd "$BATS_TEST_DIRNAME/../.."
  command -v task >/dev/null || skip "go-task required"
  run task --summary brainstorm:_materialise-keys 2>&1
  # internal tasks are rejected by go-task with "Task X is internal"
  ! echo "$output" | grep -q 'is internal'
}

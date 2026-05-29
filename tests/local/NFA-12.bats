#!/usr/bin/env bats
# NFA-12: brainstorm-sish persists SSH hostkey across restarts,
#         and brainstorm:materialise-keys is invokable from CLI.
#
# Moved from a stale ConfigMap to workspace-secrets SealedSecret (T000045).

CTX="${BRAINSTORM_CTX:-mentolder}"
NS="${BRAINSTORM_NS:-workspace}"

setup() {
  command -v kubectl >/dev/null || skip "kubectl required"
  kubectl --context "$CTX" -n "$NS" get deploy/brainstorm-sish >/dev/null 2>&1 \
    || skip "Deployment brainstorm-sish not present in $CTX/$NS"
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

# T3: task brainstorm:materialise-keys must be invokable from CLI
#     (skill documents direct invocation; internal: true breaks that).
@test "NFA-12 T3: brainstorm:materialise-keys is invokable from CLI" {
  cd "$BATS_TEST_DIRNAME/../.."
  command -v task >/dev/null || skip "go-task required"
  run task --summary brainstorm:materialise-keys 2>&1
  # internal tasks are rejected by go-task with "Task X is internal"
  ! echo "$output" | grep -q 'is internal'
}

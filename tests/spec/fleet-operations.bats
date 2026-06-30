#!/usr/bin/env bats
# tests/spec/fleet-operations.bats
# SSOT: docs/superpowers/specs/2026-06-21-secrets-deploy-automation-design.md

setup() {
  load 'test_helper.bash'
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)"
}

@test "fleet-* sealed secrets contain all non-legacy keys from their legacy counterparts" {
  if ! command -v yq >/dev/null 2>&1; then
    skip "yq is not installed"
  fi
  if ! command -v python3 >/dev/null 2>&1; then
    skip "python3 is not installed"
  fi

  # Collect legacy_only keys from environments/schema.yaml
  legacy_only_keys=$(python3 -c "
import yaml
with open('${REPO_ROOT}/environments/schema.yaml') as f:
    schema = yaml.safe_load(f)
for s in schema.get('secrets', []):
    if s.get('legacy_only', False):
        print(s['name'])
" 2>/dev/null || true)

  for pair in "mentolder:fleet-mentolder" "korczewski:fleet-korczewski"; do
    legacy="${pair%%:*}"
    fleet="${pair##*:}"

    legacy_file="${REPO_ROOT}/environments/sealed-secrets/${legacy}.yaml"
    fleet_file="${REPO_ROOT}/environments/sealed-secrets/${fleet}.yaml"

    if [[ ! -f "$legacy_file" || ! -f "$fleet_file" ]]; then
      continue
    fi

    legacy_keys=$(yq '.spec.encryptedData | keys | .[]' "$legacy_file" 2>/dev/null | sort)
    fleet_keys=$(yq '.spec.encryptedData | keys | .[]' "$fleet_file" 2>/dev/null | sort)

    missing=""
    while IFS= read -r key; do
      [[ -z "$key" ]] && continue
      # Skip if it is declared as legacy_only
      if echo "$legacy_only_keys" | grep -qxF "$key"; then
        continue
      fi
      # Skip if it is present in the fleet keys
      if echo "$fleet_keys" | grep -qxF "$key"; then
        continue
      fi
      missing="${missing} ${key}"
    done <<< "$legacy_keys"

    if [[ -n "$missing" ]]; then
      echo "Keys missing in sealed-secrets/${fleet}.yaml:${missing}" >&2
      false
    fi
  done
}

# ── T001328: Traefik externalTrafficPolicy=Local (real client IP) ─────────
# Manifest-structure assertions only — there is no live cluster in CI, so
# the actual SNAT/X-Forwarded-For fix can only be verified against the live
# fleet (see the manual rollout task in
# openspec/changes/pocket-id-rate-limit/tasks.md). These guard the static
# config that (a) the live `helm upgrade` rollout is based on and (b) future
# full-cluster-rebuilds (prod/cloud-init.yaml) will install by default.

@test "prod/traefik-values.yaml sets externalTrafficPolicy: Local" {
  if ! command -v yq >/dev/null 2>&1; then
    skip "yq is not installed"
  fi
  run yq eval '.service.spec.externalTrafficPolicy' "${REPO_ROOT}/prod/traefik-values.yaml"
  [ "$status" -eq 0 ]
  [ "$output" = "Local" ]
}

@test "prod/traefik-values.yaml runs Traefik as a DaemonSet on exactly the 3 public Hetzner nodes" {
  if ! command -v yq >/dev/null 2>&1; then
    skip "yq is not installed"
  fi
  run yq eval '.deployment.kind' "${REPO_ROOT}/prod/traefik-values.yaml"
  [ "$status" -eq 0 ]
  [ "$output" = "DaemonSet" ]

  # Regression guard: externalTrafficPolicy=Local silently drops traffic on
  # any node lacking a local Traefik pod. The node affinity MUST cover
  # exactly the nodes DNS for *.${PROD_DOMAIN} resolves to.
  run yq eval '.affinity.nodeAffinity.requiredDuringSchedulingIgnoredDuringExecution.nodeSelectorTerms[0].matchExpressions[0].values | sort | join(",")' "${REPO_ROOT}/prod/traefik-values.yaml"
  [ "$status" -eq 0 ]
  [ "$output" = "pk-hetzner-4,pk-hetzner-6,pk-hetzner-8" ]
}

@test "prod/cloud-init.yaml installs Traefik from prod/traefik-values.yaml (not inline --set)" {
  run grep -c 'traefik-values.yaml' "${REPO_ROOT}/prod/cloud-init.yaml"
  [ "$status" -eq 0 ]
  [ "$output" -ge 1 ]

  # Regression guard against silently reverting to the old inline-flags
  # install, which had no externalTrafficPolicy/affinity at all. grep -c
  # exits 1 on zero matches, so don't assert on $status here — only on the
  # printed count.
  run grep -c -- '--set deployment.kind=DaemonSet' "${REPO_ROOT}/prod/cloud-init.yaml"
  [ "$output" -eq 0 ]
}

@test "prod-korczewski/traefik-values.yaml (orphaned, superseded by prod/traefik-values.yaml) is gone" {
  [ ! -f "${REPO_ROOT}/prod-korczewski/traefik-values.yaml" ]
}

# ── T001341: Traefik hostPort (client IP survives the klipper-lb hop) ─────
# T001328's externalTrafficPolicy: Local did not fix the bug live — root
# cause is k3s' ServiceLB (klipper-lb) re-originating the connection in its
# own pod netns when forwarding to the NodePort backend, which loses the
# real client IP before externalTrafficPolicy ever applies. Fix: Traefik's
# own pods bind ports 80/443 directly via hostPort (already committed below,
# just never live), with klipper-lb removed via service.spec.type: ClusterIP
# (the missing piece — without it, klipper-lb's svclb-traefik DaemonSet
# competes for the same hostPorts and the new Traefik pods stay Pending).
# Manifest-structure assertions only — see the manual rollout task in
# openspec/changes/traefik-hostport-clientip/tasks.md for live verification.

@test "prod/traefik-values.yaml sets service.spec.type: ClusterIP (removes klipper-lb)" {
  if ! command -v yq >/dev/null 2>&1; then
    skip "yq is not installed"
  fi
  run yq eval '.service.spec.type' "${REPO_ROOT}/prod/traefik-values.yaml"
  [ "$status" -eq 0 ]
  [ "$output" = "ClusterIP" ]
}

@test "prod/traefik-values.yaml exposes Traefik directly via hostPort 80/443" {
  if ! command -v yq >/dev/null 2>&1; then
    skip "yq is not installed"
  fi
  run yq eval '.ports.web.hostPort' "${REPO_ROOT}/prod/traefik-values.yaml"
  [ "$status" -eq 0 ]
  [ "$output" = "80" ]

  run yq eval '.ports.websecure.hostPort' "${REPO_ROOT}/prod/traefik-values.yaml"
  [ "$status" -eq 0 ]
  [ "$output" = "443" ]
}

@test "prod/traefik-values.yaml uses maxUnavailable=1/maxSurge=0 (hostPort can't share a port)" {
  if ! command -v yq >/dev/null 2>&1; then
    skip "yq is not installed"
  fi
  run yq eval '.updateStrategy.rollingUpdate.maxUnavailable' "${REPO_ROOT}/prod/traefik-values.yaml"
  [ "$status" -eq 0 ]
  [ "$output" = "1" ]

  run yq eval '.updateStrategy.rollingUpdate.maxSurge' "${REPO_ROOT}/prod/traefik-values.yaml"
  [ "$status" -eq 0 ]
  [ "$output" = "0" ]
}

#!/usr/bin/env bats
# Structural guards for Fleet Phase 2b full-stack deploy wiring.

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
  TASKFILE="$REPO_ROOT/Taskfile.yml"
}

@test "fleet:shared-services task exists" {
  run grep -qE '^\s+fleet:shared-services:' "$TASKFILE"
  [ "$status" -eq 0 ]
}

@test "fleet:talk-setup:brand task exists" {
  run grep -qE '^\s+fleet:talk-setup:brand:' "$TASKFILE"
  [ "$status" -eq 0 ]
}

@test "fleet:deploy:brand runs mcp:deploy and post-setup but NOT talk-setup" {
  # Extract the fleet:deploy:brand block (until the next top-level task at same indent)
  block="$(awk '/^  fleet:deploy:brand:/{f=1} f&&/^  [a-z].*:$/&&!/fleet:deploy:brand:/{if(seen)exit} f{print; seen=1}' "$TASKFILE")"
  echo "$block" | grep -q 'workspace:deploy'
  echo "$block" | grep -q 'mcp:deploy'
  echo "$block" | grep -q 'workspace:post-setup'
  ! echo "$block" | grep -q 'talk-setup'
}

@test "fleet:deploy deploys shared-services exactly once (not per brand)" {
  block="$(awk '/^  fleet:deploy:/{if($0 ~ /fleet:deploy:$/)f=1} f&&/^  [a-z].*:$/&&!/fleet:deploy:$/{if(seen)exit} f{print; seen=1}' "$TASKFILE")"
  count="$(echo "$block" | grep -c 'fleet:shared-services')"
  [ "$count" -eq 1 ]
}

@test "fleet:deploy orders shared-services after both brand deploys, before talk-setup" {
  block="$(awk '/^  fleet:deploy:/{if($0 ~ /fleet:deploy:$/)f=1} f&&/^  [a-z].*:$/&&!/fleet:deploy:$/{if(seen)exit} f{print; seen=1}' "$TASKFILE")"
  shared_line="$(echo "$block" | grep -n 'fleet:shared-services' | head -1 | cut -d: -f1)"
  talk_line="$(echo "$block" | grep -n 'fleet:talk-setup:brand' | head -1 | cut -d: -f1)"
  brand_line="$(echo "$block" | grep -n 'fleet:deploy:brand' | tail -1 | cut -d: -f1)"
  [ "$brand_line" -lt "$shared_line" ]
  [ "$shared_line" -lt "$talk_line" ]
}

# Regression: workspace:deploy embeds coturn:sync-secret + talk-setup, which hard-fail
# on a fresh fleet cluster because coturn/Janus only come up later in fleet:shared-services.
# fleet:deploy:brand must be able to skip that embedded talk chain.

@test "workspace:deploy gates its embedded talk-setup behind SKIP_TALK_SETUP" {
  block="$(awk '/^  workspace:deploy:$/{f=1} f&&/^  [a-z].*:$/&&!/workspace:deploy:$/{if(seen)exit} f{print; seen=1}' "$TASKFILE")"
  # the block still invokes talk-setup ...
  echo "$block" | grep -q 'workspace:talk-setup'
  # ... but only when SKIP_TALK_SETUP is not "true"
  echo "$block" | grep -q 'SKIP_TALK_SETUP'
}

@test "fleet:deploy:brand passes SKIP_TALK_SETUP=true so brand core skips talk-setup" {
  block="$(awk '/^  fleet:deploy:brand:/{f=1} f&&/^  [a-z].*:$/&&!/fleet:deploy:brand:/{if(seen)exit} f{print; seen=1}' "$TASKFILE")"
  echo "$block" | grep -q 'SKIP_TALK_SETUP'
}

# Regression (T000351): cert:install installs the lego DNS-01 webhook but historically
# wired ONLY nodeAffinity — it never injected IPV64_API_KEY. That env var was set solely
# by the imperative cert:secret step, so a fresh cluster bring-up (e.g. fleet) that relied
# on a SEALED ipv64-api-key and skipped cert:secret landed a webhook that fails every
# DNS-01 challenge with "credentials missing". cert:install must wire the key itself when
# the cert-manager/ipv64-api-key secret already exists, so issuance works without cert:secret.
# Regression (T000351 root cause #2): fleet-mentolder env used fleet-m.korczewski.de
# (a sub-subdomain of korczewski.de) as PROD_DOMAIN. lego's ipv64 provider computes a
# two-level _acme-challenge praefix for sub-subdomains, which the ipv64 API rejects with
# 403 on del_record. Switching to mentolder.de (an ipv64 root domain) gives a single-level
# praefix, matching the proven mentolder pattern.
@test "fleet-mentolder env uses mentolder.de as PROD_DOMAIN (not staging fleet-m infix)" {
  grep "PROD_DOMAIN" "$REPO_ROOT/environments/fleet-mentolder.yaml" | grep -q "mentolder.de"
  ! grep "PROD_DOMAIN" "$REPO_ROOT/environments/fleet-mentolder.yaml" | grep -q "fleet-m.korczewski.de"
}

@test "fleet-korczewski env uses korczewski.de as PROD_DOMAIN (not staging fleet infix)" {
  grep "PROD_DOMAIN" "$REPO_ROOT/environments/fleet-korczewski.yaml" | grep -q "korczewski.de"
  ! grep "PROD_DOMAIN" "$REPO_ROOT/environments/fleet-korczewski.yaml" | grep -q "fleet\.korczewski\.de"
}

@test "fleet-mentolder env has no remaining fleet-m.korczewski.de references" {
  ! grep -q "fleet-m\.korczewski\.de" "$REPO_ROOT/environments/fleet-mentolder.yaml"
}

@test "fleet-korczewski env has no remaining fleet.korczewski.de references" {
  ! grep -q "fleet\.korczewski\.de" "$REPO_ROOT/environments/fleet-korczewski.yaml"
}

@test "cert:install wires IPV64_API_KEY into the lego webhook (not just cert:secret)" {
  block="$(awk '/^  cert:install:/{f=1} f&&/^  [a-z].*:$/&&!/cert:install:/{if(seen)exit} f{print; seen=1}' "$TASKFILE")"
  # injects the key from the existing secret into the webhook deployment
  echo "$block" | grep -q 'cert-manager-lego-webhook'
  echo "$block" | grep -qE 'set env .*(--from=secret/ipv64-api-key|IPV64_API_KEY)'
}

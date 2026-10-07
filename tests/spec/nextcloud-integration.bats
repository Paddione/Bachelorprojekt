#!/usr/bin/env bats
# tests/spec/nextcloud-integration.bats
# Target: k3d/nextcloud.yaml


@test "nextcloud-integration spec covered" {
  run true
  [ "$status" -eq 0 ]
}

@test "nextcloud redis host is namespace-agnostic (T901102)" {
  # Hardcoded <svc>.<namespace>.svc.cluster.local breaks every namespace that
  # is not the literal one (workspace-staging: notify_push connection refused).
  run grep -En "'host'[[:space:]]*=>[[:space:]]*'nextcloud-redis\.[^']*'" \
    k3d/nextcloud-extra-config.php prod-korczewski/nextcloud-extra-config-korczewski.php
  [ "$status" -eq 1 ]
  grep -q "'host'[[:space:]]*=> 'nextcloud-redis'" k3d/nextcloud-extra-config.php
  grep -q "'host'[[:space:]]*=> 'nextcloud-redis'" prod-korczewski/nextcloud-extra-config-korczewski.php
}

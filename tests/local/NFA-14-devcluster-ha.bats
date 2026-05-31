#!/usr/bin/env bats
# NFA-14: HA dev cluster (devc) has 3 Ready nodes, a healthy Longhorn volume, and the VIP serves traffic.
# Requires the devc kubeconfig context to be available and the cluster to be running.

setup() {
  if ! kubectl --context devc cluster-info >/dev/null 2>&1; then
    skip "devc cluster not reachable — skipping live cluster tests"
  fi
}

@test "devc cluster has 3 Ready nodes" {
  run kubectl --context devc get nodes --no-headers
  [ "$status" -eq 0 ]
  ready=$(echo "$output" | grep -c " Ready ")
  [ "$ready" -eq 3 ]
}

@test "shared-db-dev Longhorn volume is healthy" {
  run kubectl --context devc -n longhorn-system get volumes.longhorn.io \
    -o jsonpath='{.items[*].status.robustness}'
  [ "$status" -eq 0 ]
  [[ "$output" == *"healthy"* ]]
}

@test "VIP serves the website host" {
  run curl -sS -o /dev/null -w "%{http_code}" -H "Host: web.dev.mentolder.de" http://10.0.0.20/
  [ "$status" -eq 0 ]
  [[ "$output" =~ ^(200|301|302)$ ]]
}

@test "kube-vip DaemonSet is running on all nodes" {
  run kubectl --context devc -n kube-system get daemonset kube-vip-ds \
    -o jsonpath='{.status.numberReady}'
  [ "$status" -eq 0 ]
  [ "$output" -eq 3 ]
}

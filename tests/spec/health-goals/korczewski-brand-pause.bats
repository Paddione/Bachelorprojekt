#!/usr/bin/env bats
# T014537 / SA-FC-01: the intentional korczewski pause must not leave the two
# admin-action Jobs running forever.
#
# This is a live-cluster regression guard. It is skipped when kubectl or the
# fleet context is unavailable, because CI must not turn cluster credentials
# into an implicit dependency. The two approved CronJobs must be suspended
# before their active Jobs are cleaned up.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  command -v kubectl >/dev/null 2>&1 || skip "kubectl binary not installed"
  kubectl config get-contexts fleet >/dev/null 2>&1 || skip "fleet context not configured"
}

@test "T014537: paused admin-action CronJobs have no active Jobs" {
  run timeout 20 kubectl --context fleet -n workspace-korczewski get cronjobs admin-actions-cleanup admin-actions-prune -o json
  [ "$status" -eq 0 ] || { echo "kubectl get cronjobs failed: $output" >&2; return 1; }
  jq -e 'all(.items[]; .spec.suspend == true)' <<<"$output" >/dev/null || {
    echo "approved admin-action CronJobs are not both suspended" >&2
    return 1
  }
  for owner in admin-actions-cleanup admin-actions-prune; do
    jq -e --arg owner "$owner" 'any(.items[]; .metadata.name == $owner)' <<<"$output" >/dev/null || {
      echo "missing approved CronJob evidence for ${owner}" >&2
      return 1
    }
  done

  run timeout 20 kubectl --context fleet -n workspace-korczewski get jobs -o json
  [ "$status" -eq 0 ] || { echo "kubectl get jobs failed: $output" >&2; return 1; }

  active_jobs="$(jq -r '
    .items[]
    | select((.metadata.ownerReferences // []) | any(.kind == "CronJob" and
        (.name == "admin-actions-cleanup" or .name == "admin-actions-prune")))
    | select((.status.active // 0) > 0)
    | .metadata.name
  ' <<<"$output")"

  [ -z "$active_jobs" ] || {
    echo "active admin-action Jobs remain: $active_jobs" >&2
    return 1
  }

  run timeout 20 kubectl --context fleet -n flux-system get kustomizations flux-korczewski flux-korczewski-jobs flux-website-korczewski -o json
  [ "$status" -eq 0 ] || { echo "kubectl get Flux Kustomizations failed: $output" >&2; return 1; }
  jq -e 'all(.items[]; .spec.suspend == true)' <<<"$output" >/dev/null || {
    echo "korczewski Flux Kustomizations are not all suspended" >&2
    return 1
  }

  run timeout 20 kubectl --context fleet -n flux-system get ocirepository fleet-manifests-gitlab -o json
  [ "$status" -eq 0 ] || { echo "kubectl get OCIRepository failed: $output" >&2; return 1; }
  jq -e '.spec.suspend == true' <<<"$output" >/dev/null || {
    echo "fleet-manifests-gitlab is not suspended" >&2
    return 1
  }
}

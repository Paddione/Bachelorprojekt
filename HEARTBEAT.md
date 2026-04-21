# HEARTBEAT.md

Periodic checks to run during idle heartbeat cycles.

## Active Tasks

- Check for failing pods across `workspace` namespace on live clusters (`mentolder`, `korczewski`)
- Verify ArgoCD sync status — flag any `OutOfSync` or `Degraded` applications
- Check for new GitHub CI failures on open PRs

## Notes

- Only run live-cluster checks when context indicates active work on those clusters
- Skip k3d-dev checks during heartbeat (local cluster may not be running)
- If all clear, no output needed — silence is fine

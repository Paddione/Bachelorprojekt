---
ticket_id: T000069
---
# Plan: Fix korczewski deployment secrets drift and missing api-key

This plan fixes secrets drift and authentication failures on the `korczewski` cluster caused by `sed` corrupting native Kubernetes expansions during manual deployments, and repoints `ddns-updater` to the correct secret.

## Proposed Changes

### Build and Deployment Tasks
- Modify [Taskfile.yml](file:///tmp/wt-korczewski-secrets-drift/Taskfile.yml):
    - Remove the `sed 's/\$(\([^)]*\))/\${\1}/g'` pipeline step from the `dev` deployment, `prod` deployment, and `website:deploy` / `website:redeploy` tasks.

### Kubernetes Manifests
- Modify [ddns-updater.yaml](file:///tmp/wt-korczewski-secrets-drift/prod-korczewski/ddns-updater.yaml):
    - Change the `IPV64_API_KEY` environment variable secret reference name from `ipv64-api-key` to `workspace-secrets`.

## Verification Plan

### Automated Tests
- Run `task test:all` to ensure all offline tests (including the new BATS unit test in `manifests.bats`) pass.

### Manual Verification
- Deploy to `korczewski` using `task workspace:deploy ENV=korczewski`.
- Verify all pods on `korczewski` are Running/Ready and have correct DB connections.

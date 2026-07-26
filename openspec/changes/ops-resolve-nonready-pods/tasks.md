---
title: "ops-resolve-nonready-pods — Implementation Plan"
domains: [ops, infra]
status: active
file_locks: []
shared_changes: false
batch_id: null
depends_on_plans: []
---

# ops-resolve-nonready-pods — Implementation Plan

## Task 1 — Fix missing POCKET_ID_TERMINAL_SECRET (korczewski)

**Problem:** Pod `oauth2-proxy-terminal-6f7cf8c584-mj2vx` in `workspace-korczewski` hat
`CreateContainerConfigError`: "couldn't find key POCKET_ID_TERMINAL_SECRET in Secret
workspace-korczewski/workspace-secrets"

**Fix:**
```bash
# 1. Check if the secret exists in workspace namespace
kubectl get secret workspace-secrets -n workspace -o json | jq '.data | keys'

# 2. Extract the POCKET_ID_TERMINAL_SECRET value
SECRET=$(kubectl get secret workspace-secrets -n workspace -o json | jq -r '.data.POCKET_ID_TERMINAL_SECRET // empty')

# 3. If found, patch the korczewski secret
if [ -n "$SECRET" ]; then
  kubectl get secret workspace-secrets -n workspace-korczewski -o json | \
    jq --arg key "POCKET_ID_TERMINAL_SECRET" --arg val "$SECRET" \
      '.data[$key] = $val' | \
    kubectl apply -f -
fi
```

**Verify:** Pod should transition from CreateContainerConfigError to Running/Ready within 30s.

## Task 2 — Fix oauth2-proxy-brett CrashLoopBackOff (both namespaces)

**Problem:** Two pods (mentolder + korczewski) for oauth2-proxy-brett are in CrashLoopBackOff
with exit code 2. In both namespaces, an OLDER ReplicaSet has a working pod.

**Investigation:**
```bash
# Check logs of the crashing pod (workspace)
kubectl logs oauth2-proxy-brett-5585d5dc6d-d9kgx -n workspace --previous

# Check logs (korczewski)
kubectl logs oauth2-proxy-brett-76f6b697fb-jzzqb -n workspace-korczewski --previous

# List all pods for brett-oauth2 to see old vs new
kubectl get pods -n workspace | grep oauth2-proxy-brett
kubectl get pods -n workspace-korczewski | grep oauth2-proxy-brett
```

**Possible causes for exit code 2:**
- Wrong secret value for POCKET_ID_BRETT_SECRET
- Config issue in the new ReplicaSet
- OIDC provider (Pocket-ID) not reachable

**Fix options (choose based on investigation):**
1. **If old pod works fine and new one doesn't:** Delete the failing pod so the old ReplicaSet takes over
2. **If config error:** Debug the Deployment and fix the config
3. **If secret drift:** Re-sync the secret

## Task 3 — Fix livekit-egress ContainerCreating

**Problem:** Pod `livekit-egress-6c7759c9bb-fc2hp` on node `gekko-hetzner-3` stuck in ContainerCreating since July 19.

**Investigation:**
```bash
# Check PVC status
kubectl get pvc livekit-recordings-pvc -n workspace
kubectl describe pvc livekit-recordings-pvc -n workspace

# Check node status
kubectl describe node gekko-hetzner-3

# Check pod events
kubectl describe pod livekit-egress-6c7759c9bb-fc2hp -n workspace

# Check if there's a disk/pv issue
kubectl get pv | grep livekit
```

**Possible causes:**
- PVC stuck waiting for volume to be provisioned
- Node `gekko-hetzner-3` has resource pressure or disk issue
- CSI driver issue on that specific node

**Fix options:**
1. If PVC is stuck Pending → check StorageClass and CSI driver
2. If Node has pressure → cordon, drain, or delete pod to reschedule
3. If simple pod issue → delete pod, let ReplicaSet recreate

## Verification

```bash
# Check all pods across both namespaces
kubectl get pods -n workspace | grep -v Running | grep -v Completed
kubectl get pods -n workspace-korczewski | grep -v Running | grep -v Completed

# Expected: only legit Completed jobs
# No CrashLoopBackOff, no ContainerCreating, no CreateContainerConfigError
```

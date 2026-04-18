# Monitoring: Operational Actions + Real Metrics

**Date:** 2026-04-18
**Status:** Approved

## Overview

Extend the admin monitoring dashboard (`/admin/monitoring`) with two capabilities that eliminate the need to drop into `kubectl` for routine operations:

1. **Real node resource metrics** — replace the stubbed "N/A" node card with actual CPU% and Mem% progress bars.
2. **Deployments section with Restart and Scale actions** — a new table above the existing Pods list showing all workspace deployments, with Rollout Restart and Scale controls per row.

---

## Architecture

### Backend changes

#### 1. Fix node metrics in `GET /api/admin/monitoring`

The existing handler fetches `/apis/metrics.k8s.io/v1beta1/nodes` but never fetches node capacity, so it returns `"N/A"`. Fix:

- Add a fourth parallel fetch: `GET /api/v1/nodes`
- For each node, compute:
  - `cpuPercent = round(usageNanoCores / capacityNanoCores * 100)`
  - `memPercent = round(usageKi / capacityKi * 100)`
- Return `node: { cpu: "34%", memory: "61%" }` instead of the current `{ cpu: "N/A", memory: "N/A" }`
- RBAC: requires `get`/`list` on `nodes` (core API group) — see RBAC changes section. Note: the existing code already calls `/apis/metrics.k8s.io/v1beta1/nodes` (metrics API group) which is separate from `/api/v1/nodes` (capacity, core group).

#### 2. New file: `website/src/pages/api/admin/deployments.ts`

`GET /api/admin/deployments`

- Auth guard: same `getSession` + `isAdmin` check as existing endpoints.
- Fetches `/apis/apps/v1/namespaces/workspace/deployments` via the in-cluster K8s API (same `fetchK8s` helper pattern as `monitoring.ts`).
- Returns:

```ts
type Deployment = {
  name: string;
  desired: number;   // spec.replicas
  ready: number;     // status.readyReplicas ?? 0
  available: number; // status.availableReplicas ?? 0
  status: 'healthy' | 'degraded' | 'pending';
};
```

Status logic:
- `healthy`: `ready === desired && desired > 0`
- `pending`: `desired === 0` or deployment is being created
- `degraded`: everything else

#### 3. New file: `website/src/pages/api/admin/deployments/[name]/restart.ts`

`POST /api/admin/deployments/[name]/restart`

- Auth guard: `getSession` + `isAdmin`.
- Reads `name` from `Astro.params`.
- Issues a `PATCH` to `/apis/apps/v1/namespaces/workspace/deployments/{name}` with:

```json
{
  "spec": {
    "template": {
      "metadata": {
        "annotations": {
          "kubectl.kubernetes.io/restartedAt": "<ISO timestamp>"
        }
      }
    }
  }
}
```

Content-Type: `application/strategic-merge-patch+json`

- Returns `{ ok: true }` on success, `{ error: string }` on failure.

#### 4. New file: `website/src/pages/api/admin/deployments/[name]/scale.ts`

`POST /api/admin/deployments/[name]/scale`

- Auth guard: `getSession` + `isAdmin`.
- Reads `name` from `Astro.params`, `replicas: number` from request body.
- Validates: `replicas` must be an integer between 0 and 10 (upper bound prevents accidents).
- Issues a `PATCH` to `/apis/apps/v1/namespaces/workspace/deployments/{name}` with:

```json
{ "spec": { "replicas": <n> } }
```

Content-Type: `application/strategic-merge-patch+json`

- Returns `{ ok: true, replicas: n }` on success.

### RBAC changes

The website ServiceAccount (`website` in `website` namespace) currently has `get`/`list`/`watch` on pods and events in the `workspace` namespace. It needs additional permissions:

```yaml
# Add to existing ClusterRole or create a new Role in workspace namespace
- apiGroups: ["apps"]
  resources: ["deployments"]
  verbs: ["get", "list", "patch"]
- apiGroups: [""]
  resources: ["nodes"]
  verbs: ["get", "list"]
```

Location: update `k3d/website-rbac.yaml` (or equivalent RBAC manifest).

---

## Frontend changes

### `MonitoringDashboard.svelte`

#### Node metrics stat card

Replace the existing node card's `<p>` text with two labelled progress bars:

```
CPU  [████████░░░░░░░░░░░░] 34%
Mem  [██████████████░░░░░░] 61%
```

Shown only when `metricsAvailable && data.node`.

#### New Deployments section

Inserted between the summary stats and the existing Pods list.

**New types:**

```ts
type Deployment = {
  name: string;
  desired: number;
  ready: number;
  available: number;
  status: 'healthy' | 'degraded' | 'pending';
};

type DeploymentAction =
  | { type: 'restart'; deployment: Deployment }
  | { type: 'scale'; deployment: Deployment };
```

**New state:**

```ts
let deployments: Deployment[] = [];
let pendingAction: DeploymentAction | null = null;
let scaleTarget: number = 1;
let actionLoading = false;
let actionError: string | null = null;
```

**Fetching:** `fetchData` extended to also call `GET /api/admin/deployments` in parallel with the existing monitoring call. Deployments are stored separately so a deployment fetch failure does not prevent pod/event data from rendering.

**Deployment table:** columns — Name, Ready, Replicas, Status badge, Actions (Restart + Scale buttons).

Status badge colours:
- `healthy` → green
- `degraded` → orange
- `pending` → yellow

**Confirmation modal (shared for both actions):**

- Restart: "Restart deployment `{name}`? This triggers a rolling restart."
- Scale: "+/− stepper showing current replica count. Confirm to apply."
- Both have Cancel / Confirm buttons. Confirm is disabled while `actionLoading`.
- On success: close modal, re-fetch deployments after 1 s (give K8s time to register the change).
- On error: show `actionError` inline in the modal footer.

---

## Error handling

- If `GET /api/admin/deployments` fails, show an inline error banner in the Deployments section; pods/events continue to render normally.
- Restart/Scale API errors surface in the confirmation modal (not a page-level error).
- Scale to 0 is allowed (valid use case: temporarily stop a service) but the confirmation dialog makes it explicit: "This will stop all pods for `{name}`."

---

## Testing

- Manual: deploy to k3d, verify Deployments table populates, trigger Restart and confirm rolling restart via `kubectl get pods -w`, trigger Scale and confirm replica count changes.
- Existing monitoring tests (`FA-*`) should continue to pass unchanged.
- No new automated tests required for this iteration (admin-only UI, covered by manual verification).

---

## Out of scope

- Cross-namespace deployment management
- Pod-level delete button (can be added later)
- Deployment history / rollback
- Alerting / notifications

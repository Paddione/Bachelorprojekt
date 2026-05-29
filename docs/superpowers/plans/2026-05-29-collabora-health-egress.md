---
title: Collabora Health-Probe Egress Fix Implementation Plan
ticket_id: T000287
domains: []
status: active
pr_number: null
---

# Collabora Health-Probe Egress Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Platform Control Center's System-Integrität tab report Collabora's true health on both clusters by unblocking the website pod's egress to the `workspace-office` namespace, and harden two latent issues that could let the dashboard show stale/false status.

**Architecture:** The website namespace enforces `default-deny-egress` with an `allow-egress-to-workspace` exception. Collabora actually runs in `workspace-office`, which has no egress allow — so the `/api/admin/ops/health` probe from the website pod is dropped and the dashboard shows a false-negative `error`. The core fix adds an `allow-egress-to-workspace-office` NetworkPolicy. Two hardening changes prevent future drift: correcting the fresh-cluster seed for Collabora's namespace, and making the k8s client distinguish HTTP 403 (no-access) from 404 (missing) so an RBAC gap can't masquerade as a missing deployment.

**Tech Stack:** Kubernetes NetworkPolicy (Kustomize via Flux), PostgreSQL seed/migration SQL, TypeScript (Astro API route + k8s client), Svelte (admin badge), BATS (offline manifest test), Playwright (E2E).

**Ticket:** T000287 · **Branch:** `fix/collabora-health-egress`

**Verified facts (do not re-investigate):**
- collabora runs healthy 1/1 in `workspace-office` on BOTH clusters; Nextcloud reaches `collabora.workspace-office.svc.cluster.local:9980 → HTTP 200` (its `wopi_url`).
- From the website pod: `workspace` services (keycloak/nextcloud/vaultwarden) are reachable; `collabora.workspace-office:9980` is **connection-refused** (egress denied).
- The collabora inventory row already has `namespace=workspace-office`, `base_status=live` in `platform.software_assets` (in the **`website`** DB) on both clusters — **no live DB change is required.**
- The website SA `website` already has a cluster-wide ClusterRoleBinding (`website-monitoring-clusterrolebinding`); `auth can-i get deployments -n workspace-office` → **yes**. So the SoftwareTab is already correct; this plan does NOT touch RBAC.

---

## File Structure

- `k3d/website.yaml` — add the `allow-egress-to-workspace-office` NetworkPolicy (consumed by both Flux website overlays; literal `workspace-office`, identical on both clusters).
- `website/src/db/migrations/20260521_create_platform_assets.sql` — correct the collabora seed namespace.
- `website/src/db/migrations/20260520_fix_collabora_namespace.sql` — delete (misdated no-op, now redundant).
- `website/src/lib/k8s.ts` — typed error carrying HTTP status.
- `website/src/pages/api/admin/platform/software.ts` — branch on status (403 → `no-access`, else `missing`).
- `website/src/components/admin/platform/SoftwareTab.svelte` — render the `no-access` badge distinctly.
- `tests/unit/manifests.bats` — red test already added ("website overlay allows egress to workspace-office").
- `tests/e2e/specs/fa-44-platform-health-integrity.spec.ts` — add a health-tab assertion for Collabora.

---

## Task 1: NetworkPolicy — allow website egress to workspace-office

**Files:**
- Modify: `k3d/website.yaml` (after the `allow-egress-to-workspace` block, ~line 530)
- Test: `tests/unit/manifests.bats` (red test already present)

- [ ] **Step 1: Confirm the failing test is red**

Run: `cd /tmp/wt-collabora-health-egress && tests/unit/lib/bats-core/bin/bats tests/unit/manifests.bats -f "egress to workspace-office"`
Expected: FAIL — `MISSING: no NetworkPolicy grants egress to workspace-office`

- [ ] **Step 2: Add the NetworkPolicy**

In `k3d/website.yaml`, immediately after the `allow-egress-to-workspace` document (the `---` at line 530), insert:

```yaml
# Website-Pod darf Collabora im workspace-office-Namespace erreichen
# (Platform Hub System-Integrität Health-Probe → collabora:9980, T000287).
# workspace-office trägt denselben Namespace-Namen auf beiden Clustern → literal, keine Variable.
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-egress-to-workspace-office
  namespace: ${WEBSITE_NAMESPACE}
spec:
  podSelector: {}
  policyTypes:
  - Egress
  egress:
  - to:
    - namespaceSelector:
        matchLabels:
          kubernetes.io/metadata.name: workspace-office
    ports:
    - port: 9980
      protocol: TCP
---
```

- [ ] **Step 3: Run the test to verify it passes**

Run: `cd /tmp/wt-collabora-health-egress && tests/unit/lib/bats-core/bin/bats tests/unit/manifests.bats -f "egress to workspace-office"`
Expected: PASS (`ok 1 ...`)

- [ ] **Step 4: Verify envsubst coverage (no Taskfile change expected)**

The new policy reuses `${WEBSITE_NAMESPACE}`, which is already in the `website:deploy` envsubst list, and `workspace-office` is a literal. Confirm no new variable was introduced:
Run: `grep -n 'workspace-office' k3d/website.yaml`
Expected: the literal `workspace-office` appears (no `${...}` placeholder). No Taskfile edit required.

- [ ] **Step 5: Commit**

```bash
git add k3d/website.yaml tests/unit/manifests.bats
git commit -m "fix(website): allow egress to workspace-office for collabora health probe [T000287]"
```

---

## Task 2: Correct the fresh-cluster seed for Collabora's namespace

**Files:**
- Modify: `website/src/db/migrations/20260521_create_platform_assets.sql:47`
- Delete: `website/src/db/migrations/20260520_fix_collabora_namespace.sql`

**Why:** The seed inserts collabora with `namespace='workspace'`, and the intended fix migration is dated `20260520` — it sorts *before* the `20260521` table-creation, so it targets a table that does not yet exist and never applies. Live clusters are already correct, but a fresh bring-up would re-seed the wrong namespace. Correct the seed at the source and remove the dead migration (DRY).

- [ ] **Step 1: Fix the seed row**

In `website/src/db/migrations/20260521_create_platform_assets.sql`, line 47, change the collabora `namespace` column from `'workspace'` to `'workspace-office'`:

```sql
  ('collabora',          'Collabora',          'Online office suite',                   'storage',    '📄', ARRAY['mentolder','korczewski'], 'workspace-office',     'collabora',         ':latest',  'live',     40),
```

- [ ] **Step 2: Delete the misdated no-op migration**

```bash
git rm website/src/db/migrations/20260520_fix_collabora_namespace.sql
```

- [ ] **Step 3: Verify no other file references the deleted migration**

Run: `grep -rn '20260520_fix_collabora_namespace' . --exclude-dir=.git || echo "no references"`
Expected: `no references`

- [ ] **Step 4: Commit**

```bash
git add website/src/db/migrations/20260521_create_platform_assets.sql
git commit -m "fix(db): seed collabora with workspace-office namespace; drop misdated no-op migration [T000287]"
```

---

## Task 3: Distinguish HTTP 403 (no-access) from 404 (missing)

**Files:**
- Modify: `website/src/lib/k8s.ts:38-39`
- Modify: `website/src/pages/api/admin/platform/software.ts:44-52`
- Modify: `website/src/components/admin/platform/SoftwareTab.svelte:96-105`

**Why:** `k8s.ts` rejects every `>=400` with a generic `Error`, so `software.ts` collapses 403 (RBAC denied) and 404 (deployment absent) into one `missing` badge. A future RBAC gap would silently look like a deleted service — the dashboard would assert a falsehood.

- [ ] **Step 1: Add a typed error to the k8s client**

In `website/src/lib/k8s.ts`, add an exported error class at the top (after the imports, before `export type K8sClient`):

```ts
export class K8sApiError extends Error {
  readonly status: number;
  constructor(status: number, statusMessage: string | undefined, body: string) {
    super(`K8s API ${status}: ${statusMessage ?? ''} — ${body}`);
    this.name = 'K8sApiError';
    this.status = status;
  }
}
```

Then replace the rejection at lines 38-39:

```ts
            if (res.statusCode && res.statusCode >= 400) {
              reject(new Error(`K8s API ${res.statusCode}: ${res.statusMessage} — ${data}`));
```

with:

```ts
            if (res.statusCode && res.statusCode >= 400) {
              reject(new K8sApiError(res.statusCode, res.statusMessage, data));
```

- [ ] **Step 2: Branch on the status in the software API**

In `website/src/pages/api/admin/platform/software.ts`, update the import on line 4 to include the error type:

```ts
import { createK8sClient, K8sApiError, type K8sClient } from '../../../../lib/k8s';
```

Then replace the catch at lines 50-52:

```ts
        } catch {
          liveStatus = 'missing';
        }
```

with:

```ts
        } catch (e) {
          // 403 = RBAC denied (no-access) must not masquerade as a deleted
          // deployment (404 = missing). T000287.
          liveStatus = e instanceof K8sApiError && e.status === 403 ? 'no-access' : 'missing';
        }
```

- [ ] **Step 3: Render the `no-access` badge distinctly**

In `website/src/components/admin/platform/SoftwareTab.svelte`, extend the badge class expression (lines 96-103) by adding a `no-access` case before the final fallback:

```svelte
                <span class="px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider {
                  asset.live_status === 'ready'         ? 'bg-green-500/10 text-green-500'  :
                  asset.live_status === 'degraded'      ? 'bg-yellow-500/10 text-yellow-500':
                  asset.live_status === 'other-cluster' ? 'bg-blue-500/10 text-blue-400'   :
                  asset.live_status === 'optional'      ? 'bg-gray-500/10 text-gray-400'   :
                  asset.live_status === 'unknown'       ? 'bg-gray-500/10 text-gray-500'   :
                  asset.live_status === 'no-access'     ? 'bg-purple-500/10 text-purple-400':
                  asset.live_status === 'failing'       ? 'bg-red-500/10 text-red-400'     :
                                                          'bg-orange-500/10 text-orange-400'}">
                  {asset.live_status === 'other-cluster' ? '↗ remote' : asset.live_status === 'no-access' ? '⊘ no-access' : asset.live_status}
                </span>
```

- [ ] **Step 4: Typecheck the website**

Run: `cd website && pnpm install && pnpm exec astro check 2>&1 | tail -20`
Expected: no new type errors referencing `k8s.ts` / `software.ts` / `SoftwareTab.svelte`. (If `astro check` is unavailable, run `pnpm build` and confirm it compiles.)

- [ ] **Step 5: Commit**

```bash
git add website/src/lib/k8s.ts website/src/pages/api/admin/platform/software.ts website/src/components/admin/platform/SoftwareTab.svelte
git commit -m "fix(admin): distinguish k8s 403 no-access from 404 missing in platform hub [T000287]"
```

---

## Task 4: E2E assertion — Collabora healthy in System-Integrität

**Files:**
- Modify: `tests/e2e/specs/fa-44-platform-health-integrity.spec.ts`

- [ ] **Step 1: Add the health-tab assertion**

Append a new test inside the `FA-44` describe block (after the existing `T4` test, before the closing `});`):

```ts
  test('T5: health API reports Collabora reachable (not error)', async ({ request }) => {
    test.skip(!process.env.E2E_ADMIN_PASS, 'E2E_ADMIN_PASS not set — skip authenticated test');

    const res = await request.get(`${BASE}/api/admin/ops/health`);
    if (res.status() === 401) test.skip(true, 'Not authenticated — skip');

    expect(res.status()).toBe(200);
    const body = await res.json();
    const clusterKey = Object.keys(body.results)[0];
    const collabora = (body.results[clusterKey] as any[]).find((s: any) => s.name === 'Collabora');
    expect(collabora).toBeDefined();
    // The website pod must be able to reach collabora.workspace-office:9980.
    expect(['ok', 'slow']).toContain(collabora.status);
  });
```

- [ ] **Step 2: Regenerate the test inventory (fa-44 already registered; confirm no drift)**

Run: `task test:inventory && git diff --exit-code website/src/data/test-inventory.json`
Expected: no diff (FA-44 already in inventory; this only adds an assertion to an existing spec file). If a diff appears, commit it.

- [ ] **Step 3: Run the offline suite to confirm nothing regressed**

Run: `task test:all 2>&1 | tail -30`
Expected: green, including `manifests.bats` "egress to workspace-office".

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/specs/fa-44-platform-health-integrity.spec.ts website/src/data/test-inventory.json
git commit -m "test(e2e): assert Collabora health reachable in System-Integrität [T000287]"
```

---

## Task 5: Deploy to both clusters and verify live

**Files:** none (deploy + verification only)

- [ ] **Step 1: Open PR and merge (squash) after CI is green**

Handled by `dev-flow-execute`'s PR step. Wait for CI (offline tests, manifest structure, inventory check) green before merge.

- [ ] **Step 2: Deploy**

The NetworkPolicy lives in `k3d/website.yaml` (applied by Flux on both clusters); the code changes need a website image rebuild + rollout. Use the oracle to resolve the exact task rather than hardcoding:
Run: `bash scripts/task-oracle.sh 'build and roll out the website to both prod clusters'`
Then, to apply the NetworkPolicy manifest promptly without waiting for the next poll, reconcile Flux on each cluster (source before kustomization):

```bash
flux reconcile source git flux-system --context mentolder
flux reconcile kustomization website-mentolder --context mentolder
flux reconcile source git flux-system --context korczewski
flux reconcile kustomization website-korczewski --context korczewski
```

- [ ] **Step 3: Verify the NetworkPolicy exists on both clusters**

```bash
kubectl --context mentolder   get networkpolicy allow-egress-to-workspace-office -n website
kubectl --context korczewski  get networkpolicy allow-egress-to-workspace-office -n website-korczewski
```
Expected: both found.

- [ ] **Step 4: Verify the probe now succeeds from the website pod (both clusters)**

```bash
# mentolder
WP=$(kubectl --context mentolder get pod -n website -l app=website -o name | head -1)
kubectl --context mentolder exec -n website "$WP" -c website -- \
  sh -c 'wget -T5 -qO- -S http://collabora.workspace-office.svc.cluster.local:9980/hosting/capabilities 2>&1 | grep -m1 "HTTP/"'
# korczewski
WPK=$(kubectl --context korczewski get pod -n website-korczewski -l app=website -o name | head -1)
kubectl --context korczewski exec -n website-korczewski "$WPK" -c website -- \
  sh -c 'wget -T5 -qO- -S http://collabora.workspace-office.svc.cluster.local:9980/hosting/capabilities 2>&1 | grep -m1 "HTTP/"'
```
Expected: `HTTP/1.1 200 OK` from both (was connection-refused before).

- [ ] **Step 5: Confirm in the UI**

Open the admin Platform Control Center → System-Integrität tab on `https://web.mentolder.de` and `https://web.korczewski.de`. Expected: Collabora shows `ok` (green), not `error`.

---

## Self-Review Notes

- **Spec coverage:** NetworkPolicy (Task 1), seed/migration hardening (Task 2), 403/404 hardening (Task 3), behavioral E2E + offline tests (Tasks 1/4), both-cluster deploy + verify (Task 5). All scope items covered.
- **No live DB change** is included by design — both clusters already store `workspace-office`. Task 2 only fixes the fresh-cluster seed.
- **Type consistency:** `K8sApiError` defined in Task 3 Step 1, imported in Step 2, branched on `e.status`. The new `live_status` value `'no-access'` (Task 3 Step 2) is rendered in Task 3 Step 3.
- **Least privilege:** the new egress policy is scoped to TCP 9980 (collabora) only; DNS egress is already covered by the separate `allow-dns-egress` policy.

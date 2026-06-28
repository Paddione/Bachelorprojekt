---
title: "G-CQ02: Explizite any-Typen reduzieren (463→≤280, Batch 1)"
ticket_id: T001289
domains: ["cq","website","quality"]
status: completed
---

# g-cq02-any-types-batch1 — Implementation Plan

## File Structure

| Path | Status |
|------|--------|
| `website/src/lib/k8s.ts` | MODIFY — add `KubePod`, `KubeEvent`, `KubeNode`, `KubeContainer` interfaces; remove `any` casts |
| `website/src/lib/factory-floor.ts` | MODIFY — type DB result rows with `FactoryFloorRow` interface |
| `website/src/lib/website-db.ts` | MODIFY — type DB result rows with domain row interfaces |
| `website/src/lib/sessions/archive.ts` | MODIFY — type result rows |
| `website/src/pages/api/admin/monitoring.ts` | MODIFY — consume `k8s.ts` interfaces, eliminate 13 `any` casts |
| `website/src/pages/api/admin/cluster/pods-list.ts` | MODIFY — consume `k8s.ts` interfaces |
| `website/src/pages/api/admin/cluster/warnings.ts` | MODIFY — consume `k8s.ts` interfaces |
| `website/src/pages/api/admin/deployments.ts` | MODIFY — consume `k8s.ts` interfaces |
| `website/src/pages/api/admin/dora-metrics.ts` | MODIFY — type `DoraDeliveryRow` inline |
| `website/src/pages/api/admin/qa-reviews.ts` | MODIFY — `err: unknown`, typed body |
| `website/src/pages/api/admin/qa-queue.ts` | MODIFY — `err: unknown` |
| `website/src/pages/api/admin/deployments/[name]/scale.ts` | MODIFY — typed body, `err: unknown` |
| `website/src/pages/api/admin/deployments/[name]/restart.ts` | MODIFY — `err: unknown` |
| `website/src/pages/api/admin/bugs/[id].ts` | MODIFY — `err: unknown` |
| `website/src/pages/api/admin/bugs/[id]/comments.ts` | MODIFY — `err: unknown` |
| `website/src/pages/api/admin/bugs/reopen.ts` | MODIFY — `err: unknown` |
| `website/src/pages/api/admin/homepage/save.ts` | MODIFY — typed session via `KeycloakSession` |
| `website/src/pages/api/factory-floor/[extId]/inject.ts` | MODIFY — typed session via `KeycloakSession` |
| `tests/spec/code-quality.bats` | CREATE — BATS regression locking in Batch 1 reduction |

---

## Task 0: Baseline messen und Regression schreiben (RED)

**Rationale:** Measure first, write a failing BATS test that asserts the post-Batch-1 target, then
implement. This establishes a reproducible gate that CI can enforce as an offline check.

### Step 1: Baseline messen

```bash
grep -rn ': any\|<any>\|as any' website/src --include='*.ts' --include='*.svelte' --include='*.astro' | wc -l
```

expected: FAIL (aktueller Wert: 463 explizite `:any`/`<any>`/`as any` in `website/src` — over target: ≤ 373 nach Batch 1 / ≤ 280 Gesamtziel)

### Step 2: BATS-Spec erstellen (`tests/spec/code-quality.bats`)

Die Datei enthält drei offline-sichere Tests (reine Grep-/Zähltests ohne Website-Build-Dep):

```bash
#!/usr/bin/env bats
# SSOT: openspec/changes/g-cq02-any-types-batch1/proposal.md
# G-CQ02: Explizite any-Typen reduzieren — Batch 1 Gate

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
}

@test "G-CQ02: any-count in website/src is at or below Batch-1 target (373)" {
  count=$(grep -rn ': any\|<any>\|as any' \
    "$REPO_ROOT/website/src" \
    --include='*.ts' --include='*.svelte' --include='*.astro' \
    | wc -l | tr -d ' ')
  echo "current any count: $count (target: <=373)"
  [ "$count" -le 373 ]
}

@test "G-CQ02: monitoring.ts has no more than 2 explicit any (was 13)" {
  count=$(grep -c ': any\|<any>\|as any' \
    "$REPO_ROOT/website/src/pages/api/admin/monitoring.ts" || true)
  echo "monitoring.ts any count: $count (target: <=2)"
  [ "$count" -le 2 ]
}

@test "G-CQ02: catch-blocks in admin API use err: unknown not err: any" {
  hits=$(grep -rn 'catch (err: any)' \
    "$REPO_ROOT/website/src/pages/api/admin" --include='*.ts' \
    | wc -l | tr -d ' ')
  echo "remaining err: any catch blocks: $hits (target: 0)"
  [ "$hits" -eq 0 ]
}
```

Run these tests now — all three fail because the current codebase has 463 occurrences,
`monitoring.ts` has 13, and multiple admin routes use `catch (err: any)`.

---

## Task 1: Phase A — Kubernetes-API-Typen in `website/src/lib/k8s.ts`

**Goal:** Introduce narrow TypeScript interfaces for the Kubernetes object shapes consumed by
`monitoring.ts`, `pods-list.ts`, `warnings.ts`, and `deployments.ts`. Every `(item as any).field`
cast in those files must be replaced with a typed access through the new interface.

**Approach:**

Add a `KubeTypes` module block at the top of `website/src/lib/k8s.ts` with `Partial`-safe
interfaces for the most commonly accessed properties. Use `Partial` on container-status arrays and
metric fields to guard against optional fields that the API may omit under low-resource conditions.

Key interfaces to introduce:
- `KubeContainerStatus` — `ready: boolean`, `restartCount: number`, `name: string`
- `KubeContainerMetrics` — `name: string`, `usage: { cpu: string; memory: string }`
- `KubePodMetrics` — `metadata: { name: string }`, `containers: KubeContainerMetrics[]`
- `KubePod` — `metadata: { name: string }`, `status: { phase?: string; containerStatuses?: KubeContainerStatus[] }`
- `KubeEvent` — `reason: string`, `message: string`, `type: string`, `lastTimestamp?: string`, `metadata: { name: string }`
- `KubeNode` — `metadata: { name: string }`, `status: { capacity?: Record<string, string>; allocatable?: Record<string, string> }`
- `KubeDeployment` — `metadata: { name: string; namespace?: string }`, `spec: { replicas?: number }`, `status: { readyReplicas?: number; availableReplicas?: number }`
- `KubeList<T>` — `items: T[]`

After adding the interfaces, update `monitoring.ts`, `pods-list.ts`, `warnings.ts`, and
`deployments.ts` to cast Kubernetes list responses as `KubeList<KubePod>` etc. instead of using
`any` inline.

**Verification per file:** `grep -c ': any\|<any>\|as any' website/src/pages/api/admin/monitoring.ts`
should drop from 13 to ≤ 2 (a `PromiseFulfilledResult<unknown>` narrowing may retain one cast if
TypeScript's inference gap requires it — acceptable).

---

## Task 2: Phase B — DB-Layer-Typen in `website/src/lib/`

**Goal:** Replace `any[]` row arrays in `factory-floor.ts`, `website-db.ts`, and `sessions/archive.ts`
with named row interfaces, and use `pg`'s `QueryResult<RowType>` generic.

**Files and changes:**

`website/src/lib/factory-floor.ts` — introduce `FactoryFloorRow` with the columns returned by the
main factory-floor SELECT query. Replace `(rows as any[]).map(...)` with `rows.map(...)` once the
`QueryResult<FactoryFloorRow>` generic is in place.

`website/src/lib/website-db.ts` — this file returns rows for multiple queries. Introduce
per-function row interfaces co-located with each function (e.g. `ContentSectionRow`,
`HomepageBlockRow`). Each `as any[]` cast on a `QueryResult.rows` is replaced with the matching
generic.

`website/src/lib/sessions/archive.ts` — introduce `SessionArchiveRow` with the columns from the
`coaching.sessions` archive query.

**Constraint:** Do not reach into `pg`'s internal types. Use the public `QueryResult<T>` export
from `'pg'`, which ships types in `@types/pg`.

---

## Task 3: Phase C — `catch (err: any)` → `catch (err: unknown)` across admin routes

**Goal:** All `catch (err: any)` blocks in `website/src/pages/api/admin/` are replaced with
`catch (err: unknown)`, and every `.message` / `.stack` access inside those blocks is guarded with
an `instanceof Error` narrowing.

**Mechanical steps:**

1. Run `grep -rn 'catch (err: any)' website/src/pages/api/admin --include='*.ts'` to confirm the
   full list of affected files.
2. For each file, replace `catch (err: any)` with `catch (err: unknown)`.
3. For each `err.message` / `err.stack` call in the same catch block, wrap in
   `err instanceof Error ? err.message : String(err)`.
4. Run `pnpm --prefix website exec tsc --noEmit` to confirm no new type errors.

Affected files in this batch: `qa-reviews.ts`, `qa-queue.ts`, `deployments/[name]/scale.ts`,
`deployments/[name]/restart.ts`, `bugs/[id].ts`, `bugs/[id]/comments.ts`, `bugs/reopen.ts`.

Additionally normalize `let body: any` in `qa-reviews.ts` and `scale.ts` to `let body: unknown`
with a `JSON.parse` result assertion via `z.object` or explicit type guard.

---

## Task 4: Phase D — Session-Casts durch `KeycloakSession`-Interface ersetzen

**Goal:** The pattern `(session as any).preferred_username` appears in
`website/src/pages/api/admin/homepage/save.ts` and
`website/src/pages/api/factory-floor/[extId]/inject.ts`. Both should use a typed interface.

**Approach:**

Check whether a `SessionData` or similar type already exists in `website/src/env.d.ts` or
`website/src/lib/auth.ts`. If a type for the Keycloak OIDC session payload is already declared,
extend it to include `preferred_username: string`, `email?: string`, and `name?: string`. If no
such type exists, add a `KeycloakSessionPayload` interface in `website/src/lib/auth.ts`:

```typescript
export interface KeycloakSessionPayload {
  sub: string;
  preferred_username: string;
  email?: string;
  name?: string;
}
```

Replace `(session as any).preferred_username` with a type-asserted access
`(session as KeycloakSessionPayload).preferred_username`. This is a narrowing cast (still a cast,
but typed), not a blind `any`.

---

## Task 5 (Verify): Quality Gates

- [ ] `bash scripts/health-goals-check.sh --only=G-CQ02` — confirms the measured count is ≤ 373 (Batch 1) and shows progress toward ≤ 280
- [ ] `task test:changed`
- [ ] `task freshness:regenerate`
- [ ] `task freshness:check`

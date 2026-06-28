# Proposal: g-cq02-any-types-batch1

_Ticket: T001289_

## Why

The `website/src` codebase contains **463 explicit `any` occurrences** (`:any`, `<any>`, `as any`)
spread across `.ts`, `.svelte`, and `.astro` files. These annotations suppress the TypeScript
type-checker at the exact call sites where bugs most easily hide: API-route request/response
parsing, Kubernetes API responses, database result rows, and session object access. Every `as any`
cast is a hole through which runtime shape mismatches, missing property errors, and unexpected
`undefined` values pass undetected until production.

Beyond correctness, the high `any` count actively degrades IDE completions and `tsc --noEmit`
strictness because TypeScript stops inferring types downstream of each cast. The `@typescript-eslint/no-explicit-any`
rule, which G-CQ03 wires up as an ESLint gate, will immediately surface these once ESLint is green
— making Batch 1 of G-CQ02 a prerequisite for a clean ESLint baseline.

The 463 occurrences are not uniformly distributed. A handful of hotspot files account for the
majority: `website/src/pages/api/admin/monitoring.ts` alone contributes 13, and the
`website/src/lib/` layer (especially `website-db.ts`, `factory-floor.ts`, `k8s.ts`) adds
another ~75. Eliminating the top-density files first gives the highest return per PR.

## What

Batch 1 targets the two highest-density layers — API routes and shared lib modules — and aims to
eliminate at least 90 `any` occurrences, bringing the total from 463 to ≤ 373 (leaving headroom
for Batch 2 to reach the ≤ 280 milestone target):

**Phase A — Kubernetes / cluster API responses (`website/src/lib/k8s.ts`, `monitoring.ts`, `pods-list.ts`, `warnings.ts`, `deployments.ts`):**
The Kubernetes JSON API returns untyped `unknown` objects. Each `(item as any).foo` cast is
replaced with a narrow inline interface (e.g. `KubePod`, `KubeEvent`, `KubeNode`) or with
a `satisfies` / `z.object` parse step using the project's existing `zod` dependency.

**Phase B — Factory / DB layer (`website/src/lib/factory-floor.ts`, `website/src/lib/website-db.ts`, `website/src/lib/sessions/archive.ts`):**
Database result rows typed as `any[]` are replaced with row-level TypeScript interfaces that
mirror the SQL column names. `pg` QueryResult generics (`QueryResult<RowType>`) replace bare
`QueryResult`.

**Phase C — catch-clause normalization (`err: any` → `err: unknown`):**
`catch (err: any)` across the admin API routes is replaced with `catch (err: unknown)` plus a
type-narrowing `instanceof Error` guard. This is a mechanical, low-risk change that removes ~20
occurrences in one pass.

**Phase D — session casts (`(session as any).preferred_username`):**
The Keycloak session object shape is extracted into a `KeycloakSession` interface (or extended via
`ambient module augmentation` on the existing `SessionData` type). All `(session as any).x`
accesses in admin route handlers are replaced with typed access.

The measure command `grep -rn ': any\|<any>\|as any' website/src --include=*.ts --include=*.svelte --include=*.astro | wc -l` is the single source of truth and is run before and after each phase.

## Impact

**Files changed (production code only — no test files in this batch):**

- `website/src/lib/k8s.ts` — introduce `KubePod`, `KubeEvent`, `KubeNode`, `KubeContainer` interfaces
- `website/src/lib/factory-floor.ts` — type DB rows with `FactoryFloorRow`
- `website/src/lib/website-db.ts` — type DB rows with domain row interfaces
- `website/src/lib/sessions/archive.ts` — type result rows
- `website/src/pages/api/admin/monitoring.ts` — consume `k8s.ts` interfaces, remove 13 casts
- `website/src/pages/api/admin/cluster/pods-list.ts` — consume `k8s.ts` interfaces
- `website/src/pages/api/admin/cluster/warnings.ts` — consume `k8s.ts` interfaces
- `website/src/pages/api/admin/deployments.ts` — consume `k8s.ts` interfaces
- `website/src/pages/api/admin/dora-metrics.ts` — type `DoraDeliveryRow` inline
- `website/src/pages/api/admin/qa-reviews.ts` — `err: unknown`, typed body
- `website/src/pages/api/admin/qa-queue.ts` — `err: unknown`
- `website/src/pages/api/admin/deployments/[name]/scale.ts` — typed body, `err: unknown`
- `website/src/pages/api/admin/deployments/[name]/restart.ts` — `err: unknown`
- `website/src/pages/api/admin/bugs/[id].ts` — `err: unknown`
- `website/src/pages/api/admin/bugs/[id]/comments.ts` — `err: unknown`
- `website/src/pages/api/admin/bugs/reopen.ts` — `err: unknown`
- `website/src/pages/api/admin/homepage/save.ts` — typed session
- `website/src/pages/api/factory-floor/[extId]/inject.ts` — typed session
- `tests/spec/code-quality.bats` — new regression test locking in Batch 1 reduction

**New files:**

- `tests/spec/code-quality.bats` — BATS spec for G-CQ02 Batch 1 gate

**Risks:**

- Kubernetes API shapes differ between API versions; new interfaces must be declared as `Partial<...>`
  or validated with `zod` where fields are optional in practice — a strict non-optional interface
  on a Kube response can cause runtime `undefined` property access if the cluster omits an optional
  field. Mitigation: default narrowing interfaces to `Partial` and test against the dev k3d cluster.
- `catch (err: unknown)` requires an `instanceof Error` guard before accessing `err.message` — if
  a catch block calls `err.message` without the guard, `tsc` will flag it. All affected catch
  blocks must be audited for `.message` / `.stack` access.

**Out of scope for Batch 1:**

- Test files (`*.test.ts`) — test `as any` casts for Astro API context mocking are addressed in a
  separate batch once a proper `APIContext` mock utility exists.
- `.svelte` and `.astro` component files — those any occurrences are concentrated in reactive
  store types and Svelte action handlers; a dedicated Batch 2 addresses them.
- Reaching the final ≤ 280 milestone target — that requires Batches 2 and 3 covering the
  component and Svelte layers.

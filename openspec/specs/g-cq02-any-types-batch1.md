# g-cq02-any-types-batch1

## Purpose

SSOT spec.

## Requirements

### Requirement: The measure command `grep -rn ': any\|<any>\|as any' website

The system SHALL the measure command `grep -rn ': any\|<any>\|as any' website/src --include='*.ts' --include='*.svelte' --include='*.astro' | wc -l` must be reproducible from any clean checkout of the branch and must return a value ≤ 373 after Batch 1 is complete.
- REQ-2: All `catch (err: any)` blocks in `website/src/pages/api/admin/` must be replaced with `catch (err: unknown)` plus an `instanceof Error` guard before any `.message` or `.stack` access.
- REQ-3: `website/src/pages/api/admin/monitoring.ts` must have ≤ 2 remaining `any` occurrences (down from 13). Each remaining occurrence, if any, must be accompanied by an inline comment explaining why a narrower type is not feasible.
- REQ-4: Kubernetes API response shapes consumed in `website/src/lib/k8s.ts` and the cluster admin routes must be expressed through named `Partial`-safe TypeScript interfaces rather than inline `any` casts.
- REQ-5: PostgreSQL query result rows in `website/src/lib/factory-floor.ts`, `website/src/lib/website-db.ts`, and `website/src/lib/sessions/archive.ts` must use `QueryResult<RowType>` with named row interfaces rather than `any[]`.
- REQ-6: `pnpm --prefix website exec tsc --noEmit` must exit 0 after all changes — no new TypeScript errors introduced.
- REQ-7: The BATS regression file `tests/spec/code-quality.bats` must exist and contain at minimum the three tests defined in Task 0: total count gate (≤ 373), `monitoring.ts` gate (≤ 2), and zero `catch (err: any)` gate.
- REQ-8: No test files (`*.test.ts`) are modified in Batch 1. Test-file `as any` casts (Astro `APIContext` mocking) are deferred to a later batch.

## Acceptance Criteria

- THEN `grep -rn ': any\|<any>\|as any' website/src --include='*.ts' --include='*.svelte' --include='*.astro' | wc -l` returns a value ≤ 373
- THEN `grep -rn 'catch (err: any)' website/src/pages/api/admin --include='*.ts' | wc -l` returns 0
- THEN `grep -c ': any\|<any>\|as any' website/src/pages/api/admin/monitoring.ts` returns ≤ 2
- THEN `pnpm --prefix website exec tsc --noEmit` exits 0
- THEN `bash scripts/health-goals-check.sh --only=G-CQ02` prints a non-red status (TARGET in-progress or green)
- THEN `tests/spec/code-quality.bats` exists and all three G-CQ02 tests pass under `task test:changed`

<!-- merged from change delta g-cq02-any-types-batch1.md on 2026-06-28 -->
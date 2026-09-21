---
title: "applications-api-dynamic-routes-fix — Implementation Plan"
ticket_id: T900302
domains: [website]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# applications-api-dynamic-routes-fix — Implementation Plan

_Ticket: T900302_

## File Structure

```
components/website/src/pages/api/internal/applications/
├── auth.ts
├── list.ts
├── list.test.ts
├── timeline.ts
├── timeline.test.ts
└── [id]/
    ├── index.ts
    ├── index.test.ts
    ├── detail.ts
    ├── detail.test.ts
    ├── timeline.ts
    ├── timeline.test.ts
    ├── dossiers.ts
    └── dossiers.test.ts
tests/spec/
└── website-core.bats
```

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Run the BATS test verifying the [id] dynamic routes exist in the Astro pages tree.
      The test must FAIL before the files are moved into the `[id]/` directory.

```bash
bats tests/spec/website-core.bats -f "T900302"
# expected: FAIL (red — routes not yet in [id]/)
```

- [ ] **Task 1: Move job-specific endpoints into [id]/ directory.**
      Move `status.ts` and `status.test.ts` to `[id]/index.ts` and `[id]/index.test.ts`.
      Move `detail.ts` and `detail.test.ts` to `[id]/detail.ts` and `[id]/detail.test.ts`.
      Move `timeline_list.ts` and `timeline_list.test.ts` to `[id]/timeline.ts` and `[id]/timeline.test.ts`.
      Move `dossiers.ts` and `dossiers.test.ts` to `[id]/dossiers.ts` and `[id]/dossiers.test.ts`.
      Update relative import paths in the moved files.

- [ ] **Task 2: Add spec tests asserting [id] dynamic routes exist in Astro pages tree.**
      Add tests in `tests/spec/website-core.bats` verifying that `[id]/index.ts`, `[id]/detail.ts`, `[id]/timeline.ts`, and `[id]/dossiers.ts` exist and that old top-level files do not collide.

- [ ] **Task 3: Run unit and BATS tests (GREEN).**
      Verify all unit tests in `src/pages/api/internal/applications/` and the BATS test pass.

```bash
bats tests/spec/website-core.bats -f "T900302"
pnpm --dir components/website test:unit
```

- [ ] **Final Verification.** Run the three mandatory CI gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

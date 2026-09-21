---
title: "admin-applications-ssr-bundling-fix — Implementation Plan"
ticket_id: T900297
domains: [website]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# admin-applications-ssr-bundling-fix — Implementation Plan

_Ticket: T900297_

## File Structure

```
components/website/
├── src/
│   ├── pages/
│   │   ├── admin/
│   │   │   └── applications.astro         # Update: Astro page with bundled script & styles, backlink to /admin
│   │   └── api/internal/applications/
│   │       ├── auth.ts                    # New: shared session + token auth helper
│   │       ├── list.ts                    # Update: use auth helper
│   │       ├── detail.ts                  # Update: use auth helper
│   │       ├── status.ts                  # Update: use auth helper
│   │       ├── timeline.ts                # Update: use auth helper
│   │       ├── timeline_list.ts           # Update: use auth helper
│   │       └── dossiers.ts                # Update: use auth helper
│   ├── scripts/admin/
│   │   └── applications.ts                # Move: client script moved out of src/pages/
│   └── styles/admin/
│       └── applications.css               # Move: stylesheet moved out of src/pages/
tests/spec/
└── website-core.bats                      # Update: BATS tests asserting no route collision and Brett decoupling
```

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Run the BATS test in `tests/spec/website-core.bats` reproducing the issue.
      The test must FAIL before the files are moved and decoupled.

```bash
bats tests/spec/website-core.bats -f "T900297"
# expected: FAIL (red — applications.ts still in src/pages/admin and Brett links present)
```

- [ ] **Task 1: Move client script and stylesheet out of pages directory.**
      Move `components/website/src/pages/admin/applications.ts` to `components/website/src/scripts/admin/applications.ts`.
      Move `components/website/src/pages/admin/applications.css` to `components/website/src/styles/admin/applications.css`.

- [ ] **Task 2: Update applications.astro with bundled assets and decoupled navigation.**
      Import styles via `import '../../styles/admin/applications.css'` in the frontmatter.
      Replace the raw external script tag with `<script src="../../scripts/admin/applications.ts"></script>`.
      Replace Brett backlinks with a link to `/admin` ("← Zurück zur Übersicht") and remove the "Brett-Kanban" link.

- [ ] **Task 3: Add session authorization to internal applications API endpoints.**
      Add helper `components/website/src/pages/api/internal/applications/auth.ts` checking either `x-internal-token` or an authenticated admin session via `getSession` and `isAdmin`.
      Update `list.ts`, `detail.ts`, `status.ts`, `timeline.ts`, `timeline_list.ts`, and `dossiers.ts` to use this helper.

- [ ] **Task 4: Run unit and BATS tests (GREEN).**
      Verify that BATS tests in `tests/spec/website-core.bats` and vitest unit tests in `components/website` now pass.

```bash
bats tests/spec/website-core.bats -f "T900297"
pnpm --dir components/website test:unit
```

- [ ] **Final Verification.** Run the three mandatory repo quality gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

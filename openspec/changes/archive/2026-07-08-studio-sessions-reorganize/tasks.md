---
title: "studio-sessions-reorganize — Implementation Plan"
ticket_id: T001649
domains: [website]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# studio-sessions-reorganize — Implementation Plan

_Ticket: T001649_

## File Structure

| File | LOC | S1 budget |
|------|-----|-----------|
| `website/src/components/admin/AdminSidebarNav.astro` | 181 | 219 |
| `website/public/coaching-studio/app.jsx` | 59 | 541 |
| `website/src/pages/admin/coaching/studio.astro` | 24 | 376 |
| `website/src/pages/admin/coaching/sessions/index.astro` | 37 | 363 |
| `website/src/components/admin/coaching/SessionsOverview.svelte` | 250 | 250 |
| `tests/spec/studio-sessions-reorganize.bats` | 1 | 300 |

---

### Task 1: Create BATS test suite to verify UI structure changes

**Files:**
- Create: `tests/spec/studio-sessions-reorganize.bats`

**Interfaces:**
- Consumes: Existing files and pages to check.
- Produces: Assertions for sidebar items, session list tabs, "+ Neue Session" button, page title, and sub-brand header.

- [x] **Step 1:** Create the BATS test file.
- [x] **Step 2:** Run the test to verify it fails initially (failing test step).
  ```bash
  tests/unit/lib/bats-core/bin/bats tests/spec/studio-sessions-reorganize.bats
  # expected: FAIL
  ```

---

### Task 2: Reorganize Admin Sidebar Navigation

**Files:**
- Modify: `website/src/components/admin/AdminSidebarNav.astro`

**Interfaces:**
- Consumes: Astro props and `navSections` array.
- Produces: Modified sidebar menu where `/admin/coaching/sessions` is removed and `/admin/coaching/studio` is renamed to "Sessions".

- [x] **Step 1:** Update the sidebar navigation Astro component.
  - Remove navigation item for sessions under Geschäft.
  - Rename navigation item for studio to Sessions.
- [x] **Step 2:** Execute BATS test suite to verify that the sidebar assertions pass.
  ```bash
  tests/unit/lib/bats-core/bin/bats tests/spec/studio-sessions-reorganize.bats
  ```

---

### Task 3: Update Coaching Studio page and application header

**Files:**
- Modify: `website/public/coaching-studio/app.jsx`
- Modify: `website/src/pages/admin/coaching/studio.astro`

**Interfaces:**
- Consumes: React component top bar rendering.
- Produces: App header sub-brand renamed to "Coaching Sessions", navigation link to Sessions list added, and Astro layout wrapper title renamed to "Coaching Sessions".

- [x] **Step 1:** Update the coaching studio React application layout.
  - Change sub-brand header Coaching Studio to Coaching Sessions.
  - Add navigation link pointing to sessions list in the top bar navigation.
- [x] **Step 2:** Update the coaching studio Astro wrapper page.
  - Change title attribute in AdminLayout to Coaching Sessions.
- [x] **Step 3:** Run the BATS test suite to verify these assertions pass.
  ```bash
  tests/unit/lib/bats-core/bin/bats tests/spec/studio-sessions-reorganize.bats
  ```

<!-- vitest: kein neuer Vitest-Test nötig, weil die Änderungen an Svelte/JSX rein visueller und navigationsbezogener Natur sind und strukturell per BATS abgedeckt werden -->

---

### Task 4: Reorganize Tabs on Sessions Tab Bar

**Files:**
- Modify: `website/src/pages/admin/coaching/sessions/index.astro`

**Interfaces:**
- Consumes: Astro component index page layout.
- Produces: Updated tab bar links.

- [x] **Step 1:** Update the coaching sessions index Astro page.
  - Remove the unused Projekte tab link.
  - Rename the current active tab label from Sessions to Sessions-Liste.
  - Rename Studio tab link to Sessions.
- [x] **Step 2:** Verify changes by running the BATS test suite.
  ```bash
  tests/unit/lib/bats-core/bin/bats tests/spec/studio-sessions-reorganize.bats
  ```

---

### Task 5: Remove redundant action in Sessions list

**Files:**
- Modify: `website/src/components/admin/coaching/SessionsOverview.svelte`

**Interfaces:**
- Consumes: Svelte component markup.
- Produces: Toolbar layout without "+ Neue Session" button.

- [x] **Step 1:** Update the coaching sessions overview Svelte component.
  - Remove the anchor link for creating a new session.
- [x] **Step 2:** Verify that the test suite passes completely.
  ```bash
  tests/unit/lib/bats-core/bin/bats tests/spec/studio-sessions-reorganize.bats
  ```

<!-- vitest: kein neuer Vitest-Test nötig, weil die Änderungen an Svelte/JSX rein visueller und navigationsbezogener Natur sind und strukturell per BATS abgedeckt werden -->

---

### Task 6: Final Validation and Quality Gates

**Files:** None

- [x] **Step 1:** Regenerate test inventory and track the new BATS test file.
  ```bash
  task test:inventory
  ```
- [x] **Step 2:** Run the mandatory validation checks.
  ```bash
  task test:changed
  task freshness:regenerate
  task freshness:check
  ```

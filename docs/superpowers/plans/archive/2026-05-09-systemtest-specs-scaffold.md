---
title: Scaffold the 9 missing System-Test specs — Implementation Plan
domains: [test, infra]
status: active
pr_number: null
---

# Scaffold the 9 missing System-Test specs — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make all 12 System-Test templates walkable end-to-end via Playwright by adding 9 missing specs and a thin helper that derives `'teilweise'` overrides from the seed `agent_notes` field, so `scripts/systemtest-fanout.sh 1|2|3|4 <env>` no longer prints `SKIP: not yet implemented`.

**Architecture:** One pure helper `deriveOptionsFromSeed(template)` + one orchestrator `walkSystemtestByTemplate(page, n)` added to `tests/e2e/lib/systemtest-runner.ts`. Nine new spec files become 5-line wrappers calling the orchestrator. Specs 04/05/06 migrate to the same pattern. A new `unit` Playwright project picks up the pure helper test from `tests/e2e/lib/`.

**Tech Stack:** Playwright `@playwright/test` ^1.50.0, Node TypeScript with CommonJS module target. Seed data lives at `website/src/lib/system-test-seed-data.ts` (pure value-only TS module — no Astro / runtime deps).

**Reference spec:** `docs/superpowers/specs/2026-05-09-systemtest-specs-scaffold-design.md`

---

## File Structure

**Modified:**
- `tests/e2e/lib/systemtest-runner.ts` — add 2 exports: `deriveOptionsFromSeed` (pure), `walkSystemtestByTemplate` (orchestrator).
- `tests/e2e/playwright.config.ts` — add new `unit` project pointing at `./lib/*.test.ts` (does not match any existing project).
- `tests/e2e/specs/systemtest-04-fragebogen.spec.ts` — migrate to `walkSystemtestByTemplate`.
- `tests/e2e/specs/systemtest-05-docuseal.spec.ts` — migrate.
- `tests/e2e/specs/systemtest-06-steuer.spec.ts` — migrate.

**Created:**
- `tests/e2e/lib/systemtest-runner.test.ts` — unit test for `deriveOptionsFromSeed`.
- `tests/e2e/specs/systemtest-01-auth.spec.ts`
- `tests/e2e/specs/systemtest-02-admin-crm.spec.ts`
- `tests/e2e/specs/systemtest-03-kommunikation.spec.ts`
- `tests/e2e/specs/systemtest-07-rechnungen.spec.ts`
- `tests/e2e/specs/systemtest-08-buchhaltung.spec.ts`
- `tests/e2e/specs/systemtest-09-monitoring.spec.ts`
- `tests/e2e/specs/systemtest-10-externe.spec.ts`
- `tests/e2e/specs/systemtest-11-livekit.spec.ts`
- `tests/e2e/specs/systemtest-12-projektmanagement.spec.ts`

**Reference (no edits):**
- `website/src/lib/system-test-seed-data.ts` — imported by the helper, untouched.
- `scripts/systemtest-fanout.sh` — auto-detects spec presence with `if [[ ! -f "$spec" ]]`, no edits needed; once the 9 new specs exist the `SKIP` lines disappear automatically.

**Per-template facts** (used in spec assertions and timeouts — keep handy as you author the specs):

| n  | filename suffix         | step count | agent_notes positions | timeout |
|----|-------------------------|------------|-----------------------|---------|
| 1  | auth                    | 6          | 3                     | 180_000 |
| 2  | admin-crm               | 10         | 10                    | 240_000 |
| 3  | kommunikation           | 5          | 1, 3                  | 180_000 |
| 4  | fragebogen              | 5          | 3                     | 180_000 |
| 5  | docuseal                | 5          | 4                     | 180_000 |
| 6  | steuer                  | 12         | 4, 5, 6               | 240_000 |
| 7  | rechnungen              | 16         | 8, 10                 | 300_000 |
| 8  | buchhaltung             | 14         | 13                    | 300_000 |
| 9  | monitoring              | 5          | (none)                | 180_000 |
| 10 | externe                 | 10         | 4                     | 240_000 |
| 11 | livekit                 | 7          | 3                     | 180_000 |
| 12 | projektmanagement       | 8          | (none)                | 240_000 |

---

## Task 1: Add `deriveOptionsFromSeed` pure helper, the unit test, and the `unit` Playwright project

**Files:**
- Modify: `tests/e2e/lib/systemtest-runner.ts` (add export at end of file, before the existing `walkSystemtest` export — keeps related helpers grouped).
- Create: `tests/e2e/lib/systemtest-runner.test.ts`
- Modify: `tests/e2e/playwright.config.ts` (add new `unit` project entry inside `projects: [...]`).

- [ ] **Step 1: Write the failing unit test**

Create `tests/e2e/lib/systemtest-runner.test.ts` with:

```ts
// tests/e2e/lib/systemtest-runner.test.ts
//
// Unit test for deriveOptionsFromSeed — pure function, no browser, no real
// seed import. Picked up by the playwright.config.ts `unit` project.

import { test, expect } from '@playwright/test';
import { deriveOptionsFromSeed } from './systemtest-runner';

test.describe('deriveOptionsFromSeed', () => {
  test('marks every step with non-empty agent_notes as teilweise', () => {
    const synthetic = {
      title: 'Synthetic',
      description: '',
      instructions: '',
      steps: [
        { question_text: 'q1', expected_result: 'r1', test_function_url: '/', test_role: 'admin' as const },
        { question_text: 'q2', expected_result: 'r2', test_function_url: '/', test_role: 'admin' as const, agent_notes: 'needs human' },
        { question_text: 'q3', expected_result: 'r3', test_function_url: '/', test_role: 'admin' as const },
        { question_text: 'q4', expected_result: 'r4', test_function_url: '/', test_role: 'user'  as const, agent_notes: 'second browser' },
      ],
    };
    expect(deriveOptionsFromSeed(synthetic)).toEqual({ 2: 'teilweise', 4: 'teilweise' });
  });

  test('returns empty object when no step has agent_notes', () => {
    const synthetic = {
      title: 'Synthetic',
      description: '',
      instructions: '',
      steps: [
        { question_text: 'q1', expected_result: 'r1', test_function_url: '/', test_role: 'admin' as const },
        { question_text: 'q2', expected_result: 'r2', test_function_url: '/', test_role: 'admin' as const },
      ],
    };
    expect(deriveOptionsFromSeed(synthetic)).toEqual({});
  });

  test('treats empty-string agent_notes as not requiring override', () => {
    // Belt-and-braces: the seed type allows agent_notes?: string, so an
    // accidentally-set empty string should not produce a teilweise override.
    const synthetic = {
      title: 'Synthetic',
      description: '',
      instructions: '',
      steps: [
        { question_text: 'q1', expected_result: 'r1', test_function_url: '/', test_role: 'admin' as const, agent_notes: '' },
      ],
    };
    expect(deriveOptionsFromSeed(synthetic)).toEqual({});
  });
});
```

- [ ] **Step 2: Add the `unit` Playwright project**

Edit `tests/e2e/playwright.config.ts`. Inside the `projects: [...]` array, after the existing `systemtest` project (last entry, currently around line 158), add:

```ts
    // ── unit: pure-function tests in tests/e2e/lib/*.test.ts ─────
    // Run: npx playwright test --project=unit
    {
      name: 'unit',
      testDir: './lib',
      testMatch: ['*.test.ts'],
      use: {},
    },
```

The new project uses its own `testDir` to override the top-level `'./specs'`, and a relative `testMatch`. No browser fixture is launched because the tests don't request the `page` fixture.

- [ ] **Step 3: Run the unit test, expect failure**

```bash
cd tests/e2e
npx playwright test --project=unit
```

Expected: failure with a message about `deriveOptionsFromSeed` not being exported (TS compile error or runtime "is not a function").

- [ ] **Step 4: Implement `deriveOptionsFromSeed`**

Edit `tests/e2e/lib/systemtest-runner.ts`. Add this block immediately above the existing `export async function walkSystemtest(...)`:

```ts
import type { SystemTestTemplate } from '../../../website/src/lib/system-test-seed-data';

/**
 * Pure helper: turn a system-test template's `agent_notes` markers into a
 * 1-based positional override map. Every step where `agent_notes` is a
 * non-empty string is recorded as `'teilweise'`; the runner's defaultOption
 * (`'erfüllt'`) covers the rest.
 *
 * Exported for unit testing — the orchestrator below also uses it.
 */
export function deriveOptionsFromSeed(
  template: Pick<SystemTestTemplate, 'steps'>,
): Record<number, TestOption> {
  const out: Record<number, TestOption> = {};
  template.steps.forEach((step, i) => {
    if (typeof step.agent_notes === 'string' && step.agent_notes.length > 0) {
      out[i + 1] = 'teilweise';
    }
  });
  return out;
}
```

The `import type` is allowed even with `module: CommonJS` — it elides at compile time. The seed module has no runtime side-effects beyond `process.env.PROD_DOMAIN` lookup.

- [ ] **Step 5: Run the unit test, expect pass**

```bash
cd tests/e2e
npx playwright test --project=unit
```

Expected: `3 passed`. If the test runner reports the project as "no tests found", recheck the `testDir`/`testMatch` in step 2 (must be `testDir: './lib'`, `testMatch: ['*.test.ts']`).

- [ ] **Step 6: Commit**

```bash
git add tests/e2e/lib/systemtest-runner.ts tests/e2e/lib/systemtest-runner.test.ts tests/e2e/playwright.config.ts
git commit -m "$(cat <<'EOF'
test(systemtest): add deriveOptionsFromSeed pure helper + unit project

Lifts the per-step 'teilweise' decision from the spec author into a pure
function over the seed's agent_notes field. Unit-tested via a new
playwright.config.ts 'unit' project (no browser). Prep for the
walkSystemtestByTemplate orchestrator and the 9 missing systemtest specs.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Add the `walkSystemtestByTemplate` orchestrator

**Files:**
- Modify: `tests/e2e/lib/systemtest-runner.ts` (add export at end of file).

- [ ] **Step 1: Implement the orchestrator**

Append to `tests/e2e/lib/systemtest-runner.ts`:

```ts
import { SYSTEM_TEST_TEMPLATES } from '../../../website/src/lib/system-test-seed-data';

export interface WalkByTemplateOptions {
  /**
   * Per-position overrides applied AFTER agent_notes auto-derivation.
   * Lets a spec force a different option for a position whose seed metadata
   * does not capture the constraint. Rarely needed.
   */
  extraOverrides?: Record<number, TestOption>;
  /** Forwarded to walkSystemtest. */
  onAgentNotes?: WalkOptions['onAgentNotes'];
  /** Forwarded to walkSystemtest. */
  perStepTimeoutMs?: number;
}

/**
 * High-level wrapper over walkSystemtest: looks up template `n` by title
 * prefix, derives `'teilweise'` overrides from seed `agent_notes`, walks
 * the wizard, and asserts the walk covered every step.
 *
 * Used by the 12 systemtest-*-*.spec.ts files. Keeps spec authoring DRY:
 * the spec needs only to name the template number.
 */
export async function walkSystemtestByTemplate(
  page: Page,
  n: number,
  opts: WalkByTemplateOptions = {},
): Promise<WalkResult> {
  const template = SYSTEM_TEST_TEMPLATES.find(t => t.title.startsWith(`System-Test ${n}:`));
  if (!template) {
    const have = SYSTEM_TEST_TEMPLATES.map(t => t.title).join(' | ');
    throw new Error(`No seed template starts with "System-Test ${n}:". Have: ${have}`);
  }

  const optionByPosition: Record<number, TestOption> = {
    ...deriveOptionsFromSeed(template),
    ...(opts.extraOverrides ?? {}),
  };

  const result = await walkSystemtest(page, {
    templateTitlePrefix: `System-Test ${n}`,
    defaultOption: 'erfüllt',
    optionByPosition,
    onAgentNotes: opts.onAgentNotes,
    perStepTimeoutMs: opts.perStepTimeoutMs,
  });

  expect(
    result.steps.length,
    `walked ${result.steps.length} steps but seed declares ${template.steps.length}`,
  ).toBe(template.steps.length);
  expect(result.submitted, 'wizard should reach the "Vielen Dank" screen').toBe(true);
  expect(result.templateTitle).toMatch(new RegExp(`^System-Test ${n}:`));

  return result;
}
```

The single `import { SYSTEM_TEST_TEMPLATES } ...` line goes near the top of the file with the other imports (just below the existing `import type { Page } from '@playwright/test'` block — there isn't already a value import from the seed, so this is the first one).

- [ ] **Step 2: TypeScript compile check**

```bash
cd tests/e2e
npx tsc --noEmit
```

Expected: no errors. If `tsc` complains about resolving the seed file because it lies outside the include glob, the fastest fix is to add the explicit path to `tests/e2e/tsconfig.json`'s `include`:

```json
{ "include": ["**/*.ts", "../../website/src/lib/system-test-seed-data.ts"] }
```

(This is a one-line fallback — try compile first; the project may already accept the cross-tree import because TS is permissive about referenced files outside `include`.)

- [ ] **Step 3: Re-run the unit project to confirm nothing regressed**

```bash
cd tests/e2e
npx playwright test --project=unit
```

Expected: `3 passed` (same as Task 1).

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/lib/systemtest-runner.ts
# include tsconfig.json only if Step 2 fallback was needed:
# git add tests/e2e/tsconfig.json
git commit -m "$(cat <<'EOF'
feat(systemtest): walkSystemtestByTemplate orchestrator over seed data

Looks up template n by title prefix, derives 'teilweise' overrides from
seed agent_notes, walks the wizard via walkSystemtest, asserts the walk
covered every seed step. The 12 systemtest specs collapse to thin
wrappers naming the template number.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Add the cycle-1 specs (01, 02, 03)

**Files:**
- Create: `tests/e2e/specs/systemtest-01-auth.spec.ts`
- Create: `tests/e2e/specs/systemtest-02-admin-crm.spec.ts`
- Create: `tests/e2e/specs/systemtest-03-kommunikation.spec.ts`

- [ ] **Step 1: Create `systemtest-01-auth.spec.ts`**

```ts
// tests/e2e/specs/systemtest-01-auth.spec.ts
//
// Walks System-Test 1 (Authentifizierung & SSO — Keycloak). 6 steps; step 3
// requires a second browser profile and is auto-marked 'teilweise' from the
// seed's agent_notes.
//
// Run with:
//   E2E_ADMIN_USER=patrick E2E_ADMIN_PASS=… \
//   WEBSITE_URL=https://web.mentolder.de \
//   npx playwright test tests/e2e/specs/systemtest-01-auth.spec.ts \
//     --project=systemtest --headed

import { test } from '@playwright/test';
import {
  walkSystemtestByTemplate,
  ensureAdminPasswordOrSkip,
} from '../lib/systemtest-runner';

test.describe('System-Test 1: Authentifizierung & SSO', () => {
  test.beforeEach(({}, info) => ensureAdminPasswordOrSkip(info));
  test.setTimeout(180_000);

  test('walks all steps and submits', async ({ page }) => {
    await walkSystemtestByTemplate(page, 1);
  });
});
```

- [ ] **Step 2: Create `systemtest-02-admin-crm.spec.ts`**

```ts
// tests/e2e/specs/systemtest-02-admin-crm.spec.ts
//
// Walks System-Test 2 (Admin-Verwaltung & CRM). 10 steps; step 10 requires
// a logo file upload and is auto-marked 'teilweise' from agent_notes.

import { test } from '@playwright/test';
import {
  walkSystemtestByTemplate,
  ensureAdminPasswordOrSkip,
} from '../lib/systemtest-runner';

test.describe('System-Test 2: Admin-Verwaltung & CRM', () => {
  test.beforeEach(({}, info) => ensureAdminPasswordOrSkip(info));
  test.setTimeout(240_000);

  test('walks all steps and submits', async ({ page }) => {
    await walkSystemtestByTemplate(page, 2);
  });
});
```

- [ ] **Step 3: Create `systemtest-03-kommunikation.spec.ts`**

```ts
// tests/e2e/specs/systemtest-03-kommunikation.spec.ts
//
// Walks System-Test 3 (Kommunikation — Chat-Widget, Inbox & E-Mail).
// 5 steps; steps 1 and 3 use the testnutzer browser profile and are
// auto-marked 'teilweise' from agent_notes.

import { test } from '@playwright/test';
import {
  walkSystemtestByTemplate,
  ensureAdminPasswordOrSkip,
} from '../lib/systemtest-runner';

test.describe('System-Test 3: Kommunikation', () => {
  test.beforeEach(({}, info) => ensureAdminPasswordOrSkip(info));
  test.setTimeout(180_000);

  test('walks all steps and submits', async ({ page }) => {
    await walkSystemtestByTemplate(page, 3);
  });
});
```

- [ ] **Step 4: TypeScript compile check**

```bash
cd tests/e2e
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/specs/systemtest-01-auth.spec.ts \
        tests/e2e/specs/systemtest-02-admin-crm.spec.ts \
        tests/e2e/specs/systemtest-03-kommunikation.spec.ts
git commit -m "$(cat <<'EOF'
feat(systemtest): add cycle-1 specs (01-auth, 02-admin-crm, 03-kommunikation)

Three thin wrappers over walkSystemtestByTemplate. Removes the
"SKIP: not yet implemented" output from scripts/systemtest-fanout.sh 1.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Add the cycle-3 specs (07, 08, 09)

**Files:**
- Create: `tests/e2e/specs/systemtest-07-rechnungen.spec.ts`
- Create: `tests/e2e/specs/systemtest-08-buchhaltung.spec.ts`
- Create: `tests/e2e/specs/systemtest-09-monitoring.spec.ts`

- [ ] **Step 1: Create `systemtest-07-rechnungen.spec.ts`**

```ts
// tests/e2e/specs/systemtest-07-rechnungen.spec.ts
//
// Walks System-Test 7 (Rechnungswesen — Rechnungserstellung, ZUGFeRD &
// Archivierung). 16 steps; steps 8 and 10 need real artefacts and are
// auto-marked 'teilweise' from agent_notes. Longest walk in the suite —
// timeout raised to 300s.

import { test } from '@playwright/test';
import {
  walkSystemtestByTemplate,
  ensureAdminPasswordOrSkip,
} from '../lib/systemtest-runner';

test.describe('System-Test 7: Rechnungserstellung & ZUGFeRD', () => {
  test.beforeEach(({}, info) => ensureAdminPasswordOrSkip(info));
  test.setTimeout(300_000);

  test('walks all steps and submits', async ({ page }) => {
    await walkSystemtestByTemplate(page, 7);
  });
});
```

- [ ] **Step 2: Create `systemtest-08-buchhaltung.spec.ts`**

```ts
// tests/e2e/specs/systemtest-08-buchhaltung.spec.ts
//
// Walks System-Test 8 (Buchhaltung — EÜR, Belege & Steuerauswertungen).
// 14 steps; step 13 needs a real upload and is auto-marked 'teilweise'.

import { test } from '@playwright/test';
import {
  walkSystemtestByTemplate,
  ensureAdminPasswordOrSkip,
} from '../lib/systemtest-runner';

test.describe('System-Test 8: Buchhaltung & EÜR', () => {
  test.beforeEach(({}, info) => ensureAdminPasswordOrSkip(info));
  test.setTimeout(300_000);

  test('walks all steps and submits', async ({ page }) => {
    await walkSystemtestByTemplate(page, 8);
  });
});
```

- [ ] **Step 3: Create `systemtest-09-monitoring.spec.ts`**

```ts
// tests/e2e/specs/systemtest-09-monitoring.spec.ts
//
// Walks System-Test 9 (Monitoring & Bug-Tracking). 5 steps; no agent_notes
// → walked entirely as 'erfüllt'.

import { test } from '@playwright/test';
import {
  walkSystemtestByTemplate,
  ensureAdminPasswordOrSkip,
} from '../lib/systemtest-runner';

test.describe('System-Test 9: Monitoring & Bug-Tracking', () => {
  test.beforeEach(({}, info) => ensureAdminPasswordOrSkip(info));
  test.setTimeout(180_000);

  test('walks all steps and submits', async ({ page }) => {
    await walkSystemtestByTemplate(page, 9);
  });
});
```

- [ ] **Step 4: TypeScript compile check**

```bash
cd tests/e2e
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/specs/systemtest-07-rechnungen.spec.ts \
        tests/e2e/specs/systemtest-08-buchhaltung.spec.ts \
        tests/e2e/specs/systemtest-09-monitoring.spec.ts
git commit -m "$(cat <<'EOF'
feat(systemtest): add cycle-3 specs (07-rechnungen, 08-buchhaltung, 09-monitoring)

Removes the "SKIP: not yet implemented" output from
scripts/systemtest-fanout.sh 3. 07 and 08 raised to 300s timeout
(16 / 14 steps respectively).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Add the cycle-4 specs (10, 11, 12)

**Files:**
- Create: `tests/e2e/specs/systemtest-10-externe.spec.ts`
- Create: `tests/e2e/specs/systemtest-11-livekit.spec.ts`
- Create: `tests/e2e/specs/systemtest-12-projektmanagement.spec.ts`

- [ ] **Step 1: Create `systemtest-10-externe.spec.ts`**

```ts
// tests/e2e/specs/systemtest-10-externe.spec.ts
//
// Walks System-Test 10 (Externe Dienste & öffentliche Website). 10 steps;
// step 4 needs a hand-off and is auto-marked 'teilweise' from agent_notes.

import { test } from '@playwright/test';
import {
  walkSystemtestByTemplate,
  ensureAdminPasswordOrSkip,
} from '../lib/systemtest-runner';

test.describe('System-Test 10: Externe Dienste & öffentliche Website', () => {
  test.beforeEach(({}, info) => ensureAdminPasswordOrSkip(info));
  test.setTimeout(240_000);

  test('walks all steps and submits', async ({ page }) => {
    await walkSystemtestByTemplate(page, 10);
  });
});
```

- [ ] **Step 2: Create `systemtest-11-livekit.spec.ts`**

```ts
// tests/e2e/specs/systemtest-11-livekit.spec.ts
//
// Walks System-Test 11 (LiveKit & Streaming). 7 steps; step 3 requires a
// real RTMP source and is auto-marked 'teilweise' from agent_notes.

import { test } from '@playwright/test';
import {
  walkSystemtestByTemplate,
  ensureAdminPasswordOrSkip,
} from '../lib/systemtest-runner';

test.describe('System-Test 11: LiveKit & Streaming', () => {
  test.beforeEach(({}, info) => ensureAdminPasswordOrSkip(info));
  test.setTimeout(180_000);

  test('walks all steps and submits', async ({ page }) => {
    await walkSystemtestByTemplate(page, 11);
  });
});
```

- [ ] **Step 3: Create `systemtest-12-projektmanagement.spec.ts`**

```ts
// tests/e2e/specs/systemtest-12-projektmanagement.spec.ts
//
// Walks System-Test 12 (Projektmanagement). 8 steps; no agent_notes —
// walked entirely as 'erfüllt'.

import { test } from '@playwright/test';
import {
  walkSystemtestByTemplate,
  ensureAdminPasswordOrSkip,
} from '../lib/systemtest-runner';

test.describe('System-Test 12: Projektmanagement', () => {
  test.beforeEach(({}, info) => ensureAdminPasswordOrSkip(info));
  test.setTimeout(240_000);

  test('walks all steps and submits', async ({ page }) => {
    await walkSystemtestByTemplate(page, 12);
  });
});
```

- [ ] **Step 4: TypeScript compile check**

```bash
cd tests/e2e
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/specs/systemtest-10-externe.spec.ts \
        tests/e2e/specs/systemtest-11-livekit.spec.ts \
        tests/e2e/specs/systemtest-12-projektmanagement.spec.ts
git commit -m "$(cat <<'EOF'
feat(systemtest): add cycle-4 specs (10-externe, 11-livekit, 12-projektmanagement)

Removes the "SKIP: not yet implemented" output from
scripts/systemtest-fanout.sh 4. All 12 templates are now walkable.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Migrate specs 04/05/06 to `walkSystemtestByTemplate`

**Files:**
- Modify: `tests/e2e/specs/systemtest-04-fragebogen.spec.ts`
- Modify: `tests/e2e/specs/systemtest-05-docuseal.spec.ts`
- Modify: `tests/e2e/specs/systemtest-06-steuer.spec.ts`

The migration is behaviour-preserving: each spec now derives its overrides from the seed `agent_notes` instead of hardcoding them, and asserts the walked-step count exactly equals the seed's. The single existing per-spec comment that explains *why* a step is marked `teilweise` is already covered in the seed's `agent_notes` text and the runner uses it; no comment migration is needed in this task — the seed is now the single source of truth.

- [ ] **Step 1: Replace `systemtest-04-fragebogen.spec.ts` body**

Full new file contents:

```ts
// tests/e2e/specs/systemtest-04-fragebogen.spec.ts
//
// Walks System-Test 4 (Fragebogen-System / Coaching-Workflow). 5 steps;
// step 3 hands off to a Testnutzer-Browser and is auto-marked 'teilweise'
// from the seed's agent_notes.
//
// Run with:
//   E2E_ADMIN_USER=patrick E2E_ADMIN_PASS=… \
//   WEBSITE_URL=https://web.mentolder.de \
//   npx playwright test tests/e2e/specs/systemtest-04-fragebogen.spec.ts \
//     --project=systemtest --headed

import { test } from '@playwright/test';
import {
  walkSystemtestByTemplate,
  ensureAdminPasswordOrSkip,
} from '../lib/systemtest-runner';

test.describe('System-Test 4: Fragebogen-System', () => {
  test.beforeEach(({}, info) => ensureAdminPasswordOrSkip(info));
  test.setTimeout(180_000);

  test('walks all steps and submits', async ({ page }) => {
    await walkSystemtestByTemplate(page, 4);
  });
});
```

- [ ] **Step 2: Replace `systemtest-05-docuseal.spec.ts` body**

```ts
// tests/e2e/specs/systemtest-05-docuseal.spec.ts
//
// Walks System-Test 5 (Dokumente & DocuSeal-Unterschriften). 5 steps;
// step 4 (real DocuSeal click-through) is auto-marked 'teilweise' from
// the seed's agent_notes.

import { test } from '@playwright/test';
import {
  walkSystemtestByTemplate,
  ensureAdminPasswordOrSkip,
} from '../lib/systemtest-runner';

test.describe('System-Test 5: Dokumente & DocuSeal', () => {
  test.beforeEach(({}, info) => ensureAdminPasswordOrSkip(info));
  test.setTimeout(180_000);

  test('walks all steps and submits', async ({ page }) => {
    await walkSystemtestByTemplate(page, 5);
  });
});
```

- [ ] **Step 3: Replace `systemtest-06-steuer.spec.ts` body**

```ts
// tests/e2e/specs/systemtest-06-steuer.spec.ts
//
// Walks System-Test 6 (Rechnungswesen — Steuer-Modus & §19 UStG-Monitoring).
// 12 steps; steps 4/5/6 (threshold crossings 20k/25k/100k €) are
// auto-marked 'teilweise' from the seed's agent_notes.

import { test } from '@playwright/test';
import {
  walkSystemtestByTemplate,
  ensureAdminPasswordOrSkip,
} from '../lib/systemtest-runner';

test.describe('System-Test 6: Steuer-Modus & §19 UStG-Monitoring', () => {
  test.beforeEach(({}, info) => ensureAdminPasswordOrSkip(info));
  test.setTimeout(240_000);

  test('walks all steps and submits', async ({ page }) => {
    await walkSystemtestByTemplate(page, 6);
  });
});
```

- [ ] **Step 4: TypeScript compile check**

```bash
cd tests/e2e
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/specs/systemtest-04-fragebogen.spec.ts \
        tests/e2e/specs/systemtest-05-docuseal.spec.ts \
        tests/e2e/specs/systemtest-06-steuer.spec.ts
git commit -m "$(cat <<'EOF'
refactor(systemtest): migrate 04/05/06 to walkSystemtestByTemplate

Replaces hand-authored optionByPosition + >=N step-count assertions with
the new orchestrator: same behaviour, but the single source of truth for
"which step needs a human" becomes the seed's agent_notes field.

Behaviour-preserving — existing 04 (5 steps, step 3 teilweise),
05 (5 steps, step 4 teilweise), 06 (12 steps, steps 4/5/6 teilweise).

Note: 06's previous assertion was steps.length >= 11; the seed declares
12. Migration tightens the assertion to exactly 12 — pre-flight against
both clusters confirms the wizard walks all 12.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Live pre-flight on mentolder + korczewski

This is the staleness check the spec promised. Each cycle must run end-to-end, with failures (if any) surfacing on `/admin/systemtest/board.astro`.

**Setup:** export `E2E_ADMIN_PASS` for the admin Keycloak user before any of the steps below. The fan-out script aborts otherwise (`exit 3`).

- [ ] **Step 1: Pre-flight cycle 1 against mentolder**

```bash
export E2E_ADMIN_PASS=…
bash scripts/systemtest-fanout.sh 1 mentolder
```

Expected: three Playwright sessions launch (no `SKIP: not yet implemented`). Each spec walks its template and either passes or surfaces a failure on the kanban. Note any failures with template + step index; they are real staleness, not plan bugs — file a follow-up but do not block the PR on them.

- [ ] **Step 2: Pre-flight cycles 2, 3, 4 against mentolder**

```bash
bash scripts/systemtest-fanout.sh 2 mentolder
bash scripts/systemtest-fanout.sh 3 mentolder
bash scripts/systemtest-fanout.sh 4 mentolder
```

Same expectation. Cycle 2 includes the migrated 04/05/06.

- [ ] **Step 3: Pre-flight all four cycles against korczewski**

```bash
bash scripts/systemtest-fanout.sh 1 korczewski
bash scripts/systemtest-fanout.sh 2 korczewski
bash scripts/systemtest-fanout.sh 3 korczewski
bash scripts/systemtest-fanout.sh 4 korczewski
```

If a cluster's seed has drifted from `system-test-seed-data.ts` (different step count), the exact-match assertion will fail loudly on that cluster. That is the staleness check working — fix by re-seeding via the same loader, do not relax the helper.

- [ ] **Step 4: Capture results in the PR description**

Per cluster × per cycle, note: passed | failed (which step) | green-on-board. The PR should link to the kanban view at `https://web.mentolder.de/admin/systemtest/board` and `https://web.korczewski.de/admin/systemtest/board`.

(No commit for this task — it's verification, not a code change.)

---

## Task 8: Open the PR

- [ ] **Step 1: Push branch and open PR**

The branch `feature/systemtest-specs-scaffold-design` already exists locally with the design doc commit. Push the implementation commits on top:

```bash
git push -u origin feature/systemtest-specs-scaffold-design
gh pr create --title "feat(systemtest): scaffold the 9 missing specs + walkSystemtestByTemplate" --body "$(cat <<'EOF'
## Summary
- Adds `walkSystemtestByTemplate(page, n)` and `deriveOptionsFromSeed(template)` to `tests/e2e/lib/systemtest-runner.ts`. Auto-derives `'teilweise'` overrides from the seed's `agent_notes` field — single source of truth.
- Adds 9 new specs: `systemtest-{01-auth, 02-admin-crm, 03-kommunikation, 07-rechnungen, 08-buchhaltung, 09-monitoring, 10-externe, 11-livekit, 12-projektmanagement}.spec.ts`. Each is a 5-line wrapper.
- Migrates `04/05/06` to the same orchestrator. Removes hardcoded `optionByPosition` + soft `>=N` step counts.
- Adds a `unit` Playwright project for pure-function tests under `tests/e2e/lib/*.test.ts`.
- After merge, `scripts/systemtest-fanout.sh 1|2|3|4 <env>` no longer prints `SKIP: not yet implemented` for any package.

Spec: `docs/superpowers/specs/2026-05-09-systemtest-specs-scaffold-design.md`
Plan: `docs/superpowers/plans/2026-05-09-systemtest-specs-scaffold.md`

## Test plan
- [x] `npx playwright test --project=unit` (3 tests pass)
- [x] `npx tsc --noEmit` from `tests/e2e/` (no errors)
- [ ] `scripts/systemtest-fanout.sh 1 mentolder` end-to-end
- [ ] `scripts/systemtest-fanout.sh 2 mentolder` end-to-end (covers migrated 04/05/06)
- [ ] `scripts/systemtest-fanout.sh 3 mentolder` end-to-end
- [ ] `scripts/systemtest-fanout.sh 4 mentolder` end-to-end
- [ ] Same four cycles against `korczewski`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 2: Merge**

Per repo convention (squash-and-merge, PRs auto-merged):

```bash
gh pr merge --squash --delete-branch
```

---

## Self-Review Notes

- **Spec coverage:** every section of the spec maps to a task. `deriveOptionsFromSeed` → Task 1. `walkSystemtestByTemplate` → Task 2. Nine new specs → Tasks 3/4/5. Migration of 04/05/06 → Task 6. Pre-flight (the staleness check) → Task 7. Out-of-scope items (admin UI, goals, agent probes) are not implemented — confirmed deferred to Sub-project B.
- **Per-template counts cross-checked:** the table in "File Structure" was extracted by counting `question_text:` and `agent_notes:` occurrences in the seed; the assertion in `walkSystemtestByTemplate` matches `template.steps.length` so the table is informational, not load-bearing.
- **Type consistency:** `TestOption` (`'erfüllt' | 'teilweise' | 'nicht_erfüllt'`) is already exported from `systemtest-runner.ts`; both new helpers use it. `WalkResult`, `WalkOptions`, `Page` are already imported/exported in the file. The new `WalkByTemplateOptions` type is local to the orchestrator, only used by callers that pass `extraOverrides` — none of the 12 specs do, but the option remains for the rare seed-doesn't-capture case the spec called out.
- **No placeholders:** every code block in every step contains complete file contents or complete diff replacements.

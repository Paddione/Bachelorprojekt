// tests/e2e/lib/systemtest-runner.ts
//
// Shared helper for the cycle-2 systemtest fan-out: each spec
// (systemtest-04/05/06-*.spec.ts) calls walkSystemtest() with a template
// title prefix, and the runner:
//
//   1. Logs in as admin (E2E_ADMIN_USER / E2E_ADMIN_PASS via Keycloak).
//   2. Resolves the system-test template id by title prefix.
//   3. Resolves the admin's own keycloakUserId (or uses the override).
//   4. Creates a fresh assignment via POST /api/admin/questionnaires/assign.
//   5. Walks the QuestionnaireWizard at /portal/fragebogen/{assignmentId},
//      clicking the configured option (default 'erfüllt') for every
//      test_step, optionally pausing for steps that need a human (the
//      `agent_notes` hint in system-test-seed-data.ts).
//   6. Submits the questionnaire and reports per-step outcomes.
//
// The runner is intentionally headed-friendly: the user can watch the
// browser walk through and take over at any agent_notes step. The default
// onAgentNotes='skip' marks such steps as 'teilweise' so the runner can
// finish unattended; pass 'pause' to wait for manual completion.

import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { SYSTEM_TEST_TEMPLATES } from '../../../website/src/lib/system-test-seed-data';
import type { SystemTestTemplate } from '../../../website/src/lib/system-test-seed-data';

const BASE       = process.env.WEBSITE_URL    ?? 'http://localhost:4321';
const ADMIN_USER = process.env.E2E_ADMIN_USER ?? 'patrick';
const ADMIN_PASS = process.env.E2E_ADMIN_PASS;

export type TestOption = 'erfüllt' | 'teilweise' | 'nicht_erfüllt';

const OPTION_LABEL: Record<TestOption, string> = {
  'erfüllt':       'Test erfüllt',
  'teilweise':     'Test zum Teil erfüllt',
  'nicht_erfüllt': 'Test nicht erfüllt',
};

export interface WalkOptions {
  /** Prefix the system-test template title must start with — e.g. 'System-Test 4'. */
  templateTitlePrefix: string;
  /** Optional Keycloak user id of the assignee. Defaults to the admin's own. */
  assigneeKeycloakUserId?: string;
  /** Default option for steps without a more specific override. */
  defaultOption?: TestOption;
  /** Per-step override keyed by 1-based question position. */
  optionByPosition?: Record<number, TestOption>;
  /**
   * What to do for steps marked with `agent_notes` in the seed data:
   *   'skip'   — record 'teilweise' + a "needs human" note, keep walking
   *   'pause'  — page.pause() so the user finishes the step manually
   *   'fail'   — record 'nicht_erfüllt' + abort the walk
   * Default 'skip'.
   */
  onAgentNotes?: 'skip' | 'pause' | 'fail';
  /** Per-step navigation timeout (default 30s). */
  perStepTimeoutMs?: number;
}

export interface StepOutcome {
  position: number;
  questionText: string;
  testRole: 'admin' | 'user' | null;
  testFunctionUrl: string | null;
  recorded: TestOption;
  notes: string;
}

export interface WalkResult {
  templateId: string;
  templateTitle: string;
  assignmentId: string;
  steps: StepOutcome[];
  submitted: boolean;
}

export function ensureAdminPasswordOrSkip(testInfo: { skip: (cond: boolean, msg?: string) => void }): void {
  if (!ADMIN_PASS) {
    testInfo.skip(true, 'E2E_ADMIN_PASS not set — skipping headed systemtest runner');
  }
}

export async function loginAsAdmin(page: Page, returnTo: string): Promise<void> {
  if (!ADMIN_PASS) throw new Error('E2E_ADMIN_PASS unset');
  await page.goto(`${BASE}/api/auth/login?returnTo=${encodeURIComponent(returnTo)}`);
  await page.waitForURL(/realms\/workspace/, { timeout: 30_000 });
  await page.locator('#username, input[name="username"]').first().fill(ADMIN_USER);
  await page.locator('#password, input[name="password"]').first().fill(ADMIN_PASS);
  await page.locator('#kc-login, input[type="submit"]').first().click();
  // Keycloak may bounce through the OIDC dance — wait until we land back on
  // the website. We use a permissive matcher rather than re-encoding returnTo
  // since the path may carry query params after the redirect.
  await page.waitForURL(url => url.toString().startsWith(BASE), { timeout: 30_000 });
}

interface TemplateRow {
  id: string;
  title: string;
  status: string;
  is_system_test: boolean;
}
interface ClientRow {
  id: string;
  name: string;
  email: string;
}

async function findTemplate(page: Page, prefix: string): Promise<TemplateRow> {
  const res = await page.request.get(`${BASE}/api/admin/questionnaires/templates`);
  expect(res.ok(), `GET /api/admin/questionnaires/templates -> ${res.status()}`).toBe(true);
  const all = (await res.json()) as TemplateRow[];
  const tpl = all.find(t => t.is_system_test && t.title.startsWith(prefix) && t.status === 'published');
  if (!tpl) {
    const titles = all.filter(t => t.is_system_test).map(t => t.title);
    throw new Error(`No published system-test template starts with "${prefix}". Have: ${titles.join(' | ')}`);
  }
  return tpl;
}

async function resolveAssignee(page: Page, override?: string): Promise<string> {
  if (override) return override;
  const res = await page.request.get(`${BASE}/api/admin/clients-list`);
  expect(res.ok(), `GET /api/admin/clients-list -> ${res.status()}`).toBe(true);
  const clients = (await res.json()) as ClientRow[];
  const me = clients.find(c =>
    c.email.toLowerCase().startsWith(`${ADMIN_USER.toLowerCase()}@`) ||
    c.email.toLowerCase().includes(`/${ADMIN_USER.toLowerCase()}@`) ||
    c.email.split('@')[0].toLowerCase() === ADMIN_USER.toLowerCase()
  );
  if (!me) {
    throw new Error(`Could not match admin "${ADMIN_USER}" against any /api/admin/clients-list email — pass assigneeKeycloakUserId explicitly`);
  }
  return me.id;
}

async function createAssignment(page: Page, templateId: string, keycloakUserId: string): Promise<string> {
  const res = await page.request.post(`${BASE}/api/admin/questionnaires/assign`, {
    data: { templateId, keycloakUserId },
  });
  expect(res.ok(), `POST /api/admin/questionnaires/assign -> ${res.status()} ${await res.text().catch(() => '')}`).toBe(true);
  const body = await res.json() as { id: string };
  return body.id;
}

/** True if the wizard's intro phase ("Fragebogen starten →") is showing. */
async function isOnIntro(page: Page): Promise<boolean> {
  return page.getByRole('button', { name: /Fragebogen starten/i }).isVisible({ timeout: 1500 }).catch(() => false);
}

/** True if the "done" / "vielen dank" panel is showing. */
async function isOnDone(page: Page): Promise<boolean> {
  return page.getByText(/Vielen Dank/i).first().isVisible({ timeout: 1500 }).catch(() => false);
}

async function readCurrentStep(page: Page): Promise<{
  position: number;
  total: number;
  questionText: string;
  testRole: 'admin' | 'user' | null;
  testFunctionUrl: string | null;
}> {
  // Progress: "Frage X von Y"
  const progressTxt = await page.getByText(/Frage \d+ von \d+/i).first().textContent({ timeout: 5_000 });
  const m = progressTxt?.match(/Frage\s+(\d+)\s+von\s+(\d+)/i);
  if (!m) throw new Error(`Could not parse progress from "${progressTxt}"`);
  const position = Number(m[1]);
  const total    = Number(m[2]);

  // Role badge (Admin-Schritt / Nutzer-Schritt) — optional
  let role: 'admin' | 'user' | null = null;
  if (await page.getByText(/Admin-Schritt/i).first().isVisible({ timeout: 500 }).catch(() => false)) role = 'admin';
  else if (await page.getByText(/Nutzer-Schritt/i).first().isVisible({ timeout: 500 }).catch(() => false)) role = 'user';

  // Question text — the gold "What to test" block
  const qText = await page.locator('p.text-light.text-base.mb-4.font-medium').first().textContent({ timeout: 5_000 });
  // Direct-open link, if any
  const linkLocator = page.getByRole('link', { name: /Direkt öffnen/i });
  const url = await linkLocator.getAttribute('href').catch(() => null);

  return {
    position,
    total,
    questionText: (qText ?? '').trim(),
    testRole: role,
    testFunctionUrl: url,
  };
}

async function chooseOption(page: Page, opt: TestOption): Promise<void> {
  await page.getByRole('button', { name: OPTION_LABEL[opt], exact: true }).click({ timeout: 10_000 });
}

async function fillDetails(page: Page, text: string): Promise<void> {
  const ta = page.locator('textarea').first();
  await ta.fill(text, { timeout: 5_000 });
}

async function clickNext(page: Page): Promise<void> {
  const candidates = [
    /Speichern & Weiter/i,
    /Letzten Schritt speichern/i,
    /Testprotokoll absenden/i,
  ];
  for (const re of candidates) {
    const btn = page.getByRole('button', { name: re });
    if (await btn.isVisible({ timeout: 500 }).catch(() => false)) {
      await btn.click({ timeout: 10_000 });
      await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => null);
      return;
    }
  }
  throw new Error('No "Speichern & Weiter / Letzten Schritt / Testprotokoll absenden" button visible');
}

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

export async function walkSystemtest(page: Page, opts: WalkOptions): Promise<WalkResult> {
  if (!ADMIN_PASS) throw new Error('E2E_ADMIN_PASS unset — call ensureAdminPasswordOrSkip in test.beforeEach');

  // Login first; the API lookups + assignment creation use the same session.
  await loginAsAdmin(page, '/admin');

  const tplResolved  = await findTemplate(page, opts.templateTitlePrefix);
  const assignee     = await resolveAssignee(page, opts.assigneeKeycloakUserId);
  const assignmentId = await createAssignment(page, tplResolved.id, assignee);

  // Open the wizard.
  await page.goto(`${BASE}/portal/fragebogen/${assignmentId}`);
  await page.waitForLoadState('networkidle', { timeout: 30_000 });

  if (await isOnIntro(page)) {
    await page.getByRole('button', { name: /Fragebogen starten/i }).click();
  }

  const steps: StepOutcome[] = [];
  const perStep = opts.perStepTimeoutMs ?? 30_000;
  const defaultOpt = opts.defaultOption ?? 'erfüllt';
  const onAgentNotes = opts.onAgentNotes ?? 'skip';

  for (;;) {
    if (await isOnDone(page)) break;

    let cur;
    try {
      cur = await readCurrentStep(page);
    } catch (e) {
      // Wizard may already be on the final-submit-only screen
      const submitFinal = page.getByRole('button', { name: /Testprotokoll absenden/i });
      if (await submitFinal.isVisible({ timeout: 1_000 }).catch(() => false)) {
        await submitFinal.click();
        await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => null);
        break;
      }
      throw e;
    }

    // agent_notes hints live in the data module rather than the wizard DOM,
    // so the runner relies on per-position overrides supplied by the spec
    // (optionByPosition / onPause). Steps not in optionByPosition take the
    // defaultOption.
    const override  = opts.optionByPosition?.[cur.position];
    const recorded  = override ?? defaultOpt;

    if (override === 'nicht_erfüllt' && onAgentNotes === 'pause') {
      // eslint-disable-next-line no-console
      console.log(`[systemtest-runner] step ${cur.position}/${cur.total} pausing for manual takeover`);
      await page.pause();
    }

    await chooseOption(page, recorded);
    await fillDetails(page, `Walk-through (cycle-2 prep) ${new Date().toISOString()} · runner=${recorded}`);
    await clickNext(page);

    steps.push({
      position: cur.position,
      questionText: cur.questionText,
      testRole: cur.testRole,
      testFunctionUrl: cur.testFunctionUrl,
      recorded,
      notes: '',
    });

    // Safety: stop if we've recorded more than 30 steps (largest template ~16)
    if (steps.length > 30) throw new Error('runner overran 30 steps — likely stuck on the same question');

    // Some templates leave a final standalone "Testprotokoll absenden" screen
    if (cur.position === cur.total) {
      const submitFinal = page.getByRole('button', { name: /Testprotokoll absenden/i });
      if (await submitFinal.isVisible({ timeout: perStep }).catch(() => false)) {
        await submitFinal.click();
        await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => null);
        break;
      }
    }
  }

  const submitted = await isOnDone(page);

  return {
    templateId:    tplResolved.id,
    templateTitle: tplResolved.title,
    assignmentId,
    steps,
    submitted,
  };
}

export interface WalkByTemplateOptions {
  extraOverrides?: Record<number, TestOption>;
  onAgentNotes?: WalkOptions['onAgentNotes'];
  perStepTimeoutMs?: number;
}

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

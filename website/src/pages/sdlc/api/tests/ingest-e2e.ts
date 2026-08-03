import type { APIRoute } from 'astro';
import { randomUUID } from 'node:crypto';
import { getSession, isAdmin } from '../../../../lib/auth';
import {
  saveTestRun,
  saveTestResults,
  updateTestRun,
  pool,
  type TestResultRow,
  type SavedTestResult,
} from '../../../../lib/website-db';
import { safeOpenTestRunFailureTicket } from '../../../../lib/systemtest/test-run-bridge';
import { closeQaTicketsBySlug } from '../../../../lib/qa-ingest';

interface PlaywrightTestResult {
  status: 'passed' | 'failed' | 'skipped' | 'timedOut';
  duration: number;
  error?: { message: string };
}

interface PlaywrightTest {
  title: string;
  results: PlaywrightTestResult[];
}

interface PlaywrightSpec {
  title: string;
  ok: boolean;
  file?: string;
  tests: PlaywrightTest[];
}

interface PlaywrightSuite {
  specs?: PlaywrightSpec[];
  suites?: PlaywrightSuite[];
  file?: string;
}

interface PlaywrightReport {
  suites: PlaywrightSuite[];
  stats: {
    startTime: string;
    duration: number;
    expected: number;
    unexpected: number;
    skipped: number;
  };
}

function flattenSpecs(
  suites: PlaywrightSuite[],
  inheritedFile: string | undefined,
  acc: Array<PlaywrightSpec & { resolvedFile: string | undefined }> = [],
): Array<PlaywrightSpec & { resolvedFile: string | undefined }> {
  for (const s of suites) {
    const file = s.file ?? inheritedFile;
    if (s.specs) {
      for (const spec of s.specs) {
        acc.push({ ...spec, resolvedFile: spec.file ?? file });
      }
    }
    if (s.suites) flattenSpecs(s.suites, file, acc);
  }
  return acc;
}

/**
 * Auth: either an admin browser session (oauth2-proxy → Keycloak), OR a
 * shared bearer token used by GitHub Actions nightly e2e and any future
 * out-of-band ingest. Accepts either INTERNAL_API_TOKEN or E2E_INGEST_TOKEN
 * so the GitHub Actions workflow can use its dedicated secret.
 */
function isInternalCallerAuthorized(request: Request): boolean {
  // Accept either token — INTERNAL_API_TOKEN is the general-purpose internal
  // secret, E2E_INGEST_TOKEN is the dedicated secret for E2E workflow ingest.
  const tokens = [
    process.env.INTERNAL_API_TOKEN,
    process.env.E2E_INGEST_TOKEN,
  ].filter(Boolean);
  
  if (tokens.length === 0) return false;
  
  const auth = request.headers.get('authorization') ?? '';
  if (auth.startsWith('Bearer ')) {
    const token = auth.slice('Bearer '.length).trim();
    if (tokens.includes(token)) return true;
  }
  // Allow x-internal-token too — same convention as notify-close.ts.
  const xToken = request.headers.get('x-internal-token');
  if (xToken && tokens.includes(xToken)) return true;
  return false;
}

/**
 * Whether an E2E run measured a build other than the one it was tested from.
 *
 * This endpoint runs INSIDE the deployed build, so it knows its own commit
 * without an HTTP round-trip — there is no race between "ask for the SHA" and
 * "submit the results", and a misconfigured workflow step cannot bypass the
 * check. The gate belongs where the consequence is, not where the symptom
 * shows up.
 *
 * Fails CLOSED: a missing, empty or literal `unknown` value on either side
 * counts as drift. A gate that waves through a missing value is exactly the
 * T002199 mistake in new clothes — and build-website.yml records that this
 * build-arg chain has already snapped once. The price (no auto-tickets while
 * the chain is broken) is the right failure mode: better no tickets than false
 * ones.
 *
 * Comparison is exact after trimming and lowercasing. No prefix matching —
 * that would silently tolerate a truncated SHA.
 */
export function isDeployDrift(testedSha?: string | null, deployedSha?: string | null): boolean {
  const norm = (s?: string | null) => (s ?? '').trim().toLowerCase();
  const tested = norm(testedSha);
  const deployed = norm(deployedSha);
  if (!tested || !deployed) return true;
  if (tested === 'unknown' || deployed === 'unknown') return true;
  return tested !== deployed;
}

export const POST: APIRoute = async ({ request }) => {
  let authorized = false;
  if (isInternalCallerAuthorized(request)) {
    authorized = true;
  } else {
    const session = await getSession(request.headers.get('cookie'));
    if (session && isAdmin(session)) authorized = true;
  }
  if (!authorized) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const report = (await request.json()) as PlaywrightReport & {
    runId?: string;
    githubRunId?: string;
    cluster?: string;
    /** Commit the suite was run from; compared against this build's GIT_SHA. */
    testedSha?: string;
  };
  const stats = report.stats;
  if (!stats || typeof stats.startTime !== 'string' || typeof stats.duration !== 'number') {
    return new Response(JSON.stringify({ error: 'Invalid Playwright report: missing stats' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Allow the caller to pin a stable runId (e.g. GitHub Actions run id) so a
  // retried POST is idempotent at the test_run level too. New random UUID
  // otherwise.
  const runId = typeof report.runId === 'string' && report.runId ? report.runId : randomUUID();
  const cluster = report.cluster
    ?? process.env.BRAND_ID
    ?? process.env.BRAND
    ?? 'mentolder';

  await saveTestRun({ id: runId, tier: 'e2e', testIds: null, cluster });
  await updateTestRun({
    id: runId,
    status: stats.unexpected === 0 ? 'done' : 'error',
    pass: stats.expected,
    fail: stats.unexpected,
    skip: stats.skipped,
    durationMs: stats.duration,
  });

  const specs = flattenSpecs(report.suites ?? [], undefined);
  type Row = TestResultRow & { name: string; filePath?: string; isFail: boolean };
  const rows: Row[] = specs.flatMap((spec) =>
    spec.tests.flatMap((t) =>
      t.results.map<Row>((r) => {
        const status =
          r.status === 'passed' ? 'pass' : r.status === 'skipped' ? 'skip' : 'fail';
        return {
          testId: `${spec.title} :: ${t.title}`,
          category: 'E2E',
          status,
          durationMs: r.duration,
          message: r.error?.message,
          name: `${spec.title} :: ${t.title}`,
          filePath: spec.resolvedFile,
          isFail: status === 'fail',
        };
      }),
    ),
  );
  // saveTestResults now returns inserted rows so we can wire result_id back
  // into the failure-bridge for each fail.
  const inserted: SavedTestResult[] = await saveTestResults(
    runId,
    rows.map(({ testId, category, status, durationMs, message }) => ({
      testId, category, status, durationMs, message,
    })),
  );

  // Build a lookup so we can attach result_id to each ticket creation. The
  // (testId, status, message) tuple is unique enough within a single run —
  // duplicates would produce two test_results rows AND one ticket (dedup
  // by run_id+test_id), so the lookup just picks the first matching id.
  const idByKey = new Map<string, number>();
  for (const r of inserted) {
    const key = `${r.testId}|${r.status}|${r.message ?? ''}`;
    if (!idByKey.has(key)) idByKey.set(key, r.id);
  }

  // Source detection: GitHub Actions sets X-Github-Run-Id (we accept either
  // a header or a body field). Used to populate the actions-run link in the
  // ticket description.
  const headerGhRunId = request.headers.get('x-github-run-id');
  const githubRunId = report.githubRunId ?? headerGhRunId ?? null;
  const source: 'github' | 'admin' | 'cli' = githubRunId ? 'github' : 'admin';

  // Deploy-drift gate (T002202). A run whose tested SHA differs from the SHA
  // this build was made from measured the deploy, not the source tree — its
  // failures are not attributable to the repo and must not become tickets.
  // test_results are still persisted above, so trend and flake data survive.
  const deployedSha = process.env.GIT_SHA ?? null;
  const drifted = isDeployDrift(report.testedSha, deployedSha);

  // Auto-file a ticket per failing result. Best-effort: errors route to the
  // outbox so the ingest response is never blocked by ticket creation.
  let ticketsOpened = 0;
  for (const row of rows) {
    if (drifted) break;
    if (!row.isFail) continue;
    const key = `${row.testId}|${row.status}|${row.message ?? ''}`;
    const resultId = idByKey.get(key) ?? null;
    const ticketId = await safeOpenTestRunFailureTicket(pool, {
      runId,
      resultId,
      testId: row.testId,
      name: row.name,
      category: 'E2E',
      error: row.message ?? null,
      filePath: row.filePath ?? null,
      source,
      githubRunId,
      cluster,
    });
    if (ticketId) ticketsOpened++;
  }

  // QS-Abnahme-Rückkanal: schließe qa_review-Tickets deren Slug vollständig grün ist.
  const ticketsClosed = await closeQaTicketsBySlug(
    rows.map((r) => ({ testId: r.testId, status: r.status === 'pass' ? 'pass' : r.status === 'skip' ? 'skip' : 'fail' })),
  );

  return new Response(JSON.stringify({
    ok: true,
    runId,
    count: rows.length,
    ticketsOpened,
    ticketsClosed,
    ...(drifted ? {
      reason: 'deploy-drift',
      testedSha: report.testedSha ?? 'unknown',
      deployedSha: deployedSha ?? 'unknown',
    } : {}),
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

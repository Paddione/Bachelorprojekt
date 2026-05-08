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
 * out-of-band ingest. Token reuses the existing INTERNAL_API_TOKEN secret
 * so we don't expand the SealedSecret surface for one new caller.
 */
function isInternalCallerAuthorized(request: Request): boolean {
  const internalToken = process.env.INTERNAL_API_TOKEN;
  if (!internalToken) return false;
  const auth = request.headers.get('authorization') ?? '';
  if (auth.startsWith('Bearer ') && auth.slice('Bearer '.length).trim() === internalToken) {
    return true;
  }
  // Allow x-internal-token too — same convention as notify-close.ts.
  if (request.headers.get('x-internal-token') === internalToken) return true;
  return false;
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

  // Auto-file a ticket per failing result. Best-effort: errors route to the
  // outbox so the ingest response is never blocked by ticket creation.
  let ticketsOpened = 0;
  for (const row of rows) {
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

  return new Response(JSON.stringify({ ok: true, runId, count: rows.length, ticketsOpened }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

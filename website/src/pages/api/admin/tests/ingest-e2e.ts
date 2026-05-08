import type { APIRoute } from 'astro';
import { randomUUID } from 'node:crypto';
import { getSession, isAdmin } from '../../../../lib/auth';
import {
  saveTestRun,
  saveTestResults,
  updateTestRun,
  type TestResultRow,
} from '../../../../lib/website-db';

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
  tests: PlaywrightTest[];
}

interface PlaywrightSuite {
  specs?: PlaywrightSpec[];
  suites?: PlaywrightSuite[];
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

function flattenSpecs(suites: PlaywrightSuite[], acc: PlaywrightSpec[] = []): PlaywrightSpec[] {
  for (const s of suites) {
    if (s.specs) acc.push(...s.specs);
    if (s.suites) flattenSpecs(s.suites, acc);
  }
  return acc;
}

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const report = (await request.json()) as PlaywrightReport;
  const stats = report.stats;
  if (!stats || typeof stats.startTime !== 'string' || typeof stats.duration !== 'number') {
    return new Response(JSON.stringify({ error: 'Invalid Playwright report: missing stats' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const runId = randomUUID();
  const cluster = process.env.BRAND_ID ?? process.env.BRAND ?? 'mentolder';

  // saveTestRun only persists id/tier/testIds/cluster — finalised counts go through updateTestRun.
  await saveTestRun({ id: runId, tier: 'e2e', testIds: null, cluster });
  await updateTestRun({
    id: runId,
    status: stats.unexpected === 0 ? 'done' : 'error',
    pass: stats.expected,
    fail: stats.unexpected,
    skip: stats.skipped,
    durationMs: stats.duration,
  });

  const specs = flattenSpecs(report.suites ?? []);
  const rows: TestResultRow[] = specs.flatMap((spec) =>
    spec.tests.flatMap((t) =>
      t.results.map<TestResultRow>((r) => ({
        testId: `${spec.title} :: ${t.title}`,
        category: 'E2E',
        status:
          r.status === 'passed' ? 'pass' : r.status === 'skipped' ? 'skip' : 'fail',
        durationMs: r.duration,
        message: r.error?.message,
      })),
    ),
  );
  await saveTestResults(runId, rows);

  return new Response(JSON.stringify({ ok: true, runId, count: rows.length }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

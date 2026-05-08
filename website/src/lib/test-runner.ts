import { spawn } from 'child_process';
import { createInterface } from 'readline';
import { watch, existsSync, readdirSync } from 'fs';
import { readFile } from 'fs/promises';
import { randomUUID } from 'crypto';
import {
  saveTestRun,
  saveTestResults,
  updateTestRun,
  pool,
  type TestResultRow,
  type SavedTestResult,
} from './website-db.js';
import { safeOpenTestRunFailureTicket } from './systemtest/test-run-bridge.js';

export interface TestResult {
  req: string;
  test: string;
  desc: string;
  status: 'pass' | 'fail' | 'skip';
  duration_ms: number;
  detail: string;
}

export interface TestJobSummary {
  total: number;
  pass: number;
  fail: number;
  skip: number;
}

export type SseListener = (event: string, data: string) => void;

export interface TestJob {
  id: string;
  tier: string;
  startedAt: Date;
  status: 'running' | 'done' | 'error';
  stdoutBuffer: string[];
  resultBuffer: TestResult[];
  summary: TestJobSummary | null;
  listeners: Set<SseListener>;
}

// Module-level registry — survives across requests in the same Node process
const jobs = new Map<string, TestJob>();

export function getJob(id: string): TestJob | undefined {
  return jobs.get(id);
}

export function hasRunningJob(): boolean {
  for (const job of jobs.values()) {
    if (job.status === 'running') return true;
  }
  return false;
}

export async function spawnTestRun(tier: string, testIds: string[]): Promise<string> {
  const id = randomUUID();
  const cluster = process.env.CLUSTER_ENV ?? 'dev';
  const prodDomain = process.env.PROD_DOMAIN ?? 'localhost';

  const job: TestJob = {
    id,
    tier,
    startedAt: new Date(),
    status: 'running',
    stdoutBuffer: [],
    resultBuffer: [],
    summary: null,
    listeners: new Set(),
  };
  jobs.set(id, job);

  await saveTestRun({
    id,
    tier,
    testIds: testIds.length > 0 ? testIds.join(' ') : null,
    cluster,
  });

  const args = ['tests/runner.sh', tier, ...testIds];
  const env = { ...process.env, PROD_DOMAIN: prodDomain, CLUSTER_ENV: cluster };

  const proc = spawn('bash', args, { cwd: '/app', env });

  // Consume stderr to prevent pipe backpressure deadlock on test failures
  proc.stderr!.resume();

  const emit = (event: string, data: string) => {
    for (const listener of job.listeners) {
      listener(event, data);
    }
  };

  // Stream stdout line by line as log events
  const rl = createInterface({ input: proc.stdout!, crlfDelay: Infinity });
  rl.on('line', (line) => {
    job.stdoutBuffer.push(line);
    emit('log', JSON.stringify({ line }));
  });

  // Watch /app/tests/results/ for the JSONL temp file created by runner.sh
  const resultsDir = '/app/tests/results';
  let jsonlWatcher: ReturnType<typeof watch> | null = null;
  let watchedJsonlFile: string | null = null;

  const startJsonlTail = (filePath: string) => {
    if (watchedJsonlFile === filePath) return;
    watchedJsonlFile = filePath;

    // Tail the file: read all existing content first, then watch for appends
    let offset = 0;
    const readNewLines = async () => {
      try {
        const content = await readFile(filePath, 'utf-8');
        const newContent = content.slice(offset);
        offset = content.length;
        for (const line of newContent.split('\n').filter(Boolean)) {
          try {
            const result = JSON.parse(line) as TestResult;
            if (result.req && result.status) {
              job.resultBuffer.push(result);
              emit('result', JSON.stringify(result));
            }
          } catch {
            // not a result line
          }
        }
      } catch {
        // file not ready yet
      }
    };

    readNewLines();
    jsonlWatcher = watch(filePath, readNewLines);
  };

  // Check for existing or new JSONL files in results dir
  const checkForJsonl = () => {
    if (!existsSync(resultsDir)) return;
    const files = readdirSync(resultsDir).filter(
      (f) => f.startsWith(`.tmp-${tier}-`) && f.endsWith('.jsonl')
    );
    if (files.length > 0) {
      // pick most recent by name (timestamp-sorted)
      const latest = files.sort()[files.length - 1];
      startJsonlTail(`${resultsDir}/${latest}`);
    }
  };

  // Ensure results dir exists so the watcher can always be established
  const { mkdirSync } = await import('fs');
  mkdirSync(resultsDir, { recursive: true });

  let dirWatcher: ReturnType<typeof watch> | null = null;
  checkForJsonl();
  dirWatcher = watch(resultsDir, (_, filename) => {
    if (filename?.startsWith(`.tmp-${tier}-`) && filename.endsWith('.jsonl')) {
      startJsonlTail(`${resultsDir}/${filename}`);
    }
  });

  proc.on('exit', async (code) => {
    jsonlWatcher?.close();
    dirWatcher?.close();

    // Read summary + per-test results from finalised JSON file
    let summary: TestJobSummary = { total: 0, pass: 0, fail: 0, skip: 0 };
    type FinalizedResult = {
      test_id?: string;
      req?: string;
      test?: string;
      category?: string;
      status: string;
      duration_ms?: number;
      message?: string;
      detail?: string;
    };
    let rawResults: FinalizedResult[] = [];
    try {
      const files = existsSync(resultsDir)
        ? readdirSync(resultsDir).filter(
            (f) => f.startsWith(`20`) && f.endsWith(`-${tier}.json`) && !f.startsWith('.tmp')
          )
        : [];
      if (files.length > 0) {
        const latest = files.sort()[files.length - 1];
        const raw = JSON.parse(await readFile(`${resultsDir}/${latest}`, 'utf-8'));
        summary = raw.summary ?? summary;
        rawResults = Array.isArray(raw.results) ? raw.results : [];
      }
    } catch {
      // fallback: count from buffer
      summary = {
        total: job.resultBuffer.length,
        pass: job.resultBuffer.filter((r) => r.status === 'pass').length,
        fail: job.resultBuffer.filter((r) => r.status === 'fail').length,
        skip: job.resultBuffer.filter((r) => r.status === 'skip').length,
      };
    }

    job.status = code === 0 ? 'done' : 'error';
    job.summary = summary;

    const durationMs = Date.now() - job.startedAt.getTime();
    await updateTestRun({
      id,
      status: job.status,
      pass: summary.pass,
      fail: summary.fail,
      skip: summary.skip,
      durationMs,
    }).catch(() => {});

    // Ingest per-test rows for flake detection + per-test trends.
    // Falls back to job.resultBuffer if the finalised JSON couldn't be read
    // (the live JSONL tail populates resultBuffer with the same shape).
    const sourceResults: FinalizedResult[] = rawResults.length > 0
      ? rawResults
      : job.resultBuffer.map(r => ({
          test_id: `${r.req}/${r.test}`,
          req: r.req,
          test: r.test,
          category: undefined,
          status: r.status,
          duration_ms: r.duration_ms,
          message: r.detail,
        }));
    if (sourceResults.length > 0) {
      const allowedCategories = new Set(['FA', 'SA', 'NFA', 'AK', 'E2E', 'BATS']);
      const allowedStatuses = new Set(['pass', 'fail', 'skip']);
      type EnrichedRow = TestResultRow & { name: string };
      const rows: EnrichedRow[] = sourceResults
        .filter(r => allowedStatuses.has(r.status))
        .map(r => {
          const fallbackId = r.req && r.test ? `${r.req}/${r.test}` : (r.req ?? 'unknown');
          const cat = r.category && allowedCategories.has(r.category)
            ? (r.category as TestResultRow['category'])
            : 'FA';
          const testId = r.test_id ?? fallbackId;
          return {
            testId,
            category: cat,
            status: r.status as TestResultRow['status'],
            durationMs: r.duration_ms,
            message: r.message ?? r.detail,
            name: testId,
          };
        });
      // Save and capture inserted result_ids so we can wire each failure to
      // the bridge with the precise test_results row id (mirrors what
      // ingest-e2e.ts does for the nightly path).
      const inserted: SavedTestResult[] = await saveTestResults(
        id,
        rows.map(({ testId, category, status, durationMs, message }) => ({
          testId, category, status, durationMs, message,
        })),
      ).catch(() => [] as SavedTestResult[]);

      // Best-effort auto-ticketing per failure — same contract as ingest-e2e:
      // dedup by (run_id, test_id), errors route to the outbox.
      // Source = 'admin' for spawnTestRun (admin-triggered from /admin/monitoring).
      if (inserted.length > 0) {
        const idByKey = new Map<string, number>();
        for (const r of inserted) {
          const key = `${r.testId}|${r.status}|${r.message ?? ''}`;
          if (!idByKey.has(key)) idByKey.set(key, r.id);
        }
        for (const row of rows) {
          if (row.status !== 'fail') continue;
          const key = `${row.testId}|${row.status}|${row.message ?? ''}`;
          const resultId = idByKey.get(key) ?? null;
          await safeOpenTestRunFailureTicket(pool, {
            runId: id,
            resultId,
            testId: row.testId,
            name: row.name,
            category: row.category,
            error: row.message ?? null,
            source: 'admin',
            cluster,
          }).catch((err) =>
            console.error('[test-runner] safeOpenTestRunFailureTicket failed:', err),
          );
        }
      }
    }

    emit('done', JSON.stringify({ code, summary, durationMs }));

    // Keep job in map for 10 minutes so late SSE consumers can read the buffer
    setTimeout(() => jobs.delete(id), 10 * 60 * 1000);
  });

  return id;
}

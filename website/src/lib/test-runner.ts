import { spawn } from 'child_process';
import { createInterface } from 'readline';
import { watch, existsSync, readdirSync } from 'fs';
import { readFile } from 'fs/promises';
import { randomUUID } from 'crypto';
import { saveTestRun, updateTestRun } from './website-db.js';

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
      const latest = files.sort().at(-1)!;
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

    // Read summary from finalised JSON file
    let summary: TestJobSummary = { total: 0, pass: 0, fail: 0, skip: 0 };
    try {
      const files = existsSync(resultsDir)
        ? readdirSync(resultsDir).filter(
            (f) => f.startsWith(`20`) && f.endsWith(`-${tier}.json`) && !f.startsWith('.tmp')
          )
        : [];
      if (files.length > 0) {
        const latest = files.sort().at(-1)!;
        const raw = JSON.parse(await readFile(`${resultsDir}/${latest}`, 'utf-8'));
        summary = raw.summary ?? summary;
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

    emit('done', JSON.stringify({ code, summary, durationMs }));

    // Keep job in map for 10 minutes so late SSE consumers can read the buffer
    setTimeout(() => jobs.delete(id), 10 * 60 * 1000);
  });

  return id;
}

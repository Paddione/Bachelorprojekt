import { spawn } from 'node:child_process';
import crypto from 'node:crypto';

const ARG_PATTERN = /^[A-Za-z0-9_:.\-/]+$/;
const SIGKILL_DELAY_MS = 5000;

/**
 * Validates task and env arguments to prevent argument injection.
 */
export function validateArg(value) {
  if (!value || typeof value !== 'string') {
    throw new Error('argument must not be empty');
  }
  if (value.startsWith('-')) {
    throw new Error(`argument "${value}" must not start with '-'`);
  }
  if (!ARG_PATTERN.test(value)) {
    throw new Error(`argument "${value}" contains disallowed characters (allowed: A-Za-z0-9_:./-)`);
  }
}

/**
 * Executes a single task synchronously (within a Promise).
 *
 * @param {string} task
 * @param {string} env
 * @param {string} taskfilePath
 * @returns {Promise<{ task: string, env: string, exit_code: number, stdout: string, stderr: string, trace_id: string }>}
 */
export function runTask(task, env = '', taskfilePath) {
  validateArg(task);
  if (env) {
    validateArg(env);
  }

  return new Promise((resolve) => {
    const taskArgs = ['--taskfile', taskfilePath, '--', task];
    if (env) {
      taskArgs.push(`ENV=${env}`);
    }

    let stdoutBuf = '';
    let stderrBuf = '';
    const traceId = crypto.randomUUID().replace(/-/g, '');

    const child = spawn('task', taskArgs, {
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: true,
    });

    child.stdout?.on('data', (chunk) => {
      stdoutBuf += chunk.toString();
    });

    child.stderr?.on('data', (chunk) => {
      stderrBuf += chunk.toString();
    });

    child.on('error', (err) => {
      stderrBuf += `\n[error] ${err.message}`;
      resolve({
        task,
        env: env || '',
        exit_code: 1,
        stdout: stdoutBuf,
        stderr: stderrBuf,
        trace_id: traceId,
      });
    });

    child.on('close', (code) => {
      resolve({
        task,
        env: env || '',
        exit_code: code ?? 0,
        stdout: stdoutBuf,
        stderr: stderrBuf,
        trace_id: traceId,
      });
    });
  });
}

/**
 * Executes a plan sequentially by group, and in parallel within each group.
 * Fail-fast on error.
 */
export async function executePlan(plan, taskfilePath) {
  const allResults = [];
  const groups = Array.isArray(plan?.groups) ? plan.groups : [];

  for (const group of groups) {
    const tasks = Array.isArray(group.tasks) ? group.tasks : [];
    const groupResults = await Promise.all(
      tasks.map((t) => runTask(t.task, t.env, taskfilePath))
    );

    allResults.push(...groupResults);

    for (const r of groupResults) {
      if (r.exit_code !== 0) {
        const err = new Error(`task ${r.task} (env=${r.env}) exited ${r.exit_code}`);
        err.results = allResults;
        throw err;
      }
    }
  }

  return allResults;
}

class JobRegistry {
  constructor() {
    this.jobs = new Map();
  }

  startTask(task, env = '', taskfilePath) {
    validateArg(task);
    if (env) {
      validateArg(env);
    }

    const jobId = crypto.randomUUID();
    const entry = {
      jobId,
      status: 'running',
      exitCode: null,
      output: '',
      child: null,
      killTimer: null,
    };
    this.jobs.set(jobId, entry);

    const taskArgs = ['--taskfile', taskfilePath, '--', task];
    if (env) {
      taskArgs.push(`ENV=${env}`);
    }

    let stdoutBuf = '';
    let stderrBuf = '';

    const child = spawn('task', taskArgs, {
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: true,
    });
    entry.child = child;

    child.stdout?.on('data', (chunk) => {
      stdoutBuf += chunk.toString();
    });

    child.stderr?.on('data', (chunk) => {
      stderrBuf += chunk.toString();
    });

    child.on('error', (err) => {
      if (entry.killTimer) clearTimeout(entry.killTimer);
      if (entry.status === 'running') {
        entry.status = 'done';
      }
      entry.exitCode = 1;
      entry.output = stdoutBuf + stderrBuf + `\n[error] ${err.message}`;
    });

    child.on('close', (code) => {
      if (entry.killTimer) clearTimeout(entry.killTimer);
      if (entry.status === 'running') {
        entry.status = 'done';
      }
      entry.exitCode = code ?? 0;
      entry.output = stdoutBuf + stderrBuf;
    });

    return jobId;
  }

  cancelTask(jobId) {
    const entry = this.jobs.get(jobId);
    if (!entry) {
      return { found: false };
    }

    if (entry.status !== 'running') {
      return { found: true, wasCancelled: false };
    }

    entry.status = 'cancelled';
    const child = entry.child;

    if (child && child.pid) {
      try {
        // Send SIGTERM to process group
        process.kill(-child.pid, 'SIGTERM');
      } catch {
        try {
          child.kill('SIGTERM');
        } catch {
          // ignore
        }
      }

      entry.killTimer = setTimeout(() => {
        try {
          process.kill(-child.pid, 'SIGKILL');
        } catch {
          try {
            child.kill('SIGKILL');
          } catch {
            // ignore
          }
        }
      }, SIGKILL_DELAY_MS);
      entry.killTimer.unref?.();
    }

    return { found: true, wasCancelled: true };
  }

  lookup(jobId) {
    const entry = this.jobs.get(jobId);
    if (!entry) {
      return { found: false };
    }
    return {
      found: true,
      status: entry.status,
      exitCode: entry.exitCode,
      output: entry.output,
    };
  }
}

export const globalRegistry = new JobRegistry();

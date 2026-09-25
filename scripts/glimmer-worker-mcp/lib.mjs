// scripts/glimmer-worker-mcp/lib.mjs — reine Logik des Glimmer-Worker-MCP (T900373).
//
// Kein HTTP, kein Prozessstart mit Seiteneffekt ausser im injizierten Runner:
// Pfad-Mapping (D6), Job-Queue mit genau einem laufenden Job (D4/D5) und die
// Aufbereitung eines beendeten Jobs (Ausgabe-Ende + Git-Zustand des Ziel-Repos).

import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { toWslPath, isGitWorkTree } from '../lib/wsl-paths.mjs';

// Pfad-Mapping (D6) liegt seit T900379 im gemeinsamen Modul; re-exportiert fuer server.mjs und Tests.
export { toWslPath, isGitWorkTree };

const DONE_RETENTION_MS = 3600 * 1000;
const SUMMARY_CHARS = 6000;
const TERMINAL = new Set(['done', 'failed', 'timeout']);

function stripAnsi(s) {
  // eslint-disable-next-line no-control-regex
  return String(s || '').replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '');
}

function git(cwd, args) {
  const r = spawnSync('git', ['-C', cwd, ...args], { timeout: 10000 });
  return r.status === 0 ? String(r.stdout).trimEnd() : `git ${args[0]} failed: ${String(r.stderr).trim()}`;
}

// Ergebnis eines beendeten Laufs fuer glimmer_worker_result.
export function summarize({ stdout, stderr, cwd }) {
  const out = stripAnsi(stdout);
  const err = stripAnsi(stderr);
  let summary = out.slice(-SUMMARY_CHARS);
  if (!out.trim() && err.trim()) summary = err.slice(-SUMMARY_CHARS);
  return {
    summary,
    git_status: git(cwd, ['status', '--porcelain']),
    diff_stat: git(cwd, ['diff', '--stat']),
  };
}

// FIFO-Queue mit genau einem laufenden Job. runner(job) liefert ein Promise,
// das mit { code, stdout, stderr, timedOut } aufloest.
export class JobQueue {
  constructor(runner, { now = () => Date.now() } = {}) {
    this.runner = runner;
    this.now = now;
    this.jobs = new Map();
    this.queue = [];
    this.running = null;
    this.waiters = new Map();
  }

  enqueue({ task, cwd, timeoutS }) {
    this.#reap();
    const id = randomUUID();
    const job = { id, task, cwd, timeoutS, status: 'queued', createdAt: this.now() };
    this.jobs.set(id, job);
    this.queue.push(id);
    this.#pump();
    return { id, position: this.position(id) };
  }

  get(id) {
    return this.jobs.get(id);
  }

  position(id) {
    const i = this.queue.indexOf(id);
    return i < 0 ? 0 : i + (this.running ? 1 : 0);
  }

  snapshot() {
    return {
      running: this.running ? { id: this.running, cwd: this.jobs.get(this.running)?.cwd } : null,
      queued: this.queue.length,
    };
  }

  // Wartet hoechstens ms auf einen Endzustand; loest immer mit dem Job auf.
  waitFor(id, ms) {
    const job = this.jobs.get(id);
    if (!job || TERMINAL.has(job.status) || ms <= 0) return Promise.resolve(job);
    return new Promise((resolve) => {
      const timer = setTimeout(() => done(), ms);
      const done = () => {
        clearTimeout(timer);
        const list = (this.waiters.get(id) || []).filter((f) => f !== done);
        this.waiters.set(id, list);
        resolve(this.jobs.get(id));
      };
      this.waiters.set(id, [...(this.waiters.get(id) || []), done]);
    });
  }

  #notify(id) {
    for (const f of this.waiters.get(id) || []) f();
    this.waiters.delete(id);
  }

  #pump() {
    if (this.running || this.queue.length === 0) return;
    const id = this.queue.shift();
    const job = this.jobs.get(id);
    this.running = id;
    job.status = 'running';
    job.startedAt = this.now();
    Promise.resolve()
      .then(() => this.runner(job))
      .then(
        (r) => {
          job.exitCode = r.code;
          job.status = r.timedOut ? 'timeout' : r.code === 0 ? 'done' : 'failed';
          Object.assign(job, summarize({ stdout: r.stdout, stderr: r.stderr, cwd: job.cwd }));
        },
        (err) => {
          job.exitCode = -1;
          job.status = 'failed';
          job.summary = 'runner error: ' + (err && err.message ? err.message : String(err));
        },
      )
      .finally(() => {
        job.endedAt = this.now();
        this.running = null;
        this.#notify(id);
        this.#pump();
      });
  }

  #reap() {
    const cutoff = this.now() - DONE_RETENTION_MS;
    for (const [id, job] of this.jobs) {
      if (TERMINAL.has(job.status) && job.endedAt < cutoff) this.jobs.delete(id);
    }
  }
}

// Oeffentliche Sicht eines Jobs fuer glimmer_worker_result.
export function jobView(job, queue) {
  if (!job) return { status: 'unknown' };
  const end = job.endedAt || (job.startedAt ? Date.now() : null);
  return {
    job_id: job.id,
    status: job.status,
    position: job.status === 'queued' ? queue.position(job.id) : 0,
    exit_code: job.exitCode ?? null,
    duration_s: job.startedAt && end ? Math.round((end - job.startedAt) / 1000) : 0,
    summary: job.summary ?? '',
    git_status: job.git_status ?? '',
    diff_stat: job.diff_stat ?? '',
  };
}

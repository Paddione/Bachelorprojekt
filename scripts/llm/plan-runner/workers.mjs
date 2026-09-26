// workers.mjs — Worker-Pool des plan-runners (T900504): startet `opencode run` fuer 4B-Worker
// (Agent qwen35-mtp, :1920) und den Selbstaufruf des Orchestrators (Agent local, :1919),
// verwaltet die 4B-Slots und puffert beendete 4B-Ergebnisse.
// Aufrufer: scripts/llm/plan-runner.mjs. Runbook: docs/runbooks/plan-runner.md.
// Test-Override: PLAN_RUNNER_OPENCODE ersetzt das opencode-Binary.

import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { parseResult } from './plan.mjs';

export const AGENT_4B = 'qwen35-mtp';
export const AGENT_SELF = 'local';
const TAIL_CHARS = 4000;
const live = new Set(); // laufende Kindprozesse, fuer killAllWorkers()

// Beendet alle laufenden Worker-Prozessgruppen (Abbruch, Ende des Laufs).
export function killAllWorkers() {
  for (const c of live) {
    try { process.kill(-c.pid, 'SIGTERM'); } catch { try { c.kill('SIGTERM'); } catch { /* bereits beendet */ } }
  }
}

// Startet `<bin> run --agent <agent> --dir <worktree> <prompt>` und liefert
// { code, tail, ok, summary, ms }. Beim Timeout: SIGTERM an die Prozessgruppe, ok=false.
export function runWorker({ agent, prompt, worktree, timeoutMs }) {
  const bin = process.env.PLAN_RUNNER_OPENCODE || 'opencode';
  const t0 = Date.now();
  return new Promise((resolve) => {
    let out = '';
    let timedOut = false;
    let child;
    try {
      child = spawn(bin, ['run', '--agent', agent, '--dir', worktree, prompt], {
        cwd: worktree, stdio: ['ignore', 'pipe', 'pipe'], detached: true,
      });
    } catch (e) {
      resolve({ code: null, tail: String(e.message), ok: false, summary: `spawn failed: ${e.message}`, ms: 0 });
      return;
    }
    live.add(child);
    const collect = (d) => {
      out += d;
      // Nur so viel behalten, wie fuer Ergebniszeile und Ausgabe-Ende noetig ist.
      if (out.length > 64 * TAIL_CHARS) out = out.slice(-16 * TAIL_CHARS);
    };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    const timer = timeoutMs > 0 ? setTimeout(() => {
      timedOut = true;
      try { process.kill(-child.pid, 'SIGTERM'); } catch { child.kill('SIGTERM'); }
    }, timeoutMs) : null;
    const done = (code, err) => {
      live.delete(child);
      if (timer) clearTimeout(timer);
      const tail = out.slice(-TAIL_CHARS);
      const ms = Date.now() - t0;
      if (err) return resolve({ code, tail, ok: false, summary: `spawn failed: ${err.message}`, ms });
      if (timedOut) return resolve({ code, tail, ok: false, summary: 'timeout', ms });
      const r = parseResult(out);
      resolve({ code, tail, ok: r.ok && code === 0, summary: code === 0 ? r.summary : `exit ${code}: ${r.summary}`, ms });
    };
    child.on('error', (e) => done(null, e));
    child.on('close', (code) => done(code));
  });
}

// Slot-Verwaltung. Emittiert 'end' mit dem Ergebnis, sobald ein 4B-Job endet.
export class WorkerPool extends EventEmitter {
  constructor({ slots4b, worktree, timeoutMs, run = runWorker }) {
    super();
    if (!Number.isInteger(slots4b) || slots4b < 0) throw new Error('slots4b must be an integer >= 0');
    this.slots4b = slots4b;
    this.worktree = worktree;
    this.timeoutMs = timeoutMs;
    this.run = run;
    this.jobs = new Map(); // jobId -> { partialId, promise }
    this.done = []; // beendete, noch nicht abgeholte 4B-Ergebnisse
    this.waiters = [];
    this.self = null; // partialId des laufenden Selbstaufrufs
    this.seq = 0;
  }

  free4b() { return this.slots4b - this.jobs.size; }

  running4b() { return [...this.jobs.values()].map((j) => j.partialId); }

  isActive(partialId) { return this.self === partialId || this.running4b().includes(partialId); }

  start4b(partialId, prompt) {
    if (this.free4b() <= 0) throw new Error('no free 4B slot');
    const jobId = `4b-${++this.seq}`;
    const promise = this.run({ agent: AGENT_4B, prompt, worktree: this.worktree, timeoutMs: this.timeoutMs })
      .then((r) => {
        this.jobs.delete(jobId);
        const ev = { partialId, ok: r.ok, summary: r.summary, tail: r.tail, ms: r.ms };
        const w = this.waiters.shift();
        if (w) w(ev); else this.done.push(ev);
        this.emit('end', ev);
      });
    this.jobs.set(jobId, { partialId, promise });
    return jobId;
  }

  async runSelf(partialId, prompt) {
    if (this.self) throw new Error(`self-run already active for ${this.self}`);
    this.self = partialId;
    try {
      return await this.run({ agent: AGENT_SELF, prompt, worktree: this.worktree, timeoutMs: this.timeoutMs });
    } finally {
      this.self = null;
    }
  }

  // Naechstes beendetes 4B-Ergebnis; gepufferte Ergebnisse in Reihenfolge ihres Endes.
  nextEvent() {
    if (this.done.length) return Promise.resolve(this.done.shift());
    return new Promise((resolve) => this.waiters.push(resolve));
  }

  // Alle gepufferten Ergebnisse abholen, ohne zu warten.
  drainEvents() { return this.done.splice(0); }

  pending() { return this.done.length; }
}

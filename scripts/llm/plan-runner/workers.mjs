// workers.mjs — Worker-Pool des plan-runners (T900504, T016656): drei Tracks.
//  - direct: In-Process-Tool-Loop gegen vLLM :8123 (w4a4, direct-worker.mjs), ohne opencode,
//  - cloud:  `opencode run --agent plan-worker-muse` (Muse Spark 1.3 im Go-Abo),
//  - self:   Selbstaufruf des Orchestrators (Agent plan-worker-self auf llamacpp-local, :1919),
//            nur wenn :1919 beim Preflight antwortet.
// Verwaltet die Direkt-/Cloud-Slots und puffert beendete Worker-Ergebnisse.
// Aufrufer: scripts/llm/plan-runner.mjs. Runbook: docs/runbooks/plan-runner.md.
// Test-Override: PLAN_RUNNER_OPENCODE ersetzt das opencode-Binary.

import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseResult, normalisePartialSize } from './plan.mjs';
import { runDirectWorker } from './direct-worker.mjs';

// Primaer-Agenten: opencode run ersetzt Subagenten still durch den Default-Agenten.
export const AGENT_CLOUD = 'plan-worker-muse';
export const AGENT_SELF = 'plan-worker-self';
const TAIL_CHARS = 4000;
const live = new Set(); // laufende Kindprozesse, fuer killAllWorkers()

// Beendet alle laufenden Worker-Prozessgruppen (Abbruch, Ende des Laufs).
export function killAllWorkers() {
  for (const c of live) {
    try { process.kill(-c.pid, 'SIGTERM'); } catch { try { c.kill('SIGTERM'); } catch { /* bereits beendet */ } }
  }
}

// Modell eines Agenten aus .opencode/agent-models.jsonc im Repo des Runners, sonst null.
// opencode v2 nutzt bei `run --agent` das Default-Modell, deshalb geben wir es explizit mit (T900729).
const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const models = new Map();
export function agentModel(agent) {
  if (!models.has(agent)) {
    let model = null;
    try {
      const raw = readFileSync(join(REPO, '.opencode', 'agent-models.jsonc'), 'utf8');
      const cfg = JSON.parse(raw.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, ''));
      model = cfg?.agent?.[agent]?.model ?? null;
    } catch { /* keine Konfiguration: opencode waehlt selbst */ }
    models.set(agent, model);
  }
  return models.get(agent);
}

// Agent-Aufbau (Track-spezifisch): Binary, Argumente und Env fuer einen Worker-Spawn.
// Von der Pool-Verwaltung (WorkerPool) entkoppelt, damit der Track (Self vs. 4B)
// nur hier ueber agentModel/agent-Konstanten entscheidet (T901014 P1).
// PWD must follow cwd: `opencode run` takes the project root from PWD,
// so without this an out-of-repo worktree writes into the caller's repo.
export function buildAgentSpawn({ agent, prompt, worktree }) {
  const bin = process.env.PLAN_RUNNER_OPENCODE || 'opencode';
  const model = agentModel(agent);
  return {
    bin,
    args: ['run', '--agent', agent, ...(model ? ['--model', model] : []), prompt],
    env: { ...process.env, PWD: worktree },
  };
}

// Dispatch-Policy (T901014 P1, T016656): genau eine Funktion entscheidet Direkt/Cloud/Self.
// Eingaben: ready (bereite Partial-IDs in Manifest-Reihenfolge), freeDirect/freeCloud (freie Slots,
// Default 0), selfAvailable (Self-Endpunkt :1919 antwortete beim Preflight, Default false).
// Ausgabe: 'direct', 'cloud', 'self' (nur wenn kein Slot frei und Self verfuegbar) oder 'idle'
// (nichts bereit oder kein Track frei). Rangfolge: direct vor cloud vor self.
// T901542 (plan-vector-routing): nimmt optional `sizes` ({ partialId: 's'|'m'|'l' }) entgegen —
// heute routing-neutral. Extension-Point: sobald ein schweres Modell auf :1919 deployt ist, wird
// size 'l' auf einen neuen Track 'heavy' geroutet, ohne decideTrack-Aufrufer anzufassen.
// CPU-Tier (0.8B/2B) bewusst nicht verdrahtet: 4B ist Minimum fuer Tool-Loops.
export function decideTrack({ ready, freeDirect = 0, freeCloud = 0, selfAvailable = false, sizes = null }) {
  void sizes; // routing-neutral bis ein Heavy-Modell auf :1919 deployt ist (T901542)
  if (!Array.isArray(ready) || ready.length === 0) return 'idle';
  if (Number(freeDirect) > 0) return 'direct';
  if (Number(freeCloud) > 0) return 'cloud';
  return selfAvailable ? 'self' : 'idle';
}

// Wie decideTrack, liefert zusaetzlich den Size-Hint des ersten bereiten Partials
// (Default 'm' wenn fehlend/ungueltig). Der Track bleibt auf bestehenden Werten —
// kein 'heavy' ohne deploytes Modell.
export function decideTrackWithHint({ ready, freeDirect = 0, freeCloud = 0, selfAvailable = false, sizes = {} }) {
  const track = decideTrack({ ready, freeDirect, freeCloud, selfAvailable, sizes });
  const first = Array.isArray(ready) && ready.length ? ready[0] : null;
  const raw = first && sizes && typeof sizes === 'object' ? sizes[first] : null;
  return { track, sizeHint: normalisePartialSize(raw) };
}

// Startet `<bin> run --agent <agent> [--model <modell>] <prompt>` im Worktree und liefert
// { code, tail, ok, summary, ms }. Beim Timeout: SIGTERM an die Prozessgruppe, ok=false.
export function runWorker({ agent, prompt, worktree, timeoutMs }) {
  const t0 = Date.now();
  return new Promise((resolve) => {
    let out = '';
    let timedOut = false;
    let child;
    try {
      const { bin, args, env } = buildAgentSpawn({ agent, prompt, worktree });
      child = spawn(bin, args, {
        cwd: worktree, stdio: ['ignore', 'pipe', 'pipe'], detached: true, env,
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

// Slot-Verwaltung. Emittiert 'end' mit dem Ergebnis, sobald ein Direkt- oder Cloud-Job endet.
// runDirect bekommt { prompt, worktree, targetFiles, timeoutMs }, run (opencode) { agent, prompt, worktree, timeoutMs }.
export class WorkerPool extends EventEmitter {
  constructor({ slotsDirect = 0, slotsCloud = 0, worktree, timeoutMs, run = runWorker, runDirect = runDirectWorker }) {
    super();
    if (!Number.isInteger(slotsDirect) || slotsDirect < 0) throw new Error('slotsDirect must be an integer >= 0');
    if (!Number.isInteger(slotsCloud) || slotsCloud < 0) throw new Error('slotsCloud must be an integer >= 0');
    this.slotsDirect = slotsDirect;
    this.slotsCloud = slotsCloud;
    this.worktree = worktree;
    this.timeoutMs = timeoutMs;
    this.run = run;
    this.runDirect = runDirect;
    this.jobs = new Map(); // jobId -> { partialId, promise, track }
    this.done = []; // beendete, noch nicht abgeholte Worker-Ergebnisse
    this.waiters = [];
    this.self = null; // partialId des laufenden Selbstaufrufs
    this.seq = 0;
  }

  _count(track) { return [...this.jobs.values()].filter((j) => j.track === track).length; }

  _running(track) { return [...this.jobs.values()].filter((j) => j.track === track).map((j) => j.partialId); }

  freeDirect() { return this.slotsDirect - this._count('direct'); }

  runningDirect() { return this._running('direct'); }

  freeCloud() { return this.slotsCloud - this._count('cloud'); }

  runningCloud() { return this._running('cloud'); }

  isActive(partialId) { return this.self === partialId || [...this.jobs.values()].some((j) => j.partialId === partialId); }

  _start(track, partialId, launch) {
    const free = track === 'cloud' ? this.freeCloud() : this.freeDirect();
    if (free <= 0) throw new Error(`no free ${track} slot`);
    const jobId = `${track}-${++this.seq}`;
    const promise = launch()
      .then((r) => {
        this.jobs.delete(jobId);
        const ev = { partialId, ok: r.ok, summary: r.summary, tail: r.tail, ms: r.ms, owner: track };
        const w = this.waiters.shift();
        if (w) w(ev); else this.done.push(ev);
        this.emit('end', ev);
      });
    this.jobs.set(jobId, { partialId, promise, track });
    return jobId;
  }

  startDirect(partialId, prompt, targetFiles = []) {
    return this._start('direct', partialId, () => this.runDirect({
      prompt, worktree: this.worktree, targetFiles, timeoutMs: this.timeoutMs,
    }));
  }

  startCloud(partialId, prompt) {
    return this._start('cloud', partialId, () => this.run({
      agent: AGENT_CLOUD, prompt, worktree: this.worktree, timeoutMs: this.timeoutMs,
    }));
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

  // Naechstes beendetes Worker-Ergebnis; gepufferte Ergebnisse in Reihenfolge ihres Endes.
  nextEvent() {
    if (this.done.length) return Promise.resolve(this.done.shift());
    return new Promise((resolve) => this.waiters.push(resolve));
  }

  // Alle gepufferten Ergebnisse abholen, ohne zu warten.
  drainEvents() { return this.done.splice(0); }

  pending() { return this.done.length; }
}

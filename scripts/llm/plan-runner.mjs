#!/usr/bin/env node
// plan-runner.mjs — fuehrt die Partials eines gestagten Plans mit lokalen Modellen aus (T900504).
//
// Der Orchestrator (llama-server :1919, Qwen3.8-27B IQ3_XXS-mtp; faellt auf vLLM :8123 w4a4 zurueck, wenn
// :1919 nicht antwortet) steuert per Tool-Loop. Partials laufen auf drei Tracks (Rangfolge direct, cloud, self):
//  - direct: In-Process-Tool-Loop gegen vLLM :8123 (w4a4, plan-runner/direct-worker.mjs), ohne opencode,
//  - cloud:  `opencode run --agent plan-worker-muse` (Muse Spark 1.3 im Go-Abo),
//  - self:   Selbstaufruf `opencode run --agent plan-worker-self` auf :1919, nur wenn :1919 beim Preflight
//            antwortet und alle Worker-Slots belegt sind. Waehrend des Selbstaufrufs vergibt der Scheduler freie
//            Worker-Slots selbst und meldet die Ergebnisse nach der Rueckkehr.
// Fortschritt: <plan-dir>/.plan-runner/state.json (atomar, Resume nach Abbruch; Plan-Heimat seit C7a:
// .agents/plans/<slug>/).
//
// Aufruf:
//   node scripts/llm/plan-runner.mjs <change-dir> [--worktree <pfad>] [--direct-slots N|auto] [--cloud-slots N|auto] [--auto-slots] [--print-slots] [--max-turns N] [--timeout-min N]
//   (--ticket retiriert mit dem Ticket-System 2026-10-14: Plan-Verzeichnis positional uebergeben)
// 'auto' leitet die Slots aus der maximalen Frontbreite des Partials-DAGs ab (Direkt zuerst, Cloud nur fuer den
// Rest ueber der Direkt-Kapazitaet); --print-slots gibt {width, slotsDirect, slotsCloud, partials} als JSON aus und
// startet nichts (fuer Dashboard/Skripte). --4b-slots ist ein veralteter Alias fuer --direct-slots; --vllm-slots
// wurde entfernt (Exit 2).
// Preflight (GET /v1/models, 5 s): Orchestrator, Direkt-Endpunkt und Self-Endpunkt. Ein toter Track bekommt 0 Slots.
// Env: PLAN_RUNNER_ORCH_URL (gewinnt; sonst :1919 proben, bei Ausfall :8123 mit Modell w4a4),
//      PLAN_RUNNER_ORCH_MODEL (optional), PLAN_RUNNER_ORCH_PRIMARY_URL (Default http://127.0.0.1:1919),
//      PLAN_RUNNER_ORCH_FALLBACK_URL (Default http://127.0.0.1:8123), PLAN_RUNNER_ORCH_FALLBACK_MODEL (Default w4a4),
//      PLAN_RUNNER_DIRECT_URL (Default http://127.0.0.1:8123), PLAN_RUNNER_DIRECT_MODEL (Default w4a4),
//      PLAN_RUNNER_SELF_URL (Self-Preflight, Default = Primaer-URL :1919),
//      PLAN_RUNNER_OPENCODE (ersetzt das opencode-Binary).
// Exit: 0 alle Partials done · 1 mindestens eine failed bzw. Lauf abgebrochen · 2 Konfigurationsfehler.
// Runbook: docs/runbooks/plan-runner.md

import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  parseManifest, readyPartials, loadState, saveState, buildWorkerPrompt, autoSlots,
} from './plan-runner/plan.mjs';
import { WorkerPool, decideTrack, killAllWorkers } from './plan-runner/workers.mjs';
import { DEFAULT_URL as DEFAULT_DIRECT_URL, DEFAULT_MODEL as DEFAULT_DIRECT_MODEL } from './plan-runner/direct-worker.mjs';

// Direkt-Track: drei parallele Tool-Loops gegen vLLM :8123 (40k Kontext, max-num-seqs 10, teilt sich die
// RTX 5070 Ti mit dem Orchestrator-Fallback). Cloud-Track: ein opencode-Agent plan-worker-muse (abschaltbar
// mit --cloud-slots 0).
const DEFAULT_DIRECT_SLOTS = 3;
const DEFAULT_CLOUD_SLOTS = 1;
const DEFAULT_ORCH_PRIMARY_URL = 'http://127.0.0.1:1919';
const DEFAULT_ORCH_FALLBACK_URL = 'http://127.0.0.1:8123';
const DEFAULT_ORCH_FALLBACK_MODEL = 'w4a4';
const IDLE_POLL_MS = 5000;
const MAX_PROTOCOL_ERRORS = 3;
const MAX_RETRIES = 2;

const log = (msg) => process.stderr.write(`[plan-runner] ${msg}\n`);

function fail(code, msg) {
  log(msg);
  process.exit(code);
}

// ---------- CLI ----------
function parseArgs(argv) {
  const opts = { changeDir: null, worktree: null, slotsDirect: DEFAULT_DIRECT_SLOTS, slotsCloud: DEFAULT_CLOUD_SLOTS, maxTurns: 200, timeoutMin: 120, printSlots: false };
  // --direct-slots 0 und --cloud-slots 0 schalten die Worker-Tracks ab (reine Selbstausfuehrung, z. B.
  // wenn die Partial einen Worker-Server selbst umkonfiguriert).
  // 'auto' (oder --auto-slots fuer beide Tracks) leitet die Slots aus der maximalen
  // Frontbreite des Partials-DAGs ab (autoSlots aus plan.mjs); explizite Zahlen gewinnen je Track.
  const numOrAuto = (k, v, min = 0) => {
    if (v === 'auto') return v;
    const n = Number(v);
    if (!Number.isInteger(n) || n < min) fail(2, `--${k} needs an integer >= ${min} or 'auto', got ${v}`);
    return n;
  };
  const num = (k, v, min = 1) => {
    const n = Number(v);
    if (!Number.isInteger(n) || n < min) fail(2, `--${k} needs an integer >= ${min}, got ${v}`);
    return n;
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--worktree') opts.worktree = argv[++i];
    else if (a === '--ticket') fail(2, '--ticket retiriert (Ticket-System 2026-10-14) — Plan-Verzeichnis positional uebergeben');
    else if (a === '--direct-slots') opts.slotsDirect = numOrAuto('direct-slots', argv[++i], 0);
    else if (a === '--4b-slots') {
      log('--4b-slots is deprecated, use --direct-slots (the 4B pool :8080 is gone; the direct track runs on vLLM :8123)');
      opts.slotsDirect = numOrAuto('4b-slots', argv[++i], 0);
    } else if (a === '--cloud-slots') opts.slotsCloud = numOrAuto('cloud-slots', argv[++i], 0);
    else if (a === '--vllm-slots') fail(2, '--vllm-slots was removed: use --cloud-slots N (opencode agent plan-worker-muse) or --direct-slots N (in-process worker on vLLM :8123)');
    else if (a === '--auto-slots') { opts.slotsDirect = 'auto'; opts.slotsCloud = 'auto'; }
    else if (a === '--print-slots') opts.printSlots = true;
    else if (a === '--max-turns') opts.maxTurns = num('max-turns', argv[++i]);
    else if (a === '--timeout-min') opts.timeoutMin = num('timeout-min', argv[++i]);
    else if (a.startsWith('--')) fail(2, `unknown option ${a}`);
    else if (!opts.changeDir) opts.changeDir = a;
    else fail(2, `unexpected argument ${a}`);
  }
  if (!opts.changeDir) {
    fail(2, 'usage: plan-runner.mjs <change-dir> [--worktree <path>] [--direct-slots N|auto] [--cloud-slots N|auto] [--auto-slots] [--print-slots] [--max-turns N] [--timeout-min N]');
  }
  return opts;
}

function loadPlan(opts) {
  const changeDir = resolve(opts.changeDir);
  const tasksMd = join(changeDir, 'tasks.md');
  if (!existsSync(tasksMd)) fail(2, `no tasks.md in ${changeDir}`);
  let partials;
  try {
    partials = parseManifest(readFileSync(tasksMd, 'utf8'));
  } catch (e) {
    fail(2, e.message);
  }
  const texts = {};
  for (const p of partials) {
    const f = join(changeDir, p.file);
    if (!existsSync(f)) fail(2, `partial ${p.id}: plan file ${p.file} not found`);
    texts[p.id] = readFileSync(f, 'utf8');
  }
  let worktree = opts.worktree;
  if (!worktree) {
    try {
      worktree = execFileSync('git', ['-C', changeDir, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
    } catch {
      fail(2, `${changeDir} is not inside a git worktree; pass --worktree`);
    }
  }
  worktree = resolve(worktree);
  if (!existsSync(worktree) || !statSync(worktree).isDirectory()) fail(2, `worktree ${worktree} does not exist`);
  let state;
  try {
    state = loadState(changeDir, partials);
  } catch (e) {
    fail(2, e.message);
  }
  return { changeDir, partials, texts, worktree, state };
}

// ---------- Orchestrator-Protokoll ----------
const SYSTEM = `You are the orchestrator of a plan runner. You execute an staged plan that is split into partials.
Each partial is implemented by a worker: a direct worker (dispatch_direct, small local model with a short tool loop), a cloud worker (dispatch_cloud) or, only when every worker slot is busy and plan_status shows selfAvailable = true, yourself (execute_self).
Rules:
- Prefer the direct workers, then the cloud worker. Call execute_self ONLY when plan_status shows freeDirect = 0 and freeCloud = 0 and selfAvailable = true and a partial is ready.
- Dispatch only partials listed as ready. Dependencies are enforced; a partial becomes ready when its dependencies are marked done.
- A worker result is a claim, not a proof. Review every result (success/failure line and output tail) before you call mark(id, "done").
  If a result is wrong or incomplete, call mark(id, "open", note) so it can be retried, or mark(id, "failed", note).
- Use wait_event to wait for a running worker job. Write your plan_notes for execute_self so you can continue after the self-run.
- Every reply must be a tool call. Call finish(summary) when every partial is done or nothing more can be done.`;

const fn = (name, description, properties = {}, required = []) => ({
  type: 'function', function: { name, description, parameters: { type: 'object', properties, required } },
});
const S = { type: 'string' };
const TOOLS = [
  fn('plan_status', 'State of every partial, the ready partial ids, the number of free direct and cloud slots and whether self-execution is available.'),
  fn('dispatch_direct', 'Start a ready partial on a free direct worker slot. Returns STARTED or BUSY immediately.',
    { partial_id: S, prompt: { type: 'string', description: 'Extra instructions for the worker.' } }, ['partial_id']),
  fn('dispatch_cloud', 'Start a ready partial on a free cloud worker slot. Returns STARTED or BUSY immediately.',
    { partial_id: S, prompt: { type: 'string', description: 'Extra instructions for the worker.' } }, ['partial_id']),
  fn('execute_self', 'Implement a ready partial yourself. Only allowed when all direct and cloud slots are busy and self-execution is available. Blocks until it returns.',
    { partial_id: S, prompt: S, plan_notes: { type: 'string', description: 'Your plan notes; saved before you sleep.' } },
    ['partial_id', 'plan_notes']),
  fn('wait_event', 'Block until a direct or cloud job ends and return its result.'),
  fn('mark', 'Set the status of a partial after reviewing its result.',
    { partial_id: S, status: { type: 'string', enum: ['done', 'failed', 'open'] }, note: S }, ['partial_id', 'status']),
  fn('finish', 'End the run.', { summary: S }, ['summary']),
];

async function chat({ url, model }, messages) {
  const body = { messages, tools: TOOLS, tool_choice: 'auto', max_tokens: 8192 };
  if (model) body.model = model;
  const r = await fetch(`${url}/v1/chat/completions`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(30 * 60_000),
  });
  if (!r.ok) throw new Error(`orchestrator HTTP ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const j = await r.json();
  const msg = j.choices?.[0]?.message;
  if (!msg) throw new Error('orchestrator reply has no message');
  return msg;
}

// ---------- Scheduler ----------
function createScheduler({ changeDir, partials, texts, worktree, state }, pool, selfAvailable) {
  const byId = Object.fromEntries(partials.map((p) => [p.id, p]));
  const save = () => saveState(changeDir, state);
  const ready = () => readyPartials(partials, state);

  const status = () => ({
    partials: Object.fromEntries(partials.map((p) => {
      const s = state.partials[p.id];
      return [p.id, {
        status: s.status, owner: s.owner, attempts: s.attempts, depends_on: p.dependsOn,
        active: pool.isActive(p.id), awaiting_review: s.status === 'running' && !pool.isActive(p.id),
        result: s.result,
      }];
    })),
    ready: ready(),
    freeDirect: pool.freeDirect(),
    running_direct: pool.runningDirect(),
    freeCloud: pool.freeCloud(),
    running_cloud: pool.runningCloud(),
    selfAvailable,
    buffered_events: pool.pending(),
  });

  const startWith = (track, id, extra = '') => {
    const prompt = buildWorkerPrompt({ partial: byId[id], partialText: texts[id], worktree, extra });
    if (track === 'cloud') pool.startCloud(id, prompt);
    else pool.startDirect(id, prompt, byId[id].targetFiles);
    Object.assign(state.partials[id], { status: 'running', owner: track, result: null });
    save();
    log(`${track} start ${id}`);
  };

  const policy = () => decideTrack({ ready: ready(), freeDirect: pool.freeDirect(), freeCloud: pool.freeCloud(), selfAvailable });

  // Freie Worker-Slots (erst direct, dann cloud) mit der naechsten bereiten Partial belegen
  // (ohne die selbst ausgefuehrte).
  const idleDispatch = (exclude) => {
    for (const track of ['direct', 'cloud']) {
      for (const id of ready()) {
        if ((track === 'direct' ? pool.freeDirect() : pool.freeCloud()) <= 0) break;
        if (id === exclude || pool.isActive(id)) continue;
        startWith(track, id);
        log(`idle-dispatch-${track} ${id}`);
      }
    }
  };

  pool.on('end', (ev) => {
    state.partials[ev.partialId].result = `${ev.ok ? 'success' : 'failure'}: ${ev.summary}`;
    save();
    log(`${ev.owner} end ${ev.partialId} ok=${ev.ok} ${ev.summary}`);
  });

  const formatEvent = (ev) =>
    `${ev.partialId} ${ev.ok ? 'success' : 'failure'}: ${ev.summary}\n--- output tail ---\n${String(ev.tail).slice(-1500)}`;

  const requireReady = (id) => {
    if (!byId[id]) return `ERROR: unknown partial ${id}`;
    if (!ready().includes(id)) {
      const s = state.partials[id];
      const waiting = byId[id].dependsOn.filter((d) => state.partials[d].status !== 'done');
      return `ERROR: partial ${id} is not ready (status=${s.status}${waiting.length ? `, waiting for ${waiting.join(',')}` : ''})`;
    }
    return null;
  };

  const tools = {
    plan_status: () => JSON.stringify(status()),

    dispatch_direct: ({ partial_id: id, prompt = '' }) => {
      const err = requireReady(id);
      if (err) return err;
      // Direkt-Track: Dispatch-Policy (T901014 P1) — ein Direkt-Dispatch braucht 'direct'.
      if (policy() !== 'direct') return `BUSY: no free direct slot (running: ${pool.runningDirect().join(',')})`;
      startWith('direct', id, String(prompt));
      return `STARTED ${id}`;
    },

    dispatch_cloud: ({ partial_id: id, prompt = '' }) => {
      const err = requireReady(id);
      if (err) return err;
      // Cloud-Track: Dispatch-Policy — ein Cloud-Dispatch braucht 'cloud' (Direkt voll, Cloud frei).
      if (policy() !== 'cloud') {
        if (pool.freeDirect() > 0) return 'BUSY: direct slot(s) free - use dispatch_direct first';
        return `BUSY: no free cloud slot (running: ${pool.runningCloud().join(',')})`;
      }
      startWith('cloud', id, String(prompt));
      return `STARTED ${id}`;
    },

    execute_self: async ({ partial_id: id, prompt = '', plan_notes: notes = '' }) => {
      if (!byId[id]) return `ERROR: unknown partial ${id}`;
      // Self-Track: nur wenn die Dispatch-Policy 'self' liefert (kein freier Slot, Partial bereit, :1919 antwortet).
      const track = policy();
      if (track === 'direct') {
        return `ERROR: ${pool.freeDirect()} direct slot(s) free - use dispatch_direct. execute_self is only allowed when all worker slots are busy.`;
      }
      if (track === 'cloud') {
        return `ERROR: ${pool.freeCloud()} cloud slot(s) free - use dispatch_cloud. execute_self is only allowed when all worker slots are busy.`;
      }
      if (!selfAvailable) {
        return 'ERROR: self track unavailable (the self endpoint did not answer the preflight) - use wait_event for running workers or call finish';
      }
      const err = requireReady(id);
      if (err) return err;
      state.orchestrator.notes = String(notes);
      state.orchestrator.frozen_at = new Date().toISOString();
      Object.assign(state.partials[id], { status: 'running', owner: 'self', result: null });
      save();
      log(`self start ${id}`);
      const selfPrompt = buildWorkerPrompt({ partial: byId[id], partialText: texts[id], worktree, extra: String(prompt) });
      let result = null;
      const selfRun = pool.runSelf(id, selfPrompt).then((r) => { result = r; });
      while (result === null) {
        idleDispatch(id);
        let onEnd;
        const ended = new Promise((res) => { onEnd = res; pool.once('end', onEnd); });
        let timer;
        const tick = new Promise((res) => { timer = setTimeout(res, IDLE_POLL_MS); });
        await Promise.race([selfRun, ended, tick]);
        pool.off('end', onEnd);
        clearTimeout(timer);
      }
      state.orchestrator.frozen_at = null;
      state.partials[id].result = `${result.ok ? 'success' : 'failure'}: ${result.summary}`;
      save();
      log(`self end ${id} ok=${result.ok} ${result.summary}`);
      let reply = `${result.ok ? 'success' : 'failure'} ${result.summary}\n--- output tail ---\n${String(result.tail).slice(-1500)}`;
      const slept = pool.drainEvents();
      if (slept.length) {
        reply += `\n\nWhile you were asleep, these worker jobs finished (review each, then mark):\n${slept.map(formatEvent).join('\n\n')}`;
      }
      const stillDirect = pool.runningDirect();
      const stillCloud = pool.runningCloud();
      if (stillDirect.length || stillCloud.length) {
        reply += `\n\nStill running (direct: ${stillDirect.join(',') || 'none'}; cloud: ${stillCloud.join(',') || 'none'})`;
      }
      return reply;
    },

    wait_event: async () => {
      if (!pool.pending() && !pool.runningDirect().length && !pool.runningCloud().length) return 'NO_EVENT: no worker job is running';
      return `EVENT ${formatEvent(await pool.nextEvent())}`;
    },

    mark: ({ partial_id: id, status: st, note = '' }) => {
      if (!byId[id]) return `ERROR: unknown partial ${id}`;
      if (!['done', 'failed', 'open'].includes(st)) return `ERROR: status must be done, failed or open, got ${st}`;
      if (pool.isActive(id)) return `ERROR: partial ${id} is still running - call wait_event first`;
      const s = state.partials[id];
      if (note) s.result = String(note);
      if (st === 'open') {
        s.attempts += 1;
        s.owner = null;
        if (s.attempts > MAX_RETRIES) {
          s.status = 'failed';
          return `FAILED ${id}: retry limit (${MAX_RETRIES}) reached`;
        }
      }
      s.status = st;
      return `OK ${id} -> ${st}`;
    },
  };

  return { tools, status, save };
}

// ---------- Hauptlauf ----------
// Endpunkt-Preflight: prueft /v1/models mit kurzem Timeout (T016656). Ein toter Endpunkt degradiert
// seinen Track still auf 0 Slots bzw. "kein Self" — der Lauf nutzt dann die uebrigen Tracks.
async function probeEndpoint(url, timeoutMs = 5000) {
  try {
    const r = await fetch(`${url}/v1/models`, { signal: AbortSignal.timeout(timeoutMs) });
    return r.ok;
  } catch {
    return false;
  }
}

const urlEnv = (name, dflt) => (process.env[name] || dflt).replace(/\/$/, '');

// Orchestrator-Endpunkt (D4): PLAN_RUNNER_ORCH_URL gewinnt ohne Probe. Sonst :1919, bei Ausfall vLLM :8123
// (Tool-Parser qwen3_coder, Modell w4a4). Liefert { url, model, primary } oder bricht mit Exit 1 ab.
async function resolveOrchestrator() {
  const model = process.env.PLAN_RUNNER_ORCH_MODEL || null;
  const primary = urlEnv('PLAN_RUNNER_ORCH_PRIMARY_URL', DEFAULT_ORCH_PRIMARY_URL);
  if (process.env.PLAN_RUNNER_ORCH_URL) return { url: urlEnv('PLAN_RUNNER_ORCH_URL', ''), model, primary };
  if (await probeEndpoint(primary)) return { url: primary, model, primary };
  const fallback = urlEnv('PLAN_RUNNER_ORCH_FALLBACK_URL', DEFAULT_ORCH_FALLBACK_URL);
  const fbModel = process.env.PLAN_RUNNER_ORCH_FALLBACK_MODEL || model || DEFAULT_ORCH_FALLBACK_MODEL;
  if (!(await probeEndpoint(fallback))) fail(1, `orchestrator unreachable: ${primary} and fallback ${fallback} did not answer /v1/models`);
  log(`orchestrator fallback: ${primary} unreachable, using ${fallback} (model ${fbModel})`);
  return { url: fallback, model: fbModel, primary };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const plan = loadPlan(opts);
  let suggestion = null;
  if (opts.slotsDirect === 'auto' || opts.slotsCloud === 'auto' || opts.printSlots) {
    try {
      suggestion = autoSlots(plan.partials);
    } catch (e) {
      fail(2, e.message);
    }
    if (opts.slotsDirect === 'auto') opts.slotsDirect = suggestion.slotsDirect;
    if (opts.slotsCloud === 'auto') opts.slotsCloud = suggestion.slotsCloud;
    log(`auto-slots: ${plan.partials.length} partials, frontier width ${suggestion.width} -> direct ${opts.slotsDirect}, cloud ${opts.slotsCloud}`);
  }
  if (opts.printSlots) {
    process.stdout.write(`${JSON.stringify({ ...suggestion, partials: plan.partials.length })}\n`);
    process.exit(0);
  }
  const orch = await resolveOrchestrator();
  const directUrl = urlEnv('PLAN_RUNNER_DIRECT_URL', DEFAULT_DIRECT_URL);
  const selfUrl = urlEnv('PLAN_RUNNER_SELF_URL', orch.primary);
  let slotsDirect = opts.slotsDirect;
  if (slotsDirect > 0 && !(await probeEndpoint(directUrl))) {
    log(`direct endpoint ${directUrl} unreachable - direct slots 0`);
    slotsDirect = 0;
  }
  const selfAvailable = await probeEndpoint(selfUrl);
  if (!selfAvailable) log(`self endpoint ${selfUrl} unreachable - self track off`);
  const pool = new WorkerPool({ slotsDirect, slotsCloud: opts.slotsCloud, worktree: plan.worktree, timeoutMs: opts.timeoutMin * 60_000 });
  const sched = createScheduler(plan, pool, selfAvailable);
  sched.save();
  process.on('SIGINT', () => { killAllWorkers(); fail(130, 'interrupted; state saved, restart resumes'); });
  log(`change ${plan.changeDir} · worktree ${plan.worktree} · direct slots ${slotsDirect} (${process.env.PLAN_RUNNER_DIRECT_MODEL || DEFAULT_DIRECT_MODEL} @ ${directUrl}) · cloud slots ${opts.slotsCloud} · self ${selfAvailable ? 'on' : 'off'} · orchestrator ${orch.url}`);

  const messages = [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: `Execute the plan "${plan.state.slug}". Orchestrator notes from an earlier run: ${plan.state.orchestrator.notes || '(none)'}\nPlan status:\n${JSON.stringify(sched.status())}` },
  ];
  let finished = false;
  let aborted = null;
  let protocolErrors = 0;
  try {
    for (let turn = 0; turn < opts.maxTurns && !finished; turn++) {
      const msg = await chat(orch, messages);
      const calls = msg.tool_calls ?? [];
      messages.push({ role: 'assistant', content: msg.content ?? '', ...(calls.length ? { tool_calls: calls } : {}) });
      if (!calls.length) {
        protocolErrors++;
        log(`protocol error ${protocolErrors}/${MAX_PROTOCOL_ERRORS}: reply without tool call`);
        if (protocolErrors >= MAX_PROTOCOL_ERRORS) { aborted = 'too many replies without a tool call'; break; }
        messages.push({ role: 'user', content: 'Protocol error: every reply must be a tool call. Call plan_status if unsure.' });
        continue;
      }
      protocolErrors = 0;
      for (const c of calls) {
        const name = c.function?.name;
        let args;
        try { args = JSON.parse(c.function?.arguments || '{}'); } catch { args = null; }
        let out;
        if (!args || typeof args !== 'object') out = 'ERROR: arguments are not valid JSON';
        else if (name === 'finish') { finished = true; out = 'OK'; log(`finish: ${args.summary ?? ''}`); }
        else if (sched.tools[name]) out = await sched.tools[name](args);
        else out = `ERROR: unknown tool ${name}`;
        log(`tool ${name} -> ${String(out).split('\n')[0].slice(0, 160)}`);
        messages.push({ role: 'tool', tool_call_id: c.id, content: String(out) });
        sched.save();
        if (finished) break;
      }
    }
    if (!finished && !aborted) aborted = `max turns (${opts.maxTurns}) reached`;
  } catch (e) {
    aborted = e.message;
  }

  // Nicht abgeschlossene Worker-Jobs beenden; loadState setzt sie beim naechsten Lauf auf open.
  // Direkt-Jobs laufen im Runner-Prozess und enden mit process.exit, opencode-Prozesse per killAllWorkers.
  const stillRunning = [...pool.runningDirect(), ...pool.runningCloud()];
  if (stillRunning.length) {
    log(`stopping running worker jobs: ${stillRunning.join(',')}`);
    killAllWorkers();
  }
  sched.save();
  const counts = { done: 0, failed: 0, open: 0, running: 0 };
  for (const s of Object.values(plan.state.partials)) counts[s.status] = (counts[s.status] ?? 0) + 1;
  const total = plan.partials.length;
  const code = counts.done === total && !aborted ? 0 : 1;
  if (aborted) log(`aborted: ${aborted}`);
  process.stdout.write(`PLAN-RUNNER: done=${counts.done}/${total} failed=${counts.failed} open=${counts.open} running=${counts.running}${aborted ? ` aborted=${JSON.stringify(aborted)}` : ''}\n`);
  process.exit(code);
}

main().catch((e) => { killAllWorkers(); fail(1, e.stack || String(e)); });

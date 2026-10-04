#!/usr/bin/env node
// plan-runner.mjs — fuehrt die Partials eines gestagten Plans mit lokalen Modellen aus (T900504).
//
// Der Orchestrator (llama-server :1919, Qwen3.8-27B IQ3_XXS-mtp) steuert per Tool-Loop; Partials laufen als
// `opencode run --agent plan-worker-qwen35` (4B-Worker Qwen3.5-4B-MTP, Windows-nativ :8080) oder, wenn alle
// 4B-Slots belegt sind, als Selbstaufruf `opencode run --agent plan-worker-self`. Waehrend des
// Selbstaufrufs vergibt der Scheduler freie 4B-Slots selbst und meldet die Ergebnisse nach der Rueckkehr. Fortschritt:
// <plan-dir>/.plan-runner/state.json (atomar, Resume nach Abbruch; Plan-Heimat seit C7a:
// .agents/plans/<slug>/, davor .agents/plans/<slug>/).
//
// Aufruf:
//   node scripts/llm/plan-runner.mjs <change-dir> [--worktree <pfad>] [--4b-slots N] [--max-turns N] [--timeout-min N]
// Env: PLAN_RUNNER_ORCH_URL (Default http://127.0.0.1:1919), PLAN_RUNNER_ORCH_MODEL (optional),
//      PLAN_RUNNER_OPENCODE (ersetzt das opencode-Binary).
// Exit: 0 alle Partials done · 1 mindestens eine failed bzw. Lauf abgebrochen · 2 Konfigurationsfehler.
// Runbook: docs/runbooks/plan-runner.md

import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  parseManifest, readyPartials, loadState, saveState, buildWorkerPrompt,
} from './plan-runner/plan.mjs';
import { WorkerPool, decideTrack, killAllWorkers } from './plan-runner/workers.mjs';

// 3 Slots des Windows-nativen Qwen3.5-4B-MTP-Pools (:8080, -np 3 -kvu -c 98304
// seit 2026-10-03; davor -np 3 in qwen35-mtp.service auf :1920, T900504 p4).
const DEFAULT_4B_SLOTS = 3;
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
  const opts = { changeDir: null, worktree: null, slots4b: DEFAULT_4B_SLOTS, maxTurns: 200, timeoutMin: 120 };
  // --4b-slots 0 = nur Selbstausfuehrung (z. B. wenn die Partial den 4B-Server selbst umkonfiguriert).
  const num = (k, v, min = 1) => {
    const n = Number(v);
    if (!Number.isInteger(n) || n < min) fail(2, `--${k} needs an integer >= ${min}, got ${v}`);
    return n;
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--worktree') opts.worktree = argv[++i];
    else if (a === '--4b-slots') opts.slots4b = num('4b-slots', argv[++i], 0);
    else if (a === '--max-turns') opts.maxTurns = num('max-turns', argv[++i]);
    else if (a === '--timeout-min') opts.timeoutMin = num('timeout-min', argv[++i]);
    else if (a.startsWith('--')) fail(2, `unknown option ${a}`);
    else if (!opts.changeDir) opts.changeDir = a;
    else fail(2, `unexpected argument ${a}`);
  }
  if (!opts.changeDir) {
    fail(2, 'usage: plan-runner.mjs <change-dir> [--worktree <path>] [--4b-slots N] [--max-turns N] [--timeout-min N]');
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
Each partial is implemented by a worker: a small 4B model (dispatch_4b) or, only when every 4B slot is busy, yourself (execute_self).
Rules:
- Prefer the 4B workers. Call execute_self ONLY when plan_status shows free4b = 0 and a partial is ready.
- Dispatch only partials listed as ready. Dependencies are enforced; a partial becomes ready when its dependencies are marked done.
- A worker result is a claim, not a proof. Review every result (success/failure line and output tail) before you call mark(id, "done").
  If a result is wrong or incomplete, call mark(id, "open", note) so it can be retried, or mark(id, "failed", note).
- Use wait_event to wait for a running 4B job. Write your plan_notes for execute_self so you can continue after the self-run.
- Every reply must be a tool call. Call finish(summary) when every partial is done or nothing more can be done.`;

const fn = (name, description, properties = {}, required = []) => ({
  type: 'function', function: { name, description, parameters: { type: 'object', properties, required } },
});
const S = { type: 'string' };
const TOOLS = [
  fn('plan_status', 'State of every partial, the ready partial ids and the number of free 4B slots.'),
  fn('dispatch_4b', 'Start a ready partial on a free 4B worker slot. Returns STARTED or BUSY immediately.',
    { partial_id: S, prompt: { type: 'string', description: 'Extra instructions for the worker.' } }, ['partial_id']),
  fn('execute_self', 'Implement a ready partial yourself. Only allowed when all 4B slots are busy. Blocks until it returns.',
    { partial_id: S, prompt: S, plan_notes: { type: 'string', description: 'Your plan notes; saved before you sleep.' } },
    ['partial_id', 'plan_notes']),
  fn('wait_event', 'Block until a 4B job ends and return its result.'),
  fn('mark', 'Set the status of a partial after reviewing its result.',
    { partial_id: S, status: { type: 'string', enum: ['done', 'failed', 'open'] }, note: S }, ['partial_id', 'status']),
  fn('finish', 'End the run.', { summary: S }, ['summary']),
];

async function chat(url, messages) {
  const body = { messages, tools: TOOLS, tool_choice: 'auto', max_tokens: 8192 };
  if (process.env.PLAN_RUNNER_ORCH_MODEL) body.model = process.env.PLAN_RUNNER_ORCH_MODEL;
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
function createScheduler({ changeDir, partials, texts, worktree, state }, pool) {
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
    free4b: pool.free4b(),
    running_4b: pool.running4b(),
    buffered_events: pool.pending(),
  });

  const start4b = (id, extra = '') => {
    const prompt = buildWorkerPrompt({ partial: byId[id], partialText: texts[id], worktree, extra });
    pool.start4b(id, prompt);
    Object.assign(state.partials[id], { status: 'running', owner: '4b', result: null });
    save();
    log(`4b start ${id}`);
  };

  // Freie 4B-Slots mit der naechsten bereiten Partial belegen (ohne die selbst ausgefuehrte).
  const idleDispatch = (exclude) => {
    for (const id of ready()) {
      if (pool.free4b() <= 0) break;
      if (id === exclude) continue;
      start4b(id);
      log(`idle-dispatch ${id}`);
    }
  };

  pool.on('end', (ev) => {
    state.partials[ev.partialId].result = `${ev.ok ? 'success' : 'failure'}: ${ev.summary}`;
    save();
    log(`4b end ${ev.partialId} ok=${ev.ok} ${ev.summary}`);
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

    dispatch_4b: ({ partial_id: id, prompt = '' }) => {
      const err = requireReady(id);
      if (err) return err;
      // Worker-Track: Dispatch-Policy (T901014 P1) — ein 4B-Dispatch braucht 'worker'.
      if (decideTrack({ ready: ready(), freeSlots: pool.free4b() }) !== 'worker') return `BUSY: no free 4B slot (running: ${pool.running4b().join(',')})`;
      start4b(id, String(prompt));
      return `STARTED ${id}`;
    },

    execute_self: async ({ partial_id: id, prompt = '', plan_notes: notes = '' }) => {
      if (!byId[id]) return `ERROR: unknown partial ${id}`;
      // Self-Track: nur wenn die Dispatch-Policy 'self' liefert (kein freier Slot, Partial bereit).
      if (decideTrack({ ready: ready(), freeSlots: pool.free4b() }) === 'worker') {
        return `ERROR: ${pool.free4b()} 4B slot(s) free - use dispatch_4b. execute_self is only allowed when all 4B slots are busy.`;
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
        reply += `\n\nWhile you were asleep, these 4B jobs finished (review each, then mark):\n${slept.map(formatEvent).join('\n\n')}`;
      }
      if (pool.running4b().length) reply += `\n\nStill running on 4B: ${pool.running4b().join(',')}`;
      return reply;
    },

    wait_event: async () => {
      if (!pool.pending() && !pool.running4b().length) return 'NO_EVENT: no 4B job is running';
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
async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const plan = loadPlan(opts);
  const url = (process.env.PLAN_RUNNER_ORCH_URL || 'http://127.0.0.1:1919').replace(/\/$/, '');
  const pool = new WorkerPool({ slots4b: opts.slots4b, worktree: plan.worktree, timeoutMs: opts.timeoutMin * 60_000 });
  const sched = createScheduler(plan, pool);
  sched.save();
  process.on('SIGINT', () => { killAllWorkers(); fail(130, 'interrupted; state saved, restart resumes'); });
  log(`change ${plan.changeDir} · worktree ${plan.worktree} · 4b slots ${opts.slots4b} · orchestrator ${url}`);

  const messages = [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: `Execute the plan "${plan.state.slug}". Orchestrator notes from an earlier run: ${plan.state.orchestrator.notes || '(none)'}\nPlan status:\n${JSON.stringify(sched.status())}` },
  ];
  let finished = false;
  let aborted = null;
  let protocolErrors = 0;
  try {
    for (let turn = 0; turn < opts.maxTurns && !finished; turn++) {
      const msg = await chat(url, messages);
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

  // Nicht abgeschlossene 4B-Jobs beenden; loadState setzt sie beim naechsten Lauf auf open.
  if (pool.running4b().length) {
    log(`stopping running 4B jobs: ${pool.running4b().join(',')}`);
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

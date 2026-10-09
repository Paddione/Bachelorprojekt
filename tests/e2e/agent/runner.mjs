#!/usr/bin/env node
// tests/e2e/agent/runner.mjs
// T901645 — Vision-Agent-Loop: Screenshot -> VLM-JSON-Aktion -> Playwright.
// Vorbild CLI/JSONL/Reps: scripts/llm/bench-orchestration.mjs.
import { writeFileSync, appendFileSync, readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { evaluateFlow, summarize, validateFlows } from './oracle.mjs';
import { readState } from './read-state.mjs';

const PROMPT_VERSION = 1;
const VIEWPORT = { width: 1280, height: 800 };
const MAX_TOKENS = 800;
const MAX_REPAIRS = 2;
const ACTIONS = ['click', 'fill', 'goto', 'assert', 'done'];

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const FLOWS_PATH = arg('flows', '');
const MODEL = (arg('model', process.env.AGENT_MODEL_URL || 'http://127.0.0.1:1931')).replace(/\/$/, '');
const BASE = (process.env.AGENT_BASE_URL || 'http://localhost:4321').replace(/\/$/, '');
const REPS = Number(arg('reps', '3'));
const OUT = arg('out', 'agent-bench.jsonl');
const OBS = arg('obs', 'screenshot');
const MAX_TURNS = Number(arg('max-turns', '12'));
const AUTH = arg('auth', process.env.AGENT_AUTH_STATE || '');

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`agent-runner (PROMPT_VERSION=${PROMPT_VERSION}) — Vision-Agent-Harness
Flags:
  --flows <pfad>     kuratierte Flows (JSON, {flows:[...]} oder [...]) [Pflicht]
  --model <url>      OpenAI-kompatibler VLM-Endpunkt (Default: ${MODEL})
  --reps <n>         Wiederholungen je Flow (Default: ${REPS})
  --out <jsonl>      Ergebnisdatei, eine JSON-Zeile je Lauf (Default: ${OUT})
  --obs <mode>       screenshot|hybrid (Default: ${OBS})
  --max-turns <n>    Turn-Limit je Lauf (Default: ${MAX_TURNS})
  --auth <pfad>      Playwright-storageState (JSON) fuer Flows mit "auth": true (Default: keiner, anonym)
Env: AGENT_MODEL_URL, AGENT_BASE_URL (Default: ${BASE}), AGENT_AUTH_STATE`);
  process.exit(0);
}

function fail(msg) {
  process.stderr.write(`runner: ${msg}\n`);
  process.exit(1);
}
if (!FLOWS_PATH) fail('--flows <pfad> fehlt (siehe --help)');
if (!['screenshot', 'hybrid'].includes(OBS)) fail(`--obs muss screenshot|hybrid sein, ist ${OBS}`);
if (!Number.isInteger(REPS) || REPS < 1) fail(`--reps muss >= 1 sein, ist ${REPS}`);
if (!Number.isInteger(MAX_TURNS) || MAX_TURNS < 1) fail(`--max-turns muss >= 1 sein, ist ${MAX_TURNS}`);
if (AUTH) {
  try {
    JSON.parse(readFileSync(AUTH, 'utf8'));
  } catch (e) {
    fail(`--auth ${AUTH} ist nicht lesbar oder kein gueltiges JSON: ${String(e.message ?? e).slice(0, 200)}`);
  }
}

function loadFlows(path) {
  let doc;
  try {
    doc = JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    throw new Error(`Flows-Datei ${path} ist kein gueltiges JSON: ${String(e.message ?? e).slice(0, 200)}`);
  }
  const flows = Array.isArray(doc) ? doc : doc.flows;
  if (!Array.isArray(flows) || !flows.length) throw new Error(`Flows-Datei ${path}: Array 'flows' fehlt oder ist leer`);
  validateFlows(flows);
  for (const f of flows) f.goal_checks = f.goal_checks ?? f.checks;
  return flows;
}

async function chat(messages, timeoutMs = 600_000) {
  const t0 = Date.now();
  const r = await fetch(`${MODEL}/v1/chat/completions`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messages, max_tokens: MAX_TOKENS }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!r.ok) throw new Error(`${MODEL} HTTP ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const j = await r.json();
  const msg = j.choices[0].message;
  return { text: (msg.content || msg.reasoning_content || '').trim(), usage: j.usage ?? {}, ms: Date.now() - t0 };
}

const SYSTEM = `You are a browser agent (prompt v${PROMPT_VERSION}). You see screenshots of a German website and drive it to the given goal.
Reply with exactly ONE line of JSON, nothing else:
{"action":"click|fill|goto|assert|done","target":"...","x":0-1000,"y":0-1000,"text":"..."}
- click: x/y are viewport coordinates in 0-1000 space (NOT pixels). Prefer x/y over target.
- fill: target is a CSS selector, text is the value to type.
- goto: target is a path on THIS site only (must start with /). Never navigate to other origins.
- assert: target is text you expect to be visible right now (soft check, answered back to you).
- done: the goal state is reached. Use it exactly once, at the end.`;

const REPAIR = 'Deine letzte Antwort war kein gueltiges Aktions-JSON. Antworte NUR mit einer einzeiligen JSON-Aktion nach dem Kontrakt, ohne Erklaerung.';

function parseAction(text) {
  const norm = String(text ?? '').trim().replace(/^```\w*\n?|```$/g, '').trim();
  let o;
  try {
    o = JSON.parse(norm);
  } catch {
    return null;
  }
  if (!o || !ACTIONS.includes(o.action)) return null;
  if (o.x !== undefined && (typeof o.x !== 'number' || o.x < 0 || o.x > 1000)) return null;
  if (o.y !== undefined && (typeof o.y !== 'number' || o.y < 0 || o.y > 1000)) return null;
  return o;
}

async function observe(page, goal, first) {
  const shot = (await page.screenshot()).toString('base64');
  const parts = [{ type: 'text', text: first ? `Ziel: ${goal}\nAntworte mit genau einer JSON-Aktion.` : 'Naechste Aktion (genau eine JSON-Zeile):' },
    { type: 'image_url', image_url: { url: `data:image/png;base64,${shot}` } }];
  if (OBS === 'hybrid') {
    const snap = await page.locator('body').ariaSnapshot().catch(() => null);
    parts.push({ type: 'text', text: `A11y-Snapshot:\n${snap?.slice(0, 4000) ?? '(leer)'}` });
  }
  return parts;
}

async function settle(page) {
  await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {});
}

async function execute(page, action) {
  switch (action.action) {
    case 'done':
      return 'done';
    case 'click':
      if (typeof action.x === 'number' && typeof action.y === 'number') {
        await page.mouse.click((action.x / 1000) * VIEWPORT.width, (action.y / 1000) * VIEWPORT.height);
      } else if (action.target) {
        try {
          await page.locator(action.target).click({ timeout: 5000 });
        } catch (e) {
          return `Hinweis: click auf ${action.target} schlug fehl (${String(e.message ?? e).slice(0, 150)}).`;
        }
      } else {
        return 'Hinweis: click braucht x/y oder target.';
      }
      await settle(page);
      return '';
    case 'fill':
      if (!action.target || action.text === undefined) return 'Hinweis: fill braucht target und text.';
      try {
        await page.locator(action.target).fill(String(action.text), { timeout: 5000 });
      } catch (e) {
        return `Hinweis: fill auf ${action.target} schlug fehl (${String(e.message ?? e).slice(0, 150)}).`;
      }
      await settle(page);
      return '';
    case 'goto': {
      if (!action.target) return 'Hinweis: goto braucht target.';
      let url;
      try {
        url = new URL(action.target, BASE);
      } catch {
        return `Hinweis: goto-Ziel ${action.target} ist keine gueltige URL.`;
      }
      if (url.origin !== new URL(BASE).origin) return `Hinweis: goto auf ${url.origin} abgelehnt (nur ${BASE} erlaubt).`;
      await page.goto(url.toString(), { waitUntil: 'domcontentloaded', timeout: 30000 });
      return '';
    }
    case 'assert': {
      const needle = action.target ?? action.text ?? '';
      const { text } = await readState(page);
      return text.includes(needle) ? `Hinweis: assert ok (${needle}).` : `Hinweis: assert fehlgeschlagen, ${needle} nicht sichtbar.`;
    }
    default:
      return `Hinweis: unbekannte Aktion ${action.action}.`;
  }
}

async function runFlow(flow, rep) {
  const rec = { flow: flow.id, rep, pass: false, turns: 0, protocol_errors: 0,
    wall_ms: 0, tokens: 0, error: null, oracle: null, authUsed: Boolean(AUTH) };
  if (flow.auth === true && !AUTH) {
    rec.error = 'auth-required';
    return rec;
  }
  const t0 = Date.now();
  let browser;
  try {
    browser = await chromium.launch();
    const ctx = await browser.newContext({ viewport: VIEWPORT, ...(AUTH ? { storageState: AUTH } : {}) });
    await ctx.addInitScript(() => { window.localStorage.setItem('cookie_consent_v1', 'necessary'); });
    const page = await ctx.newPage();
    await page.goto(BASE + flow.start_url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    const messages = [{ role: 'system', content: SYSTEM }];
    const goal = flow.goal ?? `Erreiche den Endzustand von Flow ${flow.id} und antworte dann mit done.`;
    let done = false;
    let aborted = false;
    for (let turn = 0; turn < MAX_TURNS && !done && !aborted; turn++) {
      rec.turns++;
      messages.push({ role: 'user', content: await observe(page, goal, turn === 0) });
      let action = null;
      for (let repair = 0; repair <= MAX_REPAIRS; repair++) {
        const { text, usage } = await chat(messages);
        rec.tokens += usage.total_tokens ?? (usage.prompt_tokens ?? 0) + (usage.completion_tokens ?? 0);
        action = parseAction(text);
        messages.push({ role: 'assistant', content: text });
        if (action) break;
        rec.protocol_errors++;
        if (repair === MAX_REPAIRS) {
          aborted = true;
          break;
        }
        messages.push({ role: 'user', content: REPAIR });
      }
      if (aborted || !action) break;
      const outcome = await execute(page, action);
      if (outcome === 'done') {
        done = true;
        break;
      }
      if (outcome === 'abort') {
        aborted = true;
        break;
      }
      if (outcome) messages.push({ role: 'user', content: outcome });
    }
    rec.oracle = evaluateFlow({ id: flow.id, checks: flow.goal_checks }, await readState(page, flow, BASE));
    rec.pass = rec.oracle.pass && done;
  } catch (e) {
    rec.error = String(e.message ?? e).slice(0, 300);
  } finally {
    await browser?.close().catch(() => {});
  }
  rec.wall_ms = Date.now() - t0;
  return rec;
}

let flows;
try {
  flows = loadFlows(FLOWS_PATH);
} catch (e) {
  fail(String(e.message ?? e));
}
writeFileSync(OUT, '');
const all = [];
for (let rep = 1; rep <= REPS; rep++) {
  for (const f of flows) {
    const r = await runFlow(f, rep);
    all.push(r);
    appendFileSync(OUT, JSON.stringify(r) + '\n');
    process.stderr.write(summarize({ flow: r.flow, pass: r.pass, checks: r.oracle?.checks ?? [] }) +
      ` rep=${r.rep} turns=${r.turns} perr=${r.protocol_errors} tokens=${r.tokens} wall=${(r.wall_ms / 1000).toFixed(1)}s${r.error ? ' ERR ' + r.error : ''}\n`);
  }
}
const sum = (f) => all.reduce((a, r) => a + f(r), 0);
process.stderr.write(JSON.stringify({ runs: all.length, pass: sum((r) => (r.pass ? 1 : 0)),
  protocol_errors: sum((r) => r.protocol_errors), errors: sum((r) => (r.error ? 1 : 0)),
  avg_turns: +(sum((r) => r.turns) / all.length).toFixed(2),
  avg_wall_s: +(sum((r) => r.wall_ms) / all.length / 1000).toFixed(1) }) + '\n');

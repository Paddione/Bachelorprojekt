#!/usr/bin/env node
// bench-orchestration.mjs — Misst, wie gut ein Orchestrator-Modell einen Plan ueber ein
// kleines Arbeitermodell ausfuehrt (Qwen3.5-4B-MTP auf :1920, RTX 3060 Ti).
//
// Der Orchestrator bekommt nur zwei Tools: delegate(task) ruft den Worker auf, finish(answer)
// beendet die Aufgabe. Jede Aufgabe hat ein deterministisch pruefbares Ergebnis. Bestanden
// heisst: Ergebnis korrekt UND mindestens eine Delegation (sonst hat der Orchestrator selbst
// gerechnet, das misst nicht Orchestrierung).
//
// Aufgabe "fault" ersetzt die ERSTE Worker-Antwort durch ein offensichtlich falsches Ergebnis.
// Sie misst, ob der Orchestrator Worker-Ausgaben gegenprueft und neu delegiert.
//
// Aufruf:
//   node scripts/llm/bench-orchestration.mjs --orch 1921 --label glimmer [--reps 3] [--worker 1920] [--worker-think] [--tasks csv,chain] [--orch-model <id>]
// Ergebnis: eine JSON-Zeile pro Lauf auf stdout-Datei --out (Default: bench-orchestration-<label>.jsonl
// im aktuellen Verzeichnis), Zusammenfassung auf stderr.

import { writeFileSync, appendFileSync } from 'node:fs';
import vm from 'node:vm';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const ORCH = `http://127.0.0.1:${arg('orch', '1919')}`;
const WORKER = `http://127.0.0.1:${arg('worker', '1920')}`;
const LABEL = arg('label', 'orch');
const REPS = Number(arg('reps', '3'));
const OUT = arg('out', `bench-orchestration-${LABEL}.jsonl`);
const WORKER_THINK = process.argv.includes('--worker-think');
// FreeToken verlangt "model" im Request (HTTP 422 ohne), llama.cpp ignoriert es.
const ORCH_MODEL = arg('orch-model', undefined);
const ONLY = arg('tasks', '').split(',').filter(Boolean);
const MAX_TURNS = 12;

async function chat(base, body, timeoutMs = 600_000) {
  const t0 = Date.now();
  const r = await fetch(`${base}/v1/chat/completions`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs),
  });
  if (!r.ok) throw new Error(`${base} HTTP ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const j = await r.json();
  return { msg: j.choices[0].message, finish: j.choices[0].finish_reason, usage: j.usage ?? {}, ms: Date.now() - t0 };
}

const SYSTEM = `You are an orchestrator. You execute a plan by delegating work to a small worker model.
Rules:
- Do NOT compute, count, transform or write code yourself. Every piece of content work goes through the delegate tool.
- The worker sees ONLY the text you pass in "task". Include all data and the exact output format it must return.
- Split the job into small, unambiguous steps. A small model makes mistakes on big steps.
- Check every worker result for plausibility. If a result is wrong or implausible, delegate again with a clearer task.
- When done, call finish with the final answer in exactly the requested format and nothing else.`;

const TOOLS = [
  { type: 'function', function: { name: 'delegate', description: 'Send one self-contained task to the worker model and get its reply.',
    parameters: { type: 'object', properties: { task: { type: 'string' } }, required: ['task'] } } },
  { type: 'function', function: { name: 'finish', description: 'Return the final answer.',
    parameters: { type: 'object', properties: { answer: { type: 'string' } }, required: ['answer'] } } },
];

const norm = (s) => String(s ?? '').trim().replace(/^```\w*\n?|```$/g, '').trim();

const TASKS = [
  {
    id: 'csv',
    prompt: `From this CSV, take the rows with status "failed", count them and sum their duration_s.
Answer format: FAILED=<count> TOTAL=<sum>

job,status,duration_s
build-web,ok,41
build-brett,failed,17
test-bats,failed,88
lint,ok,9
e2e-mentolder,failed,203
docs,ok,12
render-fleet,failed,34
seal,ok,5`,
    check: (a) => /FAILED\s*=\s*4\b/.test(a) && /TOTAL\s*=\s*342\b/.test(a),
  },
  {
    id: 'slugs',
    prompt: `Turn each title into a slug: lowercase, replace ä→ae ö→oe ü→ue ß→ss, replace every run of other non-alphanumeric characters with a single "-", no leading/trailing "-". Then sort the slugs alphabetically.
Answer format: a JSON array of strings, nothing else.

Titles:
Größe der Übersicht anpassen
Login schlägt fehl (OIDC)
Backup: täglich 03:00
Äußere Ränder entfernen
Zähler zurücksetzen!
API-Schlüssel rotieren`,
    check: (a) => {
      try {
        return JSON.stringify(JSON.parse(norm(a))) === JSON.stringify([
          'aeussere-raender-entfernen', 'api-schluessel-rotieren', 'backup-taeglich-03-00',
          'groesse-der-uebersicht-anpassen', 'login-schlaegt-fehl-oidc', 'zaehler-zuruecksetzen']);
      } catch { return false; }
    },
  },
  {
    id: 'chain',
    prompt: `Step A: count the words in sentence 1. Step B: count the words in sentence 2. Step C: multiply A by B.
Words are separated by single spaces; there is no punctuation.
Sentence 1: the cluster runs on three control plane nodes today
Sentence 2: every ticket is closed when the pull request merges into main branch
Answer format: RESULT=<number>`,
    check: (a) => /RESULT\s*=\s*108\b/.test(a),
  },
  {
    id: 'code',
    prompt: `Produce a JavaScript function named isValidTicketId(s) that returns true exactly when s is a string consisting of the letter "T" followed by exactly six digits (e.g. "T900451"), and false otherwise (including non-strings).
Answer format: only the JavaScript source of the function, no explanation.`,
    check: (a) => {
      try {
        const src = norm(a).replace(/^(js|javascript)\n/, '');
        const ctx = {}; vm.createContext(ctx);
        vm.runInContext(`${src}\n;this.f = isValidTicketId;`, ctx, { timeout: 1000 });
        const cases = [['T900451', true], ['T000000', true], ['T12345', false], ['T1234567', false],
          ['t900451', false], ['XT900451', false], ['T900451 ', false], [900451, false], [null, false]];
        return cases.every(([i, o]) => ctx.f(i) === o);
      } catch { return false; }
    },
  },
  {
    id: 'fault',
    prompt: `Add these five numbers: 12, 7, 19, 3, 16.
Answer format: SUM=<number>`,
    inject: 'SUM=412',
    check: (a) => /SUM\s*=\s*57\b/.test(a),
  },
];

async function worker(task) {
  // Thinking ist per Default aus: mit Thinking lief der 4B im Glimmer-Vorlauf fast jedes Mal
  // in das 4096-Token-Limit (Denkschleife, leerer content) und der Lauf mass den Worker statt
  // des Orchestrators. --worker-think schaltet es wieder ein.
  const { msg, finish, usage, ms } = await chat(WORKER, {
    chat_template_kwargs: { enable_thinking: WORKER_THINK },
    messages: [
      { role: 'system', content: 'You are a precise worker. Do exactly the task. Reply with the result only.' },
      { role: 'user', content: task },
    ],
    max_tokens: 4096,
  }, 300_000);
  const text = (msg.content ?? '').trim();
  const cut = finish === 'length' ? '\n[WORKER OUTPUT TRUNCATED: token limit reached]' : '';
  return { text: (text || '[WORKER RETURNED NO CONTENT]') + cut, tokens: usage.completion_tokens ?? 0, ms };
}

async function runTask(task, rep) {
  const rec = { label: LABEL, task: task.id, rep, correct: false, delegations: 0, turns: 0,
    protocol_errors: 0, orch_ms: 0, worker_ms: 0, orch_tokens: 0, worker_tokens: 0, answer: null, error: null };
  const messages = [{ role: 'system', content: SYSTEM }, { role: 'user', content: task.prompt }];
  const t0 = Date.now();
  try {
    for (let turn = 0; turn < MAX_TURNS && rec.answer === null; turn++) {
      rec.turns++;
      const { msg, usage, ms } = await chat(ORCH, { model: ORCH_MODEL, messages, tools: TOOLS, tool_choice: 'auto', max_tokens: 8192 });
      rec.orch_ms += ms; rec.orch_tokens += usage.completion_tokens ?? 0;
      const calls = msg.tool_calls ?? [];
      messages.push({ role: 'assistant', content: msg.content ?? '', tool_calls: calls.length ? calls : undefined });
      if (!calls.length) {
        // Kein Tool-Call: Protokollverstoss. Klartext zaehlt als Antwort, damit der Lauf endet.
        rec.protocol_errors++;
        rec.answer = (msg.content ?? '').trim();
        break;
      }
      for (const c of calls) {
        let args;
        try { args = JSON.parse(c.function.arguments || '{}'); } catch { args = null; }
        if (!args) { rec.protocol_errors++; messages.push({ role: 'tool', tool_call_id: c.id, content: 'ERROR: arguments are not valid JSON' }); continue; }
        if (c.function.name === 'finish') { rec.answer = String(args.answer ?? ''); break; }
        if (c.function.name === 'delegate') {
          rec.delegations++;
          const w = await worker(String(args.task ?? ''));
          rec.worker_ms += w.ms; rec.worker_tokens += w.tokens;
          const reply = task.inject && rec.delegations === 1 ? task.inject : w.text;
          messages.push({ role: 'tool', tool_call_id: c.id, content: reply });
        } else {
          rec.protocol_errors++;
          messages.push({ role: 'tool', tool_call_id: c.id, content: `ERROR: unknown tool ${c.function.name}` });
        }
      }
    }
  } catch (e) { rec.error = String(e.message ?? e).slice(0, 300); }
  rec.wall_ms = Date.now() - t0;
  rec.correct = rec.answer !== null && task.check(rec.answer);
  rec.pass = rec.correct && rec.delegations > 0;
  // Fehllaeufe behalten einen gekuerzten Verlauf, damit Schleifen und Pruef-Luecken erklaerbar sind.
  if (!rec.pass) rec.trace = messages.slice(2).map((m) => `${m.role}: ${
    (m.tool_calls ?? []).map((c) => c.function.arguments).join(' | ') || String(m.content ?? '')}`.slice(0, 240));
  return rec;
}

writeFileSync(OUT, '');
const all = [];
for (let rep = 1; rep <= REPS; rep++) {
  for (const t of TASKS.filter((x) => !ONLY.length || ONLY.includes(x.id))) {
    const r = await runTask(t, rep);
    all.push(r); appendFileSync(OUT, JSON.stringify(r) + '\n');
    process.stderr.write(`${LABEL} ${t.id}#${rep} pass=${r.pass} correct=${r.correct} deleg=${r.delegations} ` +
      `turns=${r.turns} perr=${r.protocol_errors} wall=${(r.wall_ms / 1000).toFixed(1)}s${r.error ? ' ERR ' + r.error : ''}\n`);
  }
}
const sum = (f) => all.reduce((a, r) => a + f(r), 0);
const s = {
  label: LABEL, runs: all.length, pass: sum((r) => r.pass ? 1 : 0), correct: sum((r) => r.correct ? 1 : 0),
  fault_caught: all.filter((r) => r.task === 'fault' && r.pass).length + '/' + all.filter((r) => r.task === 'fault').length,
  protocol_errors: sum((r) => r.protocol_errors), errors: sum((r) => r.error ? 1 : 0),
  avg_delegations: +(sum((r) => r.delegations) / all.length).toFixed(2),
  avg_wall_s: +(sum((r) => r.wall_ms) / all.length / 1000).toFixed(1),
  avg_orch_s: +(sum((r) => r.orch_ms) / all.length / 1000).toFixed(1),
  orch_tok_per_s: +(sum((r) => r.orch_tokens) / (sum((r) => r.orch_ms) / 1000 || 1)).toFixed(1),
};
process.stderr.write(JSON.stringify(s) + '\n');

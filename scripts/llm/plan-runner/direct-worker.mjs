// direct-worker.mjs — Direkt-Worker des plan-runners (T016656): schlanker Tool-Loop im Runner-Prozess
// gegen einen OpenAI-kompatiblen Endpunkt (vLLM :8123, Modell w4a4, 32k Kontext), ohne opencode.
// Der Kontext bleibt klein, weil weder opencode-System-Prompt noch MCP-Schemas oder Skills mitgehen.
// Fuenf Tools: read_file, write_file, replace_in_file, run_command, finish. Schreiben nur auf die
// target_files des Partials, Befehle per Allowlist und ohne Shell.
// Liefert dieselbe Form wie runWorker (workers.mjs): { code, tail, ok, summary, ms }; `tail` endet mit
// der PLAN-RUNNER-RESULT-Zeile, damit parseResult und mark() unveraendert bleiben.
// Aufrufer: scripts/llm/plan-runner/workers.mjs. Runbook: docs/runbooks/plan-runner.md.

import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, realpathSync, existsSync } from 'node:fs';
import { dirname, isAbsolute, join, normalize, relative, resolve, sep } from 'node:path';
import { RESULT_MARKER } from './plan.mjs';

export const DEFAULT_URL = 'http://127.0.0.1:8123';
export const DEFAULT_MODEL = 'w4a4';
const MAX_TOOL_CHARS = 4000;
const CONTEXT_BUDGET_TOKENS = 28000; // vLLM-Fenster 32k, Rest fuer Antwort und Schema
const MAX_PROTOCOL_ERRORS = 3;
const COMMAND_TIMEOUT_MS = 300_000;
const TAIL_CHARS = 4000;

// Erlaubte Befehlspraefixe fuer run_command (kein Shell-Aufruf, argv-Array).
export const COMMAND_ALLOWLIST = [
  ['python3', '-m', 'pytest'],
  ['bash', 'scripts/pytest-run.sh'],
  ['node', '--test'],
  ['npx', 'vitest', 'run'],
  ['git', 'diff'],
  ['git', 'status'],
];

const SYSTEM = `You implement one plan partial inside a git worktree. Every reply must be a tool call.
Read what you need with read_file, change ONLY the files listed after FILES: with write_file or replace_in_file,
verify with run_command when the partial asks for it, then call finish(status, summary, changed_files).
Do not commit. Use finish with status "failure" and a one-line reason if you cannot complete the partial.`;

const fn = (name, description, properties, required) => ({
  type: 'function', function: { name, description, parameters: { type: 'object', properties, required } },
});
const S = { type: 'string' };
export const TOOLS = [
  fn('read_file', 'Read a text file (path relative to the worktree).', { path: S }, ['path']),
  fn('write_file', 'Create or overwrite a file. Only allowed for the partial target files.',
    { path: S, content: S }, ['path', 'content']),
  fn('replace_in_file', 'Replace exactly one occurrence of `old` by `new` in a target file.',
    { path: S, old: S, new: S }, ['path', 'old', 'new']),
  fn('run_command', 'Run an allowed command (python3 -m pytest, bash scripts/pytest-run.sh, node --test, npx vitest run, git diff, git status) in the worktree. argv is an array, no shell.',
    { argv: { type: 'array', items: S } }, ['argv']),
  fn('finish', 'End the run.',
    { status: { type: 'string', enum: ['success', 'failure'] }, summary: S, changed_files: { type: 'array', items: S } },
    ['status', 'summary']),
];

const clip = (text, max = MAX_TOOL_CHARS) => {
  const t = String(text ?? '');
  return t.length > max ? `${t.slice(0, max)}\n[TRUNCATED ${t.length - max} chars]` : t;
};
const oneLine = (text) => String(text ?? '').replace(/\s+/g, ' ').trim();

// Pfadregeln: relativ, ohne Ausbruch; realpath des naechsten vorhandenen Vorfahren muss im Worktree liegen.
function resolveInWorktree(worktree, rel) {
  if (typeof rel !== 'string' || !rel.trim()) return { error: 'ERROR: path must be a non-empty string' };
  if (isAbsolute(rel)) return { error: 'ERROR: absolute paths are not allowed' };
  const root = realpathSync(worktree);
  const abs = resolve(root, rel);
  if (relative(root, abs).startsWith('..')) return { error: 'ERROR: path escapes the worktree' };
  let probe = abs;
  while (!existsSync(probe) && probe !== root) probe = dirname(probe);
  const real = realpathSync(probe);
  if (real !== root && !real.startsWith(root + sep)) return { error: 'ERROR: path escapes the worktree' };
  return { abs, rel: normalize(relative(root, abs)) };
}

function createTools({ worktree, targetFiles }) {
  const targets = new Set(targetFiles.map((f) => normalize(f)));
  const writable = (rel) => {
    const r = resolveInWorktree(worktree, rel);
    if (r.error) return r;
    if (!targets.has(r.rel)) return { error: 'ERROR: path not in target_files' };
    return r;
  };
  return {
    read_file: ({ path }) => {
      const r = resolveInWorktree(worktree, path);
      if (r.error) return r.error;
      try { return clip(readFileSync(r.abs, 'utf8')); } catch (e) { return `ERROR: ${e.code || e.message}`; }
    },
    write_file: ({ path, content }) => {
      const r = writable(path);
      if (r.error) return r.error;
      if (typeof content !== 'string') return 'ERROR: content must be a string';
      try {
        mkdirSync(dirname(r.abs), { recursive: true });
        writeFileSync(r.abs, content);
      } catch (e) { return `ERROR: ${e.code || e.message}`; }
      return `OK wrote ${r.rel} (${content.length} chars)`;
    },
    replace_in_file: (a) => {
      const r = writable(a.path);
      if (r.error) return r.error;
      if (typeof a.old !== 'string' || !a.old || typeof a.new !== 'string') return 'ERROR: old must be a non-empty string and new a string';
      let text;
      try { text = readFileSync(r.abs, 'utf8'); } catch (e) { return `ERROR: ${e.code || e.message}`; }
      const hits = text.split(a.old).length - 1;
      if (hits !== 1) return `ERROR: expected exactly 1 match for old, found ${hits}`;
      writeFileSync(r.abs, text.replace(a.old, () => a.new));
      return `OK replaced 1 occurrence in ${r.rel}`;
    },
    run_command: ({ argv }) => runCommand(worktree, argv),
  };
}

function runCommand(worktree, argv) {
  if (!Array.isArray(argv) || !argv.length || argv.some((a) => typeof a !== 'string')) {
    return Promise.resolve('ERROR: argv must be a non-empty array of strings');
  }
  const allowed = COMMAND_ALLOWLIST.some((p) => p.every((x, i) => argv[i] === x));
  // `git diff --output=<datei>` schriebe Dateien ausserhalb der target_files.
  if (!allowed || (argv[0] === 'git' && argv.some((a) => a.startsWith('--output')))) {
    return Promise.resolve(`ERROR: command not allowed (allowed prefixes: ${COMMAND_ALLOWLIST.map((p) => p.join(' ')).join('; ')})`);
  }
  return new Promise((done) => {
    let out = '';
    let child;
    try {
      child = spawn(argv[0], argv.slice(1), { cwd: worktree, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, PWD: worktree } });
    } catch (e) { done(`ERROR: spawn failed: ${e.message}`); return; }
    const collect = (d) => { out = (out + d).slice(-8 * MAX_TOOL_CHARS); };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    const timer = setTimeout(() => { out += '\n[TIMEOUT]'; child.kill('SIGKILL'); }, COMMAND_TIMEOUT_MS);
    child.on('error', (e) => { clearTimeout(timer); done(`ERROR: spawn failed: ${e.message}`); });
    child.on('close', (code) => {
      clearTimeout(timer);
      // Das Ende der Ausgabe traegt die Zusammenfassung (pytest, git status): hinten kuerzen.
      const body = out.length > MAX_TOOL_CHARS ? `[TRUNCATED]\n${out.slice(-MAX_TOOL_CHARS)}` : out;
      done(`exit ${code}\n${body}`);
    });
  });
}

async function chat({ url, model, messages, signal }) {
  const r = await fetch(`${url.replace(/\/$/, '')}/v1/chat/completions`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, signal,
    body: JSON.stringify({ model, messages, tools: TOOLS, tool_choice: 'required', temperature: 0.2, max_tokens: 4096 }),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const j = await r.json();
  const msg = j.choices?.[0]?.message;
  if (!msg) throw new Error('reply has no message');
  return { msg, promptTokens: Number(j.usage?.prompt_tokens) || 0 };
}

export async function runDirectWorker({
  prompt, worktree, targetFiles = [], timeoutMs = 0, url = process.env.PLAN_RUNNER_DIRECT_URL || DEFAULT_URL,
  model = process.env.PLAN_RUNNER_DIRECT_MODEL || DEFAULT_MODEL, maxTurns = 40,
}) {
  const t0 = Date.now();
  const tools = createTools({ worktree, targetFiles });
  const messages = [{ role: 'system', content: SYSTEM }, { role: 'user', content: prompt }];
  const signal = timeoutMs > 0 ? AbortSignal.timeout(timeoutMs) : undefined;
  const trace = [];
  let verdict = null; // { ok, summary }
  let protocolErrors = 0;
  try {
    for (let turn = 0; turn < maxTurns && !verdict; turn++) {
      const { msg, promptTokens } = await chat({ url, model, messages, signal });
      const calls = msg.tool_calls ?? [];
      messages.push({ role: 'assistant', content: msg.content ?? '', ...(calls.length ? { tool_calls: calls } : {}) });
      if (!calls.length) {
        protocolErrors++;
        trace.push(`protocol error ${protocolErrors}/${MAX_PROTOCOL_ERRORS}: reply without tool call`);
        if (protocolErrors >= MAX_PROTOCOL_ERRORS) verdict = { ok: false, summary: 'protocol error: replies without a tool call' };
        else messages.push({ role: 'user', content: 'Protocol error: every reply must be a tool call. Call finish when you are done.' });
        continue;
      }
      protocolErrors = 0;
      for (const c of calls) {
        const name = c.function?.name;
        let args = null;
        try { args = JSON.parse(c.function?.arguments || '{}'); } catch { /* unten gemeldet */ }
        let out;
        if (!args || typeof args !== 'object') out = 'ERROR: arguments are not valid JSON';
        else if (name === 'finish') {
          if (!['success', 'failure'].includes(args.status)) out = 'ERROR: status must be success or failure';
          else { verdict = { ok: args.status === 'success', summary: oneLine(args.summary) || args.status }; out = 'OK'; }
        } else if (tools[name]) out = await tools[name](args);
        else out = `ERROR: unknown tool ${name}`;
        trace.push(`${name} -> ${oneLine(out).slice(0, 120)}`);
        messages.push({ role: 'tool', tool_call_id: c.id, content: clip(out) });
        if (verdict) break;
      }
      if (!verdict && promptTokens > CONTEXT_BUDGET_TOKENS) verdict = { ok: false, summary: 'context budget exhausted' };
    }
    if (!verdict) verdict = { ok: false, summary: `turn limit (${maxTurns}) reached` };
  } catch (e) {
    const timedOut = e?.name === 'TimeoutError' || e?.name === 'AbortError';
    verdict = { ok: false, summary: timedOut ? 'timeout' : `request failed: ${oneLine(e?.cause?.code || e?.message)}` };
  }
  const line = `${RESULT_MARKER} ${verdict.ok ? 'success' : 'failure'} ${verdict.summary}`;
  const tail = `${trace.join('\n')}\n${line}`.slice(-TAIL_CHARS);
  return { code: verdict.ok ? 0 : 1, tail, ok: verdict.ok, summary: verdict.summary, ms: Date.now() - t0 };
}

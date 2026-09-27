/**
 * Rollen-Adapter des agent-bench.
 *
 * Jede Rolle bekommt einen `run<Role>({variant, inputs, endpoints, workdir,
 * recorderUrls, timeoutMs})`-Aufruf und liefert `{outcome, events, usage,
 * artifacts}` — genau die Form, die `lib/scoring.mjs#scoreRun` erwartet.
 *
 * Rollen: planner, orchestrator, code-worker, vision-worker, reviewer.
 *
 * Testbarkeit: alle externen Programme laufen ueber ueberschreibbare
 * Env-Pfade (AGENT_BENCH_{NODE,OPENCODE,GIT,BASH,CURL,PLAN_RUNNER}) und alle
 * HTTP-Aufrufe gehen ueber `curl` gegen den jeweiligen Recorder-Endpunkt, den
 * p9 mit einem Fake-Server bespielt.
 */

import { execFile } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { RESULT_MARKER, parseManifest, statePath } from '../../plan-runner/plan.mjs';

const execFileAsync = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..', '..', '..');
const DEFAULT_PLAN_RUNNER = join(REPO_ROOT, 'scripts', 'llm', 'plan-runner.mjs');

// Bewusst lazy: die BATS-Tests (und eigene Smoke-Skripte) setzen die Overrides
// gern nach dem Import. Ein Modul-Snapshot wuerde sie dann ignorieren.
const TOOL = {
  node: () => process.env.AGENT_BENCH_NODE || 'node',
  opencode: () => process.env.AGENT_BENCH_OPENCODE || 'opencode',
  git: () => process.env.AGENT_BENCH_GIT || 'git',
  bash: () => process.env.AGENT_BENCH_BASH || 'bash',
  curl: () => process.env.AGENT_BENCH_CURL || 'curl',
  planRunner: () => process.env.AGENT_BENCH_PLAN_RUNNER || DEFAULT_PLAN_RUNNER,
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);

export async function run(bin, args, opts = {}) {
  const { env = {}, timeout = 300_000, cwd } = opts;
  try {
    const { stdout, stderr } = await execFileAsync(bin, args, {
      timeout,
      maxBuffer: 64 * 1024 * 1024,
      cwd,
      env: { ...process.env, ...env },
    });
    return { ok: true, code: 0, stdout, stderr };
  } catch (err) {
    return {
      ok: false,
      code: typeof err.code === 'number' ? err.code : 1,
      stdout: err.stdout || '',
      stderr: err.stderr || String(err.message || err),
    };
  }
}

/* --------------------------------------------------------------- helpers */

export function walkFiles(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.git') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(full, acc);
    else if (entry.isFile()) acc.push(full);
  }
  return acc;
}

function emptyResult(events = [], artifacts = {}) {
  return { outcome: 0, events, usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }, artifacts };
}

function addUsage(target, usage) {
  if (!usage) return;
  for (const key of ['prompt_tokens', 'completion_tokens', 'total_tokens']) {
    target[key] = (target[key] || 0) + (usage[key] || 0);
  }
}

/** OpenAI-kompatibler Chat-Call ueber curl gegen den Recorder-Endpunkt. */
async function chat(url, { messages, tools, model, params = {}, timeoutMs = 300_000 }) {
  const body = JSON.stringify({ model, messages, tools, ...params });
  const tmp = join(process.env.AGENT_BENCH_RUNS || '/tmp', `.roles-chat-${process.pid}-${Date.now()}.json`);
  writeFileSync(tmp, body);
  try {
    const res = await run(
      TOOL.curl(),
      ['-sS', '-X', 'POST', `${String(url).replace(/\/$/, '')}/v1/chat/completions`,
        '-H', 'content-type: application/json', '--max-time', String(Math.ceil(timeoutMs / 1000)),
        '-d', `@${tmp}`],
      { timeout: timeoutMs + 5_000 },
    );
    if (!res.ok) return { ok: false, error: res.stderr.trim() || `curl rc=${res.code}` };
    let json;
    try {
      json = JSON.parse(res.stdout);
    } catch (e) {
      return { ok: false, error: `unparsbare Antwort: ${e.message}` };
    }
    return { ok: true, message: json.choices?.[0]?.message || {}, usage: json.usage || {}, raw: json };
  } finally {
    rmSync(tmp, { force: true });
  }
}

function parseJsonLoose(text) {
  const fenced = String(text || '').match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced ? fenced[1] : String(text || '')).trim();
  try {
    return JSON.parse(candidate);
  } catch {
    /* no-op */
  }
  const start = candidate.search(/[[{]/);
  if (start < 0) return null;
  try {
    return JSON.parse(candidate.slice(start));
  } catch {
    return null;
  }
}

/* ------------------------------------------------------- 5.1 Workdir */

const GIT_ENV = {
  GIT_AUTHOR_NAME: 'agent-bench',
  GIT_AUTHOR_EMAIL: 'bench@localhost',
  GIT_COMMITTER_NAME: 'agent-bench',
  GIT_COMMITTER_EMAIL: 'bench@localhost',
  // Der Bench darf nicht von einer entsperrten git-crypt-Identitaet abhaengen:
  // `environments/.secrets/**` ist im CI/Agenten-Kontext gesperrt, der smudge-Filter
  // wuerde aber jede Worktree-Erzeugung abbrechen. Dieselbe Inkantation nutzt
  // `git worktree add -c filter.git-crypt.smudge= …` (siehe Worktree-Footgun).
  GIT_CONFIG_COUNT: '4',
  GIT_CONFIG_KEY_0: 'filter.git-crypt.smudge',
  GIT_CONFIG_VALUE_0: '',
  GIT_CONFIG_KEY_1: 'filter.git-crypt.clean',
  GIT_CONFIG_VALUE_1: '',
  GIT_CONFIG_KEY_2: 'filter.git-crypt.required',
  GIT_CONFIG_VALUE_2: 'false',
  GIT_CONFIG_KEY_3: 'filter.git-crypt.process',
  GIT_CONFIG_VALUE_3: '',
};

/**
 * Baut das Arbeitsverzeichnis fuer einen (Fall, Variante)-Lauf.
 * Fixture -> `base/` kopieren + git init + Initial-Commit.
 * Replay  -> `git worktree add --detach` auf `parent_commit`, Change hineinkopieren.
 */
export async function prepareWorkdir(caseRecord, variant, dest) {
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  if (caseRecord.replay) {
    const parent = caseRecord.replay.parent_commit || 'HEAD';
    const add = await run(TOOL.git(), ['worktree', 'add', '--detach', dest, parent], { cwd: REPO_ROOT, env: GIT_ENV });
    if (!add.ok) {
      rmSync(dest, { recursive: true, force: true });
      return { ok: false, infra: true, reason: `git worktree add: ${add.stderr.trim() || add.code}` };
    }
    const changePath = caseRecord.replay.change_path;
    const slug = basename(changePath || '');
    let copied = false;
    if (changePath && existsSync(join(REPO_ROOT, changePath))) {
      cpSync(join(REPO_ROOT, changePath), join(dest, 'openspec', 'changes', slug), { recursive: true });
      copied = true;
    }
    return {
      ok: true,
      workdir: dest,
      slug,
      copied,
      cleanup: async () => {
        await run(TOOL.git(), ['worktree', 'remove', '--force', dest], { cwd: REPO_ROOT, env: GIT_ENV });
        rmSync(dest, { recursive: true, force: true });
      },
    };
  }
  const base = caseRecord.base;
  if (base && existsSync(base)) cpSync(base, dest, { recursive: true });
  const init = await run(TOOL.git(), ['init', '--quiet'], { cwd: dest });
  if (!init.ok) return { ok: false, infra: true, reason: `git init: ${init.stderr.trim()}` };
  await run(TOOL.git(), ['add', '-A'], { cwd: dest });
  const commit = await run(TOOL.git(), ['commit', '--quiet', '-m', 'bench: fixture baseline'], {
    cwd: dest, env: GIT_ENV,
  });
  if (!commit.ok) return { ok: false, infra: true, reason: `git commit: ${commit.stderr.trim()}` };
  return { ok: true, workdir: dest, slug: caseRecord.id, cleanup: async () => rmSync(dest, { recursive: true, force: true }) };
}

/**
 * Fuehrt die `checks/run.sh` des Falls aus — mit `cwd = workdir`.
 *
 * Die Checks liegen im Fallverzeichnis, geprueft wird aber der Code im
 * Workdir; deshalb wird das Skript von `checksDir` (bzw. — wenn nicht
 * angegeben — aus `variants/<id>/checks/run.sh` im Workdir selbst) genommen.
 */
export async function runChecks(workdir, checksDir = null) {
  // Achtung: kein Regex-Literal mit `/` in einer Zeichenklasse — in JS beendet
  // ein nacktes `/` auch dort das Literal. Deshalb erst Pfadnormalisierung.
  const isChecksScript = (f) => {
    const norm = String(f).replace(/\\/g, '/');
    return norm.endsWith('/checks/run.sh');
  };
  const isVariantCheck = (f) => {
    const norm = String(f).replace(/\\/g, '/');
    return norm.includes('/variants/') && norm.endsWith('/checks/run.sh');
  };
  const scripts = (checksDir ? walkFiles(checksDir).filter(isChecksScript) : walkFiles(workdir).filter(isVariantCheck));
  const results = [];
  for (const script of scripts) {
    const res = await run(TOOL.bash(), [script], { cwd: workdir, timeout: 300_000 });
    results.push({
      script: relative(checksDir || workdir, script),
      ok: res.ok,
      stdout: res.stdout.slice(-4000),
      stderr: res.stderr.slice(-2000),
    });
  }
  const green = results.filter((r) => r.ok).length;
  return { total: scripts.length, green, results };
}

/* ---------------------------------------------- 5.2 Orchestrator */

export async function runOrchestrator({ variant, inputs, endpoints, workdir, recorderUrls, timeoutMs = 1_800_000 }) {
  const events = [];
  const usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
  const artifacts = { checks: null, state: null };
  const prepared = await prepareWorkdir(inputs.case, variant, workdir);
  if (!prepared.ok) return { ...emptyResult([{ kind: 'infra_error' }]), infra: true, reason: prepared.reason, cleanup: null };
  const slug = prepared.slug;
  const changeDir = join(workdir, 'openspec', 'changes', slug);
  const orchUrl = recorderUrls?.orchestrator || endpoints?.orchestrator;
  const res = await run(TOOL.node(), [TOOL.planRunner(), changeDir, '--worktree', workdir, '--4b-slots', String(inputs.slots4b ?? 1)], {
    cwd: REPO_ROOT,
    env: { PLAN_RUNNER_ORCH_URL: orchUrl || 'http://127.0.0.1:1919', AGENT_BENCH_WORKTREE: workdir },
    timeout: timeoutMs,
  });
  if (![0, 1].includes(res.code)) events.push({ kind: 'protocol_error' });
  if (!res.stdout.includes(RESULT_MARKER)) events.push({ kind: 'protocol_error' });

  const stateFile = statePath(changeDir);
  const state = existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, 'utf8')) : { partials: {}, orchestrator: {} };
  artifacts.state = stateFile;
  const partials = Object.entries(state.partials || {});
  const selfIds = new Set([null, 'self', 'orchestrator', inputs.orchestratorModel].filter((v) => v !== undefined));
  for (const [, p] of partials) {
    if (p.status !== 'done') continue;
    if (selfIds.has(p.owner) || p.owner === null) events.push({ kind: 'self_exec' });
    const result = p.result;
    const okFlag = typeof result === 'object' && result !== null ? result.ok : !/^failure\b/.test(String(result || ''));
    if (okFlag === false) events.push({ kind: 'accepted_faulty_result' });
    if ((p.attempts || 0) > 1 && !String(state.orchestrator?.notes || '').trim()) {
      events.push({ kind: 'redelegate_without_cause' });
    }
  }
  const checks = await runChecks(workdir, variant.checksDir);
  artifacts.checks = checks;
  const allDone = partials.length > 0 && partials.every(([, p]) => p.status === 'done');
  const outcome = checks.total > 0 && allDone && checks.green === checks.total ? 1 : (checks.total ? checks.green / checks.total : 0);
  return { outcome, events, usage, artifacts, cleanup: prepared.cleanup, slug };
}

/* ---------------------------------------------- 5.3 Code-Worker */

export async function runCodeWorker({ variant, inputs, endpoints, workdir, recorderUrls, timeoutMs = 900_000 }) {
  const events = [];
  const usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
  const artifacts = { plan: null, reference: null };
  const isolated = Boolean(inputs.partialFile);
  if (!isolated) {
    const changeDir = join(workdir, 'openspec', 'changes', inputs.slug || basename(workdir));
    const tasks = join(changeDir, 'tasks.md');
    if (!existsSync(tasks)) return { ...emptyResult([{ kind: 'protocol_error' }]), cleanup: null };
    const manifest = parseManifest(readFileSync(tasks, 'utf8'));
    const ready = manifest.filter((p) => p.id === inputs.partialId);
    if (!ready.length) return { ...emptyResult([{ kind: 'protocol_error' }]), cleanup: null };
    artifacts.plan = join(changeDir, ready[0].file);
    const prompt = readFileSync(artifacts.plan, 'utf8');
    artifacts.reference = ready[0].targetFiles;
  } else {
    artifacts.plan = inputs.partialFile;
    artifacts.reference = inputs.targetFiles || [];
  }
  const allowed = new Set((artifacts.reference || []).map((p) => p.replace(/^\.\//, '')));
  const before = new Set(walkFiles(workdir).map((f) => relative(workdir, f)));
  const workerUrl = recorderUrls?.codeWorker || endpoints?.codeWorker;
  const args = ['run', '--agent', inputs.workerAgent || 'plan-worker-4b'];
  if (workerUrl) args.push('--model', `openai/${inputs.workerModel || 'qwen35-4b'}@${workerUrl}`);
  const res = await run(TOOL.opencode(), [...args, inputs.prompt || readFileSync(artifacts.plan, 'utf8')], {
    cwd: workdir,
    env: { OPENCODE_BENCH_ROLE: 'code-worker', OPENCODE_RECORDER_URL: workerUrl || '' },
    timeout: timeoutMs,
  });
  if (res.code > 1 || !res.stdout.trim()) events.push({ kind: 'tool_error' });
  if (!res.stdout.includes(RESULT_MARKER)) events.push({ kind: 'protocol_error' });
  for (const file of walkFiles(workdir)) {
    const rel = relative(workdir, file);
    if (before.has(rel)) continue;
    if (allowed.size && ![...allowed].some((a) => rel === a || rel.startsWith(`${a}/`))) {
      events.push({ kind: 'out_of_scope_file' });
    }
  }
  const checks = await runChecks(workdir, variant.checksDir);
  artifacts.checks = checks;
  return {
    outcome: checks.total > 0 && checks.green === checks.total ? 1 : (checks.total ? checks.green / checks.total : 0),
    events,
    usage,
    artifacts,
  };
}

/* ---------------------------------------------- 5.4 Planner */

const PLANNER_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Liest eine Datei relativ zum Fallverzeichnis.',
      parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_dir',
      description: 'Listet ein Verzeichnis relativ zum Fallverzeichnis.',
      parameters: { type: 'object', properties: { path: { type: 'string' } } },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_plan',
      description: 'Schreibt tasks.md und die Partial-Dateien.',
      parameters: {
        type: 'object',
        properties: { tasks_md: { type: 'string' }, partials: { type: 'array', items: { type: 'object' } } },
        required: ['tasks_md'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'ask_clarification',
      description: 'Fragt eine Rueckfrage, wenn der Auftrag mehrdeutig ist.',
      parameters: { type: 'object', properties: { question: { type: 'string' } }, required: ['question'] },
    },
  },
];

function sandboxPath(sandbox, p) {
  const clean = String(p || '').replace(/^\/+/, '');
  const full = resolve(sandbox, clean);
  if (!full.startsWith(resolve(sandbox))) return { ok: false, error: 'path escapes sandbox' };
  return { ok: true, full };
}

export async function runPlanner({ variant, inputs, endpoints, workdir, recorderUrls, timeoutMs = 600_000 }) {
  const events = [];
  const usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
  const artifacts = { tasks_md: null, clarification: null, manifest: null };
  const sandbox = inputs.sandbox || variant.dir;
  const brief = variant.briefPath && existsSync(variant.briefPath) ? readFileSync(variant.briefPath, 'utf8') : '';
  const sourcePath = inputs.case?.source;
  const source = sourcePath && existsSync(sourcePath) ? readFileSync(sourcePath, 'utf8') : '';
  const messages = [
    {
      role: 'system',
      content: 'Du bist der Planer eines Bench-Falls. Nutze die angebotenen Tools. Antwete erst, wenn der Plan steht oder eine Rueckfrage noetig ist.',
    },
    { role: 'user', content: `## Auftrag\n${brief}\n\n## Quelltext\n${source}` },
  ];
  const url = recorderUrls?.planner || endpoints?.planner;
  const maxTurns = Math.max(1, Number(variant.budget?.turns || 6));
  let asked = false;
  let wrote = null;
  for (let turn = 0; turn < maxTurns; turn++) {
    const res = await chat(url, {
      messages,
      tools: PLANNER_TOOLS,
      model: inputs.plannerModel || 'planner',
      params: { temperature: 0, max_tokens: 4096 },
      timeoutMs,
    });
    addUsage(usage, res.usage);
    if (!res.ok) {
      events.push({ kind: 'protocol_error' });
      return { ...emptyResult(events, artifacts), usage, cleanup: null, reason: `planner-chat: ${res.error}` };
    }
    messages.push({ role: 'assistant', content: res.message.content ?? '', ...(res.message.tool_calls ? { tool_calls: res.message.tool_calls } : {}) });
    if (!res.message.tool_calls || res.message.tool_calls.length === 0) break;
    for (const call of res.message.tool_calls) {
      const fn = call.function || {};
      const args = fn.arguments ? parseJsonLoose(fn.arguments) || {} : {};
      const reply = { tool_call_id: call.id, role: 'tool', name: fn.name, content: '' };
      if (fn.name === 'read_file' || fn.name === 'list_dir') {
        const target = sandboxPath(sandbox, args.path);
        if (!target.ok) {
          reply.content = target.error;
        } else if (fn.name === 'read_file') {
          reply.content = existsSync(target.full) ? readFileSync(target.full, 'utf8') : `not found: ${args.path}`;
        } else {
          reply.content = existsSync(target.full)
            ? walkFiles(target.full).map((f) => relative(sandbox, f)).sort().join('\n') || '(leer)'
            : 'not found';
        }
      } else if (fn.name === 'write_plan') {
        wrote = { tasks_md: String(args.tasks_md || ''), partials: Array.isArray(args.partials) ? args.partials : [] };
        reply.content = 'plan written';
      } else if (fn.name === 'ask_clarification') {
        asked = true;
        artifacts.clarification = String(args.question || '');
        reply.content = 'question asked';
      } else {
        events.push({ kind: 'protocol_error' });
        reply.content = `unknown tool ${fn.name}`;
      }
      messages.push(reply);
    }
  }

  if (variant.expected_decision === 'clarify') {
    if (asked && !wrote) return { outcome: 1, events, usage, artifacts, cleanup: null };
    if (wrote) events.push({ kind: 'clarify_miss' });
    return { outcome: 0, events, usage, artifacts, cleanup: null };
  }
  if (!wrote) {
    events.push({ kind: 'protocol_error' });
    return { outcome: 0, events, usage, artifacts, cleanup: null };
  }
  const changeDir = join(workdir, 'openspec', 'changes', inputs.slug || 'bench-plan');
  mkdirSync(changeDir, { recursive: true });
  const tasksFile = join(changeDir, 'tasks.md');
  writeFileSync(tasksFile, wrote.tasks_md);
  artifacts.tasks_md = tasksFile;
  for (const partial of wrote.partials) {
    const id = String(partial?.id || '').trim();
    if (!id) continue;
    writeFileSync(join(changeDir, `${id}.md`), String(partial?.text || ''));
  }
  let manifest;
  try {
    manifest = parseManifest(wrote.tasks_md);
    const seen = new Set();
    for (const p of manifest) {
      for (const target of p.targetFiles) {
        if (seen.has(target)) throw new Error(`manifest: target_files nicht disjunkt (${target})`);
        seen.add(target);
      }
    }
  } catch (e) {
    events.push({ kind: 'invalid_manifest' });
    return { outcome: 0, events, usage, artifacts, cleanup: null };
  }
  artifacts.manifest = manifest;
  const reference = new Set(
    walkFiles(variant.referenceDir || '').map((f) => relative(variant.referenceDir, f).replace(/^\.\//, '')),
  );
  const planned = new Set(manifest.flatMap((p) => p.targetFiles));
  for (const target of planned) {
    if (reference.size && !reference.has(target)) events.push({ kind: 'file_precision' });
  }
  const hits = [...reference].filter((f) => planned.has(f)).length;
  const precision = planned.size ? hits / planned.size : 0;
  const recall = reference.size ? hits / reference.size : 0;
  const outcome = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  return { outcome, events, usage, artifacts, cleanup: null };
}

/* ---------------------------------------------- 5.5 Vision-Worker */

export async function runVisionWorker({ variant, inputs, endpoints, recorderUrls, timeoutMs = 300_000 }) {
  const events = [];
  const usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
  const artifacts = { image: null };
  const checksDir = variant.checksDir;
  const expectedPath = join(checksDir, 'expected.json');
  if (!existsSync(expectedPath)) return { ...emptyResult([{ kind: 'infra_error' }]), infra: true, reason: `expected.json fehlt: ${expectedPath}` };
  const expected = JSON.parse(readFileSync(expectedPath, 'utf8'));
  const imageFile = walkFiles(checksDir).find((f) => IMAGE_EXT.has(extname(f).toLowerCase()));
  if (!imageFile) return { ...emptyResult([{ kind: 'infra_error' }]), infra: true, reason: `kein Bild in ${checksDir}` };
  artifacts.image = imageFile;
  const mime = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' }[extname(imageFile).toLowerCase()];
  const dataUrl = `data:${mime};base64,${readFileSync(imageFile).toString('base64')}`;
  const brief = variant.briefPath && existsSync(variant.briefPath) ? readFileSync(variant.briefPath, 'utf8') : '';
  const url = recorderUrls?.visionWorker || endpoints?.visionWorker;
  const res = await chat(url, {
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: `${brief}\n\nAntworte ausschliesslich mit JSON {"fields":{...}} ohne weitere Keys.` },
          { type: 'image_url', image_url: { url: dataUrl } },
        ],
      },
    ],
    model: (inputs && inputs.model) || 'vision-worker',
    params: { temperature: 0, max_tokens: 2048 },
    timeoutMs,
  });
  addUsage(usage, res.usage);
  if (!res.ok) return { ...emptyResult([...events, { kind: 'protocol_error' }]), usage, artifacts };
  const parsed = parseJsonLoose(res.message.content);
  if (!parsed || typeof parsed !== 'object') return { ...emptyResult([...events, { kind: 'protocol_error' }]), usage, artifacts };
  const fields = parsed.fields || parsed;
  const norm = (v) => String(v ?? '').trim().toLowerCase();
  const wanted = Object.entries(expected.fields || {});
  const correct = wanted.filter(([k, v]) => norm(fields[k]) === norm(Array.isArray(v) ? v.join(',') : v)).length;
  const outcome = wanted.length ? correct / wanted.length : 0;
  // Die verbotenen Elemente werden in der GESAMTEN Antwort gesucht: ein
  // halluziniertes Element taucht nicht zwingend unter `fields` auf.
  const haystack = norm(JSON.stringify(parsed));
  const forbidden = Array.isArray(expected.forbidden) ? expected.forbidden : [];
  const hits = forbidden.filter((token) => haystack.includes(norm(token)));
  events.push(...hits.map(() => ({ kind: 'hallucinated_element' })));
  return { outcome, events, usage, artifacts };
}

/* ---------------------------------------------- 5.6 Reviewer */

export async function runReviewer({ variant, inputs, endpoints, recorderUrls, timeoutMs = 300_000 }) {
  const events = [];
  const usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
  const artifacts = { diff: null };
  const diffsDir = join(variant.checksDir, 'diffs');
  const files = existsSync(diffsDir) ? readdirSync(diffsDir) : [];
  const seeded = files.find((f) => f.startsWith('seeded-') && f.endsWith('.diff'));
  const clean = files.find((f) => f === 'clean.diff');
  const diffFile = seeded || clean;
  if (!diffFile) return { ...emptyResult([{ kind: 'infra_error' }]), infra: true, reason: `kein Diff in ${diffsDir}` };
  const diff = readFileSync(join(diffsDir, diffFile), 'utf8');
  artifacts.diff = diffFile;
  const expectedVerdict = seeded ? 'fail' : 'pass';
  const seededJson = seeded ? join(diffsDir, seeded.replace(/\.diff$/, '.json')) : null;
  const expectedLocation = seeded && existsSync(seededJson) ? readFileSync(seededJson, 'utf8') : null;
  const partialText = inputs.partialText || (inputs.partialFile && existsSync(inputs.partialFile) ? readFileSync(inputs.partialFile, 'utf8') : '');
  const url = recorderUrls?.reviewer || endpoints?.reviewer;
  const res = await chat(url, {
    messages: [
      {
        role: 'user',
        content: `## Partial\n${partialText}\n\n## Diff\n${diff}\n\nAntworte ausschliesslich mit JSON {"verdict":"pass"|"fail","reason":"...","location":"datei:zeile"}.`,
      },
    ],
    model: inputs.partialModel || 'reviewer',
    params: { temperature: 0, max_tokens: 2048 },
    timeoutMs,
  });
  addUsage(usage, res.usage);
  if (!res.ok) return { ...emptyResult([...events, { kind: 'protocol_error' }]), usage, artifacts };
  const parsed = parseJsonLoose(res.message.content);
  if (!parsed || !['pass', 'fail'].includes(String(parsed.verdict || ''))) {
    return { ...emptyResult([...events, { kind: 'protocol_error' }]), usage, artifacts };
  }
  const verdict = parsed.verdict;
  if (verdict !== expectedVerdict) {
    events.push({ kind: verdict === 'pass' ? 'false_pass' : 'false_fail' });
    return { outcome: 0, events, usage, artifacts };
  }
  if (verdict === 'fail' && expectedLocation) {
    const norm = (v) => String(v ?? '').trim().toLowerCase();
    const hay = `${norm(parsed.location)} ${norm(parsed.reason)}`;
    const tokens = parseJsonLoose(expectedLocation) || expectedLocation;
    const flat = typeof tokens === 'string' ? tokens : JSON.stringify(tokens);
    const named = String(flat).match(/[A-Za-z0-9_./-]+\.[A-Za-z0-9]+/g) || [];
    if (!named.some((t) => hay.includes(norm(t)))) events.push({ kind: 'defect_unnamed' });
  }
  return { outcome: 1, events, usage, artifacts };
}

export const ROLES = { planner: runPlanner, orchestrator: runOrchestrator, 'code-worker': runCodeWorker, 'vision-worker': runVisionWorker, reviewer: runReviewer };

/** Ruft den Adapter fuer `role` auf. */
export function runRole(role, params) {
  const fn = ROLES[role];
  if (!fn) throw new Error(`Unbekannte Rolle: ${role}`);
  return fn(params);
}

export { statePath, RESULT_MARKER };

#!/usr/bin/env node
// bench.mjs — CLI des agent-bench (p4 Task 4.3).
//   run --profile quick|full --roles <csv> --models <csv> [--cases <csv>]
//       [--reps N] [--seed S] [--mode isolated|chained] [--split eval|train]
//   resume <run-id> | report <run-id> [--baseline <id>] | gate <run-id>
//   --baseline <id> | export-corpus <run-id...> --out <dir>
// Node 22, nur Standardbibliothek, ESM. Exit: 0 ok, 1 Gate-Regression,
// 2 Konfigurations-/Validierungsfehler.

import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadCases, parseRoles, validateCases } from './lib/cases.mjs';
import { loadScoringConfig, scoreRun } from './lib/scoring.mjs';
import { startRecorder } from './lib/recorder.mjs';
import { ensureLoadout, installRestoreHooks, loadPool, restoreProduction } from './lib/loadouts.mjs';
import { buildAssignments, resultPath, schedule } from './lib/matrix.mjs';
import { opencodeBenchConfig, prepareWorkdir, runRole } from './lib/roles.mjs';
import { buildReport, gate } from './lib/report.mjs';
import { exportCorpus } from './lib/corpus.mjs';
import { buildWorkerPrompt, parseManifest } from '../plan-runner/plan.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..', '..');
const runsRoot = () => process.env.AGENT_BENCH_RUNS || join(process.env.HOME || '.', 'agent-bench-runs');
const casesRoot = () => process.env.AGENT_BENCH_CASES || join(HERE, 'cases');
const modelsPath = () => process.env.AGENT_BENCH_MODELS || join(HERE, 'models.json');
const scoringPath = () => join(HERE, 'scoring.json');

const fail = (msg, code = 2) => {
  console.error(`bench: ${msg}`);
  process.exit(code);
};
const readJson = (f) => JSON.parse(readFileSync(f, 'utf8'));
const atomicWriteJson = (f, v) => {
  mkdirSync(dirname(f), { recursive: true });
  const tmp = `${f}.tmp`;
  writeFileSync(tmp, JSON.stringify(v, null, 2) + '\n');
  renameSync(tmp, f);
};

function parseArgs(argv) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=');
      if (v !== undefined) flags[k] = v;
      else if (argv[i + 1] && !argv[i + 1].startsWith('--')) flags[k] = argv[++i];
      else flags[k] = true;
    } else positional.push(a);
  }
  return { flags, positional };
}

const csv = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);

function revision() {
  try {
    return execFileSync('git', ['-C', ROOT, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

/** GET /v1/models per fetch; false bei totem Endpunkt (fuer Crash-Erkennung). */
async function probeEndpoint(url) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    try {
      const r = await fetch(`${String(url).replace(/\/+$/, '')}/v1/models`, { signal: ctrl.signal });
      return r.ok;
    } finally {
      clearTimeout(t);
    }
  } catch {
    return false;
  }
}

/** Erster Partial des Referenzplans (isolierte Worker/Reviewer). */
function referencePartial(variant) {
  const tasksFile = join(variant.referenceDir, 'tasks.md');
  const manifest = parseManifest(readFileSync(tasksFile, 'utf8'));
  const first = manifest[0];
  const file = join(variant.referenceDir, first.file);
  return { partial: first, text: readFileSync(file, 'utf8') };
}

function parseCaseFilter(list, cases) {
  const ids = new Set(cases.map((c) => c.id));
  const out = [];
  for (const entry of csv(list)) {
    const [id, variant] = entry.split(':');
    if (!ids.has(id)) fail(`unbekannter Fall "${id}" (bekannt: ${[...ids].sort().join(', ')})`);
    if (variant) {
      const rec = cases.find((c) => c.id === id);
      if (!rec.variants.some((v) => v.id === variant)) fail(`Fall "${id}" hat keine Variante "${variant}"`);
    }
    out.push({ case: id, variant: variant || null });
  }
  return out;
}

function selectVariants(cases, { list, split, profile, roles }) {
  let pool = cases;
  if (split) {
    if (split !== 'eval' && split !== 'train') fail(`--split muss eval oder train sein (gefunden: "${split}")`);
    pool = pool.filter((c) => c.split === split);
  }
  // Nur Varianten, die mindestens eine gewaehlte Rolle ueben.
  const matching = (vars) => vars.filter((vv) => (vv.roles || []).some((r) => roles.includes(r)));
  const firstSorted = (vars) => [...vars].sort((a, b) => a.id.localeCompare(b.id)).slice(0, 1);
  const filter = list ? parseCaseFilter(list, cases) : null;
  if (filter) {
    const out = [];
    for (const f of filter) {
      const rec = cases.find((c) => c.id === f.case);
      if (split && rec.split !== split) continue;
      // quick ohne explizite Variante: erste passende Variante je Fall.
      const vars = f.variant
        ? rec.variants.filter((v) => v.id === f.variant)
        : profile === 'quick' ? firstSorted(matching(rec.variants)) : matching(rec.variants);
      for (const v of vars) out.push({ rec, v });
    }
    return out;
  }
  const out = [];
  for (const rec of pool) {
    const vars = profile === 'quick' ? firstSorted(matching(rec.variants)) : matching(rec.variants);
    for (const v of vars) out.push({ rec, v });
  }
  return out;
}

// Stufenfolge einhalten (Plan vor Execute vor Review), je Stufe nach Loadout.
function orderJobs(jobs) {
  const order = { plan: 0, execute: 1, review: 2 };
  const out = [];
  for (const stage of ['plan', 'execute', 'review']) {
    out.push(...schedule(jobs.filter((j) => j.stage === stage)).jobs);
  }
  const rest = jobs.filter((j) => order[j.stage] === undefined);
  out.push(...rest);
  let reloads = 0;
  let prev = null;
  for (const j of out) {
    const k = [...j.loadout].sort().join('+');
    if (prev !== null && k !== prev) reloads += 1;
    prev = k;
  }
  return { jobs: out, reloads };
}

function writeOpencodeWrapper(jobDir, recorderUrl, workerModel, workerContext, fault = null) {
  const real = process.env.AGENT_BENCH_OPENCODE || 'opencode';
  const config = opencodeBenchConfig(recorderUrl, workerModel, workerContext);
  const file = join(jobDir, 'opencode-bench.sh');
  // Der Prompt ist das letzte Argument; --model davor schieben (yargs-fest).
  // Mit fault/ schiebt sich der Injektor dazwischen (erster Aufruf failt).
  const target = fault ? fault.script : real;
  const faultEnv = fault ? `export FAULT_REAL=${JSON.stringify(real)}\nexport FAULT_STATE=${JSON.stringify(fault.state)}\n` : '';
  writeFileSync(file, `#!/usr/bin/env bash
export OPENCODE_CONFIG_CONTENT='${config}'
${faultEnv}args=("$@")
prompt="\${args[@]: -1}"
unset 'args[\${#args[@]}-1]'
exec ${JSON.stringify(target)} "\${args[@]}" --model ${JSON.stringify(`bench-recorder/${workerModel}`)} "$prompt"
`);
  execFileSync('chmod', ['+x', file]);
  return file;
}

/** Fault-Injektor einer faulty-worker-Variante (fault/*.sh) oder null. */
function faultScriptFor(jobDir, variant) {
  if (variant.perspective !== 'faulty-worker' || !variant.dir) return null;
  try {
    const cands = readdirSync(join(variant.dir, 'fault')).filter((f) => f.endsWith('.sh')).sort();
    if (!cands.length) return null;
    return { script: join(variant.dir, 'fault', cands[0]), state: join(jobDir, 'fault.state') };
  } catch {
    return null;
  }
}

async function runJob(ctx, job) {
  const { runDir, caseMap, scoring, pool, endpoints } = ctx;
  const jobDir = join(runDir, 'runs', job.dirName);
  mkdirSync(jobDir, { recursive: true });
  const { rec, v } = caseMap.get(`${job.caseId}:${job.variantId}`);
  const recorders = [];
  try {
    const startRoleRecorder = async (role, model) => {
      const url = endpoints[model];
      if (!url) throw new Error(`kein Endpunkt fuer Modell "${model}"`);
      const rec = await startRecorder({ upstream: url, role, traceFile: join(jobDir, 'trace.jsonl'), imageDir: jobDir });
      recorders.push(rec);
      return rec.url;
    };
    const workdir = join(jobDir, 'work');
    let result;
    if (job.role === 'planner') {
      const sandbox = join(jobDir, 'sandbox');
      const prep = await prepareWorkdir(rec, v, sandbox);
      if (!prep.ok) return { infra: prep.reason };
      const url = await startRoleRecorder('planner', job.model);
      result = await runRole('planner', {
        variant: v, inputs: { case: rec, sandbox, plannerModel: job.model, slug: `${job.caseId}-${job.variantId}` },
        endpoints: {}, workdir, recorderUrls: { planner: url }, timeoutMs: ctx.timeoutMs,
      });
      if (result.artifacts?.tasks_md) {
        const planDir = join(jobDir, 'plan');
        rm_rf(planDir);
        cpSync(dirname(result.artifacts.tasks_md), planDir, { recursive: true });
        result.persistedPlan = `runs/${job.dirName}/plan`;
      }
    } else if (job.role === 'orchestrator') {
      const planDir = resolvePlanDir(ctx, job, rec, v);
      const orchUrl = await startRoleRecorder('orchestrator', job.model);
      const workerModel = pairWorker(job) || job.model;
      const workerUrl = await startRoleRecorder('code-worker', workerModel);
      const wrapper = writeOpencodeWrapper(jobDir, workerUrl, workerModel, modelContext(pool, workerModel), faultScriptFor(jobDir, v));
      result = await runRole('orchestrator', {
        variant: v,
        inputs: { case: rec, planDir, slots4b: ctx.slots4b, orchestratorModel: job.model, opencodeBin: wrapper },
        endpoints: {}, workdir, recorderUrls: { orchestrator: orchUrl, codeWorker: workerUrl }, timeoutMs: ctx.timeoutMs,
      });
      result.planRef = planDir;
    } else if (job.role === 'code-worker') {
      const prep = await prepareWorkdir(rec, v, workdir);
      if (!prep.ok) return { infra: prep.reason };
      const url = await startRoleRecorder('code-worker', job.model);
      let inputs;
      let executed = '';
      if (job.plan === 'ref') {
        let ref;
        try {
          ref = referencePartial(v);
        } catch (e) {
          return { infra: `Referenzplan unlesbar: ${e.message}` };
        }
        const prompt = buildWorkerPrompt({ partial: ref.partial, partialText: ref.text, worktree: workdir });
        inputs = { partialFile: join(v.referenceDir, ref.partial.file), targetFiles: ref.partial.targetFiles, prompt, workerAgent: ctx.workerAgent, workerModel: job.model, workerContext: modelContext(pool, job.model) };
        executed = ref.text.slice(0, 4000);
      } else {
        const planDir = resolvePlanDir(ctx, job, rec, v);
        if (!planDir) return { infra: `Ketten-Plan fehlt: ${job.plan}` };
        const slug = `${job.caseId}-${job.variantId}`;
        const dest = join(workdir, 'openspec', 'changes', slug);
        rm_rf(dest);
        cpSync(planDir, dest, { recursive: true });
        const manifest = parseManifest(readFileSync(join(dest, 'tasks.md'), 'utf8'));
        const first = manifest[0];
        const text = readFileSync(join(dest, first.file), 'utf8');
        inputs = { slug, partialId: first.id, workerAgent: ctx.workerAgent, workerModel: job.model, workerContext: modelContext(pool, job.model), prompt: buildWorkerPrompt({ partial: first, partialText: text, worktree: workdir }) };
        executed = text.slice(0, 4000);
      }
      result = await runRole('code-worker', { variant: v, inputs, endpoints: {}, workdir, recorderUrls: { codeWorker: url }, timeoutMs: ctx.timeoutMs });
      result.executedPartial = executed;
    } else if (job.role === 'vision-worker') {
      const url = await startRoleRecorder('vision-worker', job.model);
      result = await runRole('vision-worker', {
        variant: v, inputs: { model: job.model }, endpoints: {}, workdir, recorderUrls: { visionWorker: url }, timeoutMs: ctx.timeoutMs,
      });
    } else if (job.role === 'reviewer') {
      const url = await startRoleRecorder('reviewer', job.model);
      let inputs = { partialModel: job.model };
      let fallback = false;
      if (job.plan === 'ref' || !job.plan) {
        const ref = referencePartial(v);
        inputs.partialFile = join(v.referenceDir, ref.partial.file);
      } else {
        const execText = findExecutedPartial(ctx, job);
        if (execText) inputs.partialText = execText;
        else {
          const ref = referencePartial(v);
          inputs.partialFile = join(v.referenceDir, ref.partial.file);
          fallback = true;
        }
      }
      result = await runRole('reviewer', { variant: v, inputs, endpoints: {}, workdir, recorderUrls: { reviewer: url }, timeoutMs: ctx.timeoutMs });
      if (fallback) result.execFallback = true;
    } else {
      return { infra: `unbekannte Rolle "${job.role}"` };
    }
    if (result.infra) return { infra: result.reason || 'Rollen-Infra-Fehler' };
    // Crash-Unterscheidung: Protokollfehler + toter Endpunkt = Infra, nicht Modell.
    const proto = (result.events || []).some((e) => ['protocol_error', 'tool_error', 'timeout'].includes(e.kind));
    if (proto && !(await probeEndpoint(endpoints[job.model]))) {
      return { infra: `Endpunkt ${job.model} nach dem Lauf unerreichbar`, retryable: true };
    }
    const score = scoreRun({ role: job.role, outcome: result.outcome, events: result.events, usage: result.usage, budget: v.budget || {} }, scoring);
    const out = {
      case: job.caseId, variant: job.variantId, perspective: v.perspective, role: job.role, model: job.model,
      rep: job.rep, split: rec.split, source_ref: rec.source_ref, stage: job.stage,
      plan: job.plan, pair: job.pair, score, usage: result.usage, trace: 'trace.jsonl',
    };
    if (result.persistedPlan) {
      out.plan_dir = result.persistedPlan;
      out.manifest = result.artifacts.manifest || null;
      out.budget = v.budget || null;
    }
    if (result.executedPartial) out.executed_partial = result.executedPartial;
    if (result.planRef) out.plan_ref = result.planRef;
    if (result.execFallback) out.exec_fallback = true;
    return { result: out };
  } catch (e) {
    return { infra: String(e?.message || e), retryable: /endpoint|econn|socket|fetch failed/i.test(String(e?.message || '')) };
  } finally {
    for (const r of recorders) await r.close().catch(() => {});
  }
}

function rm_rf(p) {
  rmSync(p, { recursive: true, force: true });
}

function pairWorker(job) {
  if (!job.pair) return null;
  const [, w] = job.pair.split('+');
  return w && w !== '-' ? w : null;
}

function modelContext(pool, id) {
  return pool.models.find((m) => m.id === id)?.max_context || 65536;
}

/** Ketten-Plan fuer Execute/Review auftreiben (persistierter Plan oder Referenz). */
function resolvePlanDir(ctx, job, rec, v) {
  if (!job.plan || job.plan === 'ref') return v.referenceDir;
  const planJob = ctx.jobs.find((j) => j.stage === 'plan' && j.caseId === job.caseId && j.variantId === job.variantId && j.model === job.plan && j.rep === job.rep);
  if (planJob) {
    const f = resultPath(ctx.runDir, planJob);
    if (existsSync(f)) {
      const r = readJson(f);
      if (r.plan_dir && existsSync(join(ctx.runDir, r.plan_dir, 'tasks.md'))) return join(ctx.runDir, r.plan_dir);
    }
  }
  return v.referenceDir;
}

function findExecutedPartial(ctx, job) {
  for (const role of ['code-worker', 'orchestrator']) {
    const cand = ctx.jobs.find((j) => j.stage === 'execute' && j.role === role && j.caseId === job.caseId && j.variantId === job.variantId && j.rep === job.rep && j.plan === job.plan && j.pair === job.pair);
    if (!cand) continue;
    const f = resultPath(ctx.runDir, cand);
    if (existsSync(f)) {
      const r = readJson(f);
      if (r.executed_partial) return r.executed_partial;
    }
  }
  return null;
}

/** Kette: Planner-Outcome = Mittel der Execute-Outcomes seiner Plaene. */
function backfillPlanners(ctx) {
  if (ctx.mode !== 'chained') return 0;
  let n = 0;
  for (const job of ctx.jobs.filter((j) => j.stage === 'plan')) {
    const f = resultPath(ctx.runDir, job);
    if (!existsSync(f)) continue;
    const r = readJson(f);
    if (!r.score || r.infra_error) continue;
    const execs = [];
    for (const e of ctx.jobs.filter((j) => j.stage === 'execute' && (j.role === 'orchestrator' || j.role === 'code-worker'))) {
      if (e.caseId !== job.caseId || e.variantId !== job.variantId || e.rep !== job.rep || e.plan !== job.model) continue;
      const ef = resultPath(ctx.runDir, e);
      if (!existsSync(ef)) continue;
      const er = readJson(ef);
      if (er.score && !er.infra_error) execs.push(er.score.outcome);
    }
    if (!execs.length) continue;
    const outcome = execs.reduce((a, b) => a + b, 0) / execs.length;
    const score = scoreRun({ role: 'planner', outcome, events: (r.score.events || []).map((e) => ({ kind: e.kind })), usage: r.usage, budget: r.budget || {} }, ctx.scoring);
    r.isolated_outcome = r.score.outcome;
    r.score = score;
    r.chained_outcome = true;
    atomicWriteJson(f, r);
    n += 1;
  }
  return n;
}

function writeResult(runDir, job, payload) {
  atomicWriteJson(resultPath(runDir, job), payload);
}

function saveState(runDir, state) {
  atomicWriteJson(join(runDir, 'state.json'), { ...state, updated_at: new Date().toISOString() });
}

async function executeJobs(ctx, jobs) {
  const { runDir } = ctx;
  let done = 0;
  let infra = 0;
  // Jobs nach Loadout gruppieren (Reihenfolge aus orderJobs beibehalten).
  const groups = new Map();
  for (const job of jobs) {
    const k = [...job.loadout].sort().join('+');
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(job);
  }
  for (const [, group] of groups) {
    const models = [...new Set(group.flatMap((j) => j.loadout))];
    let loadout = models.length ? await ensureLoadout(models, ctx.pool, { reason: `agent-bench ${ctx.runId}` }) : { ok: true, endpoints: {} };
    if (!loadout.ok) loadout = await ensureLoadout(models, ctx.pool, { reason: `agent-bench ${ctx.runId} retry` });
    if (!loadout.ok) {
      for (const job of group) {
        if (existsSync(resultPath(runDir, job))) continue;
        writeResult(runDir, job, metaOnly(ctx, job, loadout.reason));
        markState(ctx, job, 'infra');
        infra += 1;
      }
      continue;
    }
    Object.assign(ctx.endpoints, loadout.endpoints || {});
    for (const job of group) {
      if (existsSync(resultPath(runDir, job))) {
        const r = readJson(resultPath(runDir, job));
        if (r.infra_error) infra += 1;
        else done += 1;
        continue;
      }
      let res = await runJob(ctx, job);
      if (res.infra && res.retryable) {
        const retry = await ensureLoadout(models, ctx.pool, { reason: `agent-bench ${ctx.runId} retry` });
        if (retry.ok) {
          Object.assign(ctx.endpoints, retry.endpoints || {});
          res = await runJob(ctx, job);
        }
      }
      if (res.infra) {
        writeResult(runDir, job, metaOnly(ctx, job, res.infra));
        markState(ctx, job, 'infra');
        infra += 1;
      } else {
        writeResult(runDir, job, res.result);
        markState(ctx, job, 'done');
        done += 1;
      }
    }
  }
  return { done, infra };
}

function metaOnly(ctx, job, reason) {
  const entry = ctx.caseMap.get(`${job.caseId}:${job.variantId}`);
  return {
    case: job.caseId, variant: job.variantId, perspective: entry?.v.perspective || null,
    role: job.role, model: job.model, rep: job.rep, split: entry?.rec.split || null,
    source_ref: entry?.rec.source_ref || null, stage: job.stage, plan: job.plan, pair: job.pair,
    score: null, usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    infra_error: reason, reason,
  };
}

function markState(ctx, job, status) {
  const s = ctx.state.jobs.find((j) => j.key === job.key);
  if (s) s.status = status;
  saveState(ctx.runDir, ctx.state);
}

function commandLine(opts) {
  const parts = ['node scripts/llm/agent-bench/bench.mjs run', `--profile ${opts.profile}`, `--roles ${opts.roles.join(',')}`, `--models ${opts.models.join(',')}`];
  if (opts.cases) parts.push(`--cases ${opts.cases}`);
  if (opts.reps != null) parts.push(`--reps ${opts.reps}`);
  parts.push(`--seed ${opts.seed}`, `--mode ${opts.mode}`);
  if (opts.split) parts.push(`--split ${opts.split}`);
  return parts.join(' ');
}

async function cmdRun(flags) {
  const profile = flags.profile || 'quick';
  if (profile !== 'quick' && profile !== 'full') fail(`--profile muss quick oder full sein (gefunden: "${profile}")`);
  const mode = flags.mode || 'isolated';
  if (mode !== 'isolated' && mode !== 'chained') fail(`--mode muss isolated oder chained sein (gefunden: "${mode}")`);
  let roles;
  try {
    roles = parseRoles(flags.roles || '');
  } catch (e) {
    fail(e.message);
  }
  const pool = loadPool(modelsPath());
  const selectedModels = flags.models ? csv(flags.models) : pool.models.filter((m) => m.enabled !== false).map((m) => m.id);
  for (const id of selectedModels) {
    if (!pool.models.some((m) => m.id === id)) fail(`unbekanntes Modell "${id}" (Pool: ${modelsPath()})`);
  }
  const casesDir = casesRoot();
  const validation = validateCases(casesDir);
  if (!validation.ok) {
    fail(`Fall-Validierung fehlgeschlagen:\n${validation.errors.map((e) => `  ${e.caseId}: ${e.message}`).join('\n')}`);
  }
  const cases = loadCases(casesDir);
  const picked = selectVariants(cases, { list: flags.cases, split: flags.split, profile, roles });
  if (!picked.length) fail('keine Faelle nach Filter (--cases/--split)');
  const seed = flags.seed != null ? Number(flags.seed) : Math.floor(Math.random() * 900000) + 100000;
  const reps = flags.reps != null ? Number(flags.reps) : null;
  if (reps != null && !(reps >= 1)) fail('--reps muss >= 1 sein');
  const maxJobs = Number(process.env.AGENT_BENCH_MAX_JOBS || 400);
  const { jobs, sampled, stats } = buildAssignments({
    roles, models: selectedModels, pool, mode, profile, seed,
    variants: picked.map(({ rec, v }) => ({ caseId: rec.id, variantId: v.id, perspective: v.perspective, roles: v.roles })),
    reps, maxJobs,
  });
  if (!jobs.length) fail('keine Auftraege: keine (Rolle, Modell)-Kombination ist faehig oder resident');
  const { jobs: ordered, reloads } = orderJobs(jobs);

  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const runId = `${stamp}-${profile}-${mode}-${String(Math.floor(Math.random() * 0xffff)).padStart(4, '0')}`;
  const runDir = join(runsRoot(), runId);
  mkdirSync(runDir, { recursive: true });
  const caseMap = new Map(picked.map(({ rec, v }) => [`${rec.id}:${v.id}`, { rec, v }]));
  const scoring = loadScoringConfig(scoringPath());
  const modelsSha = createHash('sha256').update(readFileSync(modelsPath())).digest('hex');
  const manifest = {
    run_id: runId, started_at: new Date().toISOString(), revision: revision(),
    scoring_version: scoring.version, models_sha256: modelsSha, models_path: modelsPath(),
    seed, profile, mode, split: flags.split || null, roles, models: selectedModels,
    cases: [...new Map(picked.map(({ rec }) => [rec.id, rec])).values()].map((rec) => ({
      id: rec.id, split: rec.split, source_ref: rec.source_ref, variants: picked.filter((p) => p.rec.id === rec.id).map((p) => p.v.id),
    })),
    servers: selectedModels.map((id) => {
      const m = pool.models.find((x) => x.id === id);
      return { id, engine: m.engine, command: m.engine === 'api' ? (process.env[m.endpoint_env] || m.endpoint_env) : (m.service ? `systemctl --user start ${m.service}` : (m.start || []).join(' ')) };
    }),
    command: commandLine({ profile, roles, models: selectedModels, cases: flags.cases, reps, seed, mode, split: flags.split }),
    sampled, repetitions: stats.repetitions, reloads, jobs_total: stats.jobs_total, jobs_kept: stats.jobs_kept,
  };
  atomicWriteJson(join(runDir, 'manifest.json'), manifest);
  for (const c of manifest.cases) {
    atomicWriteJson(join(runDir, 'cases', c.id, 'case.json'), c);
  }
  const ctx = {
    runDir, runId, pool, scoring, caseMap, jobs: ordered, mode,
    endpoints: {}, state: { run_id: runId, status: 'running', jobs: ordered.map((j) => ({ key: j.key, dirName: j.dirName, status: 'open' })) },
    slots4b: Number(process.env.AGENT_BENCH_4B_SLOTS || 1),
    workerAgent: process.env.AGENT_BENCH_WORKER_AGENT || 'plan-worker-4b',
    timeoutMs: process.env.AGENT_BENCH_TIMEOUT_MS ? Number(process.env.AGENT_BENCH_TIMEOUT_MS) : undefined,
  };
  saveState(runDir, ctx.state);
  installRestoreHooks(() => restoreProduction(pool));
  try {
    const { done, infra } = await executeJobs(ctx, ordered);
    backfillPlanners(ctx);
    ctx.state.status = 'done';
    saveState(runDir, ctx.state);
    console.log(`AGENT-BENCH: run=${runId} jobs=${ordered.length} done=${done} infra=${infra}`);
  } finally {
    await restoreProduction(pool).catch(() => {});
  }
}

async function cmdResume(runId) {
  if (!runId) fail('resume braucht eine run-id');
  const runDir = join(runsRoot(), runId);
  if (!existsSync(join(runDir, 'manifest.json'))) fail(`unbekannter Lauf "${runId}"`);
  const manifest = readJson(join(runDir, 'manifest.json'));
  const pool = loadPool(modelsPath());
  const scoring = loadScoringConfig(scoringPath());
  const cases = loadCases(casesRoot());
  const caseMap = new Map();
  for (const c of manifest.cases || []) {
    const rec = cases.find((x) => x.id === c.id);
    if (!rec) fail(`Fall "${c.id}" fehlt im Fall-Verzeichnis (Resume unmoeglich)`);
    for (const vid of c.variants || []) {
      const v = rec.variants.find((x) => x.id === vid);
      if (!v) fail(`Variante "${c.id}:${vid}" fehlt (Resume unmoeglich)`);
      caseMap.set(`${c.id}:${vid}`, { rec, v });
    }
  }
  const state = readJson(join(runDir, 'state.json'));
  // Job-Specs deterministisch neu aufbauen (gleicher Seed = gleiche Stichprobe)
  // und auf die gespeicherten dirNames einschraenken.
  const picked = [...caseMap.entries()].map(([k, { rec, v }]) => ({ key: k, rec, v }));
  const { jobs } = buildAssignments({
    roles: manifest.roles, models: manifest.models, pool, mode: manifest.mode, profile: manifest.profile,
    seed: manifest.seed, variants: picked.map(({ rec, v }) => ({ caseId: rec.id, variantId: v.id, perspective: v.perspective, roles: v.roles })),
    reps: manifest.repetitions, maxJobs: Number(process.env.AGENT_BENCH_MAX_JOBS || 400),
  });
  const wanted = new Set(state.jobs.map((j) => j.dirName));
  const { jobs: ordered } = orderJobs(jobs.filter((j) => wanted.has(j.dirName)));
  const ctx = {
    runDir, runId, pool, scoring, caseMap, jobs: ordered, mode: manifest.mode,
    endpoints: {}, state,
    slots4b: Number(process.env.AGENT_BENCH_4B_SLOTS || 1),
    workerAgent: process.env.AGENT_BENCH_WORKER_AGENT || 'plan-worker-4b',
    timeoutMs: process.env.AGENT_BENCH_TIMEOUT_MS ? Number(process.env.AGENT_BENCH_TIMEOUT_MS) : undefined,
  };
  installRestoreHooks(() => restoreProduction(pool));
  try {
    const { done, infra } = await executeJobs(ctx, ordered);
    backfillPlanners(ctx);
    ctx.state.status = 'done';
    saveState(runDir, ctx.state);
    console.log(`AGENT-BENCH: run=${runId} jobs=${ordered.length} done=${done} infra=${infra}`);
  } finally {
    await restoreProduction(pool).catch(() => {});
  }
}

function cmdReport(runId, baselineId) {
  if (!runId) fail('report braucht eine run-id');
  const runDir = join(runsRoot(), runId);
  if (!existsSync(join(runDir, 'manifest.json'))) fail(`unbekannter Lauf "${runId}"`);
  const { markdown } = buildReport(runDir);
  console.log(markdown);
  if (baselineId) {
    const baseDir = join(runsRoot(), baselineId);
    if (!existsSync(join(baseDir, 'manifest.json'))) fail(`unbekannte Baseline "${baselineId}"`);
    const g = gate(runDir, baseDir);
    console.log(`\n## Gate gegen ${baselineId}\n`);
    if (g.exit === 2) console.log(`verweigert: ${g.error}`);
    else if (g.ok) console.log('ok: keine Regression');
    else for (const r of g.regressions) console.log(`- REGRESSION ${r.role}: delta ${r.delta.toFixed(1)} (Schwelle ${r.threshold.toFixed(1)})`);
  }
}

function cmdGate(runId, baselineId) {
  if (!runId || !baselineId) fail('gate braucht <run-id> --baseline <run-id>');
  const runDir = join(runsRoot(), runId);
  const baseDir = join(runsRoot(), baselineId);
  if (!existsSync(join(runDir, 'manifest.json'))) fail(`unbekannter Lauf "${runId}"`);
  if (!existsSync(join(baseDir, 'manifest.json'))) fail(`unbekannte Baseline "${baselineId}"`);
  const g = gate(runDir, baseDir);
  console.log(`GATE: run=${runId} baseline=${baselineId}`);
  if (g.exit === 2) {
    console.log(`GATE: REFUSED ${g.error}`);
    process.exit(2);
  }
  for (const r of g.regressions) console.log(`REGRESSION role=${r.role} delta=${r.delta.toFixed(1)} threshold=${r.threshold.toFixed(1)}`);
  console.log(g.ok ? 'GATE: ok' : 'GATE: REGRESSION');
  process.exit(g.ok ? 0 : 1);
}

function cmdExport(runIds, out) {
  if (!runIds.length || !out) fail('export-corpus braucht <run-id...> --out <dir>');
  const dirs = runIds.map((id) => join(runsRoot(), id));
  for (const [i, d] of dirs.entries()) {
    if (!existsSync(join(d, 'manifest.json'))) fail(`unbekannter Lauf "${runIds[i]}"`);
  }
  const r = exportCorpus(dirs, out);
  console.log(`AGENT-BENCH-CORPUS: out=${out} sft=${r.sft} preferences=${r.preferences} gaps=${r.gaps} evalSkipped=${r.evalSkipped}`);
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const { flags, positional } = parseArgs(rest);
  if (cmd === 'run') await cmdRun(flags);
  else if (cmd === 'resume') await cmdResume(positional[0]);
  else if (cmd === 'report') cmdReport(positional[0], flags.baseline);
  else if (cmd === 'gate') cmdGate(positional[0], flags.baseline);
  else if (cmd === 'export-corpus') cmdExport(positional, flags.out);
  else fail(`unbekanntes Kommando "${cmd}" (run|resume|report|gate|export-corpus)`);
}

main().catch((e) => fail(String(e?.stack || e), 1));

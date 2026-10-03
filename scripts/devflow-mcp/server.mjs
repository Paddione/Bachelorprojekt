#!/usr/bin/env node
// scripts/devflow-mcp/server.mjs — devflow-mcp: Kontext, Werkzeuge und Plan-Staging für Subagenten (T900985).
//
// stdio, zeilengetrenntes JSON-RPC. Design: .agents/plans/devflow-mcp/design.md.
// Backends (bge, mcp-postgres, codebase-memory) öffnet lib/backends.mjs lazy — ein Tool, das ein
// Backend nicht braucht, funktioniert auch ohne dessen Erreichbarkeit.
//
// Repo-Wurzel: DEVFLOW_REPO_ROOT, sonst das Repo, in dem dieses Skript liegt. Die Registry
// (capabilities.yaml/toolset.lock.yaml) kommt immer aus dem Repo des Skripts, außer
// TOOLSET_REGISTRY ist gesetzt.
import readline from 'node:readline';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeBge, makePg } from './lib/backends.mjs';
import { findCache, headCommit, searchCode, searchKnowledge } from './lib/retrieve.mjs';
import { recommendTools, resolveRoleOrThrow } from './lib/tools-corpus.mjs';
import { planStage, planLint, scriptIn } from './lib/plan-stage.mjs';
import { run, tail } from './lib/run.mjs';

const SCRIPT_REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const REPO = path.resolve(process.env.DEVFLOW_REPO_ROOT || SCRIPT_REPO);
const REGISTRY = process.env.TOOLSET_REGISTRY || path.join(SCRIPT_REPO, 'docs', 'agent-guide', 'registry', 'capabilities.yaml');
const bge = makeBge();
const pg = makePg();

const ROLE = { type: 'string', description: 'Agenten-Rolle: bp-build | bp-run | bp-ship | orchestrator' };
const TOOLS = [
  {
    name: 'context_for_task',
    description: 'Einstieg für jeden Auftrag: relevante Code-Symbole (Graph-Index), Pläne/Bugs/PRs (knowledge) und empfohlene Werkzeuge für die Rolle — per bge-Rerank, in einem Aufruf. Vor der ersten Datei-Suche aufrufen.',
    inputSchema: { type: 'object', required: ['task', 'role'], properties: {
      task: { type: 'string', description: 'Aufgabentext in eigenen Worten' }, role: ROLE,
      k_code: { type: 'integer', minimum: 0, maximum: 20, default: 6 }, k_docs: { type: 'integer', minimum: 0, maximum: 20, default: 5 },
      k_tools: { type: 'integer', minimum: 0, maximum: 20, default: 6 },
    } },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'recommend_tools',
    description: 'Werkzeuge (MCP-Tools, Skills, CLIs) für eine Aufgabe, gefiltert nach Rolle, Unterdrückung und Tier, sortiert per bge-Rerank.',
    inputSchema: { type: 'object', required: ['task', 'role'], properties: {
      task: { type: 'string' }, role: ROLE, k: { type: 'integer', minimum: 1, maximum: 30, default: 6 },
      max_tier: { type: 'string', enum: ['safe', 'caution', 'assisted', 'dangerous'], default: 'assisted' },
    } },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'search_code',
    description: 'Semantische Suche über Function/Method/Class des Code-Graphen; Treffer mit Datei:Zeile, Signatur und Ausschnitt.',
    inputSchema: { type: 'object', required: ['query'], properties: {
      query: { type: 'string' }, k: { type: 'integer', minimum: 1, maximum: 30, default: 8 },
      path_prefix: { type: 'string', description: 'Nur Dateien unter diesem Pfad, z. B. scripts/toolset/' },
    } },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'graph_status',
    description: 'Stand des Graph-Index: Symbolzahl, indizierter Commit, ob er hinter HEAD liegt.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'plan_stage',
    description: 'Plan stagen in einem Schritt: Worktree + Branch von origin/main, Ticket-Claim, Plan (und design.md) schreiben, plan-lint, Commit, Push, ticket.sh stage-plan --hold. Bei rotem Lint Abbruch vor dem Commit mit den Befunden.',
    inputSchema: { type: 'object', required: ['ticket', 'slug'], properties: {
      ticket: { type: 'string', description: 'T + 6 Ziffern' }, slug: { type: 'string', description: 'kebab-case, wird Plan-Ordner und Branch-Teil' },
      branch_type: { type: 'string', enum: ['feature', 'fix'], default: 'feature' },
      plan_markdown: { type: 'string' }, plan_file: { type: 'string', description: 'Alternative zu plan_markdown: absoluter Pfad' },
      design_markdown: { type: 'string' }, partials: { type: 'integer', minimum: 1, default: 1 },
      sid: { type: 'string', description: 'AGENT_LOCK_SID des Orchestrators (sonst Harness-Env)' },
    } },
  },
  {
    name: 'plan_lint',
    description: 'plan-lint.sh --json: Urteil (PASS/FAIL) mit harten Befunden und Warnungen.',
    inputSchema: { type: 'object', required: ['plan_path'], properties: { plan_path: { type: 'string' } } },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'lock',
    description: 'agent-lock.sh: claim | release | check | list | mine | activity. Die SID kommt aus dem Parameter oder der Harness-Umgebung des Servers.',
    inputSchema: { type: 'object', required: ['action'], properties: {
      action: { type: 'string', enum: ['claim', 'release', 'check', 'list', 'mine', 'activity'] },
      scope: { type: 'string', enum: ['ticket', 'branch', 'main-checkout'] }, id: { type: 'string' },
      branch: { type: 'string' }, worktree: { type: 'string' }, label: { type: 'string' }, sid: { type: 'string' },
    } },
  },
  {
    name: 'collision_check',
    description: 'agent-collision.sh check --branch im Worktree: überschneiden sich die geänderten Dateien mit fremden Claims?',
    inputSchema: { type: 'object', properties: { worktree: { type: 'string' } } },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'ci_status',
    description: 'Ein Schnappschuss des PR-Status (kein Polling): Zustand, Mergebarkeit, Checks nach Ergebnis, Namen der roten Checks.',
    inputSchema: { type: 'object', required: ['pr'], properties: { pr: { type: 'string', description: 'PR-Nummer oder URL' } } },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'task_oracle',
    description: 'Task-Oracle (vda.sh oracle --json): Ziel in Klartext → Taskfile-Task und Befehl.',
    inputSchema: { type: 'object', required: ['goal'], properties: { goal: { type: 'string' } } },
    annotations: { readOnlyHint: true },
  },
];

async function graphStatus() {
  const found = findCache(REPO);
  if (!found) return { indexed: false, repo: REPO, hint: `node scripts/devflow-mcp/graph-index.mjs --repo ${REPO}` };
  const head = headCommit(REPO);
  const m = found.meta;
  return {
    indexed: true, project: m.project, count: m.count, commit: m.commit, head, stale: m.commit !== head,
    // T900985: Erstlauf in Etappen — pending Symbole fehlen noch, der nächste Indexlauf setzt fort.
    partial: Boolean(m.partial), pending: m.pending ?? 0,
    built_at: m.built_at, cbm_version: m.cbm_version, dir: found.dir,
  };
}

async function contextForTask({ task, role, k_code = 6, k_docs = 5, k_tools = 6 }) {
  const r = resolveRoleOrThrow(role);
  const degraded = [];
  const settle = async (name, fn) => {
    try { const v = await fn(); for (const d of v.degraded ?? []) degraded.push(`${name}:${d}`); return v; } catch (e) { degraded.push(`${name}: ${e.message.slice(0, 160)}`); return null; }
  };
  // Anfrage einmal einbetten, für Code und Wissen teilen. Scheitert das Embedding, laufen die
  // beiden Sektionen leer (degraded), die Werkzeug-Empfehlung braucht keinen Vektor.
  let queryVector = null;
  if (k_code > 0 || k_docs > 0) {
    try { [queryVector] = await bge.embed([task]); } catch (e) { degraded.push(`embed: ${e.message.slice(0, 160)}`); }
  }
  const [code, docs, tools] = await Promise.all([
    k_code > 0 && queryVector ? settle('code', () => searchCode({ bge, repoRoot: REPO, query: task, k: k_code, excerptChars: 300, queryVector })) : null,
    k_docs > 0 && queryVector ? settle('plans', () => searchKnowledge({ bge, pg, query: task, k: k_docs, excerptChars: 300, queryVector })) : null,
    k_tools > 0 ? settle('tools', () => recommendTools({ bge, registryPath: REGISTRY, task, role: r, k: k_tools })) : null,
  ]);
  return {
    role: r,
    code: code?.results ?? [],
    plans: docs?.results ?? [],
    tools: tools?.tools ?? [],
    graph: code?.graph ?? null,
    degraded,
  };
}

const sh = async (script, args, opts = {}) => run('bash', [scriptIn(REPO, opts.cwd ?? REPO, script), ...args], { cwd: opts.cwd ?? REPO, env: opts.env ?? process.env, timeoutMs: opts.timeoutMs ?? 120000 });

const HANDLERS = {
  context_for_task: contextForTask,
  recommend_tools: ({ task, role, k, max_tier }) => recommendTools({ bge, registryPath: REGISTRY, task, role, k, maxTier: max_tier }),
  search_code: ({ query, k, path_prefix }) => searchCode({ bge, repoRoot: REPO, query, k, pathPrefix: path_prefix }),
  graph_status: graphStatus,
  plan_stage: (args) => planStage(REPO, args),
  plan_lint: ({ plan_path }) => planLint(REPO, plan_path),
  async lock({ action, scope, id, branch, worktree, label, sid }) {
    const args = [action];
    if (['claim', 'release', 'check'].includes(action)) {
      if (!scope) throw new Error(`lock ${action} braucht scope`);
      args.push(scope);
      if (scope !== 'main-checkout') { if (!id) throw new Error(`lock ${action} ${scope} braucht id`); args.push(id); }
      if (action === 'claim') {
        if (branch) args.push('--branch', branch);
        if (worktree) args.push('--worktree', worktree);
        args.push('--label', label || 'devflow-mcp');
      }
    }
    const r = await sh('agent-lock.sh', args, { env: sid ? { ...process.env, AGENT_LOCK_SID: sid } : process.env });
    return { exit: r.code, stdout: tail(r.stdout, 40), stderr: tail(r.stderr, 10) };
  },
  async collision_check({ worktree }) {
    const cwd = worktree || REPO;
    const r = await sh('agent-collision.sh', ['check', '--branch'], { cwd });
    return { exit: r.code, collisions: r.stdout.split('\n').filter(Boolean), stderr: tail(r.stderr, 10) };
  },
  async ci_status({ pr }) {
    const view = await run('gh', ['pr', 'view', String(pr), '--json', 'number,state,mergeable,mergeStateStatus,url,headRefName,title'], { cwd: REPO, timeoutMs: 60000 });
    if (view.code !== 0) throw new Error(`gh pr view: ${tail(view.stderr, 3)}`);
    const checks = await run('gh', ['pr', 'checks', String(pr), '--json', 'name,state,bucket'], { cwd: REPO, timeoutMs: 60000 });
    let list = [];
    try { list = JSON.parse(checks.stdout || '[]'); } catch { /* keine Checks */ }
    const count = (b) => list.filter(c => c.bucket === b).length;
    return { ...JSON.parse(view.stdout), checks: { pass: count('pass'), fail: count('fail'), pending: count('pending'), skipping: count('skipping') }, failing: list.filter(c => c.bucket === 'fail').map(c => c.name) };
  },
  async task_oracle({ goal }) {
    const r = await sh('vda.sh', ['oracle', '--json', goal], { timeoutMs: 60000 });
    try { return JSON.parse(r.stdout.trim().split('\n').pop()); } catch { return { exit: r.code, stdout: tail(r.stdout, 10), stderr: tail(r.stderr, 5) }; }
  },
};

const send = (msg) => process.stdout.write(JSON.stringify(msg) + '\n');
const content = (obj) => [{ type: 'text', text: JSON.stringify(obj) }];

async function handle(msg) {
  if (msg.id === undefined) return; // Notifications
  if (msg.method === 'initialize') {
    return send({ jsonrpc: '2.0', id: msg.id, result: {
      protocolVersion: msg.params?.protocolVersion ?? '2025-06-18',
      capabilities: { tools: {} },
      serverInfo: { name: 'devflow-mcp', version: '1.0.0' },
      instructions: 'Für jeden Auftrag zuerst context_for_task(task, role) aufrufen: liefert Code-Symbole, Pläne und passende Werkzeuge. Pläne mit plan_stage stagen (nicht ticket-mcp stage_plan).',
    } });
  }
  if (msg.method === 'tools/list') return send({ jsonrpc: '2.0', id: msg.id, result: { tools: TOOLS } });
  if (msg.method === 'ping') return send({ jsonrpc: '2.0', id: msg.id, result: {} });
  if (msg.method === 'tools/call') {
    const { name, arguments: args = {} } = msg.params ?? {};
    const fn = HANDLERS[name];
    if (!fn) return send({ jsonrpc: '2.0', id: msg.id, result: { isError: true, content: content({ error: `unbekanntes Tool ${name}` }) } });
    try {
      return send({ jsonrpc: '2.0', id: msg.id, result: { content: content(await fn(args)) } });
    } catch (e) {
      return send({ jsonrpc: '2.0', id: msg.id, result: { isError: true, content: content({ error: e.message }) } });
    }
  }
  send({ jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: `method not found: ${msg.method}` } });
}

readline.createInterface({ input: process.stdin }).on('line', (line) => {
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  handle(msg);
}).on('close', async () => {
  await Promise.allSettled([bge.close(), pg.close()]);
  process.exit(0);
});

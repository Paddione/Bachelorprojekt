/**
 * Geteilte Helfer der agent-bench-Rollen (p5).
 *
 * Node 22, nur Standardbibliothek, ESM. Alle externen Programme laufen ueber
 * lazy Env-Overrides (AGENT_BENCH_{NODE,OPENCODE,GIT,BASH,CURL,PLAN_RUNNER}),
 * damit BATS-Tests Fakes injizieren koennen.
 */

import { execFile } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(HERE, '..', '..', '..', '..', '..');
const DEFAULT_PLAN_RUNNER = join(REPO_ROOT, 'scripts', 'llm', 'plan-runner.mjs');

// Bewusst lazy: die BATS-Tests setzen die Overrides gern nach dem Import.
export const TOOL = {
  node: () => process.env.AGENT_BENCH_NODE || 'node',
  opencode: () => process.env.AGENT_BENCH_OPENCODE || 'opencode',
  git: () => process.env.AGENT_BENCH_GIT || 'git',
  bash: () => process.env.AGENT_BENCH_BASH || 'bash',
  curl: () => process.env.AGENT_BENCH_CURL || 'curl',
  planRunner: () => process.env.AGENT_BENCH_PLAN_RUNNER || DEFAULT_PLAN_RUNNER,
};

export const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.svg']);
export const BENCH_PROVIDER = 'bench-recorder';

export function mimeFor(file) {
  return (
    {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.webp': 'image/webp',
      '.gif': 'image/gif',
      '.bmp': 'image/bmp',
      '.svg': 'image/svg+xml',
    }[String(file).toLowerCase().replace(/^.*(\.[a-z0-9]+)$/, '$1')] || 'image/png'
  );
}

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

export function emptyResult(events = [], artifacts = {}) {
  return { outcome: 0, events, usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }, artifacts };
}

export function addUsage(target, usage) {
  if (!usage) return;
  for (const key of ['prompt_tokens', 'completion_tokens', 'total_tokens']) {
    target[key] = (target[key] || 0) + (usage[key] || 0);
  }
}

/** OpenAI-kompatibler Chat-Call ueber curl gegen den Recorder-Endpunkt. */
export async function chat(url, { messages, tools, model, params = {}, timeoutMs = 300_000 }) {
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

export function parseJsonLoose(text) {
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

/**
 * Zusaetzliche opencode-Konfiguration (fuer OPENCODE_CONFIG_CONTENT): legt den
 * Provider `bench-recorder` auf den Recorder-URL, sodass `opencode run
 * --model bench-recorder/<id>` durch den Trace-Proxy laeuft.
 */
export function opencodeBenchConfig(recorderUrl, modelId, context = 65536) {
  return JSON.stringify({
    $schema: 'https://opencode.ai/config.json',
    provider: {
      [BENCH_PROVIDER]: {
        npm: '@ai-sdk/openai-compatible',
        name: 'agent-bench recorder',
        options: { baseURL: `${String(recorderUrl).replace(/\/+$/, '')}/v1` },
        models: { [modelId]: { name: `bench ${modelId}`, limit: { context, output: 8192 } } },
      },
    },
  });
}

export const GIT_ENV = {
  GIT_AUTHOR_NAME: 'agent-bench',
  GIT_AUTHOR_EMAIL: 'bench@localhost',
  GIT_COMMITTER_NAME: 'agent-bench',
  GIT_COMMITTER_EMAIL: 'bench@localhost',
  // Kein git-crypt im Bench: der smudge-Filter wuerde jede Worktree-Erzeugung
  // abbrechen, solange `environments/.secrets/**` gesperrt ist.
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
  const init = await run(TOOL.git(), ['-c', 'init.defaultBranch=main', 'init', '--quiet'], { cwd: dest });
  if (!init.ok) return { ok: false, infra: true, reason: `git init: ${init.stderr.trim()}` };
  await run(TOOL.git(), ['add', '-A'], { cwd: dest });
  const commit = await run(TOOL.git(), ['commit', '--quiet', '--allow-empty', '-m', 'bench: fixture baseline'], {
    cwd: dest, env: GIT_ENV,
  });
  if (!commit.ok) return { ok: false, infra: true, reason: `git commit: ${commit.stderr.trim()}` };
  return { ok: true, workdir: dest, slug: caseRecord.id, cleanup: async () => rmSync(dest, { recursive: true, force: true }) };
}

/**
 * Fuehrt `checks/run.sh` der Variante aus — mit `cwd = workdir`.
 * Die Checks liegen im Fallverzeichnis, geprueft wird der Code im Workdir.
 */
export async function runChecks(workdir, checksDir = null) {
  const norm = (f) => String(f).replace(/\\/g, '/');
  const isChecksScript = (f) => norm(f).endsWith('/checks/run.sh');
  const isVariantCheck = (f) => norm(f).includes('/variants/') && norm(f).endsWith('/checks/run.sh');
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

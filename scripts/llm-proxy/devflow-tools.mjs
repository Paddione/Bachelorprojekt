// scripts/llm-proxy/devflow-tools.mjs
// T901630 — native Routen POST /tools/devflow/<verb> nach dem bge-Muster
// (T003205): der Dispatch kommt aus dem PFAD, die gesamte Logik liegt in
// diesem Modul, server.mjs haelt nur die Weiterleitung. Das Modul kennt den
// HTTP-Server nicht: es bekommt Helfer injiziert (readBody, sendJson) und
// spawnt das Python-Backend `python3 -m devflow <verb>` mit JSON auf stdin.
//
// Exit-Mapping (design.md Kontrakte): 0 -> 200 mit Backend-JSON,
// 1 -> 500 devflow_fail, 2 -> 503 devflow_env, Spawn-Fehler/Timeout ->
// 503 devflow_unreachable. Fehler immer als {error:{code,message}}.
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEVFLOW_TIMEOUT_MS = Number(process.env.DEVFLOW_TIMEOUT_MS || 120_000);

const VERB_PATHS = new Map([
  ['/tools/devflow/turbolint', 'turbolint'],
  ['/tools/devflow/insta_ci', 'insta_ci'],
  ['/tools/devflow/sandbox', 'sandbox'],
]);

/** Verb aus dem PFAD ableiten — bewusst nicht aus dem Body. */
export function verbForPath(path) {
  return VERB_PATHS.get(path) ?? null;
}

function repoRoot() {
  return join(dirname(fileURLToPath(import.meta.url)), '..', '..');
}

function tryParse(text) {
  try { return JSON.parse(text); } catch { return null; }
}

function stderrMessage(stderr, fallback) {
  const lines = (stderr || '').trim().split('\n').filter(Boolean);
  const parsed = lines.length ? tryParse(lines[lines.length - 1]) : null;
  if (parsed?.error?.message) return parsed.error.message;
  return lines.length ? lines[lines.length - 1] : fallback;
}

function mapExit(verb, code, stdout, stderr) {
  const out = tryParse((stdout || '').trim());
  if (code === 0) {
    return { status: 200, body: out ?? { ok: true, output: (stdout || '').trim() } };
  }
  if (code === 1) {
    return {
      status: 500,
      body: {
        error: {
          code: 'devflow_fail',
          message: stderrMessage(stderr, `devflow ${verb} failed`),
          ...(out ? { details: out } : {}),
        },
      },
    };
  }
  return {
    status: 503,
    body: {
      error: {
        code: 'devflow_env',
        message: stderrMessage(stderr, `devflow ${verb} environment error`),
        ...(out ? { details: out } : {}),
      },
    },
  };
}

/**
 * Spawnt `python3 -m devflow <verb>` (Repo-Root, PYTHONPATH=scripts) und
 * uebergibt {worktree, scope, ...extra} als JSON auf stdin. `extra` traegt
 * verb-spezifische Felder (z. B. sandbox action/ticket) — ohne sie koennte
 * die sandbox-Route nur worktree/scope uebergeben.
 *
 * @returns {Promise<{status:number, body:object}>}
 */
export function runDevflow({ verb, worktree = '.', scope = 'changed', timeoutMs = DEVFLOW_TIMEOUT_MS, extra = {} }) {
  const root = repoRoot();
  const input = JSON.stringify({ worktree, scope, ...extra });
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn('python3', ['-m', 'devflow', verb], {
        cwd: root,
        env: { ...process.env, PYTHONPATH: join(root, 'scripts') },
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (err) {
      return resolve({ status: 503, body: { error: { code: 'devflow_unreachable', message: err.message } } });
    }
    let stdout = '';
    let stderr = '';
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      child.kill('SIGKILL');
      resolve({ status: 503, body: { error: { code: 'devflow_unreachable', message: `devflow ${verb}: no answer within ${timeoutMs}ms` } } });
    }, timeoutMs);
    if (typeof timer.unref === 'function') timer.unref();
    child.on('error', (err) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve({ status: 503, body: { error: { code: 'devflow_unreachable', message: err.message } } });
    });
    child.stdout.on('data', (c) => { stdout += c; });
    child.stderr.on('data', (c) => { stderr += c; });
    child.on('close', (code) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(mapExit(verb, code, stdout, stderr));
    });
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}

/**
 * Routen-Handler mit injizierten Helfern, damit das Modul den Server nicht
 * importiert (reines Modul, keine Importzyklen).
 */
export async function handleDevflow(req, res, path, { readBody, sendJson }) {
  const verb = verbForPath(path);
  if (!verb) {
    return sendJson(res, 404, { error: { code: 'devflow_unknown_verb', message: `unknown devflow verb path: ${path}` } });
  }
  let body;
  try {
    body = await readBody(req);
  } catch (err) {
    return sendJson(res, 400, { error: { code: 'devflow_bad_request', message: `invalid JSON body: ${err.message}` } });
  }
  const { worktree = '.', scope = 'changed', ...extra } = body ?? {};
  try {
    const { status, body: out } = await runDevflow({ verb, worktree, scope, extra });
    return sendJson(res, status, out);
  } catch (err) {
    return sendJson(res, 503, { error: { code: 'devflow_unreachable', message: err.message } });
  }
}

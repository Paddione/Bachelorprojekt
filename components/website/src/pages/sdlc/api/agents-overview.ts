import type { APIRoute } from 'astro';
import { execFile } from 'node:child_process/promises';
import { existsSync, promises as fsp } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSession, isAdmin } from '../../../lib/auth';
import {
  createCachedCollect,
  findRepoRoot,
  type AgentsOverviewDeps,
} from '../../../lib/sdlc/agents-overview';

// agents-overview.ts — Agents-Übersicht für das Leitstand-Deck (T016600).
// Admin-Route über dotfiles `~/scripts/agents-overview.py --json` plus
// agent-lock-Claims. Serverseitiger 25-s-Cache: das Deck pollt alle 30 s,
// teure Sammelrunden laufen dadurch höchstens alle 25 s — egal wie viele
// Panels offen sind. Timeout je Quelle 20 s; keine Secrets im Payload.

export const prerender = false;

const CACHE_TTL_MS = 25_000;
const SCRIPT_TIMEOUT_MS = 20_000;

const cached = createCachedCollect(CACHE_TTL_MS);

interface ExecFailure {
  killed?: boolean;
  code?: unknown;
  stdout?: unknown;
  stderr?: unknown;
}

async function runCmd(
  cmd: string,
  args: string[],
  opts: { cwd?: string; timeoutMs: number },
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await execFile(cmd, args, {
      cwd: opts.cwd,
      timeout: opts.timeoutMs,
      maxBuffer: 1 << 20,
    });
    return { code: 0, stdout: String(stdout ?? ''), stderr: String(stderr ?? '') };
  } catch (err) {
    const failure = err as ExecFailure;
    if (failure?.killed) {
      return { code: null, stdout: String(failure.stdout ?? ''), stderr: `timeout nach ${opts.timeoutMs} ms` };
    }
    return {
      code: typeof failure?.code === 'number' ? failure.code : 1,
      stdout: String(failure?.stdout ?? ''),
      stderr: String(failure?.stderr ?? ''),
    };
  }
}

async function realDeps(): Promise<AgentsOverviewDeps | { error: string }> {
  const here = dirname(fileURLToPath(import.meta.url));
  const root = findRepoRoot(here, existsSync);
  if (!root) return { error: 'Repo-Root mit scripts/agent-lock.sh nicht gefunden' };
  // AGENTS_OVERVIEW_SCRIPT: expliziter Pfad (Tests, Sonder-Setups);
  // Standard ist das dotfiles-Skript im Home des Server-Users.
  const script = process.env.AGENTS_OVERVIEW_SCRIPT?.trim()
    || join(homedir(), 'scripts', 'agents-overview.py');
  if (!existsSync(script)) return { error: `agents-overview.py fehlt unter ${script}` };
  // Lock-Verzeichnis über git-common-dir (worktree-fest), Fallback .git.
  let lockDir = join(root, '.git', 'agent-locks');
  try {
    const { stdout } = await execFile('git', ['-C', root, 'rev-parse', '--git-common-dir'], { timeout: 5_000 });
    lockDir = join(resolve(root, String(stdout).trim()), 'agent-locks');
  } catch {
    // Fallback bleibt lockDir.
  }
  const resolvedLockDir = lockDir;
  return {
    runAgentsScript: () => runCmd('python3', [script, '--json'], { timeoutMs: SCRIPT_TIMEOUT_MS }),
    listLocks: async () => {
      const res = await runCmd('bash', ['scripts/agent-lock.sh', 'list'], { cwd: root, timeoutMs: SCRIPT_TIMEOUT_MS });
      return res.stdout;
    },
    readLockFile: async (file: string) => {
      if (!/^[A-Za-z0-9_.-]+$/.test(file)) return null;
      try {
        return await fsp.readFile(join(resolvedLockDir, `${file}.json`), 'utf8');
      } catch {
        return null;
      }
    },
  };
}

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response('Unauthorized', { status: 401 });
  }
  const deps = await realDeps();
  if ('error' in deps) {
    return new Response(JSON.stringify({ error: deps.error }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
  const { body, hit } = await cached.get(deps, Date.now());
  return new Response(JSON.stringify({ fetchedAt: new Date().toISOString(), cacheHit: hit, ...body }), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
    },
  });
};

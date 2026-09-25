#!/usr/bin/env node
// scripts/glimmer-worker-mcp/server.mjs — Glimmer als Arbeitermodell fuer Muse Code (T900373).
//
// Muse Code (Meta) kann llama-server nicht als Provider nutzen (proprietaeres
// Stream-/Tool-Format, siehe openspec design glimmer-worker-mcp). Dieser Server
// bietet Glimmer stattdessen als MCP-Werkzeug an: ein Job fuehrt opencode mit
// dem Agenten glimmer-primary im Ziel-Repo aus (gleiches Modell, gleiche
// Tool-Schleife). Streamable HTTP auf 127.0.0.1, Bearer, Node-stdlib only —
// Aufbau wie scripts/factory-mcp-node/server.mjs.

import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import {
  allowedBrowserOrigins,
  requireToken,
  guardRequest,
  corsHeadersFor,
  writeSecurityError,
} from '../lib/mcp-http-security.mjs';
import { toWslPath, isGitWorkTree, JobQueue, jobView } from './lib.mjs';

const SERVER_NAME = 'glimmer-worker-mcp';
const SERVER_VERSION = '1.0.0';
const CODE_PARSE = -32700;

const env = (k, d) => process.env[k] || d;
const PORT = Number(env('GLIMMER_WORKER_MCP_PORT', '13007'));
const OPENCODE = env('GLIMMER_WORKER_OPENCODE', `${homedir()}/.opencode/bin/opencode`);
const AGENT = env('GLIMMER_WORKER_AGENT', 'glimmer-primary');
const LLAMA = env('GLIMMER_WORKER_LLAMA_URL', 'http://127.0.0.1:1919').replace(/\/+$/, '');
// Untergrenze fuer timeout_s. Default 60; nur Tests setzen sie niedriger.
const TIMEOUT_FLOOR_S = Math.max(1, Number(env('GLIMMER_WORKER_TIMEOUT_FLOOR_S', '60')));
const TOKEN = requireToken('GLIMMER_WORKER_MCP_TOKEN');
const ORIGINS = allowedBrowserOrigins();

// ---------------------------------------------------------------------------
// Runner: ein Job = ein opencode-Lauf im Ziel-Repo (D2, D5)
// ---------------------------------------------------------------------------

function runOpencode(job) {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    // Eigene Prozessgruppe (detached): beim Timeout wird die GANZE Gruppe beendet,
    // also auch Shell-Tools, die opencode gestartet hat — sonst liefen sie nach
    // dem 'timeout' weiter und veraenderten das Repo neben dem naechsten Job.
    const child = spawn(OPENCODE, ['run', '--agent', AGENT, '--dir', job.cwd, job.task], {
      cwd: job.cwd,
      env: { ...process.env, NO_COLOR: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
    });
    const killGroup = (sig) => {
      try { process.kill(-child.pid, sig); } catch { try { child.kill(sig); } catch { /* bereits beendet */ } }
    };
    const cap = (s, chunk) => (s + chunk).slice(-200_000);
    child.stdout.on('data', (c) => { stdout = cap(stdout, c); });
    child.stderr.on('data', (c) => { stderr = cap(stderr, c); });
    const timer = setTimeout(() => {
      timedOut = true;
      killGroup('SIGTERM');
      setTimeout(() => killGroup('SIGKILL'), 10_000).unref();
    }, job.timeoutS * 1000);
    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ code: -1, stdout, stderr: stderr + `\nspawn ${OPENCODE}: ${err.message}`, timedOut });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      console.error(`[${SERVER_NAME}] job ${job.id} ended code=${code} timedOut=${timedOut}`);
      resolve({ code: code ?? -1, stdout, stderr, timedOut });
    });
    console.error(`[${SERVER_NAME}] job ${job.id} started in ${job.cwd}`);
  });
}

const queue = new JobQueue(runOpencode);

// ---------------------------------------------------------------------------
// Tools (D4, D8)
// ---------------------------------------------------------------------------

const TOOLS = [
  {
    name: 'glimmer_worker_start',
    description:
      'Delegate a self-contained coding task (clear goal, files to touch, acceptance check) to the local ' +
      'Muse Glimmer 30B worker on this machine (distilled from Muse Spark; runs with its own file and shell ' +
      'tools inside the given Git repository). Returns a job_id immediately; poll glimmer_worker_result. ' +
      'Jobs run one at a time. Review the returned git_status/diff before accepting the change. ' +
      'cwd may be a WSL path or a Windows path (C:\\... or \\\\wsl.localhost\\<distro>\\...).',
    inputSchema: {
      type: 'object',
      properties: {
        task: { type: 'string', description: 'Complete, self-contained instructions for the worker.' },
        cwd: { type: 'string', description: 'Directory inside a Git working tree the worker operates in.' },
        timeout_s: { type: 'integer', minimum: 60, maximum: 3600, description: 'Job time limit (default 900).' },
      },
      required: ['task', 'cwd'],
    },
  },
  {
    name: 'glimmer_worker_result',
    description:
      'Wait up to wait_s seconds (max 55) for a glimmer_worker job and return its state. Once the job has ' +
      'ended: status done|failed|timeout, exit_code, summary (tail of the worker output), git_status and ' +
      'diff_stat of the target repository. Call again while status is queued or running.',
    inputSchema: {
      type: 'object',
      properties: {
        job_id: { type: 'string' },
        wait_s: { type: 'integer', minimum: 0, maximum: 55, description: 'Long-poll seconds (default 50).' },
      },
      required: ['job_id'],
    },
  },
  {
    name: 'glimmer_worker_status',
    description: 'Health of the local Glimmer server (:1919) and the worker queue.',
    inputSchema: { type: 'object', properties: {} },
  },
];

const text = (obj, isError = false) => ({
  content: [{ type: 'text', text: typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2) }],
  ...(isError ? { isError: true } : {}),
});

async function fetchJSON(url) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(3000) });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

async function callTool(name, args) {
  switch (name) {
    case 'glimmer_worker_start': {
      const task = String(args.task || '').trim();
      if (!task) return text('task is required', true);
      const cwd = toWslPath(args.cwd);
      if (!cwd || !existsSync(cwd) || !statSync(cwd).isDirectory()) {
        return text(`cwd does not exist in WSL: ${cwd}`, true);
      }
      if (!isGitWorkTree(cwd)) return text(`cwd is not inside a Git working tree: ${cwd}`, true);
      const t = Number.isInteger(args.timeout_s) ? args.timeout_s : 900;
      const timeoutS = Math.min(3600, Math.max(TIMEOUT_FLOOR_S, t));
      const { id, position } = queue.enqueue({ task, cwd, timeoutS });
      return text({ job_id: id, position, cwd, timeout_s: timeoutS });
    }
    case 'glimmer_worker_result': {
      const job = queue.get(String(args.job_id || ''));
      if (!job) return text(`unknown job_id: ${args.job_id}`, true);
      const w = Number.isInteger(args.wait_s) ? args.wait_s : 50;
      const done = await queue.waitFor(job.id, Math.min(55, Math.max(0, w)) * 1000);
      return text(jobView(done, queue));
    }
    case 'glimmer_worker_status': {
      const health = await fetchJSON(`${LLAMA}/health`);
      const models = health ? await fetchJSON(`${LLAMA}/v1/models`) : null;
      const props = health ? await fetchJSON(`${LLAMA}/props`) : null;
      return text({
        llama: {
          ok: health?.status === 'ok',
          url: LLAMA,
          model: models?.data?.[0]?.id ?? null,
          n_ctx: props?.default_generation_settings?.n_ctx ?? null,
        },
        ...queue.snapshot(),
        agent: AGENT,
      });
    }
    default:
      return text(`unknown tool: ${name}`, true);
  }
}

// ---------------------------------------------------------------------------
// HTTP / JSON-RPC (Muster: factory-mcp-node)
// ---------------------------------------------------------------------------

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) reject(new Error('payload too large'));
    });
    req.on('end', () => resolve(raw));
    req.on('error', reject);
  });
}

function applyCORS(res, req) {
  const origin = req?.headers?.origin;
  const valid = origin && ORIGINS.has(String(origin)) ? String(origin) : undefined;
  for (const [k, v] of Object.entries(corsHeadersFor(valid, ORIGINS))) res.setHeader(k, v);
}

const server = createServer(async (req, res) => {
  applyCORS(res, req);

  if (req.method === 'OPTIONS') {
    const r = guardRequest(req, { token: TOKEN, allowedOrigins: ORIGINS, requireAuth: false });
    if (!r.ok) return writeSecurityError(res, r.status, r.message);
    res.writeHead(204).end();
    return;
  }

  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, server: SERVER_NAME }));
    return;
  }

  if (req.url === '/mcp' && req.method === 'GET') {
    res.writeHead(405, { Allow: 'POST', 'Content-Type': 'text/plain' });
    res.end('Method Not Allowed');
    return;
  }

  if (req.url === '/mcp' && req.method === 'POST') {
    // Fail-closed VOR dem Body-Lesen: Host, Origin, Bearer.
    const g = guardRequest(req, { token: TOKEN, allowedOrigins: ORIGINS });
    if (!g.ok) return writeSecurityError(res, g.status, g.message);

    let reqObj;
    try {
      reqObj = JSON.parse(await readBody(req));
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: CODE_PARSE, message: String(err.message || err) } }));
      return;
    }
    // id=0 ist ein gueltiger Request; nur undefined/null ist eine Notification.
    if (reqObj?.id === undefined || reqObj.id === null) {
      res.writeHead(204).end();
      return;
    }

    const { id, method, params } = reqObj;
    let result;
    try {
      switch (method) {
        case 'initialize':
          result = {
            protocolVersion: '2024-11-05',
            serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
            capabilities: { tools: {} },
          };
          break;
        case 'ping':
          result = {};
          break;
        case 'tools/list':
          result = { tools: TOOLS };
          break;
        case 'tools/call':
          result = await callTool(params?.name, params?.arguments || {});
          break;
        default:
          result = text(`method not found: ${method}`, true);
      }
    } catch (err) {
      result = text('internal error: ' + (err?.message || err), true);
    }

    const payload = JSON.stringify({ jsonrpc: '2.0', id, result });
    if (String(req.headers.accept || '').includes('text/event-stream')) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Mcp-Session-Id': `glimmer-worker-${process.pid}`,
      });
      res.write(`event: message\ndata: ${payload}\n\n`);
      res.end();
    } else {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(payload);
    }
    return;
  }

  res.writeHead(404).end();
});

server.listen(PORT, '127.0.0.1', () => {
  console.error(`${SERVER_NAME} listening on 127.0.0.1:${PORT} (agent ${AGENT}, llama ${LLAMA})`);
});

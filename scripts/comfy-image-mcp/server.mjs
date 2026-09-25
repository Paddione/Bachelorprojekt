#!/usr/bin/env node
// scripts/comfy-image-mcp/server.mjs — lokale Bildgenerierung als MCP-Werkzeug fuer Muse Code (T900379).
//
// ComfyUI (Qwen-Image 2.1, RTX 3060 Ti) laeuft nur bei Bedarf: der erste Job startet die
// User-Unit comfyui, nach COMFY_IMAGE_IDLE_MIN Minuten ohne Job stoppt der Server sie wieder.
// Bilder landen nur in Git-Arbeitsbaeumen; optional freigestellt und verpixelt (postprocess.py).
// Streamable HTTP auf 127.0.0.1, Bearer, Node-stdlib only — Aufbau wie glimmer-worker-mcp.

import { createServer } from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  allowedBrowserOrigins,
  requireToken,
  guardRequest,
  corsHeadersFor,
  writeSecurityError,
} from '../lib/mcp-http-security.mjs';
import {
  validateArgs,
  checkOutPath,
  assertTemplate,
  buildPrompt,
  ImageQueue,
  jobView,
  postprocessArgs,
  needsPostprocess,
} from './lib.mjs';
import { createClient } from './comfy-client.mjs';

const SERVER_NAME = 'comfy-image-mcp';
const SERVER_VERSION = '1.0.0';
const CODE_PARSE = -32700;
const HERE = dirname(fileURLToPath(import.meta.url));

const env = (k, d) => process.env[k] || d;
const PORT = Number(env('COMFY_IMAGE_MCP_PORT', '13008'));
const COMFY_URL = env('COMFY_IMAGE_URL', 'http://127.0.0.1:8189');
const PYTHON = env('COMFY_IMAGE_PYTHON', `${homedir()}/ComfyUI/.venv/bin/python`);
const IDLE_MS = process.env.COMFY_IMAGE_IDLE_S
  ? Number(process.env.COMFY_IMAGE_IDLE_S) * 1000
  : Number(env('COMFY_IMAGE_IDLE_MIN', '15')) * 60_000;
const TIMEOUT_FLOOR_S = Math.max(1, Number(env('COMFY_IMAGE_TIMEOUT_FLOOR_S', '60')));
const TEMPLATE = JSON.parse(readFileSync(env('COMFY_IMAGE_WORKFLOW', join(HERE, 'workflow.json')), 'utf8'));
assertTemplate(TEMPLATE);
const TOKEN = requireToken('COMFY_IMAGE_MCP_TOKEN');
const ORIGINS = allowedBrowserOrigins();

const client = createClient({
  url: COMFY_URL,
  systemctl: env('COMFY_IMAGE_SYSTEMCTL', 'systemctl'),
  startTimeoutS: Number(env('COMFY_IMAGE_START_TIMEOUT_S', '180')),
});

// ---------------------------------------------------------------------------
// Runner: ein Job = ein Bild (D4, D6)
// ---------------------------------------------------------------------------

// Schreibt in eine Temp-Datei; runJob benennt sie erst nach Erfolg um (kein halbes PNG an out_path).
function postprocess(p, tmpOut, deadline) {
  const args = [join(HERE, 'postprocess.py'), ...postprocessArgs(p, p.rawPath, tmpOut)];
  return new Promise((resolve, reject) => {
    const child = spawn(PYTHON, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let err = '';
    child.stderr.on('data', (c) => { err = (err + c).slice(-4000); });
    let killed = false;
    const timer = setTimeout(() => { killed = true; child.kill('SIGKILL'); }, Math.max(1000, deadline - Date.now()));
    child.on('error', (e) => { clearTimeout(timer); reject(new Error(`spawn ${PYTHON}: ${e.message}`)); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) return resolve();
      const e = new Error(killed ? 'postprocess.py hit the job deadline' : `postprocess.py exit ${code}: ${err.trim()}`);
      e.timeout = killed;
      reject(e);
    });
  });
}

// Schreibt data nach dest; ohne overwrite schlaegt das fehl, falls dest inzwischen existiert
// (die Pruefung beim Einreihen liegt Minuten zurueck).
function writeNew(dest, data, overwrite) {
  writeFileSync(dest, data, { flag: overwrite ? 'w' : 'wx' });
}

async function runJob(job) {
  const p = job.params;
  const t = (job.timings = {});
  let mark = Date.now();
  const lap = (k) => { const n = Date.now(); t[k] = Math.round((n - mark) / 100) / 10; mark = n; };

  await client.ensureUp();
  lap('start_s');
  // Frist erst ab hier: ein Kaltstart von ComfyUI soll das Generierungsbudget nicht aufbrauchen.
  const deadline = Date.now() + p.timeoutS * 1000;
  const promptId = await client.submit(buildPrompt(TEMPLATE, p));
  const ref = await client.waitHistory(promptId, deadline);
  if (!ref) {
    await client.interrupt(promptId);
    job.error = `timeout after ${p.timeoutS}s`;
    return { status: 'timeout' };
  }
  const png = await client.fetchImage(ref);
  lap('generate_s');

  const needsPost = needsPostprocess(p);
  if (!needsPost) {
    writeNew(p.outPath, png, p.overwrite);
  } else {
    writeNew(p.rawPath, png, p.overwrite);
    job.rawWritten = true;
    const tmpOut = `${p.outPath}.${job.id}.tmp`;
    try {
      await postprocess(p, tmpOut, deadline);
      if (!p.overwrite && existsSync(p.outPath)) throw new Error(`file appeared meanwhile, not replaced: ${p.outPath}`);
      renameSync(tmpOut, p.outPath);
    } catch (err) {
      rmSync(tmpOut, { force: true });
      if (err.timeout) {
        job.error = err.message;
        return { status: 'timeout' };
      }
      throw err;
    }
    lap('postprocess_s');
  }
  const gs = spawnSync('git', ['-C', dirname(p.outPath), 'status', '--porcelain', '--', p.outPath], { encoding: 'utf8' });
  job.gitStatus = String(gs.stdout || '').trimEnd();
  return { status: 'done' };
}

const queue = new ImageQueue(runJob, {
  idleMs: IDLE_MS,
  onIdle: () => {
    const r = client.stop();
    console.error(`[${SERVER_NAME}] idle — stopped comfyui (${r.ok ? 'ok' : r.out})`);
  },
});

// ---------------------------------------------------------------------------
// Tools (D2)
// ---------------------------------------------------------------------------

const TOOLS = [
  {
    name: 'image_generate',
    description:
      'Generate an image with the local Qwen-Image 2.1 model (ComfyUI on this machine) and write it as PNG to ' +
      'out_path, which must lie inside a Git working tree (WSL or Windows path). Good for game key art, ' +
      'backgrounds/parallax layers, card illustrations, portraits, single item icons and images with legible ' +
      'text (logos, signs, title screens). Consistent sprite sheets, animation frames or the same character ' +
      'across several images do NOT work reliably. transparent:true removes the background (for sprites); ' +
      'transparent images are trimmed to the subject by default (trim:false keeps the canvas); ' +
      'pixelate {size, colors, scale} turns the result into pixel art with a hard alpha. One 768x768 image ' +
      'takes about 2 minutes (plus ~1 minute if ComfyUI has to start). Returns a job_id immediately; poll ' +
      'image_result. Reuse the reported seed to reproduce an image.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'What to draw; describe style, subject, framing.' },
        out_path: { type: 'string', description: 'Target .png file inside a Git working tree.' },
        width: { type: 'integer', minimum: 256, maximum: 1536, description: 'Multiple of 16 (default 768).' },
        height: { type: 'integer', minimum: 256, maximum: 1536, description: 'Multiple of 16 (default 768).' },
        seed: { type: 'integer', minimum: 0, description: 'Fixed seed for reproducible output.' },
        steps: { type: 'integer', minimum: 1, maximum: 60, description: 'Sampling steps (default 25).' },
        negative_prompt: { type: 'string' },
        transparent: { type: 'boolean', description: 'Cut out the subject (RGBA). Keeps <name>.raw.png.' },
        trim: {
          type: 'boolean',
          description: 'Crop to the subject plus a small transparent margin before pixelate (default: same as transparent).',
        },
        pixelate: {
          type: 'object',
          description: 'Pixel-art post-processing. Keeps <name>.raw.png.',
          properties: {
            size: { type: 'integer', minimum: 8, maximum: 512, description: 'Longer side in pixels.' },
            colors: { type: 'integer', minimum: 2, maximum: 256, description: 'Palette size (default 16).' },
            scale: { type: 'integer', minimum: 1, maximum: 16, description: 'Nearest-neighbour upscale (default 1).' },
          },
          required: ['size'],
        },
        overwrite: { type: 'boolean', description: 'Replace an existing file at out_path.' },
        timeout_s: { type: 'integer', minimum: 60, maximum: 1800, description: 'Job time limit (default 600).' },
      },
      required: ['prompt', 'out_path'],
    },
  },
  {
    name: 'image_result',
    description:
      'Wait up to wait_s seconds (max 55) for an image job and return its state. Once ended: status ' +
      'done|failed|timeout, out_path, raw_path, seed, size, timings and git_status of the file; error on failure. ' +
      'Call again while status is queued or running.',
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
    name: 'image_status',
    description: 'Whether ComfyUI is running, free VRAM, the job queue and seconds until the idle stop.',
    inputSchema: { type: 'object', properties: {} },
  },
];

const text = (obj, isError = false) => ({
  content: [{ type: 'text', text: typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2) }],
  ...(isError ? { isError: true } : {}),
});

const mb = (bytes) => (Number.isFinite(bytes) ? Math.round(bytes / 1048576) : null);

async function callTool(name, args) {
  switch (name) {
    case 'image_generate': {
      const v = validateArgs(args, { timeoutFloorS: TIMEOUT_FLOOR_S });
      if (v.error) return text(v.error, true);
      const needsRaw = needsPostprocess(v.params);
      const out = checkOutPath(args.out_path, v.params.overwrite, needsRaw);
      if (out.error) return text(out.error, true);
      if (queue.claims(out.path) || (needsRaw && queue.claims(out.rawPath))) {
        return text(`another queued or running job already writes ${out.path}`, true);
      }
      const params = { ...v.params, outPath: out.path, rawPath: out.rawPath };
      const { id, position } = queue.enqueue(params);
      return text({ job_id: id, position, out_path: out.path, seed: params.seed });
    }
    case 'image_result': {
      const job = queue.get(String(args.job_id || ''));
      if (!job) return text(`unknown job_id: ${args.job_id}`, true);
      const w = Number.isInteger(args.wait_s) ? args.wait_s : 50;
      const done = await queue.waitFor(job.id, Math.min(55, Math.max(0, w)) * 1000);
      return text(jobView(done, queue));
    }
    case 'image_status': {
      const s = await client.stats();
      const dev = s?.devices?.[0];
      return text({
        comfy: { ok: Boolean(s), url: COMFY_URL, device: dev?.name ?? null, vram_free_mb: mb(dev?.vram_free), vram_total_mb: mb(dev?.vram_total) },
        ...queue.snapshot(),
        idle_stop_in_s: queue.idleRemainingS(),
      });
    }
    default:
      return text(`unknown tool: ${name}`, true);
  }
}

// ---------------------------------------------------------------------------
// HTTP / JSON-RPC (Muster: glimmer-worker-mcp)
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
      // Details nur ins Server-Log, der Client bekommt eine feste Meldung (CodeQL: stack-trace exposure).
      console.error(`[${SERVER_NAME}] parse error: ${err?.message || err}`);
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: CODE_PARSE, message: 'Parse error' } }));
      return;
    }
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
      console.error(`[${SERVER_NAME}] internal error in ${method}: ${err?.stack || err}`);
      result = text('internal error (details in journalctl --user -u comfy-image-mcp)', true);
    }

    const payload = JSON.stringify({ jsonrpc: '2.0', id, result });
    if (String(req.headers.accept || '').includes('text/event-stream')) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Mcp-Session-Id': `comfy-image-${process.pid}`,
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
  console.error(`${SERVER_NAME} listening on 127.0.0.1:${PORT} (comfy ${COMFY_URL}, idle ${IDLE_MS / 1000}s)`);
});

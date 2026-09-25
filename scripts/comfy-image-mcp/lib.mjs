// scripts/comfy-image-mcp/lib.mjs — reine Logik des Bild-MCP fuer Muse Code (T900379).
//
// Kein HTTP: Argument-Pruefung, out_path-Pruefung (D3), Befuellung der Workflow-Vorlage ueber
// Klassennamen (D5) und eine Job-Queue mit genau einem laufenden Job und Leerlauf-Hook (D4).

import { randomUUID, randomInt } from 'node:crypto';
import { existsSync, statSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { toWslPath, isGitWorkTree } from '../lib/wsl-paths.mjs';

const DONE_RETENTION_MS = 3600 * 1000;
export const TERMINAL = new Set(['done', 'failed', 'timeout']);
export const TRANSPARENT_HINT = ', isolated on a plain white background, centered, no shadow';
const REQUIRED_NODES = ['TextEncodeQwenImage21', 'KSampler', 'EmptyLatentImage', 'SaveImage'];

const isInt = (v) => Number.isInteger(v);
const inRange = (v, lo, hi) => isInt(v) && v >= lo && v <= hi;

// Normalisiert die Tool-Argumente von image_generate. Liefert { params } oder { error }.
export function validateArgs(args, { timeoutFloorS = 60 } = {}) {
  const prompt = String(args.prompt || '').trim();
  if (!prompt) return { error: 'prompt is required' };
  const dim = (v, name) => {
    if (v === undefined) return 768;
    if (!inRange(v, 256, 1536) || v % 16 !== 0) throw new Error(`${name} must be 256..1536 and a multiple of 16`);
    return v;
  };
  try {
    const params = {
      prompt,
      negativePrompt: String(args.negative_prompt || ''),
      width: dim(args.width, 'width'),
      height: dim(args.height, 'height'),
      steps: args.steps === undefined ? 25 : args.steps,
      seed: args.seed === undefined ? randomInt(0, 2 ** 31) : args.seed,
      transparent: args.transparent === true,
      pixelate: null,
      overwrite: args.overwrite === true,
    };
    if (!inRange(params.steps, 1, 60)) throw new Error('steps must be 1..60');
    if (!isInt(params.seed) || params.seed < 0) throw new Error('seed must be a non-negative integer');
    if (args.pixelate !== undefined && args.pixelate !== null) {
      const p = args.pixelate;
      const size = p.size;
      const colors = p.colors === undefined ? 16 : p.colors;
      const scale = p.scale === undefined ? 1 : p.scale;
      if (!inRange(size, 8, 512)) throw new Error('pixelate.size must be 8..512');
      if (!inRange(colors, 2, 256)) throw new Error('pixelate.colors must be 2..256');
      if (!inRange(scale, 1, 16)) throw new Error('pixelate.scale must be 1..16');
      params.pixelate = { size, colors, scale };
    }
    const t = isInt(args.timeout_s) ? args.timeout_s : 600;
    params.timeoutS = Math.min(1800, Math.max(timeoutFloorS, t));
    return { params };
  } catch (err) {
    return { error: err.message };
  }
}

// Prueft out_path (D3). Liefert { path, dir, rawPath } oder { error }.
export function checkOutPath(p, overwrite) {
  const path = toWslPath(p);
  if (!path || !path.startsWith('/')) return { error: `out_path must be absolute: ${p}` };
  if (!/\.png$/i.test(path)) return { error: `out_path must end in .png: ${path}` };
  const dir = dirname(path);
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return { error: `directory does not exist in WSL: ${dir}` };
  if (!isGitWorkTree(dir)) return { error: `out_path is not inside a Git working tree: ${dir}` };
  if (existsSync(path) && !overwrite) return { error: `file exists (pass overwrite: true to replace): ${path}` };
  const rawPath = join(dir, basename(path).replace(/\.png$/i, '.raw.png'));
  return { path, dir, rawPath };
}

function nodeOf(graph, classType) {
  return Object.values(graph).find((n) => n && n.class_type === classType);
}

// Wirft, wenn der Vorlage ein Knoten fehlt, den buildPrompt setzen muss.
export function assertTemplate(template) {
  const missing = REQUIRED_NODES.filter((c) => !nodeOf(template, c));
  if (missing.length) throw new Error(`workflow template lacks node(s): ${missing.join(', ')}`);
}

// Tiefe Kopie der Vorlage mit den Job-Parametern (D5).
export function buildPrompt(template, params) {
  assertTemplate(template);
  const g = structuredClone(template);
  const enc = nodeOf(g, 'TextEncodeQwenImage21').inputs;
  enc.prompt = params.prompt + (params.transparent ? TRANSPARENT_HINT : '');
  enc.negative_prompt = params.negativePrompt;
  const ks = nodeOf(g, 'KSampler').inputs;
  ks.seed = params.seed;
  ks.steps = params.steps;
  const lat = nodeOf(g, 'EmptyLatentImage').inputs;
  lat.width = params.width;
  lat.height = params.height;
  nodeOf(g, 'SaveImage').inputs.filename_prefix = 'comfy-image-mcp';
  return g;
}

// FIFO-Queue mit genau einem laufenden Job. runner(job) setzt Felder am Job und
// liefert { status } ('done'|'failed'|'timeout'). onIdle() laeuft, wenn die Queue
// idleMs lang leer war.
export class ImageQueue {
  constructor(runner, { idleMs, onIdle, now = () => Date.now() }) {
    Object.assign(this, { runner, idleMs, onIdle, now });
    this.jobs = new Map();
    this.queue = [];
    this.running = null;
    this.waiters = new Map();
    this.idleTimer = null;
    this.idleAt = null;
  }

  enqueue(params) {
    this.#reap();
    this.#cancelIdle();
    const id = randomUUID();
    this.jobs.set(id, { id, params, status: 'queued', createdAt: this.now() });
    this.queue.push(id);
    this.#pump();
    return { id, position: this.position(id) };
  }

  get(id) {
    return this.jobs.get(id);
  }

  position(id) {
    const i = this.queue.indexOf(id);
    return i < 0 ? 0 : i + (this.running ? 1 : 0);
  }

  snapshot() {
    return { running: this.running, queued: this.queue.length };
  }

  idleRemainingS() {
    return this.idleAt ? Math.max(0, Math.round((this.idleAt - this.now()) / 1000)) : null;
  }

  waitFor(id, ms) {
    const job = this.jobs.get(id);
    if (!job || TERMINAL.has(job.status) || ms <= 0) return Promise.resolve(job);
    return new Promise((resolve) => {
      const timer = setTimeout(() => done(), ms);
      const done = () => {
        clearTimeout(timer);
        this.waiters.set(id, (this.waiters.get(id) || []).filter((f) => f !== done));
        resolve(this.jobs.get(id));
      };
      this.waiters.set(id, [...(this.waiters.get(id) || []), done]);
    });
  }

  #cancelIdle() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = null;
    this.idleAt = null;
  }

  #armIdle() {
    this.#cancelIdle();
    this.idleAt = this.now() + this.idleMs;
    this.idleTimer = setTimeout(() => {
      this.idleTimer = null;
      this.idleAt = null;
      if (!this.running && this.queue.length === 0) Promise.resolve(this.onIdle()).catch(() => {});
    }, this.idleMs);
    this.idleTimer.unref?.();
  }

  #pump() {
    if (this.running) return;
    if (this.queue.length === 0) return this.#armIdle();
    const id = this.queue.shift();
    const job = this.jobs.get(id);
    this.running = id;
    job.status = 'running';
    job.startedAt = this.now();
    Promise.resolve()
      .then(() => this.runner(job))
      .then(
        (r) => { job.status = r?.status || 'done'; },
        (err) => {
          job.status = 'failed';
          job.error = err && err.message ? err.message : String(err);
        },
      )
      .finally(() => {
        job.endedAt = this.now();
        this.running = null;
        for (const f of this.waiters.get(id) || []) f();
        this.waiters.delete(id);
        this.#pump();
      });
  }

  #reap() {
    const cutoff = this.now() - DONE_RETENTION_MS;
    for (const [id, job] of this.jobs) {
      if (TERMINAL.has(job.status) && job.endedAt < cutoff) this.jobs.delete(id);
    }
  }
}

// Oeffentliche Sicht eines Jobs fuer image_result.
export function jobView(job, queue) {
  if (!job) return { status: 'unknown' };
  const p = job.params;
  return {
    job_id: job.id,
    status: job.status,
    position: job.status === 'queued' ? queue.position(job.id) : 0,
    out_path: p.outPath,
    raw_path: job.rawWritten ? p.rawPath : null,
    seed: p.seed,
    width: p.width,
    height: p.height,
    timings: job.timings || {},
    git_status: job.gitStatus ?? '',
    ...(job.error ? { error: job.error } : {}),
  };
}

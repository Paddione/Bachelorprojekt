/**
 * GPU-Loadout-Steuerung fuer den agent-bench.
 *
 * Verantwortlichkeiten:
 *  - `scripts/gpu-lock.sh` sperren/freigeben (Produktions-Orchestrator anhalten)
 *  - je benoetigter GPU die Belegung stoppen und das Zielmodell starten
 *  - auf `/v1/models` warten (vLLM kompiliert beim ersten Start)
 *  - NVFP4-Kernel-Check (`vllm-kernel-check.py`) und Device-Memory-Spill-Check
 *  - `restoreProduction()` fuer Abbruch/Fehler/Prozessende
 *
 * Alle externen Programme laufen ueber ueberschreibbare Env-Pfade, damit die
 * BATS-Tests Fake-Binaries injizieren koennen:
 *   AGENT_BENCH_SYSTEMCTL, AGENT_BENCH_SYSTEMD_RUN, AGENT_BENCH_NVIDIA_SMI,
 *   AGENT_BENCH_GPU_LOCK, AGENT_BENCH_PYTHON, AGENT_BENCH_KERNEL_LOG
 */

import { execFile, execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const AGENT_BENCH_DIR = resolve(HERE, '..');
const REPO_ROOT = resolve(AGENT_BENCH_DIR, '..', '..', '..');

// Nur systemd-verwaltete Produktionsdienste. Die 4B-Rail (Qwen3-4B-2507 auf
// :8080) ist Windows-nativ (Autostart via register-qwen3-4b-2507-autostart.ps1)
// und hat keine User-Unit — der Bench startet/stoppt sie nicht.
export const PRODUCTION_SERVICES = Object.freeze([
  'qwen38-gsq-iq3xxs.service',
]);

const SYSTEMCTL = process.env.AGENT_BENCH_SYSTEMCTL || 'systemctl';
const SYSTEMD_RUN = process.env.AGENT_BENCH_SYSTEMD_RUN || 'systemd-run';
const NVIDIA_SMI = process.env.AGENT_BENCH_NVIDIA_SMI || 'nvidia-smi';
const PYTHON = process.env.AGENT_BENCH_PYTHON || 'python3';
const DEFAULT_GPU_LOCK = join(REPO_ROOT, 'scripts', 'gpu-lock.sh');
const KERNEL_CHECK = join(AGENT_BENCH_DIR, 'vllm-kernel-check.py');
const SERVE_TIMEOUT_MS = Number(process.env.AGENT_BENCH_SERVE_TIMEOUT_MS || 600_000);
const POLL_INTERVAL_MS = Number(process.env.AGENT_BENCH_POLL_INTERVAL_MS || 2_000);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function gpuLockScript() {
  return process.env.AGENT_BENCH_GPU_LOCK || DEFAULT_GPU_LOCK;
}

async function run(bin, args, opts = {}) {
  const { env = {}, timeout = 30_000 } = opts;
  try {
    const { stdout, stderr } = await execFileAsync(bin, args, {
      timeout,
      maxBuffer: 8 * 1024 * 1024,
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

/* ------------------------------------------------------------------ pool */

/** Liest und validiert `models.json`. */
export function loadPool(path = join(AGENT_BENCH_DIR, 'models.json')) {
  if (!existsSync(path)) throw new Error(`Modell-Pool fehlt: ${path}`);
  const pool = JSON.parse(readFileSync(path, 'utf8'));
  if (!Array.isArray(pool.models) || pool.models.length === 0) {
    throw new Error(`Modell-Pool ohne Modelle: ${path}`);
  }
  const ids = new Set();
  for (const model of pool.models) {
    for (const field of ['id', 'engine', 'gpu']) {
      if (!model || !model[field]) {
        throw new Error(`Modelleintrag ohne '${field}': ${path}`);
      }
    }
    if (ids.has(model.id)) throw new Error(`Doppelte Model-Id im Pool: ${model.id}`);
    ids.add(model.id);
    if (model.engine === 'llamacpp' && !model.service && !model.start) {
      throw new Error(`llamacpp-Modell ${model.id} hat weder service noch start`);
    }
    if (model.engine === 'vllm' && !Array.isArray(model.start)) {
      throw new Error(`vllm-Modell ${model.id} hat kein start-argv`);
    }
    if (model.engine === 'api' && model.enabled) {
      throw new Error(`api-Modell ${model.id} muss enabled=false sein (nur per --models)`);
    }
  }
  return pool;
}

export function modelById(pool, id) {
  const model = pool.models.find((m) => m.id === id);
  if (!model) throw new Error(`Unbekanntes Modell im Pool: ${id}`);
  return model;
}

export function selectModels(pool, { models, roles } = {}) {
  // Explizit via --models benannte Modelle duerfen `enabled: false` sein
  // (das ist der dokumentierte Weg, das Lehrermodell zu aktivieren);
  // rollen- oder profilgesteuerte Laeufe sehen ausschliesslich enabled-Modelle.
  let selected =
    models && models.length
      ? pool.models.filter((m) => models.includes(m.id))
      : pool.models.filter((m) => m.enabled !== false);
  if (roles && roles.length) {
    selected = selected.filter((m) =>
      roles.every((role) => {
        const need = { 'vision-worker': 'vision' }[role];
        return !need || (m.capabilities || []).includes(need);
      }),
    );
  }
  return selected;
}

/** Modelle, die wegen fehlender Capability fuer eine Rolle uebersprungen werden. */
export function skipByCapability(pool, role, ids) {
  const need = { 'vision-worker': 'vision' }[role];
  if (!need) return [];
  return ids.filter((id) => !(modelById(pool, id).capabilities || []).includes(need));
}

/* ------------------------------------------------------------- gpu lock */

export async function acquireGpu({ reason = 'agent-bench', pool } = {}) {
  const requiredMib = String((pool && pool.spill_threshold_mib) || 15900);
  const res = await run('bash', [gpuLockScript(), 'acquire', '--reason', reason], {
    env: { GPU_LOCK_REQUIRED_MIB: requiredMib },
    timeout: 600_000,
  });
  if (!res.ok) {
    return { ok: false, infra: true, reason: `gpu-lock-acquire: ${res.stderr.trim() || res.code}` };
  }
  return { ok: true, required_mib: Number(requiredMib) };
}

export async function releaseGpu() {
  const res = await run('bash', [gpuLockScript(), 'release'], { timeout: 60_000 });
  if (!res.ok) return { ok: false, infra: true, reason: `gpu-lock-release: ${res.stderr.trim()}` };
  return { ok: true };
}

/* ---------------------------------------------------------------- checks */

/** Device-Memory-Check: lehnt ab, wenn die Ziel-GPU ueber der Spill-Grenze liegt. */
export async function checkSpill(pool, gpu) {
  const uuid = (pool.gpu_uuids || {})[gpu] || null;
  const threshold = Number(pool.spill_threshold_mib || 15900);
  const res = await run(NVIDIA_SMI, [
    '--query-gpu=uuid,memory.used',
    '--format=csv,noheader,nounits',
  ]);
  if (!res.ok) {
    return { ok: false, infra: true, reason: `nvidia-smi: ${res.stderr.trim() || res.code}` };
  }
  let rows;
  try {
    rows = res.stdout
      .split('\n')
      .map((line) => line.split(',').map((cell) => cell.trim()))
      .filter((cells) => cells.length === 2 && cells[0]);
  } catch {
    return { ok: false, infra: true, reason: 'nvidia-smi: unparsbare Ausgabe' };
  }
  if (!uuid) return { ok: true, checked: false, threshold_mib: threshold };
  const row = rows.find(([rowUuid]) => rowUuid === uuid);
  if (!row) return { ok: true, checked: false, threshold_mib: threshold };
  const used = Number(row[1]);
  if (!Number.isFinite(used)) {
    return { ok: false, infra: true, reason: 'nvidia-smi: unparsbare memory.used' };
  }
  if (used > threshold) {
    return {
      ok: false,
      infra: true,
      reason: `spill: ${gpu} nutzt ${used} MiB > ${threshold} MiB`,
    };
  }
  return { ok: true, checked: true, used_mib: used, threshold_mib: threshold };
}

/** NVFP4-Kernel-Check gegen das Serverlog; Marlin-Fallback => Ablehnung. */
export async function checkKernel(model, { logPath } = {}) {
  if (model.engine !== 'vllm') return { ok: true, checked: false };
  const log =
    logPath ||
    process.env.AGENT_BENCH_KERNEL_LOG ||
    join(process.env.AGENT_BENCH_RUNS || join(process.env.HOME || '.', 'agent-bench-runs'), `${model.id}-server.log`);
  if (!existsSync(log)) {
    return { ok: false, infra: true, reason: `kernel-check: Serverlog fehlt (${log})` };
  }
  const res = await run(PYTHON, [KERNEL_CHECK, log, '--skip-capability'], { timeout: 60_000 });
  const summary = (res.stdout || res.stderr || '').trim();
  if (!res.ok) {
    return { ok: false, infra: true, reason: `kernel-check abgelehnt: ${summary || res.code}` };
  }
  return { ok: true, checked: true, summary };
}

async function waitForModels(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let last = 'timeout';
  while (Date.now() < deadline) {
    const res = await run('curl', ['-sf', '--max-time', '5', `${url}/v1/models`], { timeout: 15_000 });
    if (res.ok) return { ok: true };
    last = res.stderr.trim() || res.code;
    await sleep(POLL_INTERVAL_MS);
  }
  return { ok: false, infra: true, reason: `endpoint-bereit: ${url} (${last})` };
}

/* ------------------------------------------------------------- loadout */

function expandArgv(model) {
  const home = process.env.HOME || '';
  return (model.start || []).map((arg) =>
    arg.startsWith('%h/') ? join(home, arg.slice(3)) : arg,
  );
}

async function startModel(model) {
  if (model.service) {
    return run(SYSTEMCTL, ['--user', 'start', model.service], { timeout: 300_000 });
  }
  const args = ['--user', `--unit=agent-bench-${model.id}`, '--collect'];
  for (const [key, value] of Object.entries(model.environment || {})) {
    args.push('-p', `Environment=${key}=${value}`);
  }
  args.push(...expandArgv(model));
  return run(SYSTEMD_RUN, args, { timeout: 300_000 });
}

async function stopResident(pool, keepIds) {
  const keep = new Set(keepIds);
  for (const model of pool.models) {
    if (keep.has(model.id)) continue;
    if (model.service) {
      await run(SYSTEMCTL, ['--user', 'stop', model.service], { timeout: 300_000 });
    }
  }
  await run(SYSTEMCTL, ['--user', 'stop', `agent-bench-${keepIds.join('_')}`], { timeout: 30_000 });
  const listed = await run(SYSTEMCTL, ['--user', 'list-units', '--all', '--plain', '--no-legend', 'agent-bench-*'], {
    timeout: 30_000,
  });
  for (const line of listed.stdout.split('\n')) {
    const unit = line.trim().split(/\s+/)[0];
    if (unit) await run(SYSTEMCTL, ['--user', 'stop', unit], { timeout: 60_000 });
  }
}

/**
 * Baut das Loadout fuer die gewuenschten Modelle auf.
 * Rueckgabe: `{ ok, infra, reason, endpoints }` — `infra:true` bedeutet
 * Umgebungsfehler, der NICHT gegen das Modell gewertet wird.
 */
export async function ensureLoadout(modelIds, pool, { reason = 'agent-bench' } = {}) {
  const ids = modelIds.filter((id) => {
    const model = modelById(pool, id);
    return model.enabled !== false || model.engine === 'api';
  });
  if (ids.length === 0) return { ok: false, infra: true, reason: 'keine Modelle ausgewaehlt' };

  const gpus = new Set(ids.map((id) => modelById(pool, id).gpu).filter((g) => g !== 'remote'));
  if (gpus.size > 1) {
    return { ok: false, infra: true, reason: `mehrere GPUs gleichzeitig noetig: ${[...gpus].join(', ')}` };
  }

  const lock = await acquireGpu({ reason, pool });
  if (!lock.ok) return lock;

  const gpu = [...gpus][0];
  if (gpu) {
    const spill = await checkSpill(pool, gpu);
    if (!spill.ok) {
      await releaseGpu();
      return spill;
    }
  }

  await stopResident(pool, ids);
  const endpoints = {};
  for (const id of ids) {
    const model = modelById(pool, id);
    if (model.engine === 'api') {
      const url = process.env[model.endpoint_env] || '';
      if (!url) {
        await restoreProduction(pool);
        return { ok: false, infra: true, reason: `${id}: ${model.endpoint_env} nicht gesetzt` };
      }
      endpoints[id] = url;
      continue;
    }
    const started = await startModel(model);
    if (!started.ok) {
      await restoreProduction(pool);
      return {
        ok: false,
        infra: true,
        reason: `start ${id}: ${started.stderr.trim() || started.code}`,
      };
    }
    const url = `http://127.0.0.1:${model.port}`;
    const ready = await waitForModels(url, SERVE_TIMEOUT_MS);
    if (!ready.ok) {
      await restoreProduction(pool);
      return { ok: false, infra: true, reason: `${id}: ${ready.reason}` };
    }
    const kernel = await checkKernel(model);
    if (!kernel.ok) {
      await restoreProduction(pool);
      return kernel;
    }
    endpoints[id] = url;
  }
  return { ok: true, infra: false, endpoints, gpu: gpu || 'remote' };
}

/** Stoppt alle Bench-Units, startet die Produktionsdienste und gibt den Lock frei. */
export async function restoreProduction(pool) {
  const services = (pool && pool.production_services) || PRODUCTION_SERVICES;
  const listed = await run(SYSTEMCTL, ['--user', 'list-units', '--all', '--plain', '--no-legend', 'agent-bench-*'], {
    timeout: 30_000,
  });
  for (const line of listed.stdout.split('\n')) {
    const unit = line.trim().split(/\s+/)[0];
    if (unit) await run(SYSTEMCTL, ['--user', 'stop', unit], { timeout: 60_000 });
  }
  for (const service of services) {
    await run(SYSTEMCTL, ['--user', 'start', service], { timeout: 300_000 });
  }
  for (const service of services) {
    const port = { 'qwen38-gsq-iq3xxs.service': 1919, 'qwen38-gsq-iq2s.service': 1919 }[service];
    if (port) await waitForModels(`http://127.0.0.1:${port}`, 120_000);
  }
  const released = await releaseGpu();
  return { ok: released.ok, restored: services, release: released };
}

/**
 * Registriert `restore` fuer SIGINT/SIGTERM/uncaughtException/Prozessende.
 * `AGENT_BENCH_RESTORE_NO_EXIT=1` verhindert das anschliessende Beenden (Tests).
 */
export function installRestoreHooks(restore, { syncRestore } = {}) {
  const target = process;
  let done = false;
  // Das Restore ist asynchron (systemctl-Aufrufe): wer hier nicht wartet,
  // beendet den Prozess vor dem ersten `start` — der Produktionsdienst
  // kaeme nach einem Abbruch nicht zurueck. Deshalb wartet bail() ab.
  const onceAsync = () => {
    if (done) return Promise.resolve();
    done = true;
    try {
      return Promise.resolve(restore()).catch(() => {});
    } catch {
      /* Restore ist best-effort, der Abbruch laeuft weiter. */
      return Promise.resolve();
    }
  };
  const bail = (code) => () => {
    onceAsync().finally(() => {
      if (process.env.AGENT_BENCH_RESTORE_NO_EXIT === '1') return;
      process.exit(code);
    });
  };
  target.on('SIGINT', bail(130));
  target.on('SIGTERM', bail(143));
  target.on('uncaughtException', bail(1));
  if (syncRestore) {
    target.on('exit', () => {
      if (done) return;
      try {
        syncRestore();
      } catch {
        /* best-effort */
      }
    });
  }
  return onceAsync;
}

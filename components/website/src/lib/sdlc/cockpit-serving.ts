// Read helpers for the GPU/vLLM serving strip in the SDLC cockpit.
// Scrapes vLLM /metrics exposition endpoints (Prometheus text format)
// server-side — browsers never touch the inference ports directly.
// Unreachable endpoints yield ok:false instead of failing the snapshot.
// nvidia-smi is best-effort (absent on hosts without NVIDIA GPUs).
import { execFile } from 'node:child_process';

export interface ServingEndpoint {
  url: string;
  ok: boolean;
  model: string;
  /** Scheduler gauges at scrape time. */
  running: number;
  waiting: number;
  swapped: number;
  /** KV-cache fill factor 0..1. */
  kvCache: number;
}

export interface ServingGpu {
  index: string;
  name: string;
  usedMiB: number;
  totalMiB: number;
  utilPct: number;
}

export interface ServingSnapshot {
  endpoints: ServingEndpoint[];
  gpus: ServingGpu[];
  fetchedAt: string;
}

const WANT = new Set([
  'vllm:num_requests_running',
  'vllm:num_requests_waiting',
  'vllm:num_requests_swapped',
  'vllm:kv_cache_usage_perc',
]);

export interface ExpoSeries {
  name: string;
  labels: Record<string, string>;
  value: number;
}

/** Parse Prometheus exposition text into wanted series (ignores HELP/TYPE/comments). */
export function parseExposition(text: string): ExpoSeries[] {
  const out: ExpoSeries[] = [];
  for (const line of text.split('\n')) {
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^([a-zA-Z_:][a-zA-Z0-9_:]*)\{([^}]*)\}\s+([0-9.eE+-]+|NaN|\+Inf|-Inf)/);
    if (!m) continue;
    const [, name, labelStr, raw] = m;
    if (!WANT.has(name)) continue;
    const labels: Record<string, string> = {};
    for (const kv of labelStr.matchAll(/([a-zA-Z_][a-zA-Z0-9_]*)="((?:[^"\\]|\\.)*)"/g)) {
      labels[kv[1]] = kv[2];
    }
    const value = Number(raw);
    out.push({ name, labels, value: Number.isFinite(value) ? value : 0 });
  }
  return out;
}

function first(series: ExpoSeries[], name: string): ExpoSeries | undefined {
  return series.find((s) => s.name === name);
}

/** Collapse exposition text into one endpoint row (first series per gauge wins). */
export function summarizeEndpoint(url: string, text: string): ServingEndpoint {
  const series = parseExposition(text);
  const running = first(series, 'vllm:num_requests_running');
  return {
    url,
    ok: true,
    model: running?.labels.model_name ?? '',
    running: running?.value ?? 0,
    waiting: first(series, 'vllm:num_requests_waiting')?.value ?? 0,
    swapped: first(series, 'vllm:num_requests_swapped')?.value ?? 0,
    kvCache: first(series, 'vllm:kv_cache_usage_perc')?.value ?? 0,
  };
}

function unreachable(url: string): ServingEndpoint {
  return { url, ok: false, model: '', running: 0, waiting: 0, swapped: 0, kvCache: 0 };
}

async function scrape(url: string, timeoutMs: number): Promise<ServingEndpoint> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return unreachable(url);
    return summarizeEndpoint(url, await res.text());
  } catch {
    return unreachable(url);
  }
}

/** Parse `nvidia-smi --format=csv,noheader` rows (index, name, used, total, util). */
export function parseNvidiaSmi(csv: string): ServingGpu[] {
  const out: ServingGpu[] = [];
  for (const line of csv.split('\n')) {
    const parts = line.split(',').map((p) => p.trim());
    if (parts.length < 5) continue;
    const [index, name, used, total, util] = parts;
    const usedMiB = parseInt(used, 10);
    const totalMiB = parseInt(total, 10);
    const utilPct = parseInt(util, 10);
    if (!index || !name || Number.isNaN(usedMiB) || Number.isNaN(totalMiB)) continue;
    out.push({ index, name, usedMiB, totalMiB, utilPct: Number.isNaN(utilPct) ? 0 : utilPct });
  }
  return out;
}

function queryGpus(): Promise<ServingGpu[]> {
  return new Promise((resolve) => {
    execFile(
      'nvidia-smi',
      ['--query-gpu=index,name,memory.used,memory.total,utilization.gpu', '--format=csv,noheader'],
      { timeout: 8000 },
      (err, stdout) => {
        if (err) return resolve([]);
        try {
          resolve(parseNvidiaSmi(String(stdout)));
        } catch {
          resolve([]);
        }
      },
    );
  });
}

/** Scrape endpoints from $VLLM_METRICS_ENDPOINTS (space-separated) or the local default set. */
export function defaultEndpoints(): string[] {
  const raw = (process.env.VLLM_METRICS_ENDPOINTS ?? '').split(' ').map((s) => s.trim()).filter(Boolean);
  if (raw.length > 0) return raw;
  return ['http://127.0.0.1:8123/metrics', 'http://127.0.0.1:8002/metrics', 'http://127.0.0.1:8003/metrics'];
}

export async function snapshotServing(endpoints: string[] = defaultEndpoints()): Promise<ServingSnapshot> {
  const [endpointRows, gpus] = await Promise.all([
    Promise.all(endpoints.map((url) => scrape(url, 5000))),
    queryGpus(),
  ]);
  return { endpoints: endpointRows, gpus, fetchedAt: new Date().toISOString() };
}

// scripts/llm-proxy/discovery.mjs
const PROBE_TIMEOUT_MS = 2500;
const BACKOFF_MS = 15_000;

/** @type {Map<string,{healthy:boolean,models:string[],loaded:Set<string>,backoffUntil:number,lastProbe:number}>} */
const health = new Map();
/** @type {Map<string,string[]>} catalog: modelId → backend names by priority */
let catalog = new Map();
let lastProbeAt = 0;

/** @returns {Promise<{healthy:boolean,models:string[],loaded:Set<string>}>} */
export async function probeBackend(backend) {
  try {
    const res = await fetch(`${backend.baseUrl}/models`, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`status ${res.status}`);
    const body = await res.json();
    const models = (body.data || []).map((m) => m.id);
    const loaded = new Set();
    if (backend.kind === 'lmstudio') {
      const host = backend.baseUrl.replace(/\/v1\/?$/, '');
      const v0 = await fetch(`${host}/api/v0/models`, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) }).then((r) => r.json()).catch(() => null);
      for (const m of (v0?.data || [])) if (m.state === 'loaded') loaded.add(m.id);
    }
    return { healthy: true, models, loaded };
  } catch {
    return { healthy: false, models: [], loaded: new Set() };
  }
}

export function startDiscovery(getBackends, intervalMs) {
  const tick = async () => {
    const next = new Map();
    for (const b of getBackends()) {
      const prev = health.get(b.name);
      if (prev && !prev.healthy && Date.now() < prev.backoffUntil) { health.set(b.name, prev); continue; }
      const r = await probeBackend(b);
      health.set(b.name, { ...r, backoffUntil: r.healthy ? 0 : Date.now() + BACKOFF_MS, lastProbe: Date.now() });
      for (const id of r.models) { if (!next.has(id)) next.set(id, []); next.get(id).push(b.name); }
    }
    catalog = next;
    lastProbeAt = Date.now();
  };
  tick();
  const t = setInterval(tick, intervalMs);
  t.unref?.();
  return { timer: t, probeNow: tick };
}

/** @returns {{backend:import('./backends.mjs').Backend, servedModel:string, substituted:boolean}|null} */
export function resolveModel(requestedId, getBackends) {
  const backends = getBackends();
  const byName = (n) => backends.find((b) => b.name === n);
  const healthyNames = (id) => (catalog.get(id) || []).filter((n) => health.get(n)?.healthy);

  const exact = healthyNames(requestedId);
  if (exact.length) return { backend: byName(exact[0]), servedModel: requestedId, substituted: false };

  for (const b of backends) {
    const aliased = b.modelAliases[requestedId];
    if (aliased && healthyNames(aliased).includes(b.name) && health.get(b.name)?.healthy) {
      return { backend: b, servedModel: aliased, substituted: true };
    }
  }

  for (const b of backends) {
    const h = health.get(b.name);
    if (h?.healthy && h.models.length) return { backend: b, servedModel: h.models[0], substituted: true };
  }
  return null;
}

export function aggregateModels() {
  const data = [];
  for (const id of catalog.keys()) if ((catalog.get(id) || []).some((n) => health.get(n)?.healthy)) {
    data.push({ id, object: 'model', owned_by: 'llm-proxy' });
  }
  return { object: 'list', data };
}

export function getState(getBackends) {
  return {
    lastProbe: lastProbeAt,
    backends: getBackends().map((b) => {
      const h = health.get(b.name);
      return { name: b.name, kind: b.kind, baseUrl: b.baseUrl, priority: b.priority,
        healthy: !!h?.healthy, models: h?.models || [], loaded: [...(h?.loaded || [])] };
    }),
  };
}

/** @param {{backends: {name:string,priority:number,healthy:boolean,models:string[],aliases?:Record<string,string>,modelAliases?:Record<string,string>,fixups?:string[],baseUrl?:string,kind?:string,apiKeyEnv?:string}[]}} seed */
export function _testSeed(seed) {
  health.clear();
  catalog.clear();
  for (const b of seed.backends) {
    health.set(b.name, { healthy: b.healthy, models: b.models, loaded: new Set(), backoffUntil: 0, lastProbe: Date.now() });
    for (const id of b.models) { if (!catalog.has(id)) catalog.set(id, []); catalog.get(id).push(b.name); }
  }
}

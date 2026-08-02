// scripts/llm-proxy/slot-queue.mjs
// Per-Slot-Semaphor: isolate queuing per slot_id so that slot 0 does not block slot 1.
// Imported by server.mjs (production) and server.test.mjs (no side effects).

const sems = new Map(); // key -> { inflight:number, waiters: Array<() => void> }

function semFor(name) {
  let s = sems.get(name);
  if (!s) { s = { inflight: 0, waiters: [] }; sems.set(name, s); }
  return s;
}

function acquire(name, limit) {
  const s = semFor(name);
  if (s.inflight < limit) { s.inflight++; return Promise.resolve(); }
  return new Promise((resolve) => s.waiters.push(resolve));
}

function release(name) {
  const s = semFor(name);
  const next = s.waiters.shift();
  if (next) next();
  else if (s.inflight > 0) s.inflight--;
}

export function enqueue(name, limit, fn, slotId) {
  const queuedAt = Date.now();
  const key = slotId != null ? `${name}:slot${slotId}` : name;
  const run = acquire(key, limit).then(fn).finally(() => release(key));
  return { run, queuedAt };
}

export function inflightOf(name) { return sems.get(name)?.inflight ?? 0; }

export function extractSlotId(req) {
  const raw = req?.headers?.['x-slot-id'];
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

// scripts/factory/otel-emit.cjs — pure, require-able OTLP/HTTP-JSON emitter for the
// Software Factory. fetch-based (Node >= 18 global). No-op when the OTLP endpoint is
// unset or OTEL_SDK_DISABLED=true. NEVER throws (fire-and-forget). No DB/API imports (S2).

function endpoint() {
  if (process.env.OTEL_SDK_DISABLED === 'true') return null;
  const e = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  return e ? e.replace(/\/+$/, '') : null;
}

function authHeaders() {
  const h = { 'content-type': 'application/json' };
  const raw = process.env.OTEL_EXPORTER_OTLP_HEADERS || '';
  const m = /Authorization=([^,]+)/i.exec(raw);
  if (m) h['authorization'] = m[1];
  return h;
}

function nowNanos() { return String(Date.now() * 1e6); }

function kvAttrs(attrs) {
  return Object.entries(attrs || {})
    .filter(([, v]) => v != null)
    .map(([key, v]) => ({ key, value: { stringValue: String(v) } }));
}

// Build one OTLP metrics request. `metrics` = [{ name, kind:'sum'|'gauge', value, attrs }].
// ticket_id is intentionally placed on RESOURCE attributes (exemplar/log level), never
// as a per-datapoint metric label, to keep series cardinality bounded.
function buildPayload(metrics, resourceAttrs) {
  const t = nowNanos();
  return {
    resourceMetrics: [{
      resource: { attributes: kvAttrs({ 'service.name': 'software-factory', ...resourceAttrs }) },
      scopeMetrics: [{
        scope: { name: 'factory.otel-emit' },
        metrics: metrics.map((mm) => ({
          name: mm.name,
          [mm.kind === 'gauge' ? 'gauge' : 'sum']: {
            ...(mm.kind === 'gauge' ? {} : { aggregationTemporality: 2, isMonotonic: true }),
            dataPoints: [{
              asDouble: Number(mm.value),
              timeUnixNano: t,
              startTimeUnixNano: t,
              attributes: kvAttrs(mm.attrs),
            }],
          },
        })),
      }],
    }],
  };
}

async function post(payload) {
  const base = endpoint();
  if (!base) return { skipped: true };
  try {
    const res = await fetch(`${base}/v1/metrics`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(payload),
    });
    return { skipped: false, ok: !!(res && res.ok), status: res && res.status };
  } catch {
    return { skipped: false, ok: false };
  }
}

// Generic single counter/gauge.
async function emitMetric(name, value, attrs, opts) {
  if (!endpoint()) return { skipped: true };
  const kind = (opts && opts.kind) || 'sum';
  const { ticket_id, ...labels } = attrs || {};
  return post(buildPayload([{ name, kind, value, attrs: labels }], { ticket_id, brand: labels.brand }));
}

// Phase transition + duration. state: entered|done|blocked. duration optional.
// ctx may contain { brand, ticket_id, durationMs, model, provider }.
async function emitPhase(phase, state, ctx) {
  if (!endpoint()) return { skipped: true };
  const labels = { phase, state, brand: (ctx && ctx.brand) || 'unknown' };
  if (ctx && ctx.model) labels.model = ctx.model;
  if (ctx && ctx.provider) labels.provider = ctx.provider;
  const metrics = [{ name: 'factory.phase.transition', kind: 'sum', value: 1, attrs: labels }];
  if (ctx && typeof ctx.durationMs === 'number') {
    metrics.push({ name: 'factory.phase.duration', kind: 'gauge', value: ctx.durationMs, attrs: labels });
  }
  return post(buildPayload(metrics, { ticket_id: ctx && ctx.ticket_id, brand: labels.brand }));
}

module.exports = { emitMetric, emitPhase, buildPayload, _endpoint: endpoint };

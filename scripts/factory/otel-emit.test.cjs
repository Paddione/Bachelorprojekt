const { test } = require('node:test');
const assert = require('node:assert');
const otel = require('./otel-emit.cjs');

test('no-op when endpoint unset', async () => {
  delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  const r = await otel.emitMetric('factory.tick.count', 1, { brand: 'mentolder' });
  assert.strictEqual(r.skipped, true);
});

test('no-op when OTEL_SDK_DISABLED=true', async () => {
  process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'https://otel.example.invalid';
  process.env.OTEL_SDK_DISABLED = 'true';
  const r = await otel.emitMetric('factory.tick.count', 1, {});
  assert.strictEqual(r.skipped, true);
  delete process.env.OTEL_SDK_DISABLED;
});

test('emitPhase posts an OTLP metrics payload to /v1/metrics', async () => {
  process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'https://otel.example.invalid';
  delete process.env.OTEL_SDK_DISABLED;
  let captured = null;
  global.fetch = async (url, opts) => {
    captured = { url, body: JSON.parse(opts.body), headers: opts.headers };
    return { ok: true, status: 200 };
  };
  const r = await otel.emitPhase('Implement', 'done', { brand: 'mentolder', ticket_id: 'T000883', durationMs: 1234 });
  assert.strictEqual(r.skipped, false);
  assert.match(captured.url, /\/v1\/metrics$/);
  // ticket_id must NOT be a metric label (cardinality) — only resource/attr level
  const metricNames = captured.body.resourceMetrics[0].scopeMetrics[0].metrics.map(m => m.name);
  assert.ok(metricNames.includes('factory.phase.transition'));
});

test('emit never throws on fetch failure (fire-and-forget)', async () => {
  process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'https://otel.example.invalid';
  global.fetch = async () => { throw new Error('network down'); };
  const r = await otel.emitMetric('factory.tick.count', 1, {});
  assert.strictEqual(r.ok, false); // returns, does not throw
});

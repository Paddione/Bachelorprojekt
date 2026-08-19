// tests/e2e/lib/vision-judge.test.ts
//
// Unit tests for the vision-judge library (T012781).
// Runs under vitest — pure functions, no browser, no network, no GPU host.
//
// Deliberately NOT tested here: whether the model judges a broken page as
// broken. That is not reproducible and would go red on every model swap; the
// stage reports and does not gate (REQ-vs-02). The live-endpoint evidence is a
// measurement step in the plan, not a test.

import { describe, test, expect } from 'vitest';
import {
  visionConfig,
  buildVisionRequest,
  parseVerdict,
  probeVision,
  VISION_VERDICT_SCHEMA,
  VISION_FINDING_CODES,
} from './vision-judge';

// ── Helpers ────────────────────────────────────────────────────────────────

/** Run fn with a temporarily patched process.env, then restore. */
function withEnv<T>(patch: Record<string, string | undefined>, fn: () => T): T {
  const saved: Record<string, string | undefined> = {};
  for (const k of Object.keys(patch)) {
    saved[k] = process.env[k];
    if (patch[k] === undefined) delete process.env[k];
    else process.env[k] = patch[k] as string;
  }
  try {
    return fn();
  } finally {
    for (const k of Object.keys(saved)) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k] as string;
    }
  }
}

const ENV_KEYS = {
  VISUAL_SWEEP_VISION: undefined,
  VISION_URL: undefined,
  VISION_MODEL: undefined,
  VISION_TIMEOUT_MS: undefined,
  VISION_MAX_ROUTES: undefined,
};

// ── visionConfig ───────────────────────────────────────────────────────────

describe('visionConfig', () => {
  test('defaults point at the llm-proxy, not at the llama.cpp port', () => {
    const cfg = withEnv(ENV_KEYS, () => visionConfig());

    // Positiv-Anker zuerst: ohne ihn bestuende der Test auch, wenn die Funktion
    // nichts (oder ein leeres Objekt) zurueckgaebe.
    expect(cfg).toBeTypeOf('object');
    expect(cfg.endpoint.length).toBeGreaterThan(0);
    expect(cfg.model.length).toBeGreaterThan(0);

    expect(cfg.endpoint).toBe('http://127.0.0.1:18235/v1/chat/completions');
    expect(cfg.model).toBe('gemma12-vision');
    expect(cfg.timeoutMs).toBe(60_000);
  });

  test('the port of the llama.cpp server is never the default target', () => {
    // 8089 laeuft auf dem Windows-GPU-Host und ist aus WSL nicht erreichbar
    // (curl -> HTTP-Code 000). Ein Default darauf waere immer tot.
    const cfg = withEnv(ENV_KEYS, () => visionConfig());
    expect(cfg.endpoint).not.toContain('8089');
    expect(cfg.endpoint).not.toContain('8094');
    expect(cfg.endpoint).not.toContain('8091');
  });

  test('stage is off unless VISUAL_SWEEP_VISION=1', () => {
    expect(withEnv(ENV_KEYS, () => visionConfig().enabled)).toBe(false);
    expect(withEnv({ ...ENV_KEYS, VISUAL_SWEEP_VISION: '0' }, () => visionConfig().enabled)).toBe(false);
    expect(withEnv({ ...ENV_KEYS, VISUAL_SWEEP_VISION: '1' }, () => visionConfig().enabled)).toBe(true);
  });

  test('env overrides win', () => {
    const cfg = withEnv(
      { ...ENV_KEYS, VISION_URL: 'http://example.invalid/v1/chat/completions', VISION_MODEL: 'other', VISION_TIMEOUT_MS: '1234', VISION_MAX_ROUTES: '10' },
      () => visionConfig(),
    );
    expect(cfg.endpoint).toBe('http://example.invalid/v1/chat/completions');
    expect(cfg.model).toBe('other');
    expect(cfg.timeoutMs).toBe(1234);
    expect(cfg.maxRoutes).toBe(10);
  });

  test('maxRoutes is unset by default (judge every route)', () => {
    expect(withEnv(ENV_KEYS, () => visionConfig().maxRoutes)).toBeNull();
  });
});

// ── buildVisionRequest ─────────────────────────────────────────────────────

describe('buildVisionRequest', () => {
  const args = {
    route: '/admin/tickets',
    brand: 'mentolder' as const,
    viewport: 'desktop' as const,
    domStatus: 'ok',
    imageBase64: 'QUJD',
    model: 'gemma12-vision',
  };

  test('is deterministic and schema-constrained', () => {
    const body = buildVisionRequest(args);

    expect(body).toBeTypeOf('object');
    expect(body.model).toBe('gemma12-vision');
    // Das Loadout steht auf temperature 1; ein Urteil soll reproduzierbar sein.
    expect(body.temperature).toBe(0);
    expect(body.response_format).toBeTruthy();
    expect(body.response_format.type).toBe('json_schema');
    expect(body.response_format.json_schema.schema).toEqual(VISION_VERDICT_SCHEMA);
  });

  test('carries the screenshot as an inline jpeg data URI', () => {
    const body = buildVisionRequest(args);
    const parts = body.messages[0].content;
    expect(parts.length).toBeGreaterThan(1);
    const image = parts.find((p) => p.type === 'image_url');
    if (!image?.image_url) throw new Error('kein image_url-Teil im Anfragerumpf');
    expect(image.image_url.url).toBe('data:image/jpeg;base64,QUJD');
  });

  test('names every finding code the schema allows', () => {
    const body = buildVisionRequest(args);
    const textPart = body.messages[0].content.find((p) => p.type === 'text');
    if (!textPart || !('text' in textPart)) throw new Error('kein Text-Teil im Anfragerumpf');
    expect(VISION_FINDING_CODES.length).toBe(5);
    // Gegen die exportierte Konstante pruefen, nicht gegen eine Abschrift —
    // sonst prueft der Test seine eigene Kopie.
    for (const code of VISION_FINDING_CODES) {
      expect(textPart.text).toContain(code);
    }
  });

  test('gives the model the context unexpected_auth_wall needs', () => {
    const body = buildVisionRequest(args);
    const textPart = body.messages[0].content.find((p) => p.type === 'text');
    if (!textPart || !('text' in textPart)) throw new Error('kein Text-Teil im Anfragerumpf');
    // Eine Anmeldeseite ist auf /login richtig und auf /admin/tickets ein Defekt.
    // Ohne Route und Auth-Kontext ist die Frage nicht beantwortbar.
    expect(textPart.text).toContain('/admin/tickets');
    expect(textPart.text).toContain('mentolder');
    expect(textPart.text).toContain('desktop');
  });
});

// ── parseVerdict ───────────────────────────────────────────────────────────

describe('parseVerdict', () => {
  const good = JSON.stringify({
    verdict: 'suspect',
    findings: [{ code: 'blank', confidence: 0.9, note: 'nur Hintergrund sichtbar' }],
  });

  test('accepts a schema-conforming answer', () => {
    const out = parseVerdict(good);
    expect(out.status).toBe('judged');
    if (out.status !== 'judged') throw new Error('unreachable');
    expect(out.verdict).toBe('suspect');
    expect(out.findings).toHaveLength(1);
    expect(out.findings[0].code).toBe('blank');
  });

  test('a truncated answer is unusable and keeps the raw text', () => {
    const truncated = good.slice(0, good.length - 12);
    const out = parseVerdict(truncated);
    expect(out.status).toBe('unusable');
    if (out.status !== 'unusable') throw new Error('unreachable');
    expect(out.raw).toBe(truncated);
  });

  test('a plausible-looking but schema-foreign answer yields NO partial verdict', () => {
    // Das ist der eigentliche Punkt von REQ-vs-04: ein halb geparstes Urteil
    // sieht aus wie ein Ergebnis und ist keins.
    const foreign = JSON.stringify({ verdict: 'broken', findings: [{ code: 'blank' }] });
    const out = parseVerdict(foreign);
    expect(out.status).toBe('unusable');
    expect(out).not.toHaveProperty('findings');
  });

  test('an unknown finding code is rejected rather than passed through', () => {
    const bogus = JSON.stringify({
      verdict: 'suspect',
      findings: [{ code: 'looks_ugly', confidence: 0.5, note: 'x' }],
    });
    expect(parseVerdict(bogus).status).toBe('unusable');
  });

  test('prose is unusable, not a verdict', () => {
    expect(parseVerdict('Die Seite sieht in Ordnung aus.').status).toBe('unusable');
  });

  test('an ok verdict with no findings is valid', () => {
    const out = parseVerdict(JSON.stringify({ verdict: 'ok', findings: [] }));
    expect(out.status).toBe('judged');
    if (out.status !== 'judged') throw new Error('unreachable');
    expect(out.verdict).toBe('ok');
    expect(out.findings).toEqual([]);
  });
});

// ── probeVision ────────────────────────────────────────────────────────────

describe('probeVision', () => {
  test('an unreachable proxy and a missing alias are different reasons', async () => {
    const unreachable = await probeVision({
      endpoint: 'http://127.0.0.1:18235/v1/chat/completions',
      model: 'gemma12-vision',
      fetchImpl: async () => { throw new Error('ECONNREFUSED'); },
    });
    expect(unreachable.available).toBe(false);
    expect(unreachable.reason.length).toBeGreaterThan(0);

    const emptyList = await probeVision({
      endpoint: 'http://127.0.0.1:18235/v1/chat/completions',
      model: 'gemma12-vision',
      fetchImpl: async () => new Response(JSON.stringify({ data: [] }), { status: 200 }),
    });
    expect(emptyList.available).toBe(false);
    expect(emptyList.reason.length).toBeGreaterThan(0);

    // Die Abhilfe ist eine andere — Proxy starten gegen Migration anwenden.
    // Verschmelzen die Begruendungen, wiederholt sich der Vorfall aus F1.
    expect(emptyList.reason).not.toBe(unreachable.reason);
  });

  test('reports available when the alias is served', async () => {
    const ok = await probeVision({
      endpoint: 'http://127.0.0.1:18235/v1/chat/completions',
      model: 'gemma12-vision',
      fetchImpl: async () => new Response(JSON.stringify({ data: [{ id: 'gemma12-vision' }] }), { status: 200 }),
    });
    expect(ok.available).toBe(true);
  });

  test('probes the models endpoint of the same host, not the chat endpoint', async () => {
    let seen = '';
    await probeVision({
      endpoint: 'http://127.0.0.1:18235/v1/chat/completions',
      model: 'gemma12-vision',
      fetchImpl: async (url: string) => {
        seen = url;
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      },
    });
    expect(seen.length).toBeGreaterThan(0);
    expect(seen).toBe('http://127.0.0.1:18235/v1/models');
  });
});

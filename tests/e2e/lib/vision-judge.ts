// tests/e2e/lib/vision-judge.ts
//
// [T012781] Screenshot-Beurteilung durch das lokale Vision-Modell.
//
// Reines Modul: kein Playwright-Import, keine Sweep-Abhaengigkeit. Dadurch ist
// es unter vitest ohne Browser pruefbar und erzeugt keinen Import-Zyklus (S2).
//
// Der Weg zum Modell fuehrt ueber den llm-proxy, NICHT direkt auf Port 8089:
// der llama.cpp-Server laeuft auf dem Windows-GPU-Host und ist aus WSL nicht
// erreichbar (gemessen 2026-08-19: curl localhost:8089 -> HTTP-Code 000,
// curl 127.0.0.1:18235 -> 200). Der Proxy ist zugleich die Stelle, an der
// max_inflight=3 serverseitig durchgesetzt wird.
//
// Diese Datei wirft nie nach aussen: jeder Fehler wird zu einer Zeile mit
// status 'skipped'. Ein negatives oder fehlendes Urteil darf den Sweep nicht
// scheitern lassen (REQ-vs-02).

// ── Typen ──────────────────────────────────────────────────────────────────

export const VISION_FINDING_CODES = [
  'blank',
  'error_visible',
  'layout_broken',
  'unstyled',
  'unexpected_auth_wall',
] as const;

export type VisionFindingCode = (typeof VISION_FINDING_CODES)[number];

export interface VisionFinding {
  code: VisionFindingCode;
  confidence: number;
  note: string;
}

export type VisionOutcome =
  | { status: 'judged'; verdict: 'ok' | 'suspect'; findings: VisionFinding[] }
  | { status: 'skipped'; reason: string }
  | { status: 'unusable'; raw: string };

export interface VisionConfig {
  enabled: boolean;
  endpoint: string;
  model: string;
  timeoutMs: number;
  maxRoutes: number | null;
}

export interface JudgeArgs {
  route: string;
  brand: string;
  viewport: string;
  domStatus: string;
  imageBase64: string;
  model: string;
}

type FetchImpl = (url: string, init?: RequestInit) => Promise<Response>;

// ── Konfiguration ──────────────────────────────────────────────────────────

const DEFAULT_ENDPOINT = 'http://127.0.0.1:18235/v1/chat/completions';
const DEFAULT_MODEL = 'gemma12-vision';
const DEFAULT_TIMEOUT_MS = 60_000;

function intFromEnv(raw: string | undefined, fallback: number | null): number | null {
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function visionConfig(): VisionConfig {
  return {
    enabled: process.env.VISUAL_SWEEP_VISION === '1',
    endpoint: process.env.VISION_URL || DEFAULT_ENDPOINT,
    model: process.env.VISION_MODEL || DEFAULT_MODEL,
    timeoutMs: intFromEnv(process.env.VISION_TIMEOUT_MS, DEFAULT_TIMEOUT_MS) as number,
    maxRoutes: intFromEnv(process.env.VISION_MAX_ROUTES, null),
  };
}

// ── Antwortform ────────────────────────────────────────────────────────────
//
// Als Grammatik an den Server gereicht. Der Sinn ist nicht Hoeflichkeit
// gegenueber dem Modell, sondern dass die Antwort ohne Freitext-Parsen
// auswertbar ist (REQ-vs-04).

export const VISION_VERDICT_SCHEMA = {
  type: 'object',
  required: ['verdict', 'findings'],
  additionalProperties: false,
  properties: {
    verdict: { type: 'string', enum: ['ok', 'suspect'] },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['code', 'confidence', 'note'],
        additionalProperties: false,
        properties: {
          code: { type: 'string', enum: [...VISION_FINDING_CODES] },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          note: { type: 'string', maxLength: 200 },
        },
      },
    },
  },
} as const;

// ── Fragenkatalog ──────────────────────────────────────────────────────────
//
// Geschlossene Fragen. Offene ("beschreibe, was du siehst") erzeugen Prosa, die
// niemand auswertet — genau das tat der bis T012781 wirkungslose Aufruf.

function promptFor(a: JudgeArgs): string {
  return [
    'Du beurteilst den Screenshot einer Webseite. Antworte ausschliesslich im vorgegebenen JSON-Format.',
    '',
    `Route: ${a.route}`,
    `Brand: ${a.brand}`,
    `Viewport: ${a.viewport}`,
    `Vom Test ermittelter Zustand: ${a.domStatus}`,
    '',
    'Pruefe genau diese fuenf Befunde und nimm nur zutreffende in "findings" auf:',
    '- blank: Der sichtbare Bereich ist praktisch leer, ausser Hintergrund und Seitenrahmen ist nichts da.',
    '- error_visible: Eine technische Fehlermeldung ist sichtbar (Stacktrace, "500", "Internal Server Error", Framework-Overlay).',
    '- layout_broken: Elemente ueberlagern sich, Inhalt ragt sichtbar aus seinem Container, oder Text ist abgeschnitten.',
    '- unstyled: Die Seite wirkt ungestylt, also nackte HTML-Standarddarstellung ohne CSS.',
    '- unexpected_auth_wall: Eine Anmeldeaufforderung ist zu sehen, obwohl die oben genannte Route angemeldeten Inhalt zeigen sollte.',
    '',
    'Setze "verdict" auf "suspect", sobald mindestens ein Befund zutrifft, sonst auf "ok".',
    'Gib fuer jeden Befund eine confidence zwischen 0 und 1 und eine kurze note an.',
  ].join('\n');
}

export function buildVisionRequest(a: JudgeArgs) {
  return {
    model: a.model,
    // Das Loadout steht auf temperature 1. Ein Urteil soll reproduzierbar sein.
    temperature: 0,
    max_tokens: 320,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: promptFor(a) },
          // JPEG statt PNG: rund ein Zehntel der base64-Nutzlast. Das zaehlt
          // doppelt, weil der Prefill des Vision-Towers die Antwortzeit
          // dominiert.
          { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${a.imageBase64}` } },
        ],
      },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'vision_verdict', strict: true, schema: VISION_VERDICT_SCHEMA },
    },
  };
}

// ── Auswertung ─────────────────────────────────────────────────────────────

function isFinding(v: unknown): v is VisionFinding {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  if (Object.keys(o).length !== 3) return false;
  if (typeof o.code !== 'string') return false;
  if (!(VISION_FINDING_CODES as readonly string[]).includes(o.code)) return false;
  if (typeof o.confidence !== 'number' || o.confidence < 0 || o.confidence > 1) return false;
  if (typeof o.note !== 'string') return false;
  return true;
}

/**
 * Prueft die Antwort gegen das Schema. Kein teilweises Parsen: eine
 * abgeschnittene oder formfremde Antwort wird verworfen, nicht gerettet.
 * Ein halb geparstes Urteil sieht aus wie ein Ergebnis und ist keins.
 */
export function parseVerdict(raw: string): VisionOutcome {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { status: 'unusable', raw };
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { status: 'unusable', raw };
  }
  const o = parsed as Record<string, unknown>;
  const keys = Object.keys(o).sort();
  if (keys.length !== 2 || keys[0] !== 'findings' || keys[1] !== 'verdict') {
    return { status: 'unusable', raw };
  }
  if (o.verdict !== 'ok' && o.verdict !== 'suspect') return { status: 'unusable', raw };
  if (!Array.isArray(o.findings) || !o.findings.every(isFinding)) return { status: 'unusable', raw };

  return { status: 'judged', verdict: o.verdict, findings: o.findings as VisionFinding[] };
}

// ── Erreichbarkeit ─────────────────────────────────────────────────────────

/** Aus dem Chat-Endpunkt den Modell-Endpunkt derselben Instanz ableiten. */
export function modelsUrlFor(endpoint: string): string {
  return endpoint.replace(/\/chat\/completions\/?$/, '/models');
}

/**
 * Zwei Fehlbilder, zwei Begruendungen. "Proxy antwortet nicht" verlangt, den
 * Proxy zu starten; "Alias nicht gefuehrt" verlangt, die Backend-Migration
 * anzuwenden (scripts/migrations/2026-08-19-llm-proxy-parallel-slots.sql) —
 * die Modellliste kommt aus der Datenbank, nicht aus einer Datei. Werden beide
 * zu "nicht erreichbar" verschmolzen, wiederholt sich genau der Vorfall, den
 * T012781 behebt.
 */
export async function probeVision(opts: {
  endpoint: string;
  model: string;
  fetchImpl?: FetchImpl;
}): Promise<{ available: boolean; reason: string }> {
  const doFetch: FetchImpl = opts.fetchImpl ?? (globalThis.fetch as FetchImpl);
  const url = modelsUrlFor(opts.endpoint);
  let res: Response;
  try {
    res = await doFetch(url, { signal: AbortSignal.timeout(5_000) });
  } catch (err) {
    return { available: false, reason: `llm-proxy nicht erreichbar unter ${url} (${(err as Error).message})` };
  }
  if (!res.ok) {
    return { available: false, reason: `llm-proxy antwortete mit Status ${res.status} auf ${url}` };
  }
  let ids: string[] = [];
  try {
    const body = (await res.json()) as { data?: Array<{ id?: string }> };
    ids = (body.data ?? []).map((m) => m.id ?? '');
  } catch {
    return { available: false, reason: `llm-proxy lieferte keine lesbare Modellliste unter ${url}` };
  }
  if (!ids.includes(opts.model)) {
    return {
      available: false,
      reason:
        `Modellalias "${opts.model}" wird nicht gefuehrt (${ids.length} Modelle gemeldet). ` +
        'Backend-Zeile fehlt — scripts/migrations/2026-08-19-llm-proxy-parallel-slots.sql anwenden.',
    };
  }
  return { available: true, reason: `Alias "${opts.model}" verfuegbar` };
}

// ── Aufruf ─────────────────────────────────────────────────────────────────

/** Wirft nie. Im Fehlerfall eine Zeile mit status 'skipped' (REQ-vs-02). */
export async function judgeScreenshot(
  a: JudgeArgs,
  opts: { endpoint: string; timeoutMs: number; fetchImpl?: FetchImpl },
): Promise<VisionOutcome> {
  const doFetch: FetchImpl = opts.fetchImpl ?? (globalThis.fetch as FetchImpl);
  try {
    const res = await doFetch(opts.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildVisionRequest(a)),
      signal: AbortSignal.timeout(opts.timeoutMs),
    });
    if (!res.ok) return { status: 'skipped', reason: `Vision-Endpunkt antwortete mit Status ${res.status}` };
    const body = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = body.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || content.length === 0) {
      return { status: 'skipped', reason: 'Vision-Endpunkt lieferte keinen Antworttext' };
    }
    return parseVerdict(content);
  } catch (err) {
    return { status: 'skipped', reason: `Vision-Aufruf fehlgeschlagen (${(err as Error).message})` };
  }
}

// scripts/llm-proxy/fixups.mjs
// Benannte Request-Fixups. Abgeglichen gegen ~/.config/factory/qwythos-msg-fixup-proxy.py
// (T001812-Workaround), das bisher als systemd-Service vor :8093 stand - siehe
// "T002102 Unified Gateway" Ablösung, 2026-07-23.

// Qwythos/Bonsai-Chat-Template hart-failt auf role:"system" an Index > 0
// ("System message must be at the beginning"). Fix: auf "user" umschreiben.
// KEIN Marker-Prefix (eine fruehere Fassung hier hatte "[system] " ergaenzt -
// die verifizierte Python-Quelle tut das nicht, nur der reine Rollenwechsel).
function bonsaiSystemRoleFixup(body) {
  if (!Array.isArray(body?.messages)) return body;
  const messages = body.messages.map((msg, i) => (
    i > 0 && msg.role === 'system' ? { ...msg, role: 'user' } : msg
  ));
  return { ...body, messages };
}

// Anthropic-Messages-API erlaubt content als Block-Array (z. B. [{type:"text",text:"..."}]);
// llama.cpp-Chat-Completions erwartet einen reinen String. Nicht-Text-Bloecke werden als JSON
// eingebettet statt verworfen, damit Tool-Result-Bloecke etc. nicht stillschweigend verschwinden.
function flattenContentBlocks(body) {
  if (!Array.isArray(body?.messages)) return body;
  const messages = body.messages.map((msg) => {
    if (!Array.isArray(msg.content)) return msg;
    const text = msg.content
      .map((p) => (typeof p === 'string' ? p : p?.type === 'text' && typeof p.text === 'string' ? p.text : JSON.stringify(p)))
      .join('\n');
    return { ...msg, content: text };
  });
  return { ...body, messages };
}

// Claude Codes erster system-Block enthaelt eine per-Prozess-Telemetriezeile
// (x-anthropic-billing-header, zufaellig wechselndes Suffix) an Position 0 -
// das vergiftet Prefix-basiertes Prompt-Cache-Matching bei jedem Request neu,
// unabhaengig vom Modell. Normalisiert auf eine Konstante, da diese Zeile fuer
// ein selbst-gehostetes Ziel ohnehin bedeutungslos ist (T-bonsai-prefill-cache).
const BILLING_HEADER_RE = /^x-anthropic-billing-header:/;
function normalizeBillingHeader(body) {
  if (!Array.isArray(body?.system) || !body.system.length) return body;
  const [first, ...rest] = body.system;
  const text = typeof first?.text === 'string' ? first.text : null;
  if (!text || !BILLING_HEADER_RE.test(text)) return body;
  return { ...body, system: [{ ...first, text: 'x-anthropic-billing-header: (normalized-for-cache);' }, ...rest] };
}

// llama.cpp baut aus JSON-Schema-"pattern" eine GBNF-Grammatik fuer constrained
// tool-calling. GBNF kennt \- nicht (Regex schon, dort ist es ein redundantes
// Escape) - trifft der Parser darauf, verwirft er die KOMPLETTE Grammatik:
//   parse: error parsing grammar: unknown escape at \-A-Za-z0-9=, ()!])+) ...
//   E failed to parse grammar
// Der Slot startet dann ohne Grammatik, das Modell generiert Tool-Calls frei,
// der Agent retryt - auf einem serialisierten Ein-Slot-Server der teuerste
// denkbare Fehler. Quelle in freier Wildbahn: mcp-kubernetes liefert fuer
// labelSelector/fieldSelector das Pattern [/_.\-A-Za-z0-9=, ()!] (T002112).
//
// Naiv \- durch - zu ersetzen waere falsch: aus [/_.\-A-Za-z0-9] wuerde
// [/_.-A-Za-z0-9], wo .-A eine Range 0x2E-0x41 ist und /0123456789:;<=>?@
// mitschluckt. Stattdessen wandert das Minus ans Klassenende, wo es unstrittig
// literal ist.
const warnedPatterns = new Set();

/** @param {string} src @returns {string} */
export function sanitizeGbnfPattern(src) {
  if (typeof src !== 'string' || !src.includes('\\-')) return src;
  let out = '';
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '\\') {
      // Ausserhalb einer Zeichenklasse ist \- schlicht ein literales Minus.
      if (src[i + 1] === '-') { out += '-'; i += 2; continue; }
      out += c + (src[i + 1] ?? ''); i += 2; continue;
    }
    if (c !== '[') { out += c; i += 1; continue; }

    let j = i + 1;
    let head = '[';
    if (src[j] === '^') { head += '^'; j += 1; }
    if (src[j] === ']') { head += ']'; j += 1; } // ] direkt am Klassenanfang ist literal
    let body = '';
    let needsDash = false;
    let closed = false;
    while (j < src.length) {
      const d = src[j];
      if (d === '\\') {
        if (src[j + 1] === '-') { needsDash = true; j += 2; continue; }
        body += d + (src[j + 1] ?? ''); j += 2; continue;
      }
      if (d === ']') { closed = true; j += 1; break; }
      body += d; j += 1;
    }
    // Unbalancierte Klasse: nicht raten, Rest unveraendert durchreichen.
    if (!closed) { out += src.slice(i); return out; }
    const dash = needsDash && !body.endsWith('-') ? '-' : '';
    out += head + body + dash + ']';
    i = j;
  }
  if (out !== src && !warnedPatterns.has(src)) {
    warnedPatterns.add(src);
    console.warn(`[fixups] GBNF-untaugliches Escape entschaerft: ${src} -> ${out}`);
  }
  return out;
}

function sanitizeSchemaTree(node) {
  if (Array.isArray(node)) return node.map(sanitizeSchemaTree);
  if (!node || typeof node !== 'object') return node;
  const out = {};
  for (const [k, v] of Object.entries(node)) {
    out[k] = k === 'pattern' && typeof v === 'string' ? sanitizeGbnfPattern(v) : sanitizeSchemaTree(v);
  }
  return out;
}

/** @param {any} body @returns {any} */
export function sanitizeToolSchemaPatterns(body) {
  if (!Array.isArray(body?.tools)) return body;
  return { ...body, tools: sanitizeSchemaTree(body.tools) };
}

export const FIXUPS = {
  'bonsai-system-role-fixup': bonsaiSystemRoleFixup,
  'flatten-content-blocks': flattenContentBlocks,
  'normalize-billing-header': normalizeBillingHeader,
  'sanitize-tool-schema-patterns': sanitizeToolSchemaPatterns,
};

/** @param {string[]} names @param {any} body */
export function applyFixups(names, body) {
  let out = body;
  for (const name of names || []) {
    const fn = FIXUPS[name];
    if (!fn) { console.warn(`[fixups] unknown fixup "${name}" — skipped`); continue; }
    out = fn(out);
  }
  return out;
}

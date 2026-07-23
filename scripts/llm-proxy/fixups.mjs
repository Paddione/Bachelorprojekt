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

export const FIXUPS = {
  'bonsai-system-role-fixup': bonsaiSystemRoleFixup,
  'flatten-content-blocks': flattenContentBlocks,
  'normalize-billing-header': normalizeBillingHeader,
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

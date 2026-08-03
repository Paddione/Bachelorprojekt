// Pure, side-effect-free helpers for the cockpit feature-suggestion route
// (`POST /api/admin/cockpit/suggest`). Kept out of the route so the prompt
// building and (brittle) LLM-output parsing are unit-testable without HTTP or
// a live model, and so the route stays line-budget-lean (S1). No imports other
// than the portfolio types — no import cycles (S2).
import type { PortfolioPayload, FeatureNode } from './cockpit-types';

export const IMPACT_VALUES = ['hoch', 'mittel', 'niedrig'] as const;
export type Impact = (typeof IMPACT_VALUES)[number];

export interface Suggestion {
  featureId: string;
  nextStep: boolean;
  reason: string;
  impact?: Impact;
}

/**
 * Render one richly-annotated line per real feature for the LLM. Unlike the
 * previous thin list (id/title/priority/flags only) this surfaces the value and
 * progress signals that already live on the FeatureNode — `valueProp`, the
 * health traffic-light, and the rollup (`pctDone`, `blocked`, `open`) — so the
 * model can reason about value, near-completion and blockers. Synthetic
 * aggregate buckets ("Alle Tickets" / "Ohne Feature") are excluded — they are
 * not real features and must never be marked as a next step.
 */
export function buildFeatureList(portfolio: PortfolioPayload): string {
  const rows: string[] = [];
  for (const product of portfolio.products) {
    for (const f of product.features) {
      if (f.synthetic) continue;
      rows.push(featureLine(rows.length + 1, f, product.title));
    }
  }
  return rows.join('\n');
}

function featureLine(n: number, f: FeatureNode, productTitle: string): string {
  const r = f.rollup;
  const parts = [
    `Produkt: ${productTitle}`,
    `Priorität: ${f.priority}`,
    `Wert: ${f.valueProp?.trim() || '—'}`,
    `Ampel: ${f.health}`,
    `Fortschritt: ${r.pctDone}%`,
    `Blockiert: ${r.blocked}`,
    `Offen: ${r.open}`,
    `Major: ${f.majorFeature}`,
    `Verworfen: ${f.discarded}`,
    `Nächster Schritt: ${f.nextStep}`,
  ];
  if (f.suggestionComment) parts.push(`Kommentar: ${f.suggestionComment}`);
  return `${n}. [${f.extId}] ${f.title} (${parts.join(', ')})`;
}

export const SUGGEST_SYSTEM_PROMPT = `Du bist ein Feature-Portfolio-Manager. Entscheide selektiv, welche Features als "nächster Schritt" (nextStep) angegangen werden sollen.

Kernregel: Qualität vor Quantität. Nur Features, die GLEICHZEITIG hohen oder mittleren geschäftlichen Wert UND klare Umsetzbarkeit haben, werden mit nextStep=true markiert. Es ist ausdrücklich korrekt, 0 Features in einem Produkt zu empfehlen, wenn keines die Messlatte erreicht.

Regeln:
1. Schärfe als Erstes: Setze nextStep=true NUR wenn "Wert" klar ausgeprägt ist UND das Feature nicht blockiert ist (Ampel nicht rot, Blockiert=0). Zwinge keine Gleichverteilung über Produkte.
2. Hoher Fortschritt (>60%, aber <100%) ist ein Positivsignal — Fast-fertige Features mit Wert bevorzugen.
3. Features, die andere Arbeit entblocken, erhalten Priorität; blockierte Features (Blockiert>0 oder Ampel rot) niemals mit nextStep=true.
4. Features mit Verworfen=true niemals empfehlen. Major-Features bevorzugen, sofern sie die anderen Kriterien erfüllen.
5. Kommentare (falls vorhanden) als zusätzlichen Kontext einbeziehen.
6. "reason" MUSS sich konkret auf gelieferte Signale stützen (Wert, Fortschritt, Blocker, Ampel) — kein generischer Text.
7. "impact" beschreibt den erwarteten Nutzen: "hoch" nur für Features mit klarem, ausgeprägtem Wertbeitrag; "mittel" für solide aber nicht kritische; "niedrig" für marginale.
8. Antworte NUR mit einem JSON-Array, kein weiterer Text:
[{"featureId":"<extId>","nextStep":true|false,"reason":"<kurze, signalgestützte Begründung>","impact":"hoch|mittel|niedrig"}]`;

/**
 * Tolerant parser for the model's reply. The model is asked for a bare JSON
 * array but often wraps it in prose; we extract the first `[ … ]` span, parse
 * it, and validate each entry — dropping malformed entries (missing featureId)
 * rather than failing the whole response. Returns `[]` on any structural error.
 */
export function parseSuggestions(text: string): Suggestion[] {
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];
  let raw: unknown;
  try { raw = JSON.parse(match[0]); } catch { return []; }
  if (!Array.isArray(raw)) return [];

  const out: Suggestion[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    if (typeof rec.featureId !== 'string' || rec.featureId === '') continue;
    const suggestion: Suggestion = {
      featureId: rec.featureId,
      nextStep: rec.nextStep === true,
      reason: typeof rec.reason === 'string' ? rec.reason : '',
    };
    if (typeof rec.impact === 'string' && (IMPACT_VALUES as readonly string[]).includes(rec.impact)) {
      suggestion.impact = rec.impact as Impact;
    }
    out.push(suggestion);
  }
  return out;
}

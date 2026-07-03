// Service-Registry — Single Source of Truth für KI-gestützte Dienste.
//
// WICHTIG: `source`/`tier` hier MÜSSEN exakt den Strings entsprechen, mit denen die
// Runtime `getProviderConfig(source, tier)` aufruft (siehe claude.ts, assistant/llm.ts,
// ticket-triage.ts). Beide Seiten beziehen die Strings aus `SOURCE` → kein Drift mehr.
// Pure module: keine Laufzeit-Imports (S2 — keine Zyklen).

export type Tier = 'sonnet' | 'haiku' | 'coaching';
export type ParamSet = 'routing' | 'coaching';

/** Kanonische Source-Strings, geteilt von Dashboard-Karten UND Runtime-Call-Sites. */
export const SOURCE = {
  websiteLlm: 'website-llm',
  assistantChat: 'assistant-chat',
  ticketTriage: 'ticket-triage',
  lavishArtifact: 'lavish-artifact',
  coaching: 'coaching',
} as const;

export interface ServiceDef {
  /** Stabiler Schlüssel (UI + Tests). */
  key: string;
  /** Anzeigename im Dashboard. */
  label: string;
  /** Emoji-Icon der Karte. */
  icon: string;
  /** Exakter provider_config.source — identisch zum Runtime-Aufruf. */
  source: string;
  /** Routing-Tier bzw. 'coaching' für brand-scoped Coaching-Rows. */
  tier: Tier;
  /** true → pro Brand eigene Auswahl (Coaching). false → globales Routing. */
  brandScoped: boolean;
  /** Welche Drawer-Felder das Dashboard zeigt. */
  paramSet: ParamSet;
}

export const KI_SERVICES: ServiceDef[] = [
  { key: 'website-llm',    label: 'Website-LLM',    icon: '🌐', source: SOURCE.websiteLlm,    tier: 'sonnet',   brandScoped: false, paramSet: 'routing' },
  { key: 'assistant-chat', label: 'Assistent-Chat', icon: '💬', source: SOURCE.assistantChat, tier: 'sonnet',   brandScoped: false, paramSet: 'routing' },
  { key: 'ticket-triage',  label: 'Ticket-Triage',  icon: '🎫', source: SOURCE.ticketTriage,  tier: 'haiku',    brandScoped: false, paramSet: 'routing' },
  { key: 'lavish-artifact', label: 'Lavish-Artefakt', icon: '🎨', source: SOURCE.lavishArtifact, tier: 'sonnet', brandScoped: false, paramSet: 'routing' },
  { key: 'coaching',       label: 'Coaching',       icon: '🤝', source: SOURCE.coaching,      tier: 'coaching', brandScoped: true,  paramSet: 'coaching' },
];

export function serviceByKey(key: string): ServiceDef | undefined {
  return KI_SERVICES.find((s) => s.key === key);
}

// coaching-summary.ts — T002653
//
// Session-Zusammenfassung: verdichtet ai_response + coach_notes aller Schritte
// einer Coaching-Session per LLM zu einer strukturierten Zusammenfassung und
// persistiert sie als llm_summary/llm_summary_at.
//
// DSGVO: Der LLM-Aufruf laeuft ausschliesslich ueber den Session-Agent-Pfad
// (createSessionAgent -> OpenAICompatibleSessionAgent mit DataResidencyError
// VOR dem Request und x-llm-local-only-Header). Ist kein on-premises-Provider
// konfiguriert, wird die Generierung abgebrochen — nie ueber einen
// ungeprueften Pfad ausgefuehrt.
//
// Idempotenz: Eine vorhandene llm_summary_at ist das Signal "schon generiert".
// Ohne force=true wird die gespeicherte Zusammenfassung zurueckgegeben und der
// Provider nicht erneut aufgerufen.
import type { Pool } from 'pg';
import { getActiveProvider, getKiProviderById } from './coaching-ki-config-db.ts';
import { getSession, getSessionStepsContent, updateSessionSummary, type SessionStepContent } from './coaching-session-db';
import { createSessionAgent } from './session-agent-factory';

export const SUMMARY_SYSTEM_PROMPT = [
  'Du bist ein Coaching-Dokumentationsassistent. Fasse die folgende Coaching-Session',
  'in einer strukturierten deutschen Zusammenfassung von 150 bis 250 Woertern zusammen.',
  'Nutze genau diese vier Abschnitte:',
  '',
  '## Themen',
  'Die wichtigsten besprochenen Themen in Stichpunkten.',
  '',
  '## Erkenntnisse',
  'Einsichten, die waehrend der Session deutlich wurden.',
  '',
  '## Offene Punkte',
  'Themen, die nicht abgeschlossen wurden und naechstes Mal aufgegriffen werden koennen.',
  '',
  '## Naechste Schritte',
  'Konkrete Vereinbarungen zwischen Coach und Klient.',
  '',
  'Schreibe nur die Zusammenfassung, keine Einleitung. Benenne den Klienten nie',
  'mit Namen, nur neutral als "der Klient".',
].join('\n');

export interface SummaryStepInput {
  stepNumber: number;
  stepName: string;
  phase: string;
  aiResponse: string | null;
  coachNotes: string | null;
}

export interface GenerateSummaryOptions {
  sessionId: string;
  brand?: string;
  force?: boolean;
}

export interface GenerateSummaryResult {
  summary: string;
  generatedAt: string;
  provider: string | null;
  model: string | null;
  cached: boolean;
}

/**
 * Baut den LLM-Input aus den Schritt-Inhalten. Ein Schritt fliesst ein, sobald
 * er entweder eine KI-Antwort (aiResponse) oder eine Coaching-Notiz
 * (coachNotes) traegt — ein Schritt ist fuer die Zusammenfassung relevant,
 * sobald irgendein Inhalt vorliegt. Schritte ganz ohne Inhalt (pending/
 * skipped) werden uebersprungen.
 */
export function buildSummaryInput(steps: SummaryStepInput[]): string {
  const blocks: string[] = [];
  for (const step of steps) {
    const parts: string[] = [];
    if (step.aiResponse) parts.push(`KI-Antwort: ${step.aiResponse}`);
    if (step.coachNotes) parts.push(`Coaching-Notiz: ${step.coachNotes}`);
    if (parts.length === 0) continue;
    blocks.push(`## Schritt ${step.stepNumber}: ${step.stepName} (${step.phase})\n${parts.join('\n')}`);
  }
  return blocks.join('\n\n');
}

function buildUserPrompt(steps: SessionStepContent[]): string {
  return [
    'Unten sind die Schritte der Coaching-Session mit KI-Antworten und',
    'Coaching-Notizen. Erstelle daraus die Zusammenfassung nach der Anweisung.',
    '',
    buildSummaryInput(steps),
  ].join('\n');
}

/**
 * Generiert (oder liefert idempotent) die Zusammenfassung einer Session.
 * Fehlerpfade: Session nicht gefunden, keine Schritt-Inhalte, kein
 * on-premises-Provider (DataResidencyError schlaegt durch — der Provider-Call
 * findet nie statt) und Provider-Konfigurationsfehler werden an den Endpoint
 * weitergereicht.
 */
export async function generateSessionSummary(
  pool: Pool,
  options: GenerateSummaryOptions,
): Promise<GenerateSummaryResult> {
  const brand = options.brand ?? process.env.BRAND ?? 'mentolder';
  const force = options.force === true;

  const session = await getSession(pool, options.sessionId);
  if (!session) throw new Error('Session nicht gefunden');

  if (session.llmSummary && session.llmSummaryAt && !force) {
    return {
      summary: session.llmSummary,
      generatedAt: session.llmSummaryAt.toISOString(),
      provider: null,
      model: null,
      cached: true,
    };
  }

  const activeProvider = session.kiConfigId
    ? (await getKiProviderById(pool, session.kiConfigId)) ?? await getActiveProvider(pool, brand)
    : await getActiveProvider(pool, brand);
  if (!activeProvider) throw new Error('Kein KI-Provider konfiguriert');

  const steps = await getSessionStepsContent(pool, options.sessionId);
  const input = buildSummaryInput(steps);
  if (input.trim() === '') {
    throw new Error('Keine Schritt-Inhalte fuer eine Zusammenfassung vorhanden');
  }

  const agent = createSessionAgent(activeProvider);
  const result = await agent.generate({
    sessionId: options.sessionId,
    stepNumber: 0,
    coachInputs: {},
    kiConfig: activeProvider,
    brand,
    history: [],
    effectiveSystemPrompt: activeProvider.systemPrompt || SUMMARY_SYSTEM_PROMPT,
    assembledUserPrompt: buildUserPrompt(steps),
    stepName: 'Session-Zusammenfassung',
    phase: 'summary',
  });

  const updated = await updateSessionSummary(pool, options.sessionId, result.aiResponse);

  return {
    summary: result.aiResponse,
    generatedAt: updated?.llmSummaryAt.toISOString() ?? new Date().toISOString(),
    provider: activeProvider.provider,
    model: activeProvider.modelName,
    cached: false,
  };
}

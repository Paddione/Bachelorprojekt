import { QUESTIONNAIRES, resolveQuestions, type GrillingAnswers } from './grilling';

export interface GrillingSessionData {
  ticketId: string;
  questionnaireId: string;
  questions: { id: string; label: string; section?: string }[];
  hints: Record<string, string>;
  suggestions: Record<string, string[]>;
  existingAnswers: Record<string, string>;
  assets: Array<{ name: string; url: string; type: string }>;
}

interface TicketContext {
  external_id: string;
  title: string;
  body?: string;
  grilling_answers?: GrillingAnswers;
  attachments?: Array<{ filename: string; url: string; mimetype: string }>;
}

// Clickable suggestion chips shown in the Visual Companion per question.
// Static starting points; extend with ticket-specific keywords where useful.
const STATIC_SUGGESTIONS: Record<string, string[]> = {
  q1: ['Bug fix', 'Neue Funktionalität', 'Performance-Verbesserung', 'UI/UX-Verbesserung', 'Technische Schulden'],
  q2: ['Funktionierende UI-Interaktion', 'API-Response korrekt', 'Keine Regressionen', 'Alle Tests grün'],
  q3: ['Keine bekannten Abhängigkeiten', 'Frontend + Backend betroffen', 'Abhängig von: (Ticket-ID)'],
  q4: ['Entwickler (intern)', 'Endnutzer', 'Admin-Rolle', 'Beide Brands (mentolder + korczewski)'],
  q5: ['website/src/', 'k3d/', 'scripts/', 'mediaviewer-widget/'],
  q6: ['Spec vorhanden (openspec/changes/<slug>/proposal.md)', 'Plan vorhanden (openspec/changes/<slug>/tasks.md)', 'Kein Diagramm nötig'],
  q7: ['Svelte-Komponenten-Pattern', 'Astro-Page-Template', 'API-Route-Pattern', 'Kustomize-Overlay-Pattern'],
  q8: ['Keine Breaking Changes', 'API-Breaking-Change (Versionierung prüfen)', 'DB-Schemamigration nötig'],
  q9: ['Leere/fehlende Eingabe', 'Concurrent Updates / Race Condition', 'Netzwerk-Timeout', 'Ungültiger State'],
  q10: ['Netzwerk-Fehler (fail-soft)', '404/500 API-Antwort abfangen', 'Nutzerfeedback bei Fehler'],
  q11: ['Keine Security-Implikationen', 'Input-Validierung erforderlich', 'Auth-Check (Admin-only)'],
  q12: ['Keine Skalierungsbedenken', 'N+1 Query möglich', 'Caching empfohlen', 'Indexierung prüfen'],
  q13: ['Unit-Tests (Vitest)', 'Integration-Tests (BATS)', 'E2E-Tests (Playwright)', 'Alle drei'],
  q14: ['Keine bestehenden Tests betroffen', 'Tests in website/src/__tests__/', 'BATS-Tests in tests/unit/'],
  q15: ['Keine neuen Fixtures nötig', 'Neue Testdaten für DB-State', 'Mock-API-Response'],
  q16: ['task test:changed grün', 'Manuelle Prüfung im dev-Cluster', 'E2E in beiden Brands'],
  q17: ['dev (k3d-mentolder-dev)', 'mentolder (prod)', 'korczewski (prod)', 'Alle Umgebungen'],
  q18: ['Kein Rollback nötig (rein additiv)', 'git revert + deploy', 'DB-Migration rückgängig via Skript'],
  q19: ['Keine DB/Secret-Änderungen', 'DB-Migration erforderlich', 'Neues Secret via env:seal'],
  q20: ['Paddione reviewed + auto-merge', 'Manueller Deploy nach CI', 'task workspace:deploy ENV=mentolder+korczewski'],
  q21: ['Ja, alle Punkte geklärt', 'Offen: (Details eintragen)'],
  q22: ['PR erstellen und CI abwarten', 'Deploy zu beiden Brands', 'QA-Review + Ticket schließen'],
  q23: ['Kein Follow-up nötig', 'Follow-up: (beschreiben)'],
};

function buildSuggestions(
  questions: Array<{ id: string }>,
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const q of questions) {
    const chips = STATIC_SUGGESTIONS[q.id];
    if (chips && chips.length > 0) out[q.id] = chips;
  }
  return out;
}

export function buildGrillingSessionData(
  ticket: TicketContext,
  questionnaireId = 'final-grilling-v1',
): GrillingSessionData {
  const qn = QUESTIONNAIRES[questionnaireId];
  const questions: { id: string; label: string; section?: string }[] = [];
  if (qn) {
    const resolved = resolveQuestions(questionnaireId, QUESTIONNAIRES, null);
    for (const q of resolved) {
      questions.push({ id: q.id, label: q.prompt, section: q.section });
    }
  }

  const hints: Record<string, string> = {};
  const ticketBody = ticket.body || ticket.title || '';

  for (const q of questions) {
    const qhints: string[] = [];
    if (ticketBody) {
      qhints.push(`Ticket: ${ticketBody.slice(0, 200)}`);
    }
    if (ticket.grilling_answers?.[questionnaireId]?.[q.id]) {
      qhints.push(`Bereits beantwortet: ${ticket.grilling_answers[questionnaireId][q.id].slice(0, 100)}`);
    }
    if (qhints.length > 0) {
      hints[q.id] = qhints.join(' | ');
    }
  }

  const suggestions = buildSuggestions(questions);
  const existingAnswers: Record<string, string> = ticket.grilling_answers?.[questionnaireId] ?? {};

  const assets = (ticket.attachments ?? []).map((a) => ({
    name: a.filename,
    url: a.url,
    type: a.mimetype,
  }));

  return {
    ticketId: ticket.external_id,
    questionnaireId,
    questions,
    hints,
    suggestions,
    existingAnswers,
    assets,
  };
}

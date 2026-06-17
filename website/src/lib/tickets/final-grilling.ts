import { QUESTIONNAIRES, resolveQuestions, type ResolvedQuestion, type GrillingAnswers } from './grilling';

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

  const suggestions: Record<string, string[]> = {};
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

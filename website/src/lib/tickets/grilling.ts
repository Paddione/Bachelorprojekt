// website/src/lib/tickets/grilling.ts
// Pure data module — no DB imports, no cycles.
// Questionnaire definitions and answer type for the Grilling QA Panel.

export interface GrillingQuestion {
  id: string;       // e.g. "q1"
  label: string;    // question text
}

export interface GrillingSection {
  id: string;       // e.g. "s1"
  title: string;
  questions: GrillingQuestion[];
}

export interface GrillingQuestionnaire {
  id: string;       // e.g. "coaching-sessions-v1"
  title: string;
  sections: GrillingSection[];
}

/** Answers keyed by questionnaire-id → question-id → text */
export type GrillingAnswers = Record<string, Record<string, string>>;

export const QUESTIONNAIRES: Record<string, GrillingQuestionnaire> = {
  'coaching-sessions-v1': {
    id: 'coaching-sessions-v1',
    title: 'Konzeptioneller Aufbau von Coaching-Sessions',
    sections: [
      {
        id: 's1',
        title: '1. Die Coaching-Beziehung',
        questions: [
          { id: 'q1', label: 'Wie stellst du dir den idealen Einstieg in eine Coaching-Beziehung vor?' },
          { id: 'q2', label: 'Soll es eine Erstsession geben? Wie lang, mit welchem Ziel?' },
          { id: 'q3', label: 'Wie viele Sessions umfasst ein typisches Coaching bei dir? (feste Anzahl oder offen?)' },
          { id: 'q4', label: 'In welchem Rhythmus sollen Sessions stattfinden? (wöchentlich, 14-tägig, bedarfsgesteuert?)' },
        ],
      },
      {
        id: 's2',
        title: '2. Session-Struktur',
        questions: [
          { id: 'q5', label: 'Beschreibe den Ablauf einer einzelnen Session — von Begrüßung bis Abschluss.' },
          { id: 'q6', label: 'Welche Phasen sollte eine Session haben? (z. B. Check-in, Thema, Erkenntnis, Commitment)' },
          { id: 'q7', label: 'Braucht es einen strukturierten Leitfaden oder darf jede Session anders sein?' },
          { id: 'q8', label: 'Soll es Vor- oder Nachbereitung geben? (z. B. Reflexionsfragen zwischen den Sessions)' },
        ],
      },
      {
        id: 's3',
        title: '3. Methoden & Werkzeuge',
        questions: [
          { id: 'q9',  label: 'Mit welchen Methoden möchtest du arbeiten? (systemische Fragen, Sprachmuster, Körperarbeit, Timeline, Reframing …)' },
          { id: 'q10', label: 'Welche Rituale oder wiederkehrenden Elemente sind dir wichtig?' },
          { id: 'q11', label: 'Soll der Coachee konkrete Aufgaben/Experimente zwischen den Sessions bekommen?' },
          { id: 'q12', label: 'Wie gehst du mit Widerstand oder Blockaden um?' },
        ],
      },
      {
        id: 's4',
        title: '4. Dokumentation & Fortschritt',
        questions: [
          { id: 'q13', label: 'Wie hältst du Erkenntnisse aus einer Session fest?' },
          { id: 'q14', label: 'Soll der Coachee Zugriff auf seine Notizen haben?' },
          { id: 'q15', label: 'Wie misst du Fortschritt über mehrere Sessions hinweg?' },
          { id: 'q16', label: 'Was ist für dich ein erfolgreicher Abschluss eines Coachings?' },
        ],
      },
      {
        id: 's5',
        title: '5. Timing & Flexibilität',
        questions: [
          { id: 'q17', label: 'Wie lang sollten Sessions sein? (45 Min, 60 Min, 90 Min?)' },
          { id: 'q18', label: 'Gibt es Unterschiede zwischen Erst-, Folge- und Abschlusssession?' },
          { id: 'q19', label: 'Wie flexibel darf der Ablauf sein? (vom Coachee steuerbar oder strukturiert vorgegeben?)' },
          { id: 'q20', label: 'Wie gehst du mit akuten Themen um, die nicht auf dem Plan standen?' },
        ],
      },
      {
        id: 's6',
        title: '6. Deine Wünsche',
        questions: [
          { id: 'q21', label: 'Was fehlt dir in aktuellen Coaching-Tools immer wieder?' },
          { id: 'q22', label: 'Was wäre für dich der größte Gewinn eines durchdachten Session-Konzepts?' },
          { id: 'q23', label: 'Welche drei Eigenschaften muss dein ideales Session-Format haben?' },
        ],
      },
    ],
  },
};

export function getQuestionnaire(id: string): GrillingQuestionnaire | undefined {
  return QUESTIONNAIRES[id];
}

// --- Grilling-Doc absorption: pure parsing/split/status helpers (no DB, no cycles) ---

export interface ParsedQuestion { id: string; prompt: string; section?: string; answer?: string }

const PLACEHOLDER_ANSWERS = new Set(['—', '-', 'tbd', '(offen)', 'n/a']);

/** Empty, whitespace-only, or known placeholder tokens count as "no answer". */
export function isBlankAnswer(value: string | null | undefined): boolean {
  if (value == null) return true;
  const t = value.trim();
  if (t === '') return true;
  return PLACEHOLDER_ANSWERS.has(t.toLowerCase());
}

/** Partition questions into answered (non-blank answer) and unanswered. */
export function splitAnswered(questions: ParsedQuestion[]): {
  answered: ParsedQuestion[];
  unanswered: ParsedQuestion[];
} {
  const answered: ParsedQuestion[] = [];
  const unanswered: ParsedQuestion[] = [];
  for (const q of questions) (isBlankAnswer(q.answer) ? unanswered : answered).push(q);
  return { answered, unanswered };
}

export interface ParsedGrillingDoc { questionnaireId: string; title: string; questions: ParsedQuestion[] }

const FRONT_RE = /^---\s*$/;
const HEADING_RE = /^#{2,3}\s+(.*?)\s*$/;
const NUMBERED_RE = /^\s*(?:q(\d+)[.)]|(\d+)[.)])\s+(.*?)\s*$/i;
const BOLD_Q_RE = /^\s*\*\*(.+\?)\*\*\s*$/;
const ID_SUFFIX_RE = /\s*\{#([A-Za-z0-9_-]+)\}\s*$/;
const ANSWER_PREFIX_RE = /^\s*(?:antwort|a)\s*:\s*(.*)$/i;
const BLOCKQUOTE_RE = /^\s*>\s?(.*)$/;

interface RawQuestion { explicitId?: string; prompt: string; answerLines: string[] }

/** Tolerant Markdown grilling-doc parser. Never throws; best-effort question extraction. */
export function parseGrillingDoc(content: string, fallbackId: string): ParsedGrillingDoc {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  let i = 0;
  let frontId = '';
  let frontTitle = '';

  if (lines[0] !== undefined && FRONT_RE.test(lines[0])) {
    i = 1;
    while (i < lines.length && !FRONT_RE.test(lines[i])) {
      const m = /^([A-Za-z_]+)\s*:\s*(.*)$/.exec(lines[i]);
      if (m) {
        if (m[1] === 'questionnaire') frontId = m[2].trim();
        else if (m[1] === 'title') frontTitle = m[2].trim();
      }
      i++;
    }
    if (i < lines.length) i++;
  }

  const raws: RawQuestion[] = [];
  let current: RawQuestion | null = null;
  const pushAnswer = (text: string) => { if (current) current.answerLines.push(text); };

  for (; i < lines.length; i++) {
    const line = lines[i];
    const startQuestion = (rawPrompt: string, explicitId?: string) => {
      let prompt = rawPrompt;
      const idm = ID_SUFFIX_RE.exec(prompt);
      let id = explicitId;
      if (idm) { id = idm[1]; prompt = prompt.replace(ID_SUFFIX_RE, '').trim(); }
      current = { explicitId: id, prompt: prompt.trim(), answerLines: [] };
      raws.push(current);
    };

    const heading = HEADING_RE.exec(line);
    const numbered = NUMBERED_RE.exec(line);
    const bold = BOLD_Q_RE.exec(line);
    if (heading) { startQuestion(heading[1]); continue; }
    if (numbered) { startQuestion(numbered[3], numbered[1] ? `q${numbered[1]}` : undefined); continue; }
    if (bold) { startQuestion(bold[1]); continue; }

    if (!current) continue;
    const ans = ANSWER_PREFIX_RE.exec(line);
    if (ans) { pushAnswer(ans[1].trim()); continue; }
    const bq = BLOCKQUOTE_RE.exec(line);
    if (bq) { pushAnswer(bq[1].trim()); continue; }
    if (line.trim() === '') continue;
    pushAnswer(line.trim());
  }

  let auto = 0;
  const questions: ParsedQuestion[] = raws.map((r) => {
    auto += 1;
    const id = r.explicitId ?? `q${auto}`;
    const answerText = r.answerLines.join('\n').trim();
    const q: ParsedQuestion = { id, prompt: r.prompt };
    if (!isBlankAnswer(answerText)) q.answer = answerText;
    return q;
  });

  return {
    questionnaireId: frontId || fallbackId,
    title: frontTitle || frontId || fallbackId,
    questions,
  };
}

export interface GrillingMetaEntry {
  title?: string;
  questions: { id: string; prompt: string; section?: string }[];
  dismissed: string[];
}
export type GrillingMeta = Record<string, GrillingMetaEntry>;
export interface ResolvedQuestion { id: string; prompt: string; section?: string }

/** Registry questions (flattened, section title as `section`) ∪ absorbed meta questions.
 *  Registry wins on duplicate id; absorbed-only ids are appended in meta order. */
export function resolveQuestions(
  qnId: string,
  registry: Record<string, GrillingQuestionnaire>,
  meta: GrillingMeta | null,
): ResolvedQuestion[] {
  const out: ResolvedQuestion[] = [];
  const seen = new Set<string>();
  const qn = registry[qnId];
  if (qn) {
    for (const s of qn.sections) {
      for (const q of s.questions) {
        out.push({ id: q.id, prompt: q.label, section: s.title });
        seen.add(q.id);
      }
    }
  }
  for (const q of meta?.[qnId]?.questions ?? []) {
    if (seen.has(q.id)) continue;
    out.push({ id: q.id, prompt: q.prompt, section: q.section });
    seen.add(q.id);
  }
  return out;
}

/** answered (non-blank answer) | dismissed (in meta.dismissed) | open. answered wins over dismissed. */
export function questionStatus(
  qId: string,
  qnId: string,
  answers: GrillingAnswers | null,
  meta: GrillingMeta | null,
): 'answered' | 'dismissed' | 'open' {
  if (!isBlankAnswer(answers?.[qnId]?.[qId])) return 'answered';
  if ((meta?.[qnId]?.dismissed ?? []).includes(qId)) return 'dismissed';
  return 'open';
}

/** Aggregate counts over the resolved (registry ∪ absorbed) question set. */
export function grillingProgress(
  qnId: string,
  registry: Record<string, GrillingQuestionnaire>,
  answers: GrillingAnswers | null,
  meta: GrillingMeta | null,
): { total: number; answered: number; dismissed: number; open: number } {
  const qs = resolveQuestions(qnId, registry, meta);
  let answered = 0, dismissed = 0, open = 0;
  for (const q of qs) {
    const st = questionStatus(q.id, qnId, answers, meta);
    if (st === 'answered') answered++; else if (st === 'dismissed') dismissed++; else open++;
  }
  return { total: qs.length, answered, dismissed, open };
}

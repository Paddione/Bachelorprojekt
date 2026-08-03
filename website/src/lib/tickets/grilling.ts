// website/src/lib/tickets/grilling.ts
// Pure data module — no DB imports, no cycles.
// Questionnaire definitions and answer type for the Grilling QA Panel.

interface GrillingQuestion {
  id: string;       // e.g. "q1"
  label: string;    // question text
  choices?: string[]; // quick-select chips for common answers
}

interface GrillingSection {
  id: string;       // e.g. "s1"
  title: string;
  questions: GrillingQuestion[];
}

interface GrillingQuestionnaire {
  id: string;       // e.g. "coaching-sessions-v1"
  title: string;
  sections: GrillingSection[];
}

/** Answers keyed by questionnaire-id → question-id → text */
export type GrillingAnswers = Record<string, Record<string, string>>;

export const QUESTIONNAIRES: Record<string, GrillingQuestionnaire> = {
  'final-grilling-v1': {
    id: 'final-grilling-v1',
    title: 'Final-Grilling-Session — Softwareentwicklungs-Ticket',
    sections: [
      {
        id: 's1',
        title: '1. Anforderungsklärung',
        questions: [
          { id: 'q1', label: 'Was ist das Kernproblem, das dieses Ticket löst?' },
          { id: 'q2', label: 'Welche Acceptance Criteria müssen erfüllt sein?' },
          { id: 'q3', label: 'Gibt es Abhängigkeiten zu anderen Tickets oder Komponenten?' },
          { id: 'q4', label: 'Welche Stakeholder sind betroffen?' },
        ],
      },
      {
        id: 's2',
        title: '2. Architektur & Design',
        questions: [
          { id: 'q5', label: 'Welche Komponenten/Dateien sind betroffen?' },
          { id: 'q6', label: 'Gibt es ein Architektur-Diagramm oder eine Spec?' },
          { id: 'q7', label: 'Welche bestehenden Patterns werden wiederverwendet?' },
          { id: 'q8', label: 'Sind Breaking Changes zu erwarten?', choices: ['Nein, rückwärtskompatibel', 'Ja, aber kontrolliert', 'Ja, koordinierter Rollout nötig'] },
        ],
      },
      {
        id: 's3',
        title: '3. Risiken & Edge Cases',
        questions: [
          { id: 'q9', label: 'Was sind die kritischsten Edge Cases?' },
          { id: 'q10', label: 'Welche Fehlerzustände müssen behandelt werden?' },
          { id: 'q11', label: 'Gibt es Security-Implikationen?' },
          { id: 'q12', label: 'Performance- oder Skalierungsbedenken?' },
        ],
      },
      {
        id: 's4',
        title: '4. Testing-Strategie',
        questions: [
          { id: 'q13', label: 'Welche Test-Typen sind nötig? (Unit, Integration, E2E?)', choices: ['Unit', 'Integration', 'E2E', 'Unit + E2E', 'Alle drei'] },
          { id: 'q14', label: 'Welche bestehenden Tests sind betroffen?' },
          { id: 'q15', label: 'Braucht es neue Test-Fixtures oder Mocks?' },
          { id: 'q16', label: 'Wie wird die Korrektheit verifiziert?' },
        ],
      },
      {
        id: 's5',
        title: '5. Deployment & Rollout',
        questions: [
          { id: 'q17', label: 'Welche Umgebungen sind betroffen? (dev, beide Brands?)', choices: ['Nur dev', 'dev + mentolder', 'dev + korczewski', 'Alle Envs (dev + beide Brands)'] },
          { id: 'q18', label: 'Gibt es einen Rollback-Plan?', choices: ['Ja, reversibel', 'Nein, Forward-only-Migration', 'Nicht nötig (Feature-Flag)'] },
          { id: 'q19', label: 'Sind DB-Migrationen, Secrets oder Config-Änderungen nötig?', choices: ['Nein', 'Ja, DB-Migration', 'Ja, neue Secrets', 'Ja, Config-Änderungen', 'Mehreres davon'] },
          { id: 'q20', label: 'Wer reviewt und deployed?', choices: ['Patrick (Self-Review)', 'Factory-Autopass', 'Manuell deployen nötig'] },
        ],
      },
      {
        id: 's6',
        title: '6. Abschluss & Übergabe',
        questions: [
          { id: 'q21', label: 'Sind alle Unklarheiten beseitigt?' },
          { id: 'q22', label: 'Was sind die nächsten Schritte nach der Implementierung?' },
          { id: 'q23', label: 'Gibt es offene Punkte für ein Follow-up-Ticket?' },
        ],
      },
    ],
  },
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
          { id: 'q3', label: 'Wie viele Sessions umfasst ein typisches Coaching bei dir? (feste Anzahl oder offen?)', choices: ['3-5 Sessions (kompakt)', '8-10 Sessions (standard)', '12+ Sessions (intensiv)', 'Offen je nach Bedarf'] },
          { id: 'q4', label: 'In welchem Rhythmus sollen Sessions stattfinden? (wöchentlich, 14-tägig, bedarfsgesteuert?)', choices: ['Wöchentlich', 'Alle 2 Wochen', 'Monatlich', 'Bedarfsgesteuert'] },
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
          { id: 'q17', label: 'Wie lang sollten Sessions sein? (45 Min, 60 Min, 90 Min?)', choices: ['45 Minuten', '60 Minuten', '90 Minuten', '120 Minuten'] },
          { id: 'q18', label: 'Gibt es Unterschiede zwischen Erst-, Folge- und Abschlusssession?', choices: ['Ja, Erst-/Folge-/Abschluss-Session verschieden', 'Nein, gleiche Struktur immer', 'Nur Abschluss-Session anders'] },
          { id: 'q19', label: 'Wie flexibel darf der Ablauf sein? (vom Coachee steuerbar oder strukturiert vorgegeben?)', choices: ['Sehr strukturiert (vorgegebener Ablauf)', 'Hybrid (Rahmen + Coachee-Steuerung)', 'Offen (Coachee bestimmt)'] },
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
  'brainstorm-v1': {
    id: 'brainstorm-v1',
    title: 'Brainstorm-Session — Feature-Vorklärung',
    sections: [
      {
        id: 's1',
        title: '1. Problemstellung',
        questions: [
          { id: 'q1', label: 'Welches konkrete Problem oder Bedürfnis adressiert diese Idee?' },
          { id: 'q2', label: 'Wer ist betroffen und wie äußert sich das Problem heute?' },
        ],
      },
      {
        id: 's2',
        title: '2. Lösungsansätze',
        questions: [
          { id: 'q3', label: 'Welche möglichen Lösungswege siehst du?' },
          { id: 'q4', label: 'Welcher Ansatz ist der vielversprechendste und warum?', choices: ['Kleinster Eingriff (MVP)', 'Vollständige Lösung', 'Schrittweiser Rollout', 'Noch unklar'] },
          { id: 'q5', label: 'Welche bestehenden Patterns oder Komponenten lassen sich wiederverwenden?' },
        ],
      },
      {
        id: 's3',
        title: '3. Risiken & Unbekannte',
        questions: [
          { id: 'q6', label: 'Was sind die größten Risiken oder offenen Fragen?' },
          { id: 'q7', label: 'Welche Annahmen müssen vor der Umsetzung validiert werden?' },
        ],
      },
      {
        id: 's4',
        title: '4. Nächste Schritte',
        questions: [
          { id: 'q8', label: 'Was ist der kleinste sinnvolle erste Schritt?' },
          { id: 'q9', label: 'Was muss als Nächstes entschieden oder recherchiert werden?' },
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

interface ParsedGrillingDoc { questionnaireId: string; title: string; questions: ParsedQuestion[] }

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
interface ResolvedQuestion { id: string; prompt: string; section?: string; choices?: string[] }

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
        out.push({ id: q.id, prompt: q.label, section: s.title, ...(q.choices ? { choices: q.choices } : {}) });
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

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

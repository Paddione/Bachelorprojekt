export type Phase = 'problem_ziel' | 'analyse' | 'loesung' | 'umsetzung';

export interface StepInput {
  key: string;
  label: string;
  required: boolean;
  multiline?: boolean;
}

export interface StepDefinition {
  stepNumber: number;
  stepName: string;
  phase: Phase;
  phaseLabel: string;
  inputs: StepInput[];
  systemPrompt: string;
  userTemplate: string;
}

const BASE_SYSTEM = `Du bist ein erfahrener Coaching-Assistent (Triadisches KI-Coaching nach Geißler).
Deine Aufgabe: basierend auf den Coach-Eingaben eine präzise, handlungsorientierte Gesprächsintervention vorschlagen.
Sprache: Deutsch. Maximal 250 Wörter. Kein wörtliches Buchzitat. Keine allgemeinen Ratschläge — konkret zur Situation.`;

export const STEP_DEFINITIONS: StepDefinition[] = [
  {
    stepNumber: 1,
    stepName: 'Erstanamnese',
    phase: 'problem_ziel',
    phaseLabel: 'Phase 1: Problem & Ziel',
    inputs: [
      { key: 'anlass', label: 'Anlass der Session', required: true, multiline: true },
      { key: 'vorerfahrung', label: 'Vorerfahrung mit Coaching', required: false },
      { key: 'situation', label: 'Aktuelle Situation (in Worten des Klienten)', required: true, multiline: true },
    ],
    systemPrompt: BASE_SYSTEM,
    userTemplate: `Erstanamnese:
Anlass: {anlass}
Vorerfahrung: {vorerfahrung}
Aktuelle Situation: {situation}

Schlage eine einfühlsame Eröffnungsintervention vor, die die Situation würdigt und den Klienten einlädt, tiefer zu gehen.`,
  },
  {
    stepNumber: 2,
    stepName: 'Schlüsselaffekt',
    phase: 'problem_ziel',
    phaseLabel: 'Phase 1: Problem & Ziel',
    inputs: [
      { key: 'hauptgefuehl', label: 'Hauptgefühl des Klienten', required: true },
      { key: 'koerperreaktion', label: 'Körperliche Reaktion / wo spürbar', required: false },
      { key: 'ausloeser', label: 'Auslöser / Trigger', required: true },
    ],
    systemPrompt: BASE_SYSTEM,
    userTemplate: `Schlüsselaffekt-Arbeit:
Hauptgefühl: {hauptgefuehl}
Körperreaktion: {koerperreaktion}
Auslöser: {ausloeser}

Schlage eine Intervention vor, die den Klienten mit dem Schlüsselaffekt in Kontakt bringt, ohne ihn zu überwältigen.`,
  },
  {
    stepNumber: 3,
    stepName: 'Zielformulierung',
    phase: 'problem_ziel',
    phaseLabel: 'Phase 1: Problem & Ziel',
    inputs: [
      { key: 'wunschzustand', label: 'Wunschzustand des Klienten', required: true, multiline: true },
      { key: 'ressourcen', label: 'Bereits vorhandene Ressourcen', required: false },
      { key: 'erste_schritte', label: 'Erste Ideen für Schritte', required: false },
    ],
    systemPrompt: BASE_SYSTEM,
    userTemplate: `Zielformulierung:
Wunschzustand: {wunschzustand}
Ressourcen: {ressourcen}
Erste Ideen: {erste_schritte}

Hilf dabei, ein SMART-Ziel zu formulieren und die Brücke zwischen aktuellem Zustand und Wunschzustand zu bauen.`,
  },
  {
    stepNumber: 4,
    stepName: 'Teufelskreislauf',
    phase: 'analyse',
    phaseLabel: 'Phase 2: Analyse',
    inputs: [
      { key: 'ausloeser', label: 'Auslöser des Musters', required: true },
      { key: 'reaktion', label: 'Automatische Reaktion des Klienten', required: true, multiline: true },
      { key: 'konsequenz', label: 'Konsequenz / was sich dadurch verschlimmert', required: true },
    ],
    systemPrompt: BASE_SYSTEM,
    userTemplate: `Teufelskreislauf-Analyse:
Auslöser: {ausloeser}
Automatische Reaktion: {reaktion}
Konsequenz: {konsequenz}

Beschreibe den Teufelskreislauf und schlage einen Interventionspunkt vor, an dem der Klient aussteigen könnte.`,
  },
  {
    stepNumber: 5,
    stepName: 'Ressourcenanalyse',
    phase: 'analyse',
    phaseLabel: 'Phase 2: Analyse',
    inputs: [
      { key: 'staerken', label: 'Stärken und Fähigkeiten des Klienten', required: true, multiline: true },
      { key: 'bisherige_versuche', label: 'Was hat der Klient bisher versucht?', required: false },
      { key: 'externe_unterstuetzung', label: 'Externe Unterstützung / Netzwerk', required: false },
    ],
    systemPrompt: BASE_SYSTEM,
    userTemplate: `Ressourcenanalyse:
Stärken: {staerken}
Bisherige Versuche: {bisherige_versuche}
Externes Netzwerk: {externe_unterstuetzung}

Schlage vor, wie der Klient seine Ressourcen gezielt für das Ziel aktivieren kann.`,
  },
  {
    stepNumber: 6,
    stepName: 'Komplementärkräfte',
    phase: 'analyse',
    phaseLabel: 'Phase 2: Analyse',
    inputs: [
      { key: 'gegensatz', label: 'Gegensatz zum Problem / was fehlt', required: true },
      { key: 'polaritaet', label: 'Polarität (z.B. Kontrolle ↔ Loslassen)', required: false },
      { key: 'verborgene_staerke', label: 'Verborgene Stärke im Problem', required: false },
    ],
    systemPrompt: BASE_SYSTEM,
    userTemplate: `Komplementärkräfte:
Gegensatz: {gegensatz}
Polarität: {polaritaet}
Verborgene Stärke: {verborgene_staerke}

Zeige auf, wie die Komplementärkräfte zur Lösungsentwicklung genutzt werden können.`,
  },
  {
    stepNumber: 7,
    stepName: 'Lösungsentwicklung / Bildarbeit',
    phase: 'loesung',
    phaseLabel: 'Phase 3: Lösung',
    inputs: [
      { key: 'bild_metapher', label: 'Bild oder Metapher des Klienten für die Lösung', required: true, multiline: true },
      { key: 'koerperliche_empfindung', label: 'Körperliche Empfindung beim Bild', required: false },
      { key: 'verknuepfung', label: 'Verknüpfung zur aktuellen Situation', required: false },
    ],
    systemPrompt: BASE_SYSTEM,
    userTemplate: `Immersive Bildarbeit:
Bild/Metapher: {bild_metapher}
Körperliche Empfindung: {koerperliche_empfindung}
Verknüpfung: {verknuepfung}

Begleite den Klienten tiefer in das Lösungsbild hinein. Schlage Fragen vor, die das Bild lebendig machen.`,
  },
  {
    stepNumber: 8,
    stepName: 'Erfolgsimagination',
    phase: 'loesung',
    phaseLabel: 'Phase 3: Lösung',
    inputs: [
      { key: 'erfolgsbild', label: 'Wie sieht Erfolg aus (konkret)?', required: true, multiline: true },
      { key: 'gefuehl_bei_erfolg', label: 'Wie fühlt sich das an?', required: false },
      { key: 'veraenderung', label: 'Was hat sich verändert (Verhalten, Beziehungen)?', required: false },
    ],
    systemPrompt: BASE_SYSTEM,
    userTemplate: `Erfolgsimagination:
Erfolgsbild: {erfolgsbild}
Gefühl: {gefuehl_bei_erfolg}
Veränderung: {veraenderung}

Verankere die Erfolgsimagination und leite über zur konkreten Umsetzungsplanung.`,
  },
  {
    stepNumber: 9,
    stepName: 'Goldstücks-Aktivität',
    phase: 'umsetzung',
    phaseLabel: 'Phase 4: Umsetzung',
    inputs: [
      { key: 'konkrete_schritte', label: 'Konkrete nächste Schritte', required: true, multiline: true },
      { key: 'ressourcen_dafuer', label: 'Benötigte Ressourcen', required: false },
      { key: 'zeitplan', label: 'Zeitplan / bis wann', required: false },
    ],
    systemPrompt: BASE_SYSTEM,
    userTemplate: `Goldstücks-Aktivität (Umsetzungsplanung):
Konkrete Schritte: {konkrete_schritte}
Ressourcen: {ressourcen_dafuer}
Zeitplan: {zeitplan}

Identifiziere die eine "Goldstücks-Aktivität" — den einzelnen Schritt mit dem größten Hebel — und formuliere ihn als konkreten Auftrag.`,
  },
  {
    stepNumber: 10,
    stepName: 'Transfersicherung',
    phase: 'umsetzung',
    phaseLabel: 'Phase 4: Umsetzung',
    inputs: [
      { key: 'hindernisse', label: 'Mögliche Hindernisse', required: true, multiline: true },
      { key: 'unterstuetzung', label: 'Wer/was unterstützt?', required: false },
      { key: 'naechster_termin', label: 'Nächster Termin / Nachverfolgung', required: false },
    ],
    systemPrompt: BASE_SYSTEM,
    userTemplate: `Transfersicherung:
Hindernisse: {hindernisse}
Unterstützung: {unterstuetzung}
Nächster Termin: {naechster_termin}

Erstelle einen Sicherungsplan: wie überwindet der Klient die Hindernisse? Welche Notfallstrategie gibt es?`,
  },
];

export function getStepDef(stepNumber: number): StepDefinition {
  const def = STEP_DEFINITIONS.find(s => s.stepNumber === stepNumber);
  if (!def) throw new Error(`Step ${stepNumber} not found`);
  return def;
}

export function buildUserPrompt(def: StepDefinition, inputs: Record<string, string>): string {
  return def.userTemplate.replace(/\{(\w+)\}/g, (_, key) => inputs[key] ?? '—');
}

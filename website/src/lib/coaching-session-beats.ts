import {
  BASE_SYSTEM,
  TB_TEUFELSKREISLAUF,
  TB_AUSBALANCIERUNGSPROBLEME,
  TB_KOMPLEMENTAERKRAEFTE,
  TB_ERFOLGSFAKTOREN,
} from './coaching-textbausteine';

export type Phase = 'problem_ziel' | 'analyse' | 'loesung' | 'umsetzung';

export interface StepInput {
  key: string;
  label: string;
  required: boolean;
  multiline?: boolean;
  /** UI-Vorbefüllung: dieses Feld wird mit der akzeptierten aiResponse des vorigen
   *  ki_prompt-Beats vorbefüllt (aktiv editierbar) — bildet das "Ich übernehme mit
   *  folgenden Modifikationen"-Muster ab. Ausgewertet von P2 (SessionWizard). */
  prefillFromPrevKiResponse?: boolean;
}

export interface InstructionBeat {
  kind: 'instruction';
  /** Regieanweisung: was der Coach jetzt live mit dem Coachee tut (kein KI-Call). */
  regie: string;
  /** Optional: Freitext-Erfassung der Coachee-Aussage; liefert Kontext für spätere Beats. */
  capture?: { key: string; label: string };
}

export interface KiPromptBeat {
  kind: 'ki_prompt';
  /** Kurzer Kontext-Hinweis überm Prompt. */
  regie?: string;
  inputs: StepInput[];
  /** Kann Textbaustein-Konstanten einbetten. */
  systemPrompt: string;
  /** Platzhalter: {key} für eigene inputs, {capturedFrom:INDEX} für read-only-Einsetzung
   *  des captured-Texts des InstructionBeat mit Index INDEX im selben Schritt. */
  userTemplate: string;
}

export type Beat = InstructionBeat | KiPromptBeat;

export interface StepDefinition {
  stepNumber: number;
  stepName: string;
  phase: Phase;
  phaseLabel: string;
  description: string;
  beats: Beat[];
}

export const STEP_DEFINITIONS: StepDefinition[] = [
  // ── Phase A: Problem- & Zielbeschreibung ──────────────────────────────
  {
    stepNumber: 1,
    stepName: 'Erste Problem- und Zielbeschreibung',
    phase: 'problem_ziel',
    phaseLabel: 'Phase A: Problem & Ziel',
    description: 'Rahmen setzen, Ist- und Soll-Zustand vom Coachee erzählen lassen und der KI übergeben.',
    beats: [
      {
        kind: 'instruction',
        regie: 'Begrüße den Coachee, stelle mit etwas Small Talk eine tragfähige Arbeitsbeziehung her und erkläre kurz den Ablauf des triadischen KI-Coachings (Coach ↔ Coachee ↔ KI, Bildschirm wird geteilt).',
      },
      {
        kind: 'instruction',
        regie: 'Lass den Coachee in Ruhe schildern, was ihn herführt: den belastenden Ist-Zustand und den gewünschten Soll-Zustand. Protokolliere die Erzählung möglichst in seinen eigenen Worten.',
        capture: { key: 'ist_soll', label: 'Ist- und Soll-Zustand (in Worten des Coachee)' },
      },
      {
        kind: 'ki_prompt',
        regie: 'Übergib die protokollierte Ist/Soll-Erzählung an die KI.',
        inputs: [],
        systemPrompt: BASE_SYSTEM,
        userTemplate: `Ich schildere dir mein Anliegen. Ist-Zustand und gewünschter Soll-Zustand:
{capturedFrom:1}

Bitte spiegle mir in wenigen Sätzen wertschätzend zurück, was du als meinen Kern-Konflikt und mein Ziel verstehst, und stelle mir eine vertiefende Rückfrage.`,
      },
    ],
  },
  {
    stepNumber: 2,
    stepName: 'Fokussierung Schlüsselsituation / Schlüsselaffekt',
    phase: 'problem_ziel',
    phaseLabel: 'Phase A: Problem & Ziel',
    description: 'Reaktion des Coachee, Exploration der Schlüsselsituation, strukturierter 4-Aspekte-Bericht und Modifikations-Loop.',
    beats: [
      {
        kind: 'instruction',
        regie: 'Lies dem Coachee die KI-Rückmeldung vor und erfasse seine Reaktion darauf (Zustimmung, Korrektur, Ergänzung).',
        capture: { key: 'reaktion_1', label: 'Reaktion des Coachee auf die KI-Spiegelung' },
      },
      {
        kind: 'instruction',
        regie: 'Exploriere gemeinsam die eine Schlüsselsituation, in der das Problem besonders deutlich wird, und den dabei auftretenden Schlüsselaffekt (das stärkste Gefühl). Protokolliere Situation und Affekt.',
        capture: { key: 'schluesselsituation', label: 'Schlüsselsituation und Schlüsselaffekt' },
      },
      {
        kind: 'ki_prompt',
        regie: 'Fordere von der KI einen strukturierten Bericht in 4 Aspekten an.',
        inputs: [],
        systemPrompt: BASE_SYSTEM,
        userTemplate: `Meine Reaktion auf deine Spiegelung: {capturedFrom:0}

Hier meine Schlüsselsituation und der Schlüsselaffekt darin:
{capturedFrom:1}

Bitte fasse das strukturiert in vier Aspekten zusammen: (1) auslösende Situation, (2) Schlüsselaffekt, (3) meine automatische Reaktion, (4) die unerwünschte Konsequenz.`,
      },
      {
        kind: 'instruction',
        regie: 'Lies den 4-Aspekte-Bericht vor und erfasse, wo der Coachee zustimmt oder etwas anders sieht.',
        capture: { key: 'reaktion_2', label: 'Reaktion auf den 4-Aspekte-Bericht' },
      },
      {
        kind: 'ki_prompt',
        regie: 'Übernahme mit Modifikationen: das Eingabefeld ist mit dem KI-Bericht vorbefüllt und wird vom Coachee angepasst.',
        inputs: [
          { key: 'modifikationen', label: 'Übernommener/angepasster 4-Aspekte-Bericht', required: true, multiline: true, prefillFromPrevKiResponse: true },
        ],
        systemPrompt: BASE_SYSTEM,
        userTemplate: `Vielen Dank für deine Ausführungen. Ich übernehme mit folgenden Modifikationen:
{modifikationen}

Bitte bestätige den so präzisierten Kern und halte ihn als Arbeitsgrundlage fest.`,
      },
    ],
  },
  {
    stepNumber: 3,
    stepName: 'Präzisierung Schlüsselaffekt (Bildarbeit)',
    phase: 'problem_ziel',
    phaseLabel: 'Phase A: Problem & Ziel',
    description: 'Immersive Bildarbeit zum Schlüsselaffekt: Bild wählen lassen, verbal beschreiben, Querverbindung ziehen, Modifikations-Loop. Kein Bild-Upload — nur Freitext.',
    beats: [
      {
        kind: 'instruction',
        regie: 'Zeige dem Coachee die vorbereitete Bildauswahl (geteilter Bildschirm) und lass ihn ohne Erklärung intuitiv das Bild wählen, das seinem Schlüsselaffekt am nächsten kommt. Führe eine kurze immersive Bildbetrachtung durch.',
      },
      {
        kind: 'instruction',
        regie: 'Lass den Coachee das gewählte Bild und was es in ihm auslöst mit eigenen Worten beschreiben. Die KI bekommt nie das Bild selbst, nur diese verbale Beschreibung.',
        capture: { key: 'bildbeschreibung', label: 'Beschreibung des gewählten Bildes und der ausgelösten Empfindung' },
      },
      {
        kind: 'ki_prompt',
        regie: 'Lass die KI eine Querverbindung zwischen Bild und Schlüsselaffekt ziehen.',
        inputs: [],
        systemPrompt: BASE_SYSTEM,
        userTemplate: `Ich habe zu meinem Schlüsselaffekt intuitiv ein Bild gewählt und beschreibe es so:
{capturedFrom:1}

Bitte ziehe die Querverbindung zwischen diesem Bild und meinem Schlüsselaffekt und formuliere den Affekt dadurch präziser.`,
      },
      {
        kind: 'instruction',
        regie: 'Lies die präzisierte Affektbeschreibung vor und erfasse die Reaktion des Coachee.',
        capture: { key: 'reaktion', label: 'Reaktion auf die präzisierte Affektbeschreibung' },
      },
      {
        kind: 'ki_prompt',
        regie: 'Übernahme mit Modifikationen (vorbefüllt).',
        inputs: [
          { key: 'modifikationen', label: 'Übernommener/angepasster präzisierter Schlüsselaffekt', required: true, multiline: true, prefillFromPrevKiResponse: true },
        ],
        systemPrompt: BASE_SYSTEM,
        userTemplate: `Vielen Dank. Ich übernehme meinen präzisierten Schlüsselaffekt mit folgenden Modifikationen:
{modifikationen}

Bitte halte diesen präzisierten Schlüsselaffekt als Arbeitsgrundlage fest.`,
      },
    ],
  },
  {
    stepNumber: 4,
    stepName: 'Präzisierung Coachingziel (Bildarbeit)',
    phase: 'problem_ziel',
    phaseLabel: 'Phase A: Problem & Ziel',
    description: 'Analog zu Schritt 3, aber für ein Ziel-Bild: das gewünschte Ziel über immersive Bildarbeit präzisieren. Kein Bild-Upload — nur Freitext.',
    beats: [
      {
        kind: 'instruction',
        regie: 'Zeige erneut die Bildauswahl und lass den Coachee intuitiv das Bild wählen, das seinem gewünschten Ziel-Zustand am nächsten kommt. Kurze immersive Bildbetrachtung.',
      },
      {
        kind: 'instruction',
        regie: 'Lass den Coachee das Ziel-Bild und den darin liegenden Wunsch-Zustand verbal beschreiben.',
        capture: { key: 'zielbild', label: 'Beschreibung des Ziel-Bildes und des Wunsch-Zustands' },
      },
      {
        kind: 'ki_prompt',
        regie: 'Lass die KI die Querverbindung zwischen Ziel-Bild und Coachingziel ziehen.',
        inputs: [],
        systemPrompt: BASE_SYSTEM,
        userTemplate: `Zu meinem gewünschten Ziel-Zustand habe ich intuitiv dieses Bild gewählt und beschreibe es so:
{capturedFrom:1}

Bitte ziehe die Querverbindung zwischen diesem Bild und meinem Ziel und formuliere mein Coachingziel dadurch präziser und motivierender.`,
      },
      {
        kind: 'instruction',
        regie: 'Lies das präzisierte Ziel vor und erfasse die Reaktion des Coachee.',
        capture: { key: 'reaktion', label: 'Reaktion auf das präzisierte Coachingziel' },
      },
      {
        kind: 'ki_prompt',
        regie: 'Übernahme mit Modifikationen (vorbefüllt).',
        inputs: [
          { key: 'modifikationen', label: 'Übernommenes/angepasstes präzisiertes Coachingziel', required: true, multiline: true, prefillFromPrevKiResponse: true },
        ],
        systemPrompt: BASE_SYSTEM,
        userTemplate: `Vielen Dank. Ich übernehme mein präzisiertes Coachingziel mit folgenden Modifikationen:
{modifikationen}

Bitte halte dieses präzisierte Coachingziel als Arbeitsgrundlage fest.`,
      },
    ],
  },
  // ── Phase B: Problemanalyse / Lösungsstrategie-Umriss ─────────────────
  {
    stepNumber: 5,
    stepName: 'Rekonstruktion Teufelskreislauf (Aufstellungsarbeit)',
    phase: 'analyse',
    phaseLabel: 'Phase B: Analyse',
    description: 'Konzept "Inneres Team" einführen, Tiefeninterview-Transkript erfassen, Konzept "Teufelskreislauf" einführen, KI rekonstruiert den Kreislauf mit Textbaustein.',
    beats: [
      {
        kind: 'instruction',
        regie: 'Erkläre dem Coachee das Konzept des "Inneren Teams": die widerstreitenden inneren Anteile, die in der Schlüsselsituation aktiv sind. Führe ein kurzes Tiefeninterview mit den beteiligten Anteilen.',
      },
      {
        kind: 'instruction',
        regie: 'Protokolliere das Tiefeninterview möglichst wörtlich (großes Freitextfeld): welche inneren Anteile melden sich, was sagt jeder, was befürchtet/will er.',
        capture: { key: 'tiefeninterview', label: 'Tiefeninterview-Transkript (Innere-Team-Anteile)' },
      },
      {
        kind: 'instruction',
        regie: 'Erkläre dem Coachee das Konzept "Teufelskreislauf" (Auslöser → Schlüsselaffekt → Reaktion → verstärkende Konsequenz) und kündige an, dass die KI ihn nun rekonstruiert.',
      },
      {
        kind: 'ki_prompt',
        regie: 'KI rekonstruiert den Teufelskreislauf aus dem Tiefeninterview.',
        inputs: [],
        systemPrompt: `${BASE_SYSTEM}\n\n${TB_TEUFELSKREISLAUF}`,
        userTemplate: `Hier das Transkript meines inneren Tiefeninterviews zur Schlüsselsituation:
{capturedFrom:1}

Bitte rekonstruiere daraus meinen Teufelskreislauf als geschlossenen Kreis und benenne die Ausstiegsstelle mit der größten Hebelwirkung.`,
      },
    ],
  },
  {
    stepNumber: 6,
    stepName: 'Ausbalancierungsprobleme',
    phase: 'analyse',
    phaseLabel: 'Phase B: Analyse',
    description: 'Reaktion/Rückfragen erfassen, KI leitet das zugrunde liegende Ausbalancierungsproblem her (mit Textbaustein).',
    beats: [
      {
        kind: 'instruction',
        regie: 'Lies dem Coachee die Teufelskreislauf-Rekonstruktion vor und erfasse seine Reaktion und Rückfragen.',
        capture: { key: 'reaktion', label: 'Reaktion und Rückfragen zum Teufelskreislauf' },
      },
      {
        kind: 'ki_prompt',
        regie: 'KI leitet das Ausbalancierungsproblem her.',
        inputs: [],
        systemPrompt: `${BASE_SYSTEM}\n\n${TB_AUSBALANCIERUNGSPROBLEME}`,
        userTemplate: `Meine Reaktion auf den rekonstruierten Teufelskreislauf: {capturedFrom:0}

Bitte leite daraus das zugrunde liegende Ausbalancierungsproblem her: welches Gegensatzpaar ist bei mir unausbalanciert, welcher Pol ist überbetont, welcher vernachlässigt?`,
      },
    ],
  },
  {
    stepNumber: 7,
    stepName: 'Komplementärkräfte',
    phase: 'analyse',
    phaseLabel: 'Phase B: Analyse',
    description: 'Reaktion + Bestätigung von 2–4 Kernproblemen erfassen, KI benennt die fehlenden/angelegten Komplementärkräfte (mit Textbaustein).',
    beats: [
      {
        kind: 'instruction',
        regie: 'Lies das Ausbalancierungsproblem vor und lass den Coachee 2–4 daraus abgeleitete Kernprobleme bestätigen oder anpassen.',
        capture: { key: 'kernprobleme', label: 'Reaktion und bestätigte 2–4 Kernprobleme' },
      },
      {
        kind: 'ki_prompt',
        regie: 'KI benennt die Komplementärkräfte.',
        inputs: [],
        systemPrompt: `${BASE_SYSTEM}\n\n${TB_KOMPLEMENTAERKRAEFTE}`,
        userTemplate: `Meine bestätigten Kernprobleme aus dem Ausbalancierungsproblem:
{capturedFrom:0}

Bitte benenne die konkreten Komplementärkräfte, die mir zum Ausbalancieren fehlen bzw. schon in Ansätzen vorhanden sind, und wie sie sich in meinem Alltag zeigen würden.`,
      },
    ],
  },
  // ── Phase C: Konkretisierung der Lösungsstrategie ─────────────────────
  {
    stepNumber: 8,
    stepName: 'Erfolgsimagination',
    phase: 'loesung',
    phaseLabel: 'Phase C: Lösung',
    description: 'Reaktion erfassen, KI liefert Goldstücks-Satz + 2 unterschiedliche Erfolgsimaginationen, Coachee wählt Variante + Änderungswünsche, KI übernimmt Modifikationen.',
    beats: [
      {
        kind: 'instruction',
        regie: 'Lies die Komplementärkräfte vor und erfasse die Reaktion des Coachee.',
        capture: { key: 'reaktion', label: 'Reaktion auf die Komplementärkräfte' },
      },
      {
        kind: 'ki_prompt',
        regie: 'KI liefert einen Goldstücks-Satz und zwei unterschiedliche Erfolgsimaginationen.',
        inputs: [],
        systemPrompt: BASE_SYSTEM,
        userTemplate: `Meine Reaktion auf die benannten Komplementärkräfte: {capturedFrom:0}

Bitte formuliere (1) einen prägnanten "Goldstücks-Satz", der meine aktivierte Komplementärkraft auf den Punkt bringt, und (2) zwei deutlich unterschiedliche, bildhafte Erfolgsimaginationen, wie mein gelingender Ziel-Zustand konkret aussieht.`,
      },
      {
        kind: 'instruction',
        regie: 'Lies beide Erfolgsimaginationen vor. Lass den Coachee eine Variante wählen und seine Änderungswünsche nennen.',
        capture: { key: 'variantenwahl', label: 'Gewählte Erfolgsimagination + Änderungswünsche' },
      },
      {
        kind: 'ki_prompt',
        regie: 'KI übernimmt die gewählte Variante mit Modifikationen (vorbefüllt aus der vorigen KI-Antwort).',
        inputs: [
          { key: 'modifikationen', label: 'Gewählte/angepasste Erfolgsimagination', required: true, multiline: true, prefillFromPrevKiResponse: true },
        ],
        systemPrompt: BASE_SYSTEM,
        userTemplate: `Vielen Dank. Ich wähle eine Erfolgsimagination und übernehme sie mit folgenden Modifikationen:
{modifikationen}

Bitte halte diese eine, verbindliche Erfolgsimagination als Zielbild fest.`,
      },
    ],
  },
  // ── Phase D: Umsetzungsunterstützung ──────────────────────────────────
  {
    stepNumber: 9,
    stepName: 'Nächste Aktivitäten',
    phase: 'umsetzung',
    phaseLabel: 'Phase D: Umsetzung',
    description: 'Reaktion erfassen, KI schlägt 3 konkrete Problemlösungshandlungen vor, Coachee-Planung wird ohne KI-Kommentar gespeichert.',
    beats: [
      {
        kind: 'instruction',
        regie: 'Lies das verbindliche Zielbild vor und erfasse die Reaktion des Coachee.',
        capture: { key: 'reaktion', label: 'Reaktion auf das verbindliche Zielbild' },
      },
      {
        kind: 'ki_prompt',
        regie: 'KI schlägt drei konkrete nächste Problemlösungshandlungen vor.',
        inputs: [],
        systemPrompt: BASE_SYSTEM,
        userTemplate: `Meine Reaktion auf mein Zielbild: {capturedFrom:0}

Bitte schlage mir drei konkrete, überschaubare nächste Problemlösungshandlungen vor, mit denen ich meine Komplementärkraft im Alltag erprobe. Jeweils eine Handlung pro Absatz.`,
      },
      {
        kind: 'instruction',
        regie: 'Lass den Coachee seine eigene Umsetzungsplanung zu diesen Handlungen formulieren. Diese Planung wird ohne KI-Kommentar gespeichert.',
        capture: { key: 'coachee_planung', label: 'Umsetzungsplanung des Coachee (ohne KI-Kommentar gespeichert)' },
      },
    ],
  },
  {
    stepNumber: 10,
    stepName: 'Umsetzungsunterstützung',
    phase: 'umsetzung',
    phaseLabel: 'Phase D: Umsetzung',
    description: 'Erfolgs- und Misserfolgserlebnis erfassen, KI extrahiert Lernpunkte (Textbausteine Erfolgsfaktoren + Komplementärkräfte), Coachee reagiert, KI übernimmt Modifikationen ohne Kommentar.',
    beats: [
      {
        kind: 'instruction',
        regie: 'Frage den Coachee (Folgesitzung) nach einem konkreten Erfolgserlebnis bei der Umsetzung und protokolliere es.',
        capture: { key: 'erfolgserlebnis', label: 'Konkretes Erfolgserlebnis bei der Umsetzung' },
      },
      {
        kind: 'instruction',
        regie: 'Frage nach einem konkreten Misserfolgserlebnis bei der Umsetzung und protokolliere es.',
        capture: { key: 'misserfolgserlebnis', label: 'Konkretes Misserfolgserlebnis bei der Umsetzung' },
      },
      {
        kind: 'ki_prompt',
        regie: 'KI extrahiert übertragbare Lernpunkte aus Erfolg und Misserfolg.',
        inputs: [],
        systemPrompt: `${BASE_SYSTEM}\n\n${TB_ERFOLGSFAKTOREN}\n\n${TB_KOMPLEMENTAERKRAEFTE}`,
        userTemplate: `Mein Erfolgserlebnis bei der Umsetzung: {capturedFrom:0}
Mein Misserfolgserlebnis bei der Umsetzung: {capturedFrom:1}

Bitte extrahiere daraus meine übertragbaren Erfolgsfaktoren und die dabei wirksamen Komplementärkräfte und formuliere sie als konkrete Lernpunkte für meine weiteren Umsetzungsschritte.`,
      },
      {
        kind: 'instruction',
        regie: 'Lies die Lernpunkte vor und erfasse die Reaktion des Coachee.',
        capture: { key: 'reaktion', label: 'Reaktion auf die Lernpunkte' },
      },
      {
        kind: 'ki_prompt',
        regie: 'KI übernimmt die Modifikationen ohne weiteren Kommentar (vorbefüllt).',
        inputs: [
          { key: 'modifikationen', label: 'Übernommene/angepasste Lernpunkte', required: true, multiline: true, prefillFromPrevKiResponse: true },
        ],
        systemPrompt: BASE_SYSTEM,
        userTemplate: `Ich übernehme meine Lernpunkte mit folgenden Modifikationen:
{modifikationen}

Bitte speichere diese Lernpunkte unkommentiert als Abschluss meiner Umsetzungsunterstützung.`,
      },
    ],
  },
];

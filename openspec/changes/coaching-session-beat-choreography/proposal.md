# Proposal: coaching-session-beat-choreography

_Ticket: T002138 · Design-Spec: openspec/changes/coaching-session-beat-choreography/design.md_

## Why

Die bestehende Coaching-Session-Implementierung (`SessionWizard.svelte` + `coaching-session-prompts.ts`)
bildet fachlich das **Triadische KI-Coaching nach Geißler** nur auf Ebene der 10 Schritt-Namen ab
("Erstanamnese", "Schlüsselaffekt", ...), nicht die tatsächliche mehrstufige Choreographie aus dem
zugrundeliegenden Fachbuch: jeder der 10 "Aufträge" besteht aus einer Sequenz abwechselnder
**Coach-Regieanweisungen** (Small Talk, Bildschirm teilen, immersive Bildbetrachtung) und
**KI-Prompts**, mit einem wiederkehrenden Reaktions-/Modifikations-Loop und vier benannten
Textbausteinen (Teufelskreislauf, Ausbalancierungsprobleme, Komplementärkräfte, Erfolgsfaktoren).
Aktuell: 1 Schritt = 1 statisches Formular = 1 KI-Aufruf = 1 Accept — das verliert die eigentliche
Methodik. Der Abschlussbericht ist zudem ein generischer KI-Fließtext ohne Bezug zu den einzelnen
Schritt-Inhalten, exportiert als simpler Markdown-Blob-Download.

Anlass: ein bevorstehender erster menschlicher Systemtest (Coachee-Rollenspiel), der die Session
inhaltlich geführt entlang des Strukturplans mit einem exportierbaren Arbeitsergebnis durchspielen soll.

## What

- **Beat-Modell** (siehe design.md): jeder der 10 Schritte wird eine Sequenz aus `InstructionBeat`
  (Regieanweisung, optional mit Freitext-Capture, kein KI-Call) und `KiPromptBeat` (Eingabefelder +
  KI-Aufruf + Accept/Verwerfen/Überspringen). Laufzeitdaten im bestehenden JSONB-Format
  (`coaching_session_steps.coach_inputs`/`ai_response` → Beat-Array) — **keine neue Tabelle, keine
  Migration** (keine schützenswerten Bestandsdaten im Altformat).
- Vier Textbaustein-Konstanten in `coaching-session-prompts.ts`, in die jeweiligen Ki-Prompt-Beats
  eingebettet.
- Bildarbeit-Schritte (3/4) und Tiefeninterview-Schritt (5) als reine Freitext-Beats — kein
  Bild-Upload/-Galerie-Feature.
- HTML-Export-Upgrade (Partial 2): strukturierte Protokoll-Ansicht aller akzeptierten Beats +
  KI-Executive-Summary, Druckansicht für PDF-Export über den Browser.
- Kein eigenständiges Coachee-Interface (Screen-Sharing reicht) — Architektur hält diese Option aber
  offen.

**Staging:** Partial 1 (Beat-Modell, alle 10 Schritte) zuerst und eigenständig testbar; Partial 2
(HTML-Export) danach.

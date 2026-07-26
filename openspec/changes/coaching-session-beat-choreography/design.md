---
ticket_id: T002138
plan_ref: openspec/changes/coaching-session-beat-choreography/tasks.md
---

# Design: Coaching-Session-Choreographie nach Geißler (Triadisches KI-Coaching)

## Kontext & Motivation

Die bestehende Coaching-Session-Implementierung (`website/src/components/admin/coaching/SessionWizard.svelte` +
`website/src/lib/coaching-session-prompts.ts`) bildet fachlich das **Triadische KI-Coaching nach Geißler**
ab (10 Schritte in 4 Phasen: A – Problem-/Zielbeschreibung, B – Problemanalyse/Lösungsstrategie-Umriss,
C – Konkretisierung der Lösungsstrategie, D – Umsetzungsunterstützung), aber nur auf Ebene der Schritt-Namen
und Kurzbeschreibungen. Die tatsächliche Choreographie aus dem zugrundeliegenden Fachbuch (Abb. 8.3
"Das KI-externe Prompt Skript des triadischen KI-Coachings", Kap. 8.2/8.3) ist mehrstufig und triadisch
(Coach ↔ Coachee ↔ KI), nicht "1 Formular → 1 KI-Aufruf → Accept":

- Jeder der 10 "Aufträge" (Mega-Prompts) besteht aus einer Sequenz abwechselnder **Coach-Prompts**
  (reine Regieanweisungen für die Live-Interaktion mit dem Coachee, z. B. Small Talk, Bildschirm teilen,
  immersive Bildbetrachtung durchführen) und **KI-Prompts** (Text, den der Coach — im Namen des Coachee,
  Ich-Form — an die KI schickt).
- Ein wiederkehrendes Muster ("Vielen Dank für deine Ausführungen... Ich übernehme mit folgenden
  Modifikationen...") lässt den Coachee auf jede KI-Antwort reagieren, bevor die (ggf. veränderte) Antwort
  in den nächsten Schritt einfließt.
- Vier benannte **Textbausteine** (Teufelskreislauf, Ausbalancierungsprobleme, Komplementärkräfte,
  Erfolgsfaktoren) werden als Methodik-Kontext in bestimmte KI-Prompts eingebettet.
- Schritt 3/4 (Bildarbeit) und Schritt 5 (Aufstellungsarbeit/Tiefeninterview) haben besondere,
  bisher nicht abgebildete Eingabeformen.

Diese Change flescht die Implementierung entsprechend aus, damit eine Coaching-Session **inhaltlich
geführt** entlang der Buch-Choreographie ablaufen kann und am Ende ein **exportierbares, konstruktives
Arbeitsergebnis** entsteht. Anlass: ein bevorstehender erster menschlicher Systemtest (Patrick spielt
einen Coachee, um das System interaktiv durchzuspielen).

Quellen (nicht Teil des Repos, dienten als fachliche Grundlage): Screenshot Abb. 8.3 des Fachbuchs,
`templates.pdf` (Kap. 8.2, vollständige Coach-/KI-Prompt-Vorlagen aller 10 Aufträge), `praxisbsp.pdf`
(Kap. 8.3, kompletter Beispiel-Chatverlauf).

## Entscheidungen aus dem Brainstorming

| Frage | Entscheidung |
|---|---|
| Zielsystem | `website`-Admin-Wizard (SessionWizard.svelte), **nicht** `studio-server` — Letzteres hat ein anderes, generisches Coaching-Modell ohne Bezug zu Geißler. |
| Choreographie-Tiefe | Volle Choreographie nach Buch (Coach-Regieanweisungen + Ki-Prompt-Teilschritte + Reaktions-/Modifikations-Loop), nicht das heutige 1-Schritt-Modell. |
| Coachee-Sicht | Vorerst **kein** eigenes Coachee-Interface — Screen-Sharing zwischen Coach und Coachee reicht (entspricht der Buch-Choreographie). **Zukunftsoption offen halten:** Architektur soll spätere Coachee-Interaktivität (eigene Bildauswahl, eigene Reaktionseingabe) nicht verbauen. |
| Datenmodell | Ansatz A: Beat-Array in den bestehenden JSONB-Spalten (`coach_inputs`/`ai_response` der `coaching_session_steps`-Tabelle) — **keine neue Tabelle, keine Migration**. |
| Bildarbeit (Schritt 3/4) | Nur Freitext-Beschreibung des Bildes durch den Coachee — kein Bild-Upload/-Galerie-Feature. Entspricht dem Buch: die KI bekommt nie das Bild selbst, nur die verbale Beschreibung. |
| Export-Inhalt | Volles Protokoll aller akzeptierten Beats **plus** KI-Executive-Summary obenauf. |
| Export-Format | Formatierte HTML/Druckansicht (per Browser-Druckdialog als PDF speicherbar), kein PDF-Library-Dependency. |
| Bestandsdaten | Keine echten Coachee-Daten im Altformat vorhanden — **kein Migrationsskript nötig**, alte Sessions dürfen im neuen Format unlesbar werden/zurückgesetzt werden. |
| Staging | Partial 1 (Choreographie, alle 10 Schritte) zuerst und eigenständig testbar; Partial 2 (HTML-Export) danach. |

## Architektur

**Betroffene Dateien (Kern):**
- `website/src/lib/coaching-session-prompts.ts` — `StepDefinition` erweitert um `beats: Beat[]`. Enthält
  die 4 Textbaustein-Konstanten.
- `website/src/lib/coaching-session-db.ts` — `SessionStep.coachInputs`/`aiResponse`/`coachNotes` werden
  durch `beats: BeatState[]` ersetzt (gleiche JSONB-Spalten, neue Anwendungs-Form).
- `website/src/components/admin/coaching/SessionWizard.svelte` — Kern-Umbau: Beat-Player statt
  Ein-Formular-pro-Schritt.
- `website/src/pages/api/admin/coaching/sessions/[id]/steps/[n]/generate.ts` und `.../[n]/index.ts` —
  um `beatIndex` erweitert.
- `website/src/pages/admin/coaching/sessions/[id].astro` — Report-Ansicht (Partial 2) ersetzt das
  heutige `<pre>` durch die strukturierte Protokoll-Ansicht.
- `website/src/pages/api/admin/coaching/sessions/[id]/complete.ts` — Executive-Summary-Prompt liest
  aus dem vollen Beat-Protokoll statt aus den heutigen flachen Feldern.

## Datenmodell

```ts
interface InstructionBeat {
  kind: 'instruction';
  regie: string;                 // Anzeigetext: was der Coach jetzt live tut
  capture?: { key: string; label: string };  // optional: Freitext-Erfassung, kein KI-Call
}

interface KiPromptBeat {
  kind: 'ki_prompt';
  regie?: string;                 // kurzer Kontext-Hinweis überm Prompt
  inputs: StepInput[];            // wie heute (key, label, required, multiline)
  systemPrompt: string;           // kann Textbaustein-Konstante einbetten
  userTemplate: string;           // Platzhalter {key} für eigene inputs + read-only-Einsetzung des
                                   // captured-Texts eines vorigen InstructionBeat (z. B. "...Folgendes
                                   // ausgelöst: {capturedFrom:beatIndex}")
}

type Beat = InstructionBeat | KiPromptBeat;

interface BeatState {
  beatIndex: number;
  captured?: string;              // Freitext (InstructionBeat.capture)
  inputs?: Record<string, string>; // KiPromptBeat-Eingaben
  aiResponse?: string | null;
  status: 'pending' | 'seen' | 'generated' | 'accepted' | 'skipped';
}
```

`SessionStep` behält `id`, `sessionId`, `stepNumber`, `stepName`, `phase`, `status`, `generatedAt`;
`coachInputs`/`aiPrompt`/`aiResponse`/`coachNotes` werden durch `beats: BeatState[]` ersetzt.

**Zwei getrennte Wiederverwendungs-Mechanismen** (nicht zu verwechseln):
1. **Template-Platzhalter** (`{capturedFrom:beatIndex}`): read-only Einsetzung eines vorigen
   `InstructionBeat.captured`-Texts in ein `userTemplate` — der Coach editiert an dieser Stelle nichts,
   der Text wurde schon beim Capture-Beat final erfasst (z. B. Auftrag 1→2: die protokollierte
   Ist/Soll-Erzählung fließt unverändert in den KI-Prompt ein).
2. **UI-Vorbefüllung**: das Eingabefeld eines Ki-Prompt-Beats wird mit der akzeptierten `aiResponse`
   des *vorigen Ki-Prompt-Beats* vorbefüllt und ist dort aktiv editierbar — dies bildet ausschließlich
   das "Ich übernehme mit folgenden Modifikationen"-Muster ab (Abschnitt UI/UX-Verhalten).

## UI/UX-Verhalten

- **Fortschritt:** Bestehende 10-Kreise-Leiste (Schritte) bleibt; zusätzliche Beat-Fortschrittsanzeige
  innerhalb des aktiven Schritts (z. B. "Beat 3/6").
- **InstructionBeat:** Hervorgehobene Regieanweisungs-Box (Icon + kursiver Text). Mit `capture`:
  Pflicht-Textfeld darunter, Label aus `capture.label`. "Weiter →" schließt den Beat ab.
- **KiPromptBeat:** Wie der heutige Schritt-Bildschirm (Eingabefelder → "KI befragen" → Streaming →
  Accept/Verwerfen/Überspringen), aber "Akzeptieren" wechselt zum nächsten *Beat*, nicht zum nächsten
  Schritt. Für "Ich übernehme mit folgenden Modifikationen"-Beats wird das Eingabefeld mit der
  akzeptierten KI-Antwort des vorigen Ki-Prompt-Beats vorbefüllt (inline editierbar).
- **Schritt-Abschluss:** Erst wenn alle Beats eines Schritts akzeptiert/übersprungen sind, gilt der
  Schritt als fertig; äußere Step-Navigation verhält sich wie heute.
- **Zurück:** Innerhalb eines Schritts zum vorigen Beat; am ersten Beat eines Schritts zum vorigen Schritt.
- Tiefeninterview-Transkript (Schritt 5) und die zwei Erfolgsimaginations-Varianten (Schritt 8) brauchen
  **keine** strukturellen Sonderfälle — normale Ki-Prompt-Beats mit entsprechendem Freitextfeld/Prompt-Inhalt.

## Die 10 Schritte als Beat-Sequenzen

| # | Schritt | Beats (Kurzform) |
|---|---------|-------------------|
| 1 | Erste Problem-/Zielbeschreibung | instr. (Begrüßung/Rahmen) → instr.+capture (Ist/Soll erzählen lassen) → ki_prompt (an KI schicken) |
| 2 | Fokussierung Schlüsselsituation/-affekt + Bericht | instr.+capture (Reaktion) → instr.+capture (Schlüsselsituation/-affekt explorieren) → ki_prompt (strukturierter 4-Aspekte-Bericht) → instr.+capture (Reaktion) → ki_prompt (Modifikationen, vorbefüllt) |
| 3 | Präzisierung Schlüsselaffekt (Bildarbeit) | instr. (Bilder zeigen, wählen lassen) → instr.+capture (Bildbeschreibung) → ki_prompt (Querverbindung + präzisierter Schlüsselaffekt) → instr.+capture (Reaktion) → ki_prompt (Modifikationen) |
| 4 | Präzisierung Coachingziel (Bildarbeit) | analog zu Schritt 3, für das Ziel-Bild |
| 5 | Rekonstruktion Teufelskreislauf (Aufstellungsarbeit) | instr. (Konzept "Inneres Team") → instr.+capture (Tiefeninterview-Transkript, großes Freitextfeld) → instr. (Konzept "Teufelskreislauf") → ki_prompt (Rekonstruktion mit Textbaustein "Teufelskreislauf") |
| 6 | Ausbalancierungsprobleme | instr.+capture (Reaktion/Rückfragen) → ki_prompt (mit Textbaustein "Ausbalancierungsprobleme") |
| 7 | Komplementärkräfte | instr.+capture (Reaktion + 2-4 Kernprobleme bestätigen) → ki_prompt (mit Textbaustein "Komplementärkräfte") |
| 8 | Erfolgsimagination | instr.+capture (Reaktion) → ki_prompt (Goldstücks-Satz + 2 unterschiedliche Erfolgsimaginationen) → instr.+capture (Variante wählen + Änderungswünsche) → ki_prompt (Modifikationen übernehmen) |
| 9 | Nächste Aktivitäten | instr.+capture (Reaktion) → ki_prompt (3 konkrete Problemlösungshandlungen) → instr.+capture (Coachee-Planung, "ohne Kommentar speichern") |
| 10 | Umsetzungsunterstützung | instr.+capture (Erfolgserlebnis) → instr.+capture (Misserfolgserlebnis) → ki_prompt (Lernpunkte mit Textbausteinen "Erfolgsfaktoren"+"Komplementärkräfte") → instr.+capture (Reaktion) → ki_prompt (Modifikationen, ohne Kommentar) |

Die vier Textbausteine leben als benannte String-Konstanten in `coaching-session-prompts.ts` (keine
eigene DB-Tabelle — nur 4 statische, selten geänderte Texte).

## Export (Partial 2)

Ersetzt die heutige `<pre>`-Report-Ansicht in `sessions/[id].astro`:

1. **Kopf:** Titel, Klient, Datum, KI-Provider (wie heute).
2. **Executive Summary:** bewährte KI-generierte 5-Abschnitte-Zusammenfassung, jetzt aus dem vollen
   Beat-Protokoll gebaut.
3. **Volles Protokoll:** pro Schritt ein Abschnitt (Phase-Farbe wie in der Fortschrittsleiste), je Beat
   ein Zitat-Block (protokollierte Coachee-Aussage) oder eine KI-Ergebnis-Box (finale akzeptierte Antwort).

Downloads: "Als HTML herunterladen" (Blob) plus Druckansicht (`window.print()` + Print-CSS) für
"Als PDF speichern" über den Browser — keine neue PDF-Library-Abhängigkeit.

## Fehlerbehandlung

- Bestehendes Muster (optimistisches Update, Revert bei Fehler, Inline-Fehlermeldung) — jetzt pro Beat.
- Capture-Beats sind innerhalb eines Schritts nicht einzeln überspringbar (liefern Kontext für spätere
  Beats); nur der ganze Schritt ist überspringbar (wie heute), lässt seine Beats auf `pending`.
- Ki-Prompt-Beats: "Verwerfen & neu" wie heute. API-Fehler → bestehende Fehlerbox, kein Teil-Schreibvorgang.
- Referenz auf einen vorigen Capture-Beat verwendet immer dessen *aktuellen* Stand (kein Platzhalter-Caching).

## Testing

- **Vitest (Unit):** `coaching-session-prompts.test.ts` erweitert um Struktur-Invarianten für das
  Beat-Format (≥1 Ki-Prompt-Beat je Schritt, non-empty systemPrompt/userTemplate, eindeutige
  Capture-Keys je Schritt, referenzierte Textbaustein-Konstanten non-empty). `coaching-session-db.test.ts`
  bekommt Tests für die Beat-Array-Persistenz.
- **Playwright E2E (neu):** Kompletter Durchlauf von Schritt 1 (Begrüßungs-Beat → Ist/Soll-Capture →
  KI befragen → akzeptieren → Schritt 2 erreicht) — schließt die bislang komplett fehlende Testabdeckung
  von `SessionWizard.svelte`.
- Kein BATS (reine Website-UI/API-Logik, keine CLI/Infra-Komponente).

## Out of Scope / Zukunft

- Eigenständiges Coachee-Interface (Screen-Sharing reicht vorerst) — Architektur hält diese Option aber
  offen (Beats sind UI-agnostisch modelliert).
- Bild-Upload/-Galerie (nur Freitext-Bildbeschreibung).
- Migration von Bestandsdaten (keine echten Sessions im Altformat vorhanden).
- Mehrsprachigkeit / andere Brands als `mentolder` für diese Fachlichkeit.

## Staging

- **Partial 1 (Kern, testbar):** Beat-Modell + alle 10 Schritte choreographiert. Nach Partial 1 ist ein
  voller Coachee-Testlauf mit dem *heutigen* Abschlussbericht möglich.
- **Partial 2:** HTML-Export-Upgrade (volles Protokoll + Executive Summary).

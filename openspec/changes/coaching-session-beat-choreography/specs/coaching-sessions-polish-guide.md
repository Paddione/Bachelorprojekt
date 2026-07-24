## ADDED Requirements

### Requirement: Coaching-Session-Beat-Choreographie nach Geißler

Jeder der 10 `STEP_DEFINITIONS`-Schritte SHALL als geordnete Sequenz von `Beat`s modelliert sein
(`StepDefinition.beats: Beat[]`), nicht mehr als flaches `inputs`/`systemPrompt`/`userTemplate`-Trio
pro Schritt. Ein `Beat` ist entweder ein `InstructionBeat` (reine Coach-Regieanweisung, optional mit
einem `capture`-Freitextfeld, kein KI-Aufruf) oder ein `KiPromptBeat` (Eingabefelder + KI-Aufruf).
Jeder Schritt SHALL mindestens einen `KiPromptBeat` enthalten.

#### Scenario: Jeder Schritt hat mindestens einen KiPromptBeat

- **GIVEN** `STEP_DEFINITIONS` enthält 10 Coaching-Schritte
- **WHEN** die `beats`-Liste jedes Schritts geprüft wird
- **THEN** jeder Schritt enthält mindestens einen Beat mit `kind === 'ki_prompt'`

#### Scenario: Capture-Keys sind pro Schritt eindeutig

- **GIVEN** ein Schritt mit mehreren `InstructionBeat`s, die ein `capture`-Feld tragen
- **WHEN** die `capture.key`-Werte innerhalb dieses Schritts gesammelt werden
- **THEN** kein Key kommt doppelt vor

### Requirement: Zwei getrennte Beat-Wiederverwendungs-Mechanismen

Ein `KiPromptBeat.userTemplate` SHALL zwei unterschiedliche Platzhalter-Arten unterstützen:
`{capturedFrom:INDEX}` (read-only Einsetzung des `captured`-Texts eines vorigen `InstructionBeat`
desselben Schritts) und `{key}` (eigene `inputs`-Werte). Zusätzlich SHALL ein `StepInput` optional
`prefillFromPrevKiResponse: true` tragen können, wodurch die UI dieses Feld mit der akzeptierten
`aiResponse` des vorigen `KiPromptBeat` vorbefüllt (aktiv editierbar) — dies bildet das
"Ich übernehme mit folgenden Modifikationen"-Muster ab und ist ein eigenständiger Mechanismus,
unabhängig von der Template-Platzhalter-Einsetzung.

#### Scenario: buildUserPrompt löst beide Platzhalter-Arten auf

- **GIVEN** ein `KiPromptBeat` mit `userTemplate = "Reaktion: {capturedFrom:0}\nEingabe: {feld}"`
- **WHEN** `buildUserPrompt(beat, { feld: 'x' }, { 0: 'protokollierter Text' })` aufgerufen wird
- **THEN** das Ergebnis enthält sowohl `"protokollierter Text"` als auch `"x"` an den jeweiligen Stellen

### Requirement: Vier Textbaustein-Konstanten für Phase-B/D-Schritte

Die Schritte 5, 6, 7 und 10 SHALL ihre jeweiligen `KiPromptBeat.systemPrompt`-Werte mit einem
benannten Textbaustein anreichern (Teufelskreislauf, Ausbalancierungsprobleme, Komplementärkräfte
bzw. Erfolgsfaktoren+Komplementärkräfte), definiert als nicht-leere String-Konstanten in
`coaching-textbausteine.ts`.

#### Scenario: Schritt 5 embedded den Teufelskreislauf-Textbaustein

- **GIVEN** Schritt 5 ("Rekonstruktion Teufelskreislauf")
- **WHEN** der `systemPrompt` seines `KiPromptBeat` geprüft wird
- **THEN** er enthält den nicht-leeren Inhalt der `TB_TEUFELSKREISLAUF`-Konstante

### Requirement: Exportierbares Vollprotokoll mit Executive Summary

Eine abgeschlossene Coaching-Session SHALL als strukturierte HTML-Ansicht exportierbar sein, die für
jeden der 10 Schritte einen Abschnitt (mit Phasenfarbe) zeigt — je Beat entweder einen Zitat-Block
(protokollierter `capture`-Text) oder eine KI-Ergebnis-Box (finale akzeptierte `aiResponse`) — sowie
eine KI-generierte Executive-Summary (5 Abschnitte) obenauf. Die Ansicht SHALL sowohl als
HTML-Blob-Download als auch über eine Druckansicht (`window.print()` + `@media print`) nutzbar sein.

#### Scenario: Executive Summary basiert auf dem vollen Protokoll

- **GIVEN** eine abgeschlossene Session mit akzeptierten Beats in allen 10 Schritten
- **WHEN** die Executive-Summary generiert wird
- **THEN** ihr Eingabetext enthält Inhalte aus jedem der 10 Schritte, nicht nur aus einer Teilmenge

#### Scenario: Druckansicht verfügbar ohne PDF-Bibliothek

- **GIVEN** die Report-Ansicht einer abgeschlossenen Session
- **WHEN** die Druckansicht aktiviert wird
- **THEN** `window.print()` rendert die Seite gemäß einem `@media print`-Stylesheet ohne
  Admin-Chrome (Sidebar, Meta-Box, Verlaufsprotokoll)

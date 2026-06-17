---
title: Reichere Cockpit-Feature-Vorschläge
date: 2026-06-16
slug: cockpit-suggest-richer
ticket_id: T000924
plan_ref: docs/superpowers/plans/2026-06-16-cockpit-suggest-richer.md
domains: [website, ai/factory]
status: draft
---

# Reichere Cockpit-Feature-Vorschläge

## Warum (Problem)

Der KI-gestützte Portfolio-Manager unter `POST /api/admin/cockpit/suggest`
(eingeführt mit T000784 / PR #1706) erzeugt **arme** Vorschläge. Er füttert dem
LLM pro Feature nur einen dünnen Slice — `extId, title, Produkt, priority,
majorFeature, discarded, nextStep, suggestionComment` — und gibt ihm nur 5 grobe
Regeln (Gleichverteilung über Produkte, discarded meiden, major bevorzugen,
Kommentar beachten, JSON-Format).

Dabei trägt das Portfolio-Datenmodell (`FeatureNode` in
`website/src/lib/tickets/cockpit-types.ts`, befüllt von `getPortfolio` in
`cockpit-db.ts`) bereits **reiche Signale, die `suggest.ts` wegwirft**:

- `valueProp` — der Ein-Satz-Nutzen (wird von `getPortfolio` selektiert, aber nicht in den Prompt gegeben)
- `health` (`red`/`amber`/`green`) — Ampel aus dem Rollup
- `rollup` — `total / done / blocked / inProgress / open / pctDone` der Leaf-Tickets

Das LLM entscheidet also **blind** zu Wert, Fortschritt und Blockern. Vorschläge
sind dadurch generisch und nicht handlungsleitend.

## Was (Lösung)

Die Vorschlags-Erzeugung **reichhaltiger** machen — rein prompt- und
output-seitig, **ohne Schema- oder DAL-Änderung** (alle Felder liegen schon auf
`FeatureNode`):

1. **Reicherer LLM-Input.** Die Feature-Zeile um die vorhandenen Signale
   erweitern: `valueProp`, `health`, `pctDone%`, `blocked`-Anzahl, `open`-Anzahl.
   Synthetische Buckets (`Alle Tickets` / `Ohne Feature`, `synthetic: true`)
   werden ausgefiltert — sie sind keine echten Features.

2. **Reichere Prompt-Regeln.** Zusätzlich zur Gleichverteilung soll das Modell:
   - Features mit hohem `valueProp` und **fast fertige** (hohes `pctDone`, aber
     nicht 100 %) bevorzugen — „nahe am Abschluss zuerst",
   - Features, die andere entblocken (Hinweis über `blocked`/Abhängigkeiten), höher gewichten,
   - **blockierte** (`health=red` / `blocked>0`) eher meiden,
   - die `reason` **konkret auf die gelieferten Signale** stützen (kein generisches Geschwafel).

3. **Reicheres Output-Schema (rückwärtskompatibel).** Pro Vorschlag zusätzlich
   ein optionales `impact`-Feld (`hoch`/`mittel`/`niedrig`). Bestehende Consumer,
   die nur `featureId`/`nextStep`/`reason` lesen, bleiben unberührt.
   Schema: `[{ "featureId", "nextStep", "reason", "impact"? }]`.

4. **Robusteres Parsing.** Das aktuelle `text.match(/\[[\s\S]*\]/)` ist fragil
   (greift ggf. zu gierig). Parsing in einen reinen Helper auslagern, der das
   Array extrahiert, JSON-parsed und pro Eintrag die Pflichtfelder validiert
   (Einträge ohne `featureId` verwerfen statt die ganze Antwort).

5. **UI-Anreicherung (minimal).** In `SuggestionBar.svelte` neben der `reason`
   ein dezentes `impact`-Badge anzeigen, wenn vorhanden. Keine Layout-Umbauten.

### Architektur-Entscheidung: Pure Helper-Modul

Prompt-Bau und Antwort-Parsing wandern in ein **reines, importzyklenfreies**
Modul `website/src/lib/tickets/suggest-prompt.ts`:

- `buildFeatureList(portfolio): string` — reiche Feature-Zeilen, synthetische gefiltert
- `SUGGEST_SYSTEM_PROMPT: string` — die reicheren Regeln
- `parseSuggestions(text): Suggestion[]` — tolerantes Extrahieren + Validieren

**Trade-off / Begründung:**
- Hält `suggest.ts` schlank → respektiert das **S1-Zeilen-Ratchet** (die Route
  würde sonst durch Prompt-Text deutlich wachsen).
- Reine Funktionen sind **unit-testbar ohne HTTP/LLM** → TDD möglich, schnelle
  Vitest-Abdeckung statt nur teurer E2E.
- Erfüllt **S2** (pures Modul, keine Import-Zyklen, kein Seiteneffekt).

## Nicht-Ziele

- Kein Repo-/PR-Kontext oder Dedup-Erkennung an das LLM (separater, größerer
  Schritt — gehört in den Retro-Verbesserungsplan, nicht hierher).
- Keine Änderung an `getPortfolio`, am DB-Schema oder an `cockpit-types.ts`.
- Keine Änderung am Planungsbüro-Klärungs-Flow (`clarification-questions.ts`) oder
  an GekkoMode.
- Kein neuer Provider/Model-Pfad — DeepSeek-Default bleibt.

## Akzeptanzkriterien

- [ ] `buildFeatureList` nimmt `valueProp`, `health`, `pctDone`, `blocked`, `open`
      in die Zeile auf und filtert `synthetic`-Buckets heraus (Vitest).
- [ ] `parseSuggestions` extrahiert valides Array, verwirft Einträge ohne
      `featureId`, toleriert fehlendes `impact` (Vitest, inkl. Müll-Input).
- [ ] Der System-Prompt enthält die reicheren Regeln (Wert/Fortschritt/Blocker).
- [ ] `suggest.ts` nutzt die Helper; Route bleibt zeilen-budget-konform (S1).
- [ ] `SuggestionBar.svelte` zeigt `impact`-Badge wenn vorhanden; bestehende
      Anzeige (`reason`/Übernehmen) unverändert funktionsfähig.
- [ ] E2E des Cockpit-Suggest-Flows bleibt grün (bzw. wird um die reichere
      Anzeige erweitert).
- [ ] `task test:changed` + `task freshness:regenerate` + `task freshness:check`
      grün; `task test:inventory` aktualisiert falls Tests hinzukamen.

## Betroffene Dateien (Erst-Einschätzung)

| Datei | Änderung |
|---|---|
| `website/src/lib/tickets/suggest-prompt.ts` | **neu** — pure Helper (buildFeatureList / SYSTEM_PROMPT / parseSuggestions) |
| `website/src/lib/tickets/suggest-prompt.test.ts` | **neu** — Vitest |
| `website/src/pages/api/admin/cockpit/suggest.ts` | Helper nutzen, Route schlank halten |
| `website/src/components/admin/SuggestionBar.svelte` | impact-Badge (minimal) |
| `tests/e2e/specs/…cockpit…suggest….spec.ts` | reichere Anzeige verifizieren |

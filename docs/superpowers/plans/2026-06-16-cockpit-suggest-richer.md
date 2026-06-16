---
title: Reichere Cockpit-Feature-Vorschläge
date: 2026-06-16
slug: cockpit-suggest-richer
ticket_id: T000924
spec_ref: docs/superpowers/specs/2026-06-16-cockpit-suggest-richer-design.md
domains: [website, ai/factory]
status: draft
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Reichere Cockpit-Feature-Vorschläge — Implementation Plan

Anreicherung der KI-Vorschläge unter `POST /api/admin/cockpit/suggest`: die reichen
Signale, die bereits auf `FeatureNode` liegen (`valueProp`, `health`, `rollup`
mit `pctDone`/`blocked`/`open`), in Prompt-Input, Prompt-Regeln und Output-Schema
einspeisen — rein prompt-/output-seitig, ohne DB- oder Typänderung. Prompt-Bau und
Antwort-Parsing wandern in ein reines, testbares Helper-Modul, damit die Route
schlank bleibt (S1) und die Logik per Vitest ohne LLM/HTTP geprüft werden kann (S2).

## File Structure

Neu:
- `website/src/lib/tickets/suggest-prompt.ts` — reines Helper-Modul:
  `buildFeatureList`, `SUGGEST_SYSTEM_PROMPT`, `parseSuggestions`, Typ `Suggestion`.
- `website/src/lib/tickets/suggest-prompt.test.ts` — Vitest für die Helper.

Geändert:
- `website/src/pages/api/admin/cockpit/suggest.ts` — nutzt die Helper statt
  inline-Prompt/Parser; Route schrumpft dadurch (.ts, Zeilen-Limit 600, aktuell
  ~68 Zeilen → reichlich Kapazität, Netto-Zeilen sinken).
- `website/src/components/admin/SuggestionBar.svelte` — optionales `impact`-Badge
  neben der `reason` (.svelte, Zeilen-Limit 500 → unkritisch, nur additive Zeilen).

E2E:
- `tests/e2e/specs/` — bestehende Cockpit-Suggest-Spec verifizieren/erweitern
  (genauer Dateiname wird in Task 1 ermittelt).

## Task 1: Helper-Modul + failing Vitest (rot)

Ziel: pure Funktionen anlegen und mit einem Test absichern, der zuerst fehlschlägt.

Schritte:
1. Cockpit-Suggest-E2E-Spec lokalisieren:
   `grep -rl "cockpit" tests/e2e/specs/ | xargs grep -l "suggest\|Rollen" || true`
   und Dateinamen notieren (für Task 4).
2. `website/src/lib/tickets/suggest-prompt.test.ts` schreiben — deckt ab:
   - `buildFeatureList` nimmt `valueProp`, `health`, `pctDone`, `blocked`, `open`
     in die Zeile auf und lässt `synthetic`-Buckets weg.
   - `parseSuggestions` extrahiert valides JSON-Array, verwirft Einträge ohne
     `featureId`, toleriert fehlendes `impact`, gibt bei Müll-Input `[]` zurück.
3. Den Test laufen lassen — expected: FAIL (Modul existiert noch nicht):
   `cd website && pnpm vitest run src/lib/tickets/suggest-prompt.test.ts`
   Es ist zu verify it fails (rot), bevor Implementierung beginnt.

Akzeptanz: Vitest läuft und schlägt erwartungsgemäß fehl (kein Modul / Funktionen leer).

## Task 2: Helper implementieren (grün)

Ziel: `suggest-prompt.ts` so implementieren, dass Task-1-Test grün wird.

Schritte:
1. `Suggestion`-Typ: `{ featureId: string; nextStep: boolean; reason: string; impact?: 'hoch'|'mittel'|'niedrig' }`.
2. `buildFeatureList(portfolio)`: über `products.flatMap(p => p.features)` iterieren,
   `synthetic`-Features ausfiltern, je Zeile `extId, title, Produkt, priority,
   valueProp, health, pctDone%, blocked, open, major/discarded/nextStep, Kommentar`.
3. `SUGGEST_SYSTEM_PROMPT`: bestehende Gleichverteilungsregel plus: hohen
   `valueProp` und fast-fertige (`pctDone` hoch, <100) bevorzugen; entblockende
   Features höher gewichten; `health=red`/`blocked>0` meiden; `reason` konkret auf
   die Signale stützen; Output `[{featureId,nextStep,reason,impact?}]`.
4. `parseSuggestions(text)`: Array via Regex extrahieren, `JSON.parse`, je Eintrag
   `featureId` (string) + `nextStep` (bool) erzwingen, sonst Eintrag verwerfen;
   `impact` nur übernehmen, wenn aus dem Enum; bei Fehler `[]`.
5. Test grün: `cd website && pnpm vitest run src/lib/tickets/suggest-prompt.test.ts`.

Akzeptanz: Task-1-Vitest grün; keine Import-Zyklen (S2); kein Brand-Domain-Literal (S3).

## Task 3: Route auf Helper umstellen

Ziel: `suggest.ts` nutzt die Helper, Route bleibt schlank.

Schritte:
1. In `website/src/pages/api/admin/cockpit/suggest.ts` den inline-`featureList`-Bau,
   den inline-`systemPrompt` und das inline-Parsing durch
   `buildFeatureList`, `SUGGEST_SYSTEM_PROMPT`, `parseSuggestions` ersetzen.
2. Auth-Gate, Provider/Model-Defaults, DeepSeek-Call und Fehlerbehandlung
   unverändert lassen; Antwortform `{ suggestions }` bleibt rückwärtskompatibel.
3. Typcheck: `cd website && pnpm tsc --noEmit` (oder `pnpm check`).

Akzeptanz: `tsc` grün; Route nutzt ausschließlich die Helper für Prompt/Parsing.

## Task 4: UI-Badge + E2E

Ziel: `impact` in der UI zeigen und E2E-Abdeckung sicherstellen.

Schritte:
1. In `website/src/components/admin/SuggestionBar.svelte` neben `reason` ein
   dezentes `impact`-Badge rendern, wenn `s.impact` gesetzt ist; bestehende
   Anzeige/Übernehmen unverändert.
2. Die in Task 1 gefundene Cockpit-Suggest-E2E-Spec prüfen: läuft sie noch gegen
   die Selektoren? Falls die reichere Anzeige eine Assertion erlaubt, additive
   Erwartung ergänzen; sonst unverändert lassen.
3. Falls Tests hinzukamen: `task test:inventory` und das aktualisierte
   `website/src/data/test-inventory.json` mit committen.

Akzeptanz: SuggestionBar zeigt `impact`-Badge bei vorhandenem Feld; E2E-Spec konsistent.

## Task 5: Finale Verifikation (CI-Äquivalent)

Ziel: lokale Reproduktion des CI-Gates vor dem Push.

Schritte:
1. `cd website && pnpm vitest run src/lib/tickets/suggest-prompt.test.ts` — grün.
2. `task test:changed` — Offline-/Unit-/Manifest-Gate für die geänderten Pfade.
3. `task freshness:regenerate` — generierte Artefakte neu erzeugen.
4. `task freshness:check` — S1–S4-Ratchet + Freshness grün; bei roten S1-Budgets
   die Route weiter verschlanken statt Schwelle anheben.
5. Bei Test-Änderungen `task test:inventory` erneut und Inventar committen.

Akzeptanz: alle drei Gate-Kommandos grün; keine offenen Diffs an generierten Artefakten.

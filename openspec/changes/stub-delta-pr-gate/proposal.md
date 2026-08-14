# Stub-Delta-PR-Gate

## Purpose (Deutsch)

Der PR-CI/Merge-Pfad soll unausgefüllte Stub-Deltas („### Requirement: TODO" /
„The system SHALL …") **hart ablehnen**, statt sie nur als Warnung durchzulassen.
Beobachtet 2026-08-14: In der Archiv-Welle hatten 3 von 13 gemergten Changes
unausgefüllte Skeleton-Deltas — die Implementer-PRs wurden gemergt, obwohl das Delta nie
ausformuliert wurde; erst der Archiv-Guard (`openspec-merge.mjs`, fail-closed) brach ab.
Zweite Welle desselben Musters (T003281 → T003812): der Warning-Ansatz in
`openspec-validate.ts` verhindert den Defekt nicht, weil Warnings den PR nicht blocken.

## Problem / Auslöser

`scripts/openspec-validate.ts` (Zeile 94–97) meldet Stub-Deltas als **warnings**
(„reported as warnings so in-flight skeletons don't break the gate"). Der CI-Job
`test:openspec` (`npm run test:openspec` → `vitest run scripts/openspec-validate.test.ts`)
läuft im PR — `validateChange` liefert bei Stub-Deltas `ok=true` + Warning. Ein PR, der
ein Stub-Delta enthält, wird grün und mergebar. Erst beim Archivieren schlägt der
`openspec-merge.mjs`-Guard zu — dann ist das Delta bereits Teil eines gemergten Changes
und muss manuell nachformuliert werden.

## Fix-Richtung

- **`scripts/openspec-validate.ts`**: Stub-Detection von `warnings` nach `errors`
  verschieben — die drei Muster (`### Requirement: TODO`, `#### Scenario: TODO`,
  `The system SHALL …`) erzeugen `errors`, `validateChange` liefert `ok=false`.
  Damit wird der PR-CI-Job `test:openspec` rot und der Merge blockiert.
- **Positiv-Anker sichern:** ein Change mit vollständig ausformuliertem Delta bleibt
  `ok=true`; der bestehende Warn-Test wird auf die neue Error-Semantik umgestellt
  (warnings-Test entfällt bzw. wird zum errors-Test).
- **Keine** Änderung an `openspec-merge.mjs` (Archiv-Guard bleibt als zweite Linie).
- Bewusstes Verhalten für In-Flight-Skeletons: Der Planer darf ein Stub-Delta lokal
  haben, solange es nicht committed/gemergt wird — der CI-Gate-Zeitpunkt ist der PR.

## Out of Scope

- Keine Änderung an `plan-lint.sh` P1 (prüft tasks.md, nicht Deltas).
- Keine Retro-Reparatur der drei archivierten Changes (manuell nachformuliert, erledigt).

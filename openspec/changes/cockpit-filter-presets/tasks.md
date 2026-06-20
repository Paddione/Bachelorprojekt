---
title: Cockpit: Filter speichern / Voreinstellungen
ticket_id: T000988
domains: website
status: planning
---

# Implementation Plan: cockpit-filter-presets

> Ticket: T000988 · Spec: `docs/superpowers/specs/2026-06-20-cockpit-filter-presets.md`
> Brand: mentolder · Speicher: localStorage (keine DB, kein Multi-Device-Sync)

## File Structure

| Pfad | Status | Zweck |
|------|--------|-------|
| `website/src/lib/cockpit-presets.ts` | neu | localStorage-CRUD, URL-Serialisierung, Default-Presets, Eviction |
| `website/src/lib/cockpit-presets.test.ts` | neu | Unit-Tests: CRUD, URL round-trip, Defaults, Edge Cases |
| `website/src/components/admin/Cockpit/FilterBar.svelte` | neu | Preset-Dropdown + „Als Preset speichern"-Dialog + Löschen-Button |
| `website/src/components/admin/Cockpit/FilterBar.test.ts` | neu | Komponenten-Tests: Dropdown, Save-Dialog, Delete-Protection |
| `website/src/pages/admin/cockpit.astro` | bestehend (30 Zeilen) | URL-Parameter `?preset=` beim Mount parsen + an Cockpit durchreichen |

Die neue Datei `cockpit-presets.ts` bleibt unter dem `.ts`-Limit von 600 Zeilen; die
Komponente `FilterBar.svelte` unter dem `.svelte`-Limit von 500 Zeilen. Beide werden von
vorneherein modular gehalten (Pure-Logic in `cockpit-presets.ts`, UI-only in
`FilterBar.svelte`), sodass kein Split-Schritt nötig ist.

---

## Task 1: cockpit-presets.ts — Pure-Logic-Modul (TDD)

- [ ] Failing-Test `cockpit-presets.test.ts` anlegen: Test-Block „savePreset schreibt in
      localStorage und loadPreset liest es zurück" — Lauf muss zuerst fehlschlagen, weil
      `cockpit-presets.ts` noch nicht existiert (expected: fail)
- [ ] `cockpit-presets.ts` erstellen mit Typen: `CockpitFilterState { status: string[];
      area: string[]; brand: string[] }`, `Preset { id: string; name: string; state:
      CockpitFilterState; isDefault: boolean; createdAt: number }`
- [ ] `DEFAULT_PRESETS: Preset[]` konstant definieren — 3 Einträge: Offen
      (`status:['offen']`), Planning (`status:['planning']`), Deploy
      (`status:['deploy']`) — alle mit `isDefault: true`
- [ ] `savePreset(name, state): Preset` — schreibt in localStorage unter Key
      `cockpit:presets:user`, Auto-Suffix `-2`/`-3` bei Namensduplikat, `isDefault: false`
- [ ] `loadPresets(): Preset[]` — merged `DEFAULT_PRESETS` + user-Presets aus localStorage
- [ ] `deletePreset(id): void` — entfernt nur Nicht-Default-Presets; Default-IDs werden
      ignoriert (Guard-Klausel)
- [ ] `applyPreset(id): CockpitFilterState | null` — liefert State zu ID oder null
- [ ] Unit-Tests für Auto-Suffix, Delete-Protection (Default nicht löschbar),
      load-merged-Reihenfolge (Defaults zuerst)
- [ ] `npx vitest run src/lib/cockpit-presets.test.ts` grün
- [ ] Commit `feat(cockpit): add cockpit-presets pure-logic module with localStorage CRUD [T000988]`

## Task 2: cockpit-presets.ts — URL-Serialisierung + Edge Cases

- [ ] Failing-Test: „encodeState → decodeState round-trip reproduziert State exakt" —
      expected: fail (Funktionen noch nicht implementiert)
- [ ] `encodeState(state): string` — JSON.stringify → base64-komprimiert (kein padding),
      Längen-Check wirft wenn >2000 Zeichen
- [ ] `decodeState(encoded): CockpitFilterState | null` — base64 → JSON.parse, bei
      decode-Fehler return null (kein throw)
- [ ] `parsePresetFromUrl(search): CockpitFilterState | null` — extrahiert `?preset=`
      Query-Parameter, delegiert an `decodeState`, bei null → Toast-Flag
- [ ] `buildShareUrl(state, origin): string` — `${origin}/admin/cockpit?preset=${encoded}`
- [ ] Test: ungültiger base64-Code → `decodeState` returns null, keine Exception
- [ ] Test: round-trip cross-Browser-stabil (nur Standard-base64-Alphabet, keine
      browser-spezifischen Zeichen)
- [ ] Test: encodeState wirft bei >2000 Zeichen
- [ ] `npx vitest run src/lib/cockpit-presets.test.ts` grün
- [ ] Commit `feat(cockpit): add URL serialization and decode-error handling to presets [T000988]`

## Task 3: cockpit-presets.ts — localStorage-Verfügbarkeit + Eviction

- [ ] Failing-Test: „localStorage nicht verfügbar → Session-Only-Modus, in-memory-Presets"
      — expected: fail (Detection-Funktion fehlt)
- [ ] `isLocalStorageAvailable(): boolean` — feature-detect via Schreib-Lese-Zyklus in
      try/catch, quencht SecurityError
- [ ] Wenn nicht verfügbar: `savePreset`/`loadPresets`/`deletePreset` arbeiten gegen
      Modul-interne `Map<string, Preset>` (Session-Only); `loadPresets` merged Defaults +
      Session-Map
- [ ] `evictOldestNonDefault(maxEntries=20): void` — bei localStorage-voll-Quota
      (`QuotaExceededError`): älteste Nicht-Default-Presets entfernen bis Schreiben
      erfolgreich, Hinweis-Toast-Flag setzen
- [ ] Test: QuotaExceededError triggert Eviction, ältester Nicht-Default-Eintrag entfernt
- [ ] Test: Session-Only-Modus: save/load funktioniert ohne localStorage
- [ ] `npx vitest run src/lib/cockpit-presets.test.ts` grün
- [ ] Commit `feat(cockpit): handle localStorage unavailability and quota eviction [T000988]`

## Task 4: FilterBar.svelte — Preset-Dropdown + Save-Dialog

- [ ] Failing-Test `FilterBar.test.ts`: „Preset-Dropdown rendert DEFAULT_PRESETS + eigene
      Presets, Klick wendet Filter an" — expected: fail (Komponente existiert nicht)
- [ ] Verzeichnis `website/src/components/admin/Cockpit/` anlegen
- [ ] `FilterBar.svelte` erstellen: Props `currentFilter: CockpitFilterState`,
      `onApplyPreset: (state) => void`; importiert `loadPresets`, `applyPreset`,
      `savePreset`, `deletePreset` aus `cockpit-presets.ts`
- [ ] Dropdown-Button „Preset laden" → Liste aus `loadPresets()`; Default-Presets mit
      Lock-Icon, eigene mit Mülleimer-Icon (nur eigene löschbar)
- [ ] „Als Preset speichern"-Button öffnet Dialog mit Name-Input + Speichern-Button;
      ruft `savePreset(name, currentFilter)` auf, dispatcht `onApplyPreset` nicht (Filter
      bleibt aktiv wie er ist)
- [ ] Delete-Button pro eigenem Preset → `deletePreset(id)` + Liste neu laden; Default-
      Presets: Delete-Button ausgeblendet (`isDefault`-Guard)
- [ ] „URL kopieren"-Button → `buildShareUrl(currentFilter, window.location.origin)` in
      Clipboard, Toast „URL kopiert"
- [ ] Komponenten-Tests: Dropdown rendert 3 Defaults + N eigene; Save-Dialog schreibt
      Preset; Delete nur bei eigenen; Default-Delete wird ignoriert
- [ ] `npx vitest run src/components/admin/Cockpit/FilterBar.test.ts` grün
- [ ] Commit `feat(cockpit): add FilterBar with preset dropdown and save dialog [T000988]`

## Task 5: cockpit.astro — URL-Preset-Parsing + FilterBar-Einbindung

- [ ] Failing-Test `CockpitShell.integration.test.ts` erweitern: „`?preset=`-Parameter
      wendet gespeicherten Filter beim Mount an" — expected: fail (Parsing fehlt)
- [ ] `cockpit.astro`: import `parsePresetFromUrl`, `decodeState` aus `cockpit-presets.ts`
- [ ] Beim Mount: `const urlState = parsePresetFromUrl(window.location.search)`; wenn
      nicht null → Cockpit-Store `setFilter(urlState)`; wenn null + decode-Fehler →
      Toast-Event „Preset ungültig" (Store-Action)
- [ ] `<FilterBar currentFilter={filter} onApplyPreset={applyPreset} />` in
      Cockpit-Komponente einbinden (unterhalb des bestehenden Filter-Rows)
- [ ] URL-Preset-Parsing läuft nur beim initialen Mount, nicht bei Navigation (einmalig)
- [ ] Integration-Test: Seite lädt mit `?preset=<gültig>` → Filter angewendet; mit
      ungültigem Code → Toast + kein Filter
- [ ] `npx vitest run src/components/admin/CockpitShell.integration.test.ts` grün
- [ ] Commit `feat(cockpit): parse URL preset on mount and wire FilterBar into cockpit [T000988]`

## Task 6: Finale Verifikation (CI-Äquivalent)

- [ ] AC-grep: `DEFAULT_PRESETS` in `cockpit-presets.ts` vorhanden (3 Einträge) ·
      `isDefault: true` Guard in `deletePreset` · `encodeState`/`decodeState` exportiert ·
      `FilterBar.svelte` importiert aus `cockpit-presets.ts` ·
      `parsePresetFromUrl` in `cockpit.astro` aufgerufen
- [ ] `cd website && npx vitest run src/lib/cockpit-presets.test.ts src/components/admin/Cockpit/FilterBar.test.ts src/components/admin/CockpitShell.integration.test.ts` grün
- [ ] `cd website && npx vitest run` (gesamte Suite) grün — keine verwaisten Importe
- [ ] `npm --prefix website run typecheck` grün
- [ ] `task test:changed` grün (smart selection gegen `origin/main`)
- [ ] `task freshness:regenerate` (test-inventory + freshness artifacts)
- [ ] `task freshness:check` grün (S1–S4-Ratchet + Baseline-Key-Count)
- [ ] Regenerierte Artefakte committen (falls Diff): `chore(cockpit): regenerate test-inventory + freshness artifacts [T000988]`
- [ ] `bash scripts/openspec.sh validate` grün (alternativ `task openspec:validate`)

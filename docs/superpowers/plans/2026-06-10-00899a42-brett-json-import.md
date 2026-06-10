---
title: Plan: Brett JSON-Import
ticket_id: 00899a42-676b-4540-8f6e-fde88b6251cd
domains: [brett]
status: active
pr_number: null
file_locks: []
shared_changes: false
batch_id: batch-2026-06-10
parent_feature: null
depends_on_plans: []
---

# Plan: Brett JSON-Import

**Ticket:** 00899a42
**Branch:** feature/00899a42-brett-json-import
**Datum:** 2026-06-10
**Status:** staged

---

## Ziel

JSON-Import fuer das Systemische Brett: Eine zuvor exportierte `ClientBoardSnapshot`-Datei einlesen, validieren und den Board-Zustand (alle Figuren, Positionen, Stiffness, Optik) wiederherstellen.

---

## Architektur

### Neue Dateien

- `brett/src/client/ui/import.ts` — Import-Modul: Datei lesen, validieren, Board-Zustand wiederherstellen, Button-Initialisierung
- `brett/test/import.test.ts` — Unit-Tests fuer Validierung und Import-Logik

### Geaenderte Dateien

- `brett/public/index.html` — Import-Button (`btn-import-json`) und verstecktes `<input type="file">` in der Export-Gruppe hinzufuegen
- `brett/src/client/board-boot.ts` — `initImportButton()` aus `import.ts` aufrufen (analog zu `initExportButtons`)

### Nicht geaendert

- `brett/src/client/ui/export.ts` — Export-Modul bleibt unveraendert; `ClientBoardSnapshot` und `ExportFigure` Interfaces werden von `import.ts` importiert
- `brett/src/client/ws-client.ts` — Keine Aenderungen; Import nutzt bestehende `sendAddFigure`, `sendStiffness`, `sendDelete` Funktionen
- `brett/src/client/state.ts` — STATE wird ueber bestehende Pfade mutiert (figures.length = 0, push)
- `brett/src/client/mannequin.ts` — Figurenerstellung bleibt unveraendert

---

## Tech-Stack

- TypeScript (strict mode)
- Browser File API (`FileReader`, `<input type="file">`)
- Bestehende Brett-Module: `mannequin.makeMannequin`, `ws-client.sendAddFigure`, `ws-client.sendStiffness`, `ui/optik.applyOptikToScene`, `ui/export.updateExportCache`
- `node:test` + `node:assert/strict` fuer Unit-Tests

---

## Tasks

- [ ] **T1 — Import-Modul erstellen (`brett/src/client/ui/import.ts`):**
  - Funktion `importJson(): void` — oeffnet File-Chooser via verstecktes `<input type="file">` Element
  - Funktion `processImportFile(file: File): Promise<void>` — liest Datei, parst JSON, ruft `applyImportedSnapshot()` auf
  - Funktion `validateSnapshot(data: unknown): ClientBoardSnapshot` — strukturelle Validierung:
    - Prueft Top-Level-Felder: `exportedAt` (string), `phase` (string), `stiffness` (number), `figures` (Array)
    - Prueft jede Figur: `id` (string), `x` (number), `z` (number), `facingY` (number)
    - Wirft beschreibende Fehler bei Validierungsverstoessen
  - Funktion `applyImportedSnapshot(snapshot: ClientBoardSnapshot): void` — fuehrt den Import aus:
    1. Alle bestehenden Figuren entfernen: `STATE.figures` iterieren, `getScene().scene.remove(fig.root)`, dann `STATE.figures.length = 0`
    2. Fuer jede `ExportFigure` im Snapshot: `mannequin.makeMannequin(fig.id, { x: fig.x, z: fig.z })` aufrufen, `facingY` setzen, `fig.root.rotation.y` setzen, Label setzen, Color via `mannequin.recolorFigure` anwenden, `STATE.figures.push(fig)`, `sendAddFigure(fig)` an Server senden
    3. Stiffness setzen: `STATE.stiffness = snapshot.stiffness`, Slider-Element aktualisieren, `sendStiffness(snapshot.stiffness)` senden
    4. Optik anwenden: `applyOptikToScene(snapshot.optik)` falls `snapshot.optik` nicht null
    5. Export-Cache aktualisieren: `updateExportCache({ phase, stiffness, figures, optik })`
  - Funktion `initImportButton(): void` — registriert Click-Handler auf `#btn-import-json`, gated by Feature-Flag `T000466` (gleiche Logik wie `initExportButtons`)
  - DOM-Zugriff nur innerhalb von Funktionskoerpern (headless-importierbar)
  - Fehlerbehandlung: `processImportFile` faengt Parse- und Validierungsfehler, loggt `console.error('[brett] JSON-Import fehlgeschlagen:', err)`

- [ ] **T2 — HTML: Import-Button hinzufuegen (`brett/public/index.html`):**
  - In der `#export-group` Div, nach dem `btn-export-pdf` Button, einen neuen Button einfuegen:
    `<button id="btn-import-json" class="icon-btn" title="Board-Zustand aus JSON-Datei wiederherstellen">📥 Import</button>`
  - Ein verstecktes `<input type="file" id="import-file-input" accept=".json,application/json" style="display:none">` direkt daneben oder innerhalb der Gruppe

- [ ] **T3 — Board-Boot: Import-Button initialisieren (`brett/src/client/board-boot.ts`):**
  - Import von `import.ts`: `import * as importUi from './ui/import'`
  - Nach `exportUi.initExportButtons(renderer.domElement)` den Aufruf `importUi.initImportButton()` einfuegen

- [ ] **T4 — Unit-Tests erstellen (`brett/test/import.test.ts`):**
  - `validateSnapshot` Tests:
    - Gueltiges Snapshot mit allen Pflichtfeldern wird akzeptiert
    - Fehlendes `exportedAt` wird abgelehnt
    - Fehlendes `figures` Array wird abgelehnt
    - Figur ohne `id` wird abgelehnt
    - Figur mit nicht-numerischem `x` wird abgelehnt
    - Optionale Felder (`label`, `color`, `figureType`, `ownerId`, `optik`) duerfen fehlen
  - `applyImportedSnapshot` Tests (mit DOM/STATE-Mocks):
    - Leert `STATE.figures` vor dem Import
    - Erstellt neue Figuren mit korrekten Positionen
    - Setzt Stiffness korrekt
    - Aktualisiert Export-Cache
  - Pattern: `node:test` + `node:assert/strict`, analog zu `brett/test/export.test.ts`

- [ ] **T5 — Typecheck und Tests ausfuehren:**
  - `npm run typecheck --prefix brett`
  - `npm test --prefix brett`
  - Alle bestehenden und neuen Tests muessen gruen sein

---

## Verifikation

### Lokal

- `npm run typecheck --prefix brett` — kein Fehler
- `npm test --prefix brett` — alle Tests gruen (bestehende + neue import.test.ts)
- Manueller Test im Browser: JSON exportieren → Board aendern → JSON importieren → Board-Zustand identisch zum Export-Zeitpunkt

### CI

- `task test:all` — BATS + Factory + Manifests + Dry-Run + Code-Quality gruen
- `npm run typecheck --prefix brett` — TypeScript-Fehlerpruefung
- `npm test --prefix brett` — Vitest-Testsuite

### Akzeptanzkriterien-Checkliste

- [ ] JSON-Datei kann ueber UI-Button importiert werden
- [ ] Import validiert das `ClientBoardSnapshot`-Format vor der Anwendung
- [ ] Bei ungueltigem JSON erfolgt eine Fehlermeldung (kein Partial-Import)
- [ ] Nach Import sind alle Figuren aus dem Snapshot auf dem Board sichtbar
- [ ] Stiffness-Wert wird aus dem Snapshot wiederhergestellt
- [ ] Optik wird aus dem Snapshot angewendet (falls vorhanden)
- [ ] Export-Cache ist nach Import synchron zum wiederhergestellten Zustand
- [ ] Import-Button ist hinter Feature-Flag `T000466` versteckt (dark-launch)
- [ ] Headless-Importierbarkeit: `import.ts` hat keinen top-level DOM-Zugriff
- [ ] Unit-Tests fuer Validierung und Import-Logik existieren und sind gruen

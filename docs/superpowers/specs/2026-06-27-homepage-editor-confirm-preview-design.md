---
title: Homepage-Editor — einklappbare Live-Vorschau + Bestätigungs-Schritt beim Speichern
date: 2026-06-27
status: draft
domains: [website, mentolder-web]
ticket_id: TBD
plan_ref: TBD
---

# Homepage-Editor: einklappbare Vorschau + Bestätigungs-Modal

## Problem / Ziel

Die „Edit Homepage"-Seite der React-App `mentolder-web` (`/admin/homepage`,
`src/pages/admin/HomepageEditorPage.tsx`) zeigt aktuell **bedingungslos** eine
volle Live-Vorschau in der rechten Spalte (`<BlockRenderer document={doc} />`)
und speichert beim Klick auf „Speichern" **sofort** ohne Zwischenschritt.

Gewünscht:

1. Die Live-Vorschau soll **nicht standardmäßig** sichtbar sein, aber erhalten
   bleiben: die rechte Spalte wird **einklappbar (retractable)**, Default
   **eingeklappt**.
2. Im ausgeklappten Zustand sollen Editor-Karte (Spalte 1) und der gerenderte
   Block (Spalte 2) **zeilenweise fluchten** — Block *i* links liegt in derselben
   Reihe wie Block *i* rechts (Oberkanten bündig).
3. „Speichern" öffnet einen **Bestätigungs-Schritt** (Modal), der **nur die
   geänderten Blöcke** als **Vorher/Nachher** rendert. Erst „Bestätigen" schreibt
   tatsächlich via `POST /api/admin/homepage/save`.
4. Der „Speichern"-Button ist **deaktiviert**, solange kein Block geändert wurde.

Nicht-Ziele (YAGNI): Block-Hinzufügen/Löschen/Umsortieren (dieser Editor mutiert
nur `props`), Auto-Save, Feld-genaues Inline-Diff, neue API-Endpunkte.

## Kontext (Ist-Zustand)

- `HomepageEditorPage.tsx` hält `doc` (Arbeitsstand inkl. Edits), `baseVersion`,
  `loaded`, `status`. Es gibt **keinen** Baseline-Snapshot des geladenen Docs.
- Mutation nur über `updateBlockProps(index, props)` → ersetzt `block.props`.
- Layout: `grid grid-cols-1 lg:grid-cols-2 gap-8` — links Liste aller Editor-
  Karten, rechts **eine** monolithische `BlockRenderer`-Ausgabe des ganzen Docs.
  Dadurch fluchten linke Karten und rechte Blöcke höhenbedingt nicht.
- `BlockRenderer({ document })` rendert `document.blocks` über eine Typ→Komponente-
  Registry. Fällt auf `homepageSeed` zurück, wenn `safeParse` scheitert **oder**
  `schemaVersion !== SCHEMA_VERSION`. Ein Doc `{ schemaVersion, blocks: [b] }`
  rendert genau einen Block.
- Blöcke haben stabile `id` und `type`. Diff je `id` über `props` genügt.
- Save: `handleSave` → `saveHomepage(baseVersion, doc)` → 200/409/422/Fehler,
  Feedback via `StatusBanner`.
- Bestehende Tests (`HomepageEditorPage.test.tsx`) klicken „Speichern" und
  erwarten direkten `saveHomepage`-Aufruf; zwei davon ohne vorheriges Editieren.

## Design

### Neuer State (in `HomepageEditorPage`)
- `originalDoc: HomepageBlocksDocumentType | null` — Baseline, gesetzt beim Load
  **und** nach erfolgreichem Save (`originalDoc ← doc`). Quelle für „Vorher" und
  die Änderungs-Erkennung.
- `previewOpen: boolean` — steuert Spalte 2. **Default `false`** (eingeklappt).
- `confirmOpen: boolean` — steuert das Bestätigungs-Modal.

### Helfer
- `changedBlockIds(original, current): string[]` — pure Funktion. Vergleicht je
  `block.id` die `props` (Deep-Equal via stabilem `JSON.stringify` der Props).
  Liefert die IDs geänderter Blöcke. (Block-Mengen sind deckungsgleich, da keine
  Add/Remove-Mutationen.) Eigene Datei `src/pages/admin/homepageDiff.ts` (klein,
  pur, unit-testbar, ohne Import-Zyklus).
- `singleBlockDoc(doc, block)` → `{ schemaVersion: doc.schemaVersion, blocks: [block] }`
  für Einzelblock-Rendering (inline, kein eigenes Modul nötig).

### Layout-Umbau (Zeilen-Alignment)
Statt zweier unabhängiger Spalten → **eine Grid-Reihe pro Block**:

```
{doc.blocks.map((block, index) => (
  <div
    key={block.id}
    className={previewOpen
      ? 'grid grid-cols-1 lg:grid-cols-2 gap-8 items-start mb-6'
      : 'mb-6'}
  >
    <EditorCard … />                              {/* Spalte 1 */}
    {previewOpen && <PreviewCell block={block} />} {/* Spalte 2 */}
  </div>
))}
```

`items-start` + identische Reihenfolge garantieren im ausgeklappten Zustand:
Block *i* links und rechts starten oben bündig in derselben Reihe. **Eingeklappt
(`!previewOpen`)** ist die Reihe ein einfacher Block-Container (`mb-6`, kein
Grid) und Spalte 2 entfällt → die Editor-Karte nimmt die **volle Breite** ein
(nicht die halbe — ein einzelnes Kind in `lg:grid-cols-2` bliebe sonst
halbbreit). Pixelgenaue Gleich-Höhe ist bei unterschiedlich hohen Blöcken nicht
möglich und kein Ziel; die **Oberkanten fluchten**.

### Retract-Toggle
Button im Header (neben „Speichern"), z. B. „Vorschau einblenden/ausblenden"
mit `aria-expanded={previewOpen}`, togglet `previewOpen`.

### Bestätigungs-Modal — `SaveConfirmDialog`
Neue Komponente `src/pages/admin/SaveConfirmDialog.tsx`:
- Props: `changedBlocks: { block, before, after }[]`, `saving: boolean`,
  `onConfirm()`, `onCancel()`.
- Overlay (`role="dialog"`, `aria-modal`, abgedunkelter Hintergrund), Schließen
  per Esc und Klick außerhalb = `onCancel`. Fokus initial auf „Bestätigen".
- Inhalt: je geändertem Block eine Sektion mit Block-Label (`BLOCK_LABELS`) und
  zwei gerenderten Fassungen nebeneinander: **Vorher** (aus `originalDoc`) und
  **Nachher** (aus `doc`), jeweils via `BlockRenderer` mit `singleBlockDoc`.
- Buttons: **„Abbrechen"** (`onCancel`) und **„Bestätigen"** (`onConfirm`,
  während `saving` deaktiviert + „Speichert…"). Bewusst **ohne** das Wort
  „Speichern", damit Test-Selektoren („Speichern" vs. „Bestätigen") eindeutig
  bleiben.
- Styling Tailwind, am bestehenden App-Look orientiert (vgl. `UserMenu`,
  `StatusBanner`).

### Flow
1. `const changedIds = changedBlockIds(originalDoc, doc)`.
2. Header-„Speichern": `disabled = saving || changedIds.length === 0`. Klick
   setzt `confirmOpen = true` (kein direkter Save).
3. Modal „Bestätigen" → bisherige `saveHomepage(baseVersion, doc)`-Logik. Bei
   200: `baseVersion ← version`, `originalDoc ← doc`, `confirmOpen = false`,
   „Gespeichert"-Banner. Bei 409/422/Fehler: bestehende Behandlung; Modal kann
   offen bleiben und Status anzeigen oder schließen + Banner (Implementierung:
   schließen + bestehender `StatusBanner`, da der die Fälle bereits abdeckt).
4. „Abbrechen"/Esc/Außen-Klick → `confirmOpen = false`, kein Save.

## Fehlerbehandlung
- Keine Änderung → Button disabled, Modal öffnet nicht.
- 409 Konflikt / 422 Validierung / Netzfehler → unverändert über `SaveStatus`/
  `StatusBanner`; nach Konflikt bleibt `originalDoc` unverändert (Diff weiter gültig).
- `BlockRenderer`-Seed-Fallback wird durch Mitgabe von `doc.schemaVersion`
  vermieden.

## Tests (vitest + @testing-library/react)
Bestehende Tests in `HomepageEditorPage.test.tsx` an den neuen Flow anpassen
(editieren → „Speichern" → „Bestätigen") und ergänzen:
- **Disable:** ohne Edit ist „Speichern" disabled; nach Edit enabled.
- **Kein Direkt-Save:** Klick „Speichern" ruft `saveHomepage` **nicht**; Modal erscheint.
- **Nur geänderte Blöcke:** Modal listet ausschließlich geänderte Block-Labels
  (Vorher+Nachher sichtbar).
- **Bestätigen speichert:** „Bestätigen" ruft `saveHomepage(baseVersion=4, doc)`
  genau einmal, Modal schließt, „Gespeichert"-Banner; danach „Speichern" wieder
  disabled (Baseline = doc).
- **Abbrechen:** „Abbrechen"/Esc schließt Modal ohne `saveHomepage`-Aufruf.
- **409:** nach Edit → Speichern → Bestätigen → Konflikt-Hinweis.
- **Retract-Toggle:** Default keine Vorschau-Zelle; nach Toggle erscheint die
  gerenderte Block-Ausgabe in Spalte 2.
- Pure-Unit-Test für `changedBlockIds` (`homepageDiff.test.ts`).

## Betroffene Dateien
- `mentolder-web/src/pages/admin/HomepageEditorPage.tsx` (Umbau)
- `mentolder-web/src/pages/admin/SaveConfirmDialog.tsx` (neu)
- `mentolder-web/src/pages/admin/homepageDiff.ts` (neu)
- `mentolder-web/src/pages/admin/homepageDiff.test.ts` (neu)
- `mentolder-web/src/pages/admin/HomepageEditorPage.test.tsx` (angepasst/erweitert)

## Verifikation
- `cd mentolder-web && npm run test` (vitest) grün.
- `cd mentolder-web && npm run build` (tsc + vite) ohne Fehler.
- Manuell (optional): `/admin/homepage` — Vorschau standardmäßig aus, Toggle
  blendet zeilen-aligned ein; Speichern disabled ohne Änderung; mit Änderung
  öffnet Modal mit Vorher/Nachher der geänderten Blöcke; Bestätigen speichert.

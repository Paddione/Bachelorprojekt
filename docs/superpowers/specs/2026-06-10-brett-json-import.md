# Spec: Brett JSON-Import

**Ticket:** 00899a42
**Datum:** 2026-06-10
**Status:** draft

---

## Problem

Der JSON-Export (T000466, `brett/src/client/ui/export.ts`) serialisiert den Board-Zustand als `ClientBoardSnapshot` (Figuren, Positionen, Phase, Stiffness, Optik). Es fehlt die Gegenoperation: Einlesen einer gespeicherten JSON-Datei, um eine Session exakt wiederherzustellen.

---

## Ziel

Ein Nutzer kann eine zuvor exportierte JSON-Datei ueber die UI importieren. Der Client validiert das Format, loescht den aktuellen Board-Zustand und baut alle Figuren mit Positionen, Labels, Farben, Figurentypen und Optik neu auf.

---

## Datenformat

Input ist ein `ClientBoardSnapshot` (identisch zum Export-Format):

```ts
interface ClientBoardSnapshot {
  exportedAt: string;
  sessionCode: string | null;
  phase: string;
  stiffness: number;
  figures: ExportFigure[];
  optik: Record<string, unknown> | null;
}

interface ExportFigure {
  id: string;
  label?: string;
  x: number;
  z: number;
  facingY: number;
  color?: string;
  figureType?: string;
  ownerId?: string;
}
```

---

## Validierung

Vor dem Import wird das JSON strukturell geprueft:

1. Top-Level: `exportedAt` (string), `phase` (string), `stiffness` (number), `figures` (Array)
2. Jede Figur: `id` (string), `x` (number), `z` (number), `facingY` (number)
3. Bei Validierungsfehler: Toast/Meldung, kein Partial-Import

---

## Import-Ablauf

1. User klickt "JSON Import"-Button in der Export-Gruppe
2. File-Chooser oeffnet sich (accept: `.json`, `application/json`)
3. Datei wird gelesen und als JSON geparst
4. Validierung gegen `ClientBoardSnapshot`-Schema
5. Bei Erfolg:
   - Alle bestehenden Figuren werden entfernt (lokal + via `delete`-Messages an den Server)
   - Stiffness wird gesetzt (`sendStiffness`)
   - Fuer jede Figur im Snapshot: `makeMannequin()` + `sendAddFigure()` + Label/Color/Appearance anwenden
   - Optik wird angewendet (`applyOptikToScene`)
   - Export-Cache wird aktualisiert
6. Bei Fehler: Fehlermeldung im Status-Pill oder Toast

---

## UI-Integration

- Neuer Button `btn-import-json` in der Export-Gruppe (`#export-group`) neben den bestehenden Export-Buttons
- Gleiches Feature-Flag `T000466` wie die Export-Buttons
- Icon/Label: `📥 Import`
- Verwendet ein verstecktes `<input type="file">` Element

---

## Nicht im Scope

- Server-seitige Snapshot-Restore-API (der Import laeuft client-seitig ueber einzelne WS-Messages)
- Import von PNG/PDF (nur JSON)
- Merge-Modus (Import ueberschreibt immer den aktuellen Zustand)
- Bone-Overrides / Pose-Import (das Export-Format enthaelt keine Bone-Rotationen)

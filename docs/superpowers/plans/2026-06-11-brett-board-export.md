---
ticket_id: T000605
spec: docs/superpowers/specs/2026-06-11-brett-board-export-design.md
branch: feature/T000605-brett-export
status: plan_staged
domains: [brett]
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Brett Board-Export (PNG / PDF / JSON-Snapshot) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Den vorhandenen, feature-flag-versteckten Brett-Export (PNG/PDF/JSON) produktionsreif schalten und den JSON-Snapshot um Lines, Anchors, Zones und die fehlenden Figuren-Felder vervollständigen, mit Schema-Versionierung und vollständigem Roundtrip beim Import.

**Architecture:** `STATE` (state.ts) wird um Plain-Data-Arrays `anchors`/`zones` erweitert, die `ground-objects.ts` parallel zu seinen Mesh-Maps pflegt. Der Export-Cache (`_cache` in `ui/export.ts`) wird von `ws-client.ts` synchron gehalten — neu auch für Lines/Anchors/Zones und die zusätzlichen Figuren-Felder. Import (`ui/import.ts`) validiert lenient, migriert alte Snapshots (`version: 0`) und stellt den vollen Board-Zustand wieder her. Die Feature-Flags `T000466` fallen weg; jsPDF wandert in `dependencies`.

**Tech Stack:** TypeScript, Three.js, Vite (Client), jsPDF (dynamischer Import), `node:test` + `tsx --test` (Tests, MOCK_DB=true).

---

## Wichtiger Ausgangsbefund (Worktree-Realität vs. Spec-Annahmen)

Beim Lesen des Worktrees zeigte sich, dass mehrere in der Spec als "neu hinzuzufügen" beschriebene Teile **bereits existieren**:

- `brett/public/index.html` enthält schon einen Import-Button `id="btn-import-json"` (📥 Import) und ein `<input type="file" id="import-file-input">` in `#export-group` (Zeilen 363–364). **Die Spec nennt `input-import-json` — der reale ID-Name ist `import-file-input`.** Wir bleiben bei `import-file-input` und ergänzen NICHTS Neues im HTML (Phase G entfällt weitgehend → nur Verifikation).
- `brett/src/client/ui/import.ts` existiert vollständig: `validateSnapshot`, `applyImportedSnapshot`, `processImportFile`, `importJson`, `initImportButton`. Es hat einen eigenen Feature-Flag-Guard auf `T000466` (Zeile 126), der ebenfalls entfernt werden muss.
- `initImportButton()` ist bereits in `board-boot.ts:55` verdrahtet. `initExportButtons()` in `board-boot.ts:52`.
- `_toExportLine` existiert NOCH NICHT — wird in Phase D erstellt.
- Runtime-Figuren tragen `boneOverrides`, `appearance`, `note` (siehe ws-client snapshot/update-Handler); `scale`/`preset` sind im `Figure`-Typ vorhanden, werden client-seitig aber nicht durchgängig gespiegelt → im Export defensiv via optional chaining lesen.

Der Plan ist gegen diese reale Ausgangslage geschrieben, nicht gegen die Spec-Annahme eines fehlenden Import-UI.

---

## File Structure

| Datei | Verantwortung / Änderung |
|-------|--------------------------|
| `brett/src/client/state.ts` | `STATE.anchors: Anchor[]` + `STATE.zones: Zone[]` als Plain-Data-Spiegel |
| `brett/src/client/ground-objects.ts` | `STATE.anchors`/`STATE.zones` parallel zu den Mesh-Maps pflegen |
| `brett/src/client/ui/export.ts` | `version`, `lines`/`anchors`/`zones` im Snapshot, `ExportFigure`/`ExportLine`-Erweiterung, Feature-Flag entfernen, PDF-Linientabelle |
| `brett/src/client/ui/import.ts` | Feature-Flag entfernen, `validateSnapshot` um version/lines/anchors/zones (lenient + Migration), `applyImportedSnapshot` um Lines/Anchors/Zones-Restore + erweiterte Figuren-Felder |
| `brett/src/client/ws-client.ts` | `_toExportFig()` erweitern, `_toExportLine()` neu, Cache mit lines/anchors/zones bei snapshot + line_*/anchor_*/zone_*-Nachrichten |
| `brett/public/index.html` | nur Verifikation: Import-Button/Input bereits vorhanden |
| `brett/package.json` | jsPDF devDependencies → dependencies |
| `brett/test/export.test.ts` | Tests für version/lines/anchors/zones-Defaults + ExportFigure/ExportLine-Felder |
| `brett/test/import.test.ts` | Tests für v0→v1-Migration + lines/anchors/zones-Roundtrip in validateSnapshot |

---

## Task A: State-Layer um anchors/zones erweitern

**Files:**
- Modify: `brett/src/client/state.ts:1-20`

- [ ] **Step A1: Import der Typen + Felder ergänzen**

In `brett/src/client/state.ts` den Typ-Import oben erweitern (Zeile 2) und `STATE`/`AppState` um zwei Arrays ergänzen.

Ersetze Zeile 2:

```typescript
import type { BrettLine } from '../types/state';
```

durch:

```typescript
import type { BrettLine, Anchor, Zone } from '../types/state';
```

Ersetze den `AppState`-Interface-Block + die `STATE`-Konstante (Zeilen 5–20) durch:

```typescript
export interface AppState {
  figures: any[];          // runtime figure objects (THREE groups + metadata)
  selectedId: string | null;
  hoveredId: string | null;
  stiffness: number;
  online: number;
  lines: BrettLine[];  // ← NEU (T000467)
  anchors: Anchor[];   // ← NEU (T000605) — Plain-Data-Spiegel der anchorMeshes
  zones: Zone[];       // ← NEU (T000605) — Plain-Data-Spiegel der zoneMeshes
}
export const STATE: AppState = {
  figures: [],
  selectedId: null,
  hoveredId: null,
  stiffness: 0.65,
  online: 1,
  lines: [],  // ← NEU
  anchors: [], // ← NEU (T000605)
  zones: [],   // ← NEU (T000605)
};
```

- [ ] **Step A2: Typecheck (kann zu diesem Zeitpunkt noch unrelated grün/rot sein — nur dieser File-Block muss fehlerfrei sein)**

Run: `cd brett && npx tsc --noEmit -p tsconfig.client.json 2>&1 | grep state.ts || echo "state.ts OK"`
Expected: `state.ts OK` (keine Fehler in state.ts)

- [ ] **Step A3: Commit**

```bash
cd /tmp/wt-T000605-brett-export
git add brett/src/client/state.ts
git commit -m "feat(brett): STATE.anchors + STATE.zones plain-data mirrors [T000605]"
```

---

## Task B: ground-objects.ts pflegt STATE.anchors/zones

**Files:**
- Modify: `brett/src/client/ground-objects.ts:8` (Import), `:104-106` (applyAnchorAdded), `:108-117` (applyAnchorRemoved), `:188-190` (applyZoneAdded), `:192-201` (applyZoneRemoved), `:210-218` (initGroundObjectsFromSnapshot)

- [ ] **Step B1: STATE in den Import aufnehmen**

Ersetze Zeile 8:

```typescript
import { getScene, getWs, isWsReady } from './state';
```

durch:

```typescript
import { STATE, getScene, getWs, isWsReady } from './state';
```

- [ ] **Step B2: applyAnchorAdded — STATE.anchors.push**

In `applyAnchorAdded`, ersetze die letzten beiden Zeilen vor `}` (aktuell Zeilen 104–105):

```typescript
  scene.add(group);
  anchorMeshes.set(anchor.id, group);
```

durch:

```typescript
  scene.add(group);
  anchorMeshes.set(anchor.id, group);
  STATE.anchors.push(anchor);
```

- [ ] **Step B3: applyAnchorRemoved — aus STATE.anchors entfernen**

In `applyAnchorRemoved`, ersetze die letzte Zeile vor `}` (aktuell Zeile 116):

```typescript
  anchorMeshes.delete(anchorId);
```

durch:

```typescript
  anchorMeshes.delete(anchorId);
  const aIdx = STATE.anchors.findIndex(a => a.id === anchorId);
  if (aIdx !== -1) STATE.anchors.splice(aIdx, 1);
```

- [ ] **Step B4: applyZoneAdded — STATE.zones.push**

In `applyZoneAdded`, ersetze die letzten beiden Zeilen vor `}` (aktuell Zeilen 188–189):

```typescript
  scene.add(group);
  zoneMeshes.set(zone.id, group);
```

durch:

```typescript
  scene.add(group);
  zoneMeshes.set(zone.id, group);
  STATE.zones.push(zone);
```

- [ ] **Step B5: applyZoneRemoved — aus STATE.zones entfernen**

In `applyZoneRemoved`, ersetze die letzte Zeile vor `}` (aktuell Zeile 200):

```typescript
  zoneMeshes.delete(zoneId);
```

durch:

```typescript
  zoneMeshes.delete(zoneId);
  const zIdx = STATE.zones.findIndex(z => z.id === zoneId);
  if (zIdx !== -1) STATE.zones.splice(zIdx, 1);
```

- [ ] **Step B6: initGroundObjectsFromSnapshot — Arrays zurücksetzen**

Da `applyAnchorRemoved`/`applyZoneRemoved` jetzt aus `STATE.anchors`/`STATE.zones` löschen, bleiben die Arrays beim Cleanup konsistent; aber zur Sicherheit setzen wir sie vor dem Neu-Rendern explizit leer (defensiv gegen Inkonsistenzen bei reconnect). Ersetze den Funktionskörper von `initGroundObjectsFromSnapshot` (Zeilen 211–217) durch:

```typescript
  // Cleanup bestehender Meshes (entfernt parallel aus STATE.anchors/zones)
  for (const [id] of anchorMeshes) applyAnchorRemoved(id);
  for (const [id] of zoneMeshes)   applyZoneRemoved(id);
  // Defensive: Arrays hart zurücksetzen, falls Mesh-Map/Array divergierten
  STATE.anchors.length = 0;
  STATE.zones.length = 0;

  // Neu rendern (push'd parallel in STATE.anchors/zones)
  for (const anchor of anchors) applyAnchorAdded(anchor);
  for (const zone   of zones)   applyZoneAdded(zone);
```

- [ ] **Step B7: Typecheck ground-objects.ts**

Run: `cd brett && npx tsc --noEmit -p tsconfig.client.json 2>&1 | grep ground-objects.ts || echo "ground-objects.ts OK"`
Expected: `ground-objects.ts OK`

- [ ] **Step B8: Commit**

```bash
cd /tmp/wt-T000605-brett-export
git add brett/src/client/ground-objects.ts
git commit -m "feat(brett): ground-objects pflegt STATE.anchors/zones [T000605]"
```

---

## Task C: Export-Typen erweitern (version, lines, anchors, zones, ExportFigure-Felder) — TDD

**Files:**
- Test: `brett/test/export.test.ts`
- Modify: `brett/src/client/ui/export.ts:9-55`

- [ ] **Step C1: Failing test — Default-Snapshot enthält version/lines/anchors/zones**

In `brett/test/export.test.ts`, im `describe('getExportSnapshot: Defaults', ...)`-Block (nach Zeile 74, vor dem schließenden `});` des bestehenden Tests) einen neuen Test ergänzen:

```typescript
  test('enthält version, lines, anchors, zones Defaults', () => {
    const snap = getExportSnapshot();
    assert.equal(snap.version, 1);
    assert.deepEqual(snap.lines, []);
    assert.deepEqual(snap.anchors, []);
    assert.deepEqual(snap.zones, []);
  });
```

- [ ] **Step C2: Run test to verify it fails**

Run: `cd brett && npm test -- 2>&1 | grep -A2 "version, lines, anchors"`
Expected: FAIL — `snap.version` ist `undefined` (assert.equal 1 vs undefined)

- [ ] **Step C3: ExportFigure + ExportLine + ClientBoardSnapshot erweitern, Cache-Default**

In `brett/src/client/ui/export.ts`, ersetze den Block der Interfaces + des `_cache`-Defaults + `getExportSnapshot` (Zeilen 9–55) durch:

```typescript
import type { Anchor, Zone, LineType, FigureAppearance } from '../../types/state';

/** Client-seitiger Board-Snapshot für den Export. */
export interface ClientBoardSnapshot {
  version: number;          // NEU (T000605) — Schema-Version für Migration. Aktuell 1.
  exportedAt: string;       // ISO-8601
  sessionCode: string | null;
  phase: string;
  stiffness: number;
  figures: ExportFigure[];
  lines: ExportLine[];      // NEU (T000605)
  anchors: Anchor[];        // NEU (T000605)
  zones: Zone[];            // NEU (T000605)
  optik: Record<string, unknown> | null;
}

/** Figur-Repräsentation im Export (nur serialisierbare Felder). */
export interface ExportFigure {
  id: string;
  label?: string;
  x: number;
  z: number;
  facingY: number;
  color?: string;
  figureType?: string;
  ownerId?: string;
  // NEU (T000605):
  scale?: number;
  preset?: string;
  note?: string;
  boneOverrides?: Record<string, { x: number; z: number }>;
  appearance?: FigureAppearance;
}

/** Beziehungs-/Spannungslinie im Export. */
export interface ExportLine {
  id: string;
  fromId: string;
  toId: string;
  lineType: LineType;
}

// ── Interner Cache ───────────────────────────────────────────────────────────

let _cache: ClientBoardSnapshot = {
  version: 1,
  exportedAt: new Date().toISOString(),
  sessionCode: null,
  phase: 'lobby',
  stiffness: 0.65,
  figures: [],
  lines: [],
  anchors: [],
  zones: [],
  optik: null,
};

/**
 * Aktualisiert den Export-Cache mit einem Partial-Patch.
 * Wird von ws-client.ts bei jeder relevanten WS-Nachricht aufgerufen.
 */
export function updateExportCache(patch: Partial<ClientBoardSnapshot>): void {
  _cache = { ..._cache, ...patch, exportedAt: new Date().toISOString() };
}

/**
 * Gibt eine Kopie des aktuellen Export-Snapshots zurück.
 */
export function getExportSnapshot(): ClientBoardSnapshot {
  return {
    ..._cache,
    figures: _cache.figures.map(f => ({ ...f })),
    lines: _cache.lines.map(l => ({ ...l })),
    anchors: _cache.anchors.map(a => ({ ...a })),
    zones: _cache.zones.map(z => ({ ...z })),
  };
}
```

> Hinweis: Die `import type`-Zeile MUSS innerhalb des Moduls oben stehen. Da das bestehende `export.ts` keine Imports hat, wird die `import type`-Zeile zur ersten Code-Zeile nach dem Datei-Header-Kommentar. Stelle sicher, dass sie vor allen `export interface`-Deklarationen steht (TS erlaubt top-level imports nur am Dateianfang vor Statements, aber nach Kommentaren ist OK).

- [ ] **Step C4: Run test to verify it passes**

Run: `cd brett && npm test -- 2>&1 | grep -A2 "version, lines, anchors"`
Expected: PASS

- [ ] **Step C5: Failing test — ExportFigure/ExportLine tragen die neuen Felder durch den Cache**

In `brett/test/export.test.ts`, im `describe('getExportSnapshot: Figuren-Serialisierung', ...)`-Block einen Test ergänzen (nach dem bestehenden Test, vor `});`):

```typescript
  test('ExportFigure trägt scale/preset/note/boneOverrides/appearance', () => {
    const fig: ExportFigure = {
      id: 'f99',
      x: 0,
      z: 0,
      facingY: 0,
      scale: 1.4,
      preset: 'sitzend',
      note: 'wichtige Aussage',
      boneOverrides: { head: { x: 0.1, z: -0.2 } },
      appearance: { color: '#00ff00', face: 'face1', body: null, accessories: {} },
    };
    updateExportCache({ figures: [fig] });
    const f = getExportSnapshot().figures[0];
    assert.equal(f.scale, 1.4);
    assert.equal(f.preset, 'sitzend');
    assert.equal(f.note, 'wichtige Aussage');
    assert.deepEqual(f.boneOverrides, { head: { x: 0.1, z: -0.2 } });
    assert.equal(f.appearance?.color, '#00ff00');
  });

  test('lines/anchors/zones werden als Kopie durchgereicht', () => {
    updateExportCache({
      lines: [{ id: 'l1', fromId: 'a', toId: 'b', lineType: 'tension' }],
      anchors: [{ id: 'an1', x: 1, z: 2, label: 'Ziel' }],
      zones: [{ id: 'zo1', x: 0, z: 0, shape: 'circle', radius: 1.5 }],
    });
    const snap = getExportSnapshot();
    assert.equal(snap.lines[0].lineType, 'tension');
    assert.equal(snap.anchors[0].label, 'Ziel');
    assert.equal(snap.zones[0].shape, 'circle');
    // Mutation der Kopie darf den Cache nicht verändern
    snap.lines[0].lineType = 'relationship';
    assert.equal(getExportSnapshot().lines[0].lineType, 'tension');
  });
```

- [ ] **Step C6: Run tests to verify they pass**

Run: `cd brett && npm test -- 2>&1 | grep -E "scale/preset/note|durchgereicht"`
Expected: beide PASS

- [ ] **Step C7: Commit**

```bash
cd /tmp/wt-T000605-brett-export
git add brett/src/client/ui/export.ts brett/test/export.test.ts
git commit -m "feat(brett): Export-Snapshot um version/lines/anchors/zones + ExportFigure-Felder [T000605]"
```

---

## Task D: ws-client.ts hält den Cache vollständig

**Files:**
- Modify: `brett/src/client/ws-client.ts:5` (Import), `:11-23` (_toExportFig + neues _toExportLine), `:277-282` (snapshot anchors/zones/lines), `:321-328` (snapshot updateExportCache), `:562-585` (anchor/zone-Handler), `:587-592` (line-Handler)

- [ ] **Step D1: Import um Anchor/Zone/ExportLine + Helper erweitern**

Ersetze Zeile 5:

```typescript
import { updateExportCache, type ExportFigure } from './ui/export';
```

durch:

```typescript
import { updateExportCache, type ExportFigure, type ExportLine } from './ui/export';
```

- [ ] **Step D2: _toExportFig erweitern + _toExportLine neu**

Ersetze die `_toExportFig`-Funktion (Zeilen 11–23) durch:

```typescript
/** Mappt eine runtime-Figure auf das serialisierbare ExportFigure-Format. */
function _toExportFig(fig: any): ExportFigure {
  return {
    id: fig.id,
    label: fig.label,
    x: fig.root?.position?.x ?? fig.x ?? 0,
    z: fig.root?.position?.z ?? fig.z ?? 0,
    facingY: fig.facingY ?? 0,
    color: fig.appearance?.color ?? fig.color,
    figureType: fig.figureType,
    ownerId: fig.ownerId,
    // NEU (T000605) — vollständiger Roundtrip:
    scale: fig.scale,
    preset: fig.preset,
    note: fig.note,
    boneOverrides: fig.boneOverrides ? { ...fig.boneOverrides } : undefined,
    appearance: fig.appearance ? { ...fig.appearance } : undefined,
  };
}

/** Mappt eine BrettLine (STATE.lines) auf das serialisierbare ExportLine-Format. */
function _toExportLine(line: any): ExportLine {
  return {
    id: line.id,
    fromId: line.fromId,
    toId: line.toId,
    lineType: line.lineType,
  };
}
```

- [ ] **Step D3: Snapshot-Handler — Cache mit lines/anchors/zones füllen**

Im `case 'snapshot':`-Block, ersetze den `updateExportCache`-Aufruf (Zeilen 321–328) durch:

```typescript
      // Export-Cache aktualisieren:
      updateExportCache({
        phase: (msg as any).phase ?? 'lobby',
        sessionCode: (msg as any).sessionCode ?? null,
        stiffness: (msg as any).stiffness ?? STATE.stiffness,
        figures: ((msg as any).figures ?? []).map(_toExportFig),
        lines: ((msg as any).lines ?? []).map(_toExportLine),
        anchors: [...((msg as any).anchors ?? [])],
        zones: [...((msg as any).zones ?? [])],
        optik: (msg as any).optik ?? null,
      });
```

> Hinweis: Die `anchors`/`zones` aus dem Snapshot werden direkt aus der WS-Message kopiert (Plain-Data), unabhängig vom `t000468-ground-anchors`-Feature-Flag — der Export soll den vollen Server-Zustand spiegeln, auch wenn das Rendering-Flag aus ist. Lines kommen über `_toExportLine`.

- [ ] **Step D4: Anchor/Zone-Handler — Cache nachziehen**

Ersetze den Block der vier ground-object-cases (Zeilen 561–585) durch:

```typescript
    // ── T000468: Boden-Anker & Zonen (DARK-LAUNCH-Rendering, Cache immer pflegen) ─
    case 'anchor_added': {
      if ((window as any).__brettFeatures?.['t000468-ground-anchors']) {
        groundObjects.applyAnchorAdded(msg.anchor);
        updateExportCache({ anchors: [...STATE.anchors] });
      } else {
        // Rendering aus, aber Export-Cache soll den Anker dennoch kennen
        updateExportCache({ anchors: [...STATE.anchors, msg.anchor] });
      }
      break;
    }
    case 'anchor_removed': {
      if ((window as any).__brettFeatures?.['t000468-ground-anchors']) {
        groundObjects.applyAnchorRemoved(msg.anchorId);
        updateExportCache({ anchors: [...STATE.anchors] });
      } else {
        updateExportCache({ anchors: STATE.anchors.filter(a => a.id !== msg.anchorId) });
      }
      break;
    }
    case 'zone_added': {
      if ((window as any).__brettFeatures?.['t000468-ground-anchors']) {
        groundObjects.applyZoneAdded(msg.zone);
        updateExportCache({ zones: [...STATE.zones] });
      } else {
        updateExportCache({ zones: [...STATE.zones, msg.zone] });
      }
      break;
    }
    case 'zone_removed': {
      if ((window as any).__brettFeatures?.['t000468-ground-anchors']) {
        groundObjects.applyZoneRemoved(msg.zoneId);
        updateExportCache({ zones: [...STATE.zones] });
      } else {
        updateExportCache({ zones: STATE.zones.filter(z => z.id !== msg.zoneId) });
      }
      break;
    }
```

> Hinweis: Wenn das Rendering-Flag AUS ist, pflegt `ground-objects.ts` `STATE.anchors`/`STATE.zones` NICHT (die `applyAnchor*`/`applyZone*`-Funktionen werden nicht aufgerufen). Damit der Export-Cache trotzdem korrekt bleibt, leiten wir in diesem Zweig die Patch-Werte direkt aus der Message ab (nicht aus `STATE`), da `STATE` dort leer/stale ist.

- [ ] **Step D5: Line-Handler — Cache aus STATE.lines nachziehen**

`scene-lines.ts` mutiert `STATE.lines` (push/splice/type-change) und hat keinen direkten Import auf `export.ts` (Spec A3). Deshalb ziehen wir den Cache hier in ws-client.ts nach, NACHDEM `applyLineMessage` `STATE.lines` aktualisiert hat. Ersetze den Line-case-Block (Zeilen 587–592) durch:

```typescript
    // ── T000467: Beziehungs-/Spannungslinien (delegiert an scene-lines.ts) ──
    case 'line_created':
    case 'line_deleted':
    case 'line_type_changed':
      applyLineMessage(msg);
      // Export-Cache mit aktuellem STATE.lines synchronisieren (scene-lines.ts
      // mutiert STATE.lines, hat aber keinen Export-Cache-Zugriff — T000605):
      updateExportCache({ lines: STATE.lines.map(_toExportLine) });
      break;
```

- [ ] **Step D6: Typecheck ws-client.ts**

Run: `cd brett && npx tsc --noEmit -p tsconfig.client.json 2>&1 | grep ws-client.ts || echo "ws-client.ts OK"`
Expected: `ws-client.ts OK`

- [ ] **Step D7: Commit**

```bash
cd /tmp/wt-T000605-brett-export
git add brett/src/client/ws-client.ts
git commit -m "feat(brett): ws-client hält Export-Cache mit lines/anchors/zones + erweiterten Figuren-Feldern [T000605]"
```

---

## Task E: import.ts — Feature-Flag raus, Migration + lines/anchors/zones-Restore — TDD

**Files:**
- Test: `brett/test/import.test.ts`
- Modify: `brett/src/client/ui/import.ts:9-10` (Imports), `:12-59` (validateSnapshot), `:61-105` (applyImportedSnapshot), `:123-127` (Feature-Flag-Guard)

- [ ] **Step E1: Failing test — validateSnapshot akzeptiert v0-Snapshot (ohne version/lines/anchors/zones) und defaultet**

In `brett/test/import.test.ts`, einen neuen `describe`-Block ans Dateiende (nach Zeile 196) anfügen:

```typescript
describe('validateSnapshot: v0→v1 Migration + lines/anchors/zones', () => {
  test('altes Snapshot ohne version/lines/anchors/zones → version 0 + leere Arrays', () => {
    const data = {
      exportedAt: '2024-01-15T10:30:00.000Z',
      phase: 'active',
      stiffness: 0.65,
      figures: [{ id: 'f1', x: 1.0, z: 2.0, facingY: 0.0 }],
    };
    const result = validateSnapshot(data);
    assert.equal(result.version, 0);
    assert.deepEqual(result.lines, []);
    assert.deepEqual(result.anchors, []);
    assert.deepEqual(result.zones, []);
  });

  test('neues Snapshot mit version 1 + lines/anchors/zones → Roundtrip', () => {
    const data = {
      version: 1,
      exportedAt: '2024-01-15T10:30:00.000Z',
      phase: 'active',
      stiffness: 0.65,
      figures: [{ id: 'f1', x: 1.0, z: 2.0, facingY: 0.0 }],
      lines: [{ id: 'l1', fromId: 'f1', toId: 'f2', lineType: 'tension' }],
      anchors: [{ id: 'an1', x: 0.5, z: 0.5, label: 'Anker' }],
      zones: [{ id: 'zo1', x: 0, z: 0, shape: 'rect', width: 2, height: 2 }],
    };
    const result = validateSnapshot(data);
    assert.equal(result.version, 1);
    assert.equal(result.lines.length, 1);
    assert.equal(result.lines[0].lineType, 'tension');
    assert.equal(result.anchors[0].label, 'Anker');
    assert.equal(result.zones[0].shape, 'rect');
  });

  test('nicht-Array lines/anchors/zones → werden zu leeren Arrays defaultet', () => {
    const data = {
      exportedAt: '2024-01-15T10:30:00.000Z',
      phase: 'active',
      stiffness: 0.65,
      figures: [],
      lines: 'kaputt',
      anchors: null,
      zones: 42,
    };
    const result = validateSnapshot(data);
    assert.deepEqual(result.lines, []);
    assert.deepEqual(result.anchors, []);
    assert.deepEqual(result.zones, []);
  });
});
```

- [ ] **Step E2: Run tests to verify they fail**

Run: `cd brett && npm test -- 2>&1 | grep -E "v0→v1|Roundtrip|defaultet"`
Expected: FAIL — `result.version` ist `undefined`, `result.lines` ist `undefined`.

- [ ] **Step E3: validateSnapshot — version + lines/anchors/zones lenient + Migration**

In `brett/src/client/ui/import.ts`, ersetze die Imports (Zeilen 9–10):

```typescript
import { STATE, getScene } from '../state';
import { updateExportCache, type ClientBoardSnapshot, type ExportFigure } from './export';
```

durch:

```typescript
import { STATE, getScene } from '../state';
import { updateExportCache, type ClientBoardSnapshot, type ExportFigure, type ExportLine } from './export';
import type { Anchor, Zone } from '../../types/state';
```

Ersetze das `return { ... }`-Statement am Ende von `validateSnapshot` (Zeilen 51–58) durch:

```typescript
  const version = typeof obj.version === 'number' ? obj.version : 0; // fehlend → v0 (Migration)
  const lines = Array.isArray(obj.lines) ? (obj.lines as ExportLine[]) : [];
  const anchors = Array.isArray(obj.anchors) ? (obj.anchors as Anchor[]) : [];
  const zones = Array.isArray(obj.zones) ? (obj.zones as Zone[]) : [];

  return {
    version,
    exportedAt: obj.exportedAt,
    sessionCode: (obj.sessionCode as string | null) ?? null,
    phase: obj.phase,
    stiffness: obj.stiffness,
    figures: obj.figures as ExportFigure[],
    lines,
    anchors,
    zones,
    optik: (obj.optik as Record<string, unknown> | null) ?? null,
  };
```

- [ ] **Step E4: Run tests to verify they pass**

Run: `cd brett && npm test -- 2>&1 | grep -E "v0→v1|Roundtrip|defaultet"`
Expected: alle PASS

- [ ] **Step E5: applyImportedSnapshot — erweiterte Figuren-Felder + Lines/Anchors/Zones wiederherstellen**

In `brett/src/client/ui/import.ts`, ersetze den gesamten Körper von `applyImportedSnapshot` (Zeilen 61–105) durch:

```typescript
export async function applyImportedSnapshot(snapshot: ClientBoardSnapshot): Promise<void> {
  const [wsClient, mannequin, { applyOptikToScene }, sceneLines, groundObjects] = await Promise.all([
    import('../ws-client'),
    import('../mannequin'),
    import('./optik'),
    import('../scene-lines'),
    import('../ground-objects'),
  ]);
  const scene = getScene().scene;

  // ── Figuren zurücksetzen ────────────────────────────────────────────────
  for (const fig of STATE.figures) {
    scene.remove(fig.root);
  }
  STATE.figures.length = 0;

  for (const expFig of snapshot.figures) {
    const fig = mannequin.makeMannequin(expFig.id, { x: expFig.x, z: expFig.z });
    fig.facingY = expFig.facingY;
    fig.root.rotation.y = expFig.facingY;
    if (expFig.label) {
      fig.label = expFig.label;
    }
    // Erweiterte serialisierbare Felder (T000605):
    if (typeof expFig.scale === 'number') {
      (fig as any).scale = expFig.scale;
    }
    if (expFig.preset) {
      (fig as any).preset = expFig.preset;
    }
    if (expFig.note !== undefined) {
      (fig as any).note = expFig.note;
    }
    if (expFig.boneOverrides) {
      (fig as any).boneOverrides = { ...expFig.boneOverrides };
    }
    if (expFig.appearance) {
      (fig as any).appearance = { ...expFig.appearance };
    } else if (expFig.color) {
      mannequin.recolorFigure(fig, expFig.color);
    }
    STATE.figures.push(fig);
    wsClient.sendAddFigure(fig);
  }

  STATE.stiffness = snapshot.stiffness;
  const stiffSlider = document.getElementById('stiffness') as HTMLInputElement | null;
  if (stiffSlider) {
    stiffSlider.value = String(snapshot.stiffness);
  }
  wsClient.sendStiffness(snapshot.stiffness);

  if (snapshot.optik) {
    applyOptikToScene(snapshot.optik as any);
  }

  // ── Lines wiederherstellen (lokales Re-Rendering via scene-lines.ts) ──────
  // initLinesFromSnapshot rendert nur, wenn das sf-t000467-Flag aktiv ist —
  // STATE.lines wird unabhängig davon gefüllt, sodass der Export-Cache stimmt.
  sceneLines.initLinesFromSnapshot(snapshot.lines ?? []);

  // ── Anchors/Zones wiederherstellen (Rendering via ground-objects.ts) ──────
  // initGroundObjectsFromSnapshot rendert die Meshes und pflegt STATE.anchors/zones.
  groundObjects.initGroundObjectsFromSnapshot(snapshot.anchors ?? [], snapshot.zones ?? []);

  // ── Export-Cache mit dem importierten Vollzustand synchronisieren ─────────
  updateExportCache({
    version: snapshot.version,
    phase: snapshot.phase,
    stiffness: snapshot.stiffness,
    figures: snapshot.figures,
    lines: snapshot.lines,
    anchors: snapshot.anchors,
    zones: snapshot.zones,
    optik: snapshot.optik,
  });
}
```

> Hinweis: `scene-lines.initLinesFromSnapshot` erwartet `BrettLine[]`; `ExportLine` ist strukturell ein Subset (id/fromId/toId/lineType) und damit zuweisungskompatibel. `ground-objects.initGroundObjectsFromSnapshot` erwartet `Anchor[]`/`Zone[]`, die im Snapshot exakt so vorliegen.

- [ ] **Step E6: Feature-Flag-Guard in initImportButton entfernen**

Ersetze den Körper von `initImportButton` (Zeilen 123–146), konkret die Feature-Flag-Prüfung (Zeilen 124–126):

```typescript
export function initImportButton(): void {
  const feats: Record<string, boolean> =
    (typeof window !== 'undefined' && (window as any).__brettFeatures) || {};
  if (!feats['T000466']) return;

  const btn = document.getElementById('btn-import-json') as HTMLButtonElement | null;
```

durch:

```typescript
export function initImportButton(): void {
  // T000605: Feature-Flag entfernt — Import ist permanent verfügbar.
  const btn = document.getElementById('btn-import-json') as HTMLButtonElement | null;
```

- [ ] **Step E7: Typecheck + alle bisherigen Tests grün**

Run: `cd brett && npx tsc --noEmit -p tsconfig.client.json 2>&1 | grep import.ts || echo "import.ts OK"`
Expected: `import.ts OK`

Run: `cd brett && npm test -- 2>&1 | tail -20`
Expected: Alle Tests PASS (keine fail-Zeile)

- [ ] **Step E8: Commit**

```bash
cd /tmp/wt-T000605-brett-export
git add brett/src/client/ui/import.ts brett/test/import.test.ts
git commit -m "feat(brett): Import-Migration v0→v1 + Lines/Anchors/Zones-Restore, Flag entfernt [T000605]"
```

---

## Task F: Feature-Flag in export.ts entfernen

**Files:**
- Modify: `brett/src/client/ui/export.ts:166-173` (initExportButtons-Guard)

- [ ] **Step F1: Guard entfernen, Gruppe weiterhin einblenden**

Ersetze in `initExportButtons` die Feature-Flag-Prüfung (Zeilen 167–173):

```typescript
  // Feature-Flag-Prüfung (DARK-LAUNCH: T000466)
  const feats: Record<string, boolean> =
    (typeof window !== 'undefined' && (window as any).__brettFeatures) || {};
  if (!feats['T000466']) return;

  const group = document.getElementById('export-group');
  if (group) group.style.display = '';
```

durch:

```typescript
  // T000605: Feature-Flag entfernt — Export ist permanent verfügbar.
  // Die Gruppe ist im HTML initial display:none und wird hier eingeblendet.
  const group = document.getElementById('export-group');
  if (group) group.style.display = '';
```

- [ ] **Step F2: Verifikation — keine T000466-Referenz mehr im Client-Code**

Run: `cd /tmp/wt-T000605-brett-export && grep -rn "T000466" brett/src/client/ | grep -v "Ticket:" || echo "keine aktiven T000466-Guards mehr"`
Expected: `keine aktiven T000466-Guards mehr` (nur noch Ticket-Header-Kommentare erlaubt)

- [ ] **Step F3: Commit**

```bash
cd /tmp/wt-T000605-brett-export
git add brett/src/client/ui/export.ts
git commit -m "feat(brett): Export-Feature-Flag T000466 entfernt — permanent aktiv [T000605]"
```

---

## Task G: Import-Button im HUD verifizieren (bereits vorhanden)

**Files:**
- Verify only: `brett/public/index.html:358-365`, `brett/src/client/board-boot.ts:51-55`

> Die Spec (Phase G) verlangt, einen Import-Button + File-Input ins `#export-group` einzufügen. **Beides existiert bereits** im Worktree (`btn-import-json`, `import-file-input`) und `initImportButton()` ist in `board-boot.ts:55` verdrahtet. Diese Task ist daher reine Verifikation — kein HTML-Edit nötig.

- [ ] **Step G1: Verifiziere, dass Button + Input + Verdrahtung vorhanden sind**

Run: `cd /tmp/wt-T000605-brett-export && grep -c "btn-import-json\|import-file-input" brett/public/index.html`
Expected: `2`

Run: `cd /tmp/wt-T000605-brett-export && grep -n "initImportButton\|initExportButtons" brett/src/client/board-boot.ts`
Expected: zwei Treffer (Zeilen ~52 und ~55)

- [ ] **Step G2: (kein Commit — nur Verifikation)**

---

## Task H: PDF — Beziehungslinien-Tabelle

**Files:**
- Modify: `brett/src/client/ui/export.ts` (`exportPdf`, nach der Figurenliste, vor `doc.save`)

- [ ] **Step H1: Linientabelle nach der Figurenliste einfügen**

In `exportPdf`, direkt VOR `doc.save(\`brett-${_isoDate()}.pdf\`);` (aktuell Zeile 154) den folgenden Block einfügen:

```typescript
  // ── Beziehungslinien-Tabelle (T000605) ───────────────────────────────────
  if (snapshot.lines.length > 0) {
    // Label-Lookup aus den Figuren (Fallback: figureId selbst)
    const labelOf = (id: string): string => {
      const f = snapshot.figures.find(fig => fig.id === id);
      return (f?.label && f.label.trim()) ? f.label : id;
    };
    // Startposition: unterhalb der (max. 8-zeiligen) Figurenliste oder Metadaten
    const labelledCount = snapshot.figures.filter(f => f.label && f.label.trim()).length;
    const listRows = Math.min(labelledCount, 8);
    const LINES_Y = META_Y + 7 + (labelledCount > 0 ? 5 + listRows * 5 : 0) + 4;
    doc.setFontSize(7);
    doc.setTextColor(80);
    doc.text('Beziehungen:', 20, LINES_Y);
    snapshot.lines.forEach((l, i) => {
      const col = Math.floor(i / 8);
      const row = i % 8;
      const x = 20 + col * 90;
      const y = LINES_Y + 5 + row * 5;
      doc.text(`• ${labelOf(l.fromId)} → ${labelOf(l.toId)}  [${l.lineType}]`, x, y);
    });
  }
```

> Hinweis: `META_Y` ist in `exportPdf` als `const META_Y = IMG_Y + IMG_H + 7;` definiert und damit im Funktions-Scope verfügbar. Der vertikale Offset rechnet die Höhe der Figurenliste mit ein, damit sich die Tabellen nicht überlappen.

- [ ] **Step H2: Typecheck export.ts**

Run: `cd brett && npx tsc --noEmit -p tsconfig.client.json 2>&1 | grep "ui/export.ts" || echo "export.ts OK"`
Expected: `export.ts OK`

- [ ] **Step H3: Commit**

```bash
cd /tmp/wt-T000605-brett-export
git add brett/src/client/ui/export.ts
git commit -m "feat(brett): PDF-Export um Beziehungslinien-Tabelle [T000605]"
```

---

## Task I: jsPDF von devDependencies → dependencies

**Files:**
- Modify: `brett/package.json:16-39`

- [ ] **Step I1: jsPDF verschieben**

In `brett/package.json`:
- Entferne aus `devDependencies` die Zeile `"jspdf": "^4.2.1",` (Zeile 34).
- Füge in `dependencies` (alphabetisch zwischen `express-session` und `multer`, also nach `"express-session": "^1.19.0",`) ein: `"jspdf": "^4.2.1",`.

Resultierender `dependencies`-Block:

```json
  "dependencies": {
    "express": "^5.2.1",
    "express-session": "^1.19.0",
    "jspdf": "^4.2.1",
    "multer": "^1.4.5-lts.1",
    "openid-client": "^6.8.4",
    "pg": "^8.21.0",
    "tsx": "^4.22.4",
    "ws": "^8.21.0"
  },
```

`@types/jspdf` bleibt in `devDependencies` (Type-only, korrekt dort).

- [ ] **Step I2: package.json bleibt valides JSON**

Run: `cd brett && node -e "JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log('package.json valid')"`
Expected: `package.json valid`

- [ ] **Step I3: Commit**

```bash
cd /tmp/wt-T000605-brett-export
git add brett/package.json
git commit -m "chore(brett): jsPDF devDependencies → dependencies [T000605]"
```

---

## Task J: Vollständige Verifikation (alle Tests grün)

**Files:** keine Änderung — reine Verifikation.

- [ ] **Step J1: Dependencies installieren (falls node_modules fehlt)**

Run: `cd brett && (test -d node_modules || npm install) && echo "deps ready"`
Expected: `deps ready`

- [ ] **Step J2: Volle Testsuite grün**

Run: `cd brett && npm test 2>&1 | tail -25`
Expected: Keine `fail`-Zeile mit Count > 0; alle `pass`. (`tests N`, `pass N`, `fail 0`)

- [ ] **Step J3: Client-Typecheck grün**

Run: `cd brett && npx tsc --noEmit -p tsconfig.client.json 2>&1 | tail -5 || true`
Expected: keine neuen Fehler in den geänderten Dateien (state.ts, ground-objects.ts, ui/export.ts, ui/import.ts, ws-client.ts).

> Falls vorbestehende, unrelated Typefehler im Projekt existieren, sind diese NICHT Teil dieses Tickets — dokumentiere sie, blockiere aber nicht. Neue Fehler in den oben gelisteten Dateien MÜSSEN behoben werden.

- [ ] **Step J4: Akzeptanzkriterien-Check (manuell gegen Spec)**

Verifiziere gegen `docs/superpowers/specs/2026-06-11-brett-board-export-design.md` §Akzeptanzkriterien:
1. PNG-Export — Code unverändert funktionsfähig (`exportPng`) ✓
2. PDF-Export inkl. Figurenliste + Linientabelle (Task H) ✓
3. JSON-Export mit `version:1`, figures (alle Felder), lines, anchors, zones, optik (Task C/D) ✓
4. JSON-Import mit Restore von Lines/Anchors/Zones (Task E) ✓
5. Roundtrip identisch (Task C/D/E Tests) ✓
6. Abwärtskompatibilität v0-Snapshots (Task E Migration-Test) ✓
7. Tests grün (Step J2) ✓

- [ ] **Step J5: Finaler Commit (nur falls noch ungespeicherte Änderungen)**

```bash
cd /tmp/wt-T000605-brett-export
git status --short
# Falls Reste: git add -A && git commit -m "chore(brett): T000605 finalisieren"
```

---

## Self-Review-Notiz (vom Plan-Autor)

- **Spec-Abweichung dokumentiert:** Phase G (Import-Button hinzufügen) → bereits vorhanden, daher Verifikations-Task. ID heißt `import-file-input`, nicht `input-import-json` wie in der Spec/Prompt.
- **Doppelter Feature-Flag:** Sowohl `export.ts` (Task F) als auch `import.ts` (Task E6) tragen einen `T000466`-Guard — beide werden entfernt. Die Prompt-Implementierungsreihenfolge nannte nur export.ts; import.ts wurde ergänzt, sonst bliebe der Import-Button unsichtbar.
- **Cache-Konsistenz bei ausgeschaltetem Render-Flag:** Wenn `t000468-ground-anchors` aus ist, pflegt `ground-objects.ts` `STATE.anchors/zones` nicht → ws-client leitet die Cache-Patches in diesem Zweig direkt aus der Message ab (Task D4), nicht aus `STATE`.
- **Lines ohne export.ts-Import in scene-lines.ts:** Cache-Update erfolgt in ws-client nach `applyLineMessage` (Task D5), konform zur Spec-Vorgabe A3.
- **TDD:** Tasks C, E sind test-first (failing test → impl → pass). Tasks A/B/D/F/H/I sind strukturelle/typgetriebene Änderungen mit Typecheck-Gates; ihre Wirkung wird durch die C/E-Tests + Step J2 abgedeckt.

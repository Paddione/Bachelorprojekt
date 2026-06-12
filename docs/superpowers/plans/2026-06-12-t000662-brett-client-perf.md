---
title: "Brett Client-Render-Performance Fixes (T000662)"
ticket_id: T000662
pr_number: null
status: staged
domains: [brett]
depends_on_plans: [docs/superpowers/plans/2026-06-12-t000660-brett-security-leaks.md]
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
---

# Brett Client-Render-Performance Fixes (T000662) — Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Drei Client-seitige Render-Performance-Bugs in Brett beheben, die pro Frame unnötig Canvas-Redraws, BufferGeometry-Rebuilds und Vector3-Allokationen verursachen — rote TDD-Tests grün machen, alle 509 Tests bleiben grün.

**Architecture:** Drei unabhängige, orthogonale Micro-Fixes in `brett/src/client/mannequin.ts` (Bugs 1 und 3) und `brett/src/client/scene-lines.ts` (Bug 2). Jeder Fix fügt entweder einen Cache (`_lastLabelText`), einen modul-weiten Scratch-Vector (`_floorClampScratch`) oder eine In-Place-Geometry-Aktualisierung hinzu. Die bestehenden Tests in `brett/test/client-render-perf.test.ts` definieren exakt das Sollverhalten; kein neuer Testcode wird benötigt.

**Tech Stack:** TypeScript, THREE.js (`THREE.Vector3`, `THREE.BufferGeometry`, `THREE.CatmullRomCurve3`), Node.js test runner (`tsx --test`), `tsconfig.client.json` + `tsconfig.server.json`.

---

## Vorab: Dateiübersicht

| Datei | Änderung |
|-------|----------|
| `brett/src/client/mannequin.ts` | Bug 1: Cache `_lastLabelText` in `updatePossessorLabel`; Bug 3: `export const _floorClampScratch`, Nutzung im `tickSpring` Floor-Clamp |
| `brett/src/client/scene-lines.ts` | Bug 2: In-Place-Geometry-Update + `export function getLineObjects()` Test-Seam |
| `brett/test/client-render-perf.test.ts` | Bereits vorhanden, keine Änderungen — wird nach den Fixes grün |

---

### Task 0: Rebase-Check (Konfliktlage T000660)

**Kontext:** Branch `fix/T000660-brett-security-leaks` modifiziert ebenfalls `mannequin.ts` (neuer Export `disposeMannequin` am Dateiende) und `ws-client.ts`. Wenn T000660 inzwischen in `main` gemergt ist, muss zuerst rebased werden, damit Zeilennummern stimmen.

**Files:**
- Kein File-Edit — nur git-Befehle

- [ ] **Step 1: Status prüfen**

```bash
cd /tmp/wt-brett-perf
git fetch origin main
git log --oneline origin/main | head -5
```

Erwartetes Ergebnis: Wenn `disposeMannequin` bereits in main ist → Rebase nötig (weiter mit Step 2). Sonst → direkt zu Task 1.

- [ ] **Step 2: Rebase falls T000660 gemergt**

Nur ausführen wenn Step 1 zeigt, dass T000660 in main enthalten ist:

```bash
cd /tmp/wt-brett-perf
git rebase origin/main
```

Bei Konflikten in `mannequin.ts`: In-Place-Block behalten, den `disposeMannequin`-Export an das Dateiende stellen (er gehört nicht in den Bereich, den Bug 1 und Bug 3 berühren).

---

### Task 1: Bug 3 — Scratch-Vector `_floorClampScratch` exportieren

**Hintergrund:** In `tickSpring` (ca. Z.305–308) wird pro Contact-Point und pro Frame `new THREE.Vector3()` alloziert. Bei 60fps × 9 Contact-Points × N Figuren erzeugt das massiven GC-Druck. Fix: einen modul-weiten Scratch-Vector exportieren und wiederverwenden.

**Files:**
- Modify: `brett/src/client/mannequin.ts` (ca. Z.1–25 für den Export; ca. Z.299–310 für die Nutzung)
- Test: `brett/test/client-render-perf.test.ts` (bereits vorhanden)

- [x] **Step 1: Tests laufen lassen — Bug-3-Test muss rot sein**

```bash
cd /tmp/wt-brett-perf/brett
npm test 2>&1 | grep -A3 'Bug 3'
```

Erwartetes Ergebnis:
```
✗ Bug 3 — Scratch-Vector: _floorClampScratch muss als modul-weiter Vector3 exportiert werden
  AssertionError: Bug 3: _floorClampScratch muss aus mannequin.ts exportiert werden
```

- [x] **Step 2: Modul-weiten Scratch-Vector nach den Konstanten-Exporten hinzufügen**

In `brett/src/client/mannequin.ts`, nach Zeile 23 (Ende von `CONTACT_POINTS`), direkt vor `const K_SPRING`:

```typescript
/** Modul-weiter scratch Vector3 für den Floor-Clamp in tickSpring — verhindert GC-Allokation per Frame. */
export const _floorClampScratch = new THREE.Vector3();
```

Der Block sieht dann so aus:
```typescript
export const CONTACT_POINTS = [
  { bone: 'lWrist', color: 0xffd84a }, { bone: 'rWrist', color: 0xffd84a },
  { bone: 'lAnkle', color: 0x6be0a0 }, { bone: 'rAnkle', color: 0x6be0a0 },
  { bone: 'lKnee',  color: 0x4a9adf }, { bone: 'rKnee',  color: 0x4a9adf },
  { bone: 'lElbow', color: 0xc8a96e }, { bone: 'rElbow', color: 0xc8a96e },
  { bone: 'head',   color: 0xe09090 },
];

/** Modul-weiter scratch Vector3 für den Floor-Clamp in tickSpring — verhindert GC-Allokation per Frame. */
export const _floorClampScratch = new THREE.Vector3();

const K_SPRING = 80;
```

- [x] **Step 3: Floor-Clamp in `tickSpring` auf Scratch-Vector umstellen**

In `brett/src/client/mannequin.ts`, im `tickSpring`-Floor-Clamp-Block (ca. Z.301–310). Ersetze:

```typescript
// ALT (vor dem Fix):
for (const cp of CONTACT_POINTS) {
  if (cp.bone === 'lAnkle' || cp.bone === 'rAnkle' || cp.bone === 'lKnee' || cp.bone === 'rKnee') {
    const s = fig.bones[cp.bone].children.find((c: any) => c.userData && c.userData.isContact);
    if (s) {
      const world = new THREE.Vector3();
      s.getWorldPosition(world);
      if (world.y < minY) minY = world.y;
    }
  }
}
```

Mit:

```typescript
// NEU (nach dem Fix):
for (const cp of CONTACT_POINTS) {
  if (cp.bone === 'lAnkle' || cp.bone === 'rAnkle' || cp.bone === 'lKnee' || cp.bone === 'rKnee') {
    const s = fig.bones[cp.bone].children.find((c: any) => c.userData && c.userData.isContact);
    if (s) {
      s.getWorldPosition(_floorClampScratch);
      if (_floorClampScratch.y < minY) minY = _floorClampScratch.y;
    }
  }
}
```

- [x] **Step 4: Test grün machen — Bug 3 prüfen**

```bash
cd /tmp/wt-brett-perf/brett
npm test 2>&1 | grep -A3 'Bug 3'
```

Erwartetes Ergebnis:
```
✓ Bug 3 — Scratch-Vector: _floorClampScratch muss als modul-weiter Vector3 exportiert werden
```

- [x] **Step 5: TypeScript-Typprüfung**

```bash
cd /tmp/wt-brett-perf/brett
npx tsc --noEmit -p tsconfig.client.json
npx tsc --noEmit -p tsconfig.server.json
```

Erwartetes Ergebnis: Keine Fehler.

- [x] **Step 6: no-eager-three-Test prüfen**

```bash
cd /tmp/wt-brett-perf/brett
npm test 2>&1 | grep -A3 'no-eager'
```

Erwartetes Ergebnis: Beide Tests in `no-eager-three.test.ts` weiterhin grün (sie prüfen nur `main.ts`, nicht `mannequin.ts`).

- [x] **Step 7: Commit**

```bash
cd /tmp/wt-brett-perf
git add brett/src/client/mannequin.ts
git commit -m "perf(brett): reuse _floorClampScratch in tickSpring floor-clamp (T000662)"
```

---

### Task 2: Bug 1 — Label-Caching: `_lastLabelText` in `updatePossessorLabel`

**Hintergrund:** `updatePossessorLabel` schreibt bei jedem Aufruf in den 2D-Canvas und setzt `material.map.needsUpdate = true`, unabhängig davon ob sich der Text geändert hat. Fix: `fig._lastLabelText` als Cache; bei unverändertem Text wird der Canvas-Redraw übersprungen.

**Files:**
- Modify: `brett/src/client/mannequin.ts` (Funktion `updatePossessorLabel`, ca. Z.478–489)
- Test: `brett/test/client-render-perf.test.ts` (bereits vorhanden)

- [ ] **Step 1: Test rot bestätigen**

```bash
cd /tmp/wt-brett-perf/brett
npm test 2>&1 | grep -A3 'Bug 1'
```

Erwartetes Ergebnis:
```
✗ Bug 1 — Label-Cache: unveränderter Text führt beim zweiten Frame zu keinem Canvas-Redraw
  AssertionError: Bug 1: clearRect darf bei unverändertem Label-Text nicht erneut aufgerufen werden
```

- [ ] **Step 2: `updatePossessorLabel` mit Cache-Guard erweitern**

In `brett/src/client/mannequin.ts`, Funktion `updatePossessorLabel` (ca. Z.478). Ersetze die gesamte Funktion:

```typescript
// ALT:
function updatePossessorLabel(fig: any, text: string, hexColor: string): void {
  const canvas = fig.labelSprite.material.map.image as HTMLCanvasElement;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 256, 64);
  ctx.font = 'bold 18px "Geist Mono", monospace';
  ctx.fillStyle = hexColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text.toUpperCase(), 128, 32);
  fig.labelSprite.material.map.needsUpdate = true;
  fig.labelSprite.visible = true;
}
```

Mit:

```typescript
// NEU:
function updatePossessorLabel(fig: any, text: string, hexColor: string): void {
  const upperText = text.toUpperCase();
  // Cache: Bei unverändertem Text kein Canvas-Redraw und kein needsUpdate.
  if (fig._lastLabelText === upperText) {
    fig.labelSprite.visible = true;
    return;
  }
  fig._lastLabelText = upperText;
  const canvas = fig.labelSprite.material.map.image as HTMLCanvasElement;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 256, 64);
  ctx.font = 'bold 18px "Geist Mono", monospace';
  ctx.fillStyle = hexColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(upperText, 128, 32);
  fig.labelSprite.material.map.needsUpdate = true;
  fig.labelSprite.visible = true;
}
```

**Hinweis:** Der Cache-Key ist der Upper-Case-Text (ohne `hexColor`). Damit wird bei einem Farbwechsel (z.B. eigene → fremde Possession) der Canvas trotzdem neu gezeichnet, weil sich der Text ändert (`'ICH'` vs. Name). Wenn sich nur die Farbe ändern würde ohne Textänderung, würde der neue Farbton nicht gerendert — dieses Edge-Case tritt im aktuellen Aufrufmuster nicht auf (Farbänderung ist immer mit Text-Änderung verbunden: `'ICH'` ↔ Name). Wenn künftig Farb-Only-Wechsel nötig werden, Cache-Key um Farbe erweitern.

- [ ] **Step 3: Cache bei `clearPossessionVisuals` zurücksetzen**

Damit nach einem `clearPossessionVisuals`-Aufruf (Figur wird freigegeben) beim nächsten Besitz der Canvas neu gezeichnet wird, den Cache löschen:

```typescript
// ALT:
export function clearPossessionVisuals(fig: any): void {
  fig.possessionRing.visible = false;
  fig.labelSprite.visible = false;
}
```

Mit:

```typescript
// NEU:
export function clearPossessionVisuals(fig: any): void {
  fig.possessionRing.visible = false;
  fig.labelSprite.visible = false;
  fig._lastLabelText = undefined;  // Cache invalidieren
}
```

- [ ] **Step 4: Test grün**

```bash
cd /tmp/wt-brett-perf/brett
npm test 2>&1 | grep -A3 'Bug 1'
```

Erwartetes Ergebnis:
```
✓ Bug 1 — Label-Cache: unveränderter Text führt beim zweiten Frame zu keinem Canvas-Redraw
```

- [ ] **Step 5: Vollständige Typprüfung**

```bash
cd /tmp/wt-brett-perf/brett
npx tsc --noEmit -p tsconfig.client.json
npx tsc --noEmit -p tsconfig.server.json
```

Erwartetes Ergebnis: Keine Fehler.

- [ ] **Step 6: Commit**

```bash
cd /tmp/wt-brett-perf
git add brett/src/client/mannequin.ts
git commit -m "perf(brett): cache label text in updatePossessorLabel to skip redundant canvas redraws (T000662)"
```

---

### Task 3: Bug 2 — In-Place-Geometry-Update + `getLineObjects` Test-Seam

**Hintergrund:** `updateLinePositions` ruft für jede bewegte Linie `renderLine` auf, welches `removeLineFromScene` (dispose!) und `new BufferGeometry()` erzeugt. Bei 60fps mit bewegten Figuren wird die Geometrie damit permanent weggeworfen und neu angelegt. Fix: Positions-Float32Array pre-allokieren (41 Punkte, feste Größe von `CatmullRomCurve3.getPoints(40)`), via `attribute.setXYZ` + `needsUpdate` in-place schreiben.

**Wichtige Constraints:**
- `removeLineFromScene` bleibt unverändert — beim echten Löschen einer Linie muss weiterhin disposed werden.
- Der Pfad `renderLine` (Neuanlage beim ersten Mal oder nach Typ-Änderung) bleibt für den Full-Rebuild zuständig.
- `updateLinePositions` bekommt einen separaten In-Place-Pfad der nur aufgerufen wird wenn die Linie bereits in `lineObjects` existiert.
- Wenn sich der Linien-Typ ändert (`line_type_changed`), wird weiterhin `rerenderLine` → `renderLine` aufgerufen (Full-Rebuild) — das ist korrekt, weil sich Material (LineDashedMaterial vs. LineBasicMaterial) ändert.
- Die Anzahl der Kurven-Punkte ist immer 41 (`.getPoints(40)` liefert Start + 40 Zwischenpunkte = 41). Diese Zahl ist konstant, da `buildGeometry` immer `getPoints(40)` aufruft. Eine Prüfung auf Größenänderung ist damit nicht nötig — wenn sich die Zahl in Zukunft je ändern sollte, müsste man einen Guard ergänzen (Kommentar im Code).

**Files:**
- Modify: `brett/src/client/scene-lines.ts`
- Test: `brett/test/client-render-perf.test.ts` (bereits vorhanden)

- [ ] **Step 1: Test rot bestätigen**

```bash
cd /tmp/wt-brett-perf/brett
npm test 2>&1 | grep -A3 'Bug 2'
```

Erwartetes Ergebnis:
```
✗ Bug 2 — Geometry-Identität: updateLinePositions darf THREE.Line-Referenz nicht ersetzen
  AssertionError: Bug 2: getLineObjects muss als Test-Seam exportiert werden (heute fehlt dieser Export)
```

- [ ] **Step 2: Test-Seam `getLineObjects` exportieren**

In `brett/src/client/scene-lines.ts`, direkt nach `const lineObjects = new Map<string, THREE.Line>();` (ca. Z.14), die Zeile für `lastPositions` belassen und danach:

```typescript
// Aktive THREE.Line Objekte, geindext nach lineId
const lineObjects = new Map<string, THREE.Line>();

/** Test-Seam: gibt die interne lineObjects-Map zurück (für Identitäts-Tests). */
export function getLineObjects(): Map<string, THREE.Line> {
  return lineObjects;
}

// Letzte bekannte Positionen der Figuren (dirty-check für Frame-Loop Update)
const lastPositions = new Map<string, { x: number; z: number }>();
```

- [ ] **Step 3: Hilfsfunktion `updateGeometryInPlace` hinzufügen**

In `brett/src/client/scene-lines.ts`, nach der Funktion `buildGeometry` (ca. Z.39, nach `}`), neue private Hilfsfunktion einfügen:

```typescript
/**
 * Aktualisiert die Positions eines bestehenden THREE.Line-Objekts in-place.
 * Setzt positions-Attribute via setXYZ + needsUpdate = true.
 * KEINE neue Geometrie, KEIN dispose — Objekt-Identität bleibt erhalten.
 * Vorbedingung: Die Geometrie muss mit getPoints(40) (= 41 Punkte) erstellt worden sein.
 */
function updateGeometryInPlace(mesh: THREE.Line, line: BrettLine): boolean {
  const from = getFigPos(line.fromId);
  const to = getFigPos(line.toId);
  if (!from || !to) return false;
  const mid = from.clone().lerp(to, 0.5).add(new THREE.Vector3(0, 0.25, 0));
  const curve = new THREE.CatmullRomCurve3([from, mid, to]);
  const points = curve.getPoints(40); // immer 41 Punkte
  const posAttr = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < points.length; i++) {
    posAttr.setXYZ(i, points[i].x, points[i].y, points[i].z);
  }
  posAttr.needsUpdate = true;
  if (line.lineType === 'tension') {
    mesh.computeLineDistances();
  }
  return true;
}
```

- [ ] **Step 4: `updateLinePositions` auf In-Place-Pfad umstellen**

In `brett/src/client/scene-lines.ts`, im letzten Block von `updateLinePositions` (ca. Z.124–130). Ersetze:

```typescript
  // Neu rendern der betroffenen Linien
  for (const line of STATE.lines) {
    if (affectedFigIds.has(line.fromId) || affectedFigIds.has(line.toId)) {
      renderLine(line);
    }
  }
```

Mit:

```typescript
  // In-Place-Update der betroffenen Linien (kein dispose/rebuild).
  // renderLine wird nur aufgerufen wenn die Linie noch nicht in lineObjects existiert
  // (sollte nicht vorkommen, aber als Fallback für Konsistenz).
  for (const line of STATE.lines) {
    if (affectedFigIds.has(line.fromId) || affectedFigIds.has(line.toId)) {
      const existing = lineObjects.get(line.id);
      if (existing) {
        updateGeometryInPlace(existing, line);
      } else {
        renderLine(line);
      }
    }
  }
```

- [ ] **Step 5: Test grün**

```bash
cd /tmp/wt-brett-perf/brett
npm test 2>&1 | grep -A3 'Bug 2'
```

Erwartetes Ergebnis:
```
✓ Bug 2 — Geometry-Identität: updateLinePositions darf THREE.Line-Referenz nicht ersetzen
```

- [ ] **Step 6: Vollständige Typprüfung**

```bash
cd /tmp/wt-brett-perf/brett
npx tsc --noEmit -p tsconfig.client.json
npx tsc --noEmit -p tsconfig.server.json
```

Erwartetes Ergebnis: Keine Fehler.

- [ ] **Step 7: Alle Tests grün — Gesamtlauf**

```bash
cd /tmp/wt-brett-perf/brett
npm test 2>&1 | tail -5
```

Erwartetes Ergebnis (ca.):
```
ℹ tests 509
ℹ pass 509
ℹ fail 0
```

- [ ] **Step 8: no-eager-three-Test explizit prüfen**

```bash
cd /tmp/wt-brett-perf/brett
npm test 2>&1 | grep -A3 'no static'
```

Erwartetes Ergebnis:
```
✓ main.ts has NO static import of three / scene / board-boot
✓ main.ts dynamic-imports board-boot (lazy mount)
```

- [ ] **Step 9: Commit**

```bash
cd /tmp/wt-brett-perf
git add brett/src/client/scene-lines.ts
git commit -m "perf(brett): in-place geometry update in updateLinePositions + getLineObjects test seam (T000662)"
```

---

### Task 4: Verifikation und Branch-Bereinigung

**Files:**
- Keine Änderungen — nur Verifikationsläufe

- [ ] **Step 1: Vollständiger Test-Lauf im Worktree**

```bash
cd /tmp/wt-brett-perf/brett
npm test 2>&1 | grep -E '(pass|fail|tests)'
```

Erwartetes Ergebnis:
```
ℹ tests 509
ℹ pass 509
ℹ fail 0
```

- [ ] **Step 2: Alle drei Performance-Tests explizit prüfen**

```bash
cd /tmp/wt-brett-perf/brett
npm test 2>&1 | grep -E '(Bug 1|Bug 2|Bug 3)'
```

Erwartetes Ergebnis:
```
✓ Bug 1 — Label-Cache: unveränderter Text führt beim zweiten Frame zu keinem Canvas-Redraw
✓ Bug 2 — Geometry-Identität: updateLinePositions darf THREE.Line-Referenz nicht ersetzen
✓ Bug 3 — Scratch-Vector: _floorClampScratch muss als modul-weiter Vector3 exportiert werden
```

- [ ] **Step 3: Beide TypeScript-Configs final**

```bash
cd /tmp/wt-brett-perf/brett
npx tsc --noEmit -p tsconfig.client.json && echo "client OK"
npx tsc --noEmit -p tsconfig.server.json && echo "server OK"
```

Erwartetes Ergebnis:
```
client OK
server OK
```

- [ ] **Step 4: Git-Log prüfen (3 Fix-Commits erwartet)**

```bash
cd /tmp/wt-brett-perf
git log --oneline -5
```

Erwartetes Ergebnis (letzten 3 Commits):
```
<hash> perf(brett): in-place geometry update in updateLinePositions + getLineObjects test seam (T000662)
<hash> perf(brett): cache label text in updatePossessorLabel to skip redundant canvas redraws (T000662)
<hash> perf(brett): reuse _floorClampScratch in tickSpring floor-clamp (T000662)
```

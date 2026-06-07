---
title: "Brett: Snapshot-/Export-UI PNG/JSON/PDF (Slice 3)"
ticket_id: T000466
domains: [website]
status: active
pr_number: null
---

# Design: Brett: Snapshot-/Export-UI PNG/JSON/PDF (Slice 3)

**Ticket:** T000466
**Branch (vorgesehen):** feature/brett-export-ui

---

## Überblick

### Feature-Beschreibung

Der Systembrett-Coach benötigt die Möglichkeit, den aktuellen Aufstellungs-Zustand zu exportieren — sowohl als visuellen Screenshot (PNG), als strukturierten Datenauszug (JSON) als auch als druckfähiges Dokument (PDF). Diese Export-Funktion wird als eigenständiges Modul `brett/src/client/ui/export.ts` umgesetzt und über HUD-Buttons im Topbar zugänglich gemacht.

### Coaching-Nutzen

Im systemischen Coaching ist die Dokumentation zentraler Bestandteil des Prozesses. Coaches und Klientinnen wollen:

1. **PNG**: Ein sofortiges visuelles Abbild der Aufstellung (z.B. für Protokolle, E-Mails, Follow-up-Unterlagen). Der Screenshot nutzt den WebGL-Canvas des Three.js-Renderers direkt (`renderer.domElement.toDataURL('image/png')`), erfasst also exakt die 3D-Ansicht inklusive aller Figuren, Pose, Kamera-Perspektive und Lichtstimmung.

2. **JSON**: Ein maschinenlesbarer Vollexport des `BoardState` — ermöglicht Wiederherstellung, Archivierung, externe Auswertung und spätere Re-Import-Funktionalität. Exportiert werden alle Felder aus `buildStateFromMutations()`: Figuren, Phase, Rollen, Schritte, optik, sessionCode usw.

3. **PDF**: Ein angereichtertes Dokument, das PNG-Screenshot + Metadaten (Datum, Session-Code, Figurenliste mit Labels) in einem druckbaren Layout kombiniert. Umsetzung via `jsPDF` (CDN-Import oder npm-Paket), das den Canvas direkt via `addImage()` einbettet.

---

## Architectural Decision

### Modul-Struktur

Das neue Modul `brett/src/client/ui/export.ts` folgt dem etablierten Muster der Brett-UI-Module:

- **Nur DOM-Zugriff innerhalb von Funktionskörpern** (niemals auf Top-Level), damit das Modul in headless/test-Umgebungen importierbar bleibt.
- **Dependency-Injection-Muster**: Die `SceneApi` (insbesondere `renderer`) wird nicht direkt aus `state.ts` importiert, sondern per `getScene()` bei Aufruf geholt. Das `BoardState` wird beim Export frisch gebaut — ebenfalls per Callback-Injection aus `board-boot.ts`.
- **Feature-Flag-Dark-Launch**: Alle Export-Buttons werden initial hinter `window.__brettFeatures['T000466']` verborgen. Die Flag-Prüfung erfolgt lazy bei Initialisierung, nicht beim Modulimport.

### jsPDF-Integration

`jsPDF` ist in den `devDependencies` nicht vorhanden. Es gibt zwei Optionen:

| Option | Pros | Cons |
|--------|------|------|
| A: CDN-Script-Tag in `index.html` | Kein Bundle-overhead, kein package.json-Change | Externe Abhängigkeit, offline-Test-Problematik |
| B: npm-Paket `jspdf` | Tree-shakeable, TypeScript-Typen, testbar | ~250 KB bundle-Overhead |

**Entscheidung: Option B (npm-Paket)**. `jspdf` wird als `devDependency` hinzugefügt. Das Paket wird dynamisch per `await import('jspdf')` geladen (Code-Splitting), sodass der Initial-Bundle nicht wächst. In Tests kann der Import gemockt werden.

### State-Access-Pattern

Der Export-Modul benötigt zur JSON-Erstellung den vollständigen `BoardState`. Da `buildStateFromMutations` serverseitig lebt und im Client nicht verfügbar ist, wird der JSON-Export direkt aus `STATE.figures` + websocket-seitigen Metadaten gebaut. Konkret wird `wsClient.getLastSnapshot()` erweitert (oder alternativ ein `exportState`-Singleton im Client gepflegt), das die letzte empfangene Server-Snapshot-Nachricht cacht.

**Alternativ**: Einfacher Ansatz — der Client hält ein `clientBoardCache`-Objekt, das bei jeder eingehenden WS-Nachricht (snapshot, add, move, update, delete, stiffness, phase-change etc.) aktualisiert wird. Dieses wird für den JSON-Export serialisiert. Dieser Ansatz ist robuster und erfordert keine Server-Änderungen.

**Gewählter Ansatz**: `export.ts` exportiert `updateExportCache(patch: Partial<ClientBoardSnapshot>)` — wird von `ws-client.ts` bei jeder relevanten Nachricht aufgerufen. `getExportSnapshot()` gibt den aktuellen Stand zurück.

---

## Data Model / Interface Changes

### Neue Typen in `export.ts`

```typescript
/** Der für den JSON-Export serialisierte Board-Zustand (client-seitig). */
export interface ClientBoardSnapshot {
  exportedAt: string;          // ISO-8601
  sessionCode: string | null;
  phase: string;
  stiffness: number;
  figures: ExportFigure[];
  optik: Record<string, unknown> | null;
}

export interface ExportFigure {
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

### Erweiterung `ws-client.ts`

Keine Breaking Changes. Nur: `updateExportCache` wird aus `export.ts` importiert und an den relevanten Dispatch-Stellen aufgerufen:

- Nach `'snapshot'` handler
- Nach `'add'`, `'move'`, `'update'`, `'delete'`
- Nach `'session_phase_change'`

### Keine Server-Änderungen

Der Export ist vollständig client-seitig. Keine neuen WS-Nachrichten, keine DB-Änderungen, keine API-Endpunkte.

---

## Implementation Strategy

### Server

Keine Server-Änderungen erforderlich.

### Client

#### Phase 1: Export-Cache in `ws-client.ts`

`updateExportCache(patch)` aus `export.ts` wird importiert und an den relevanten Handler-Stellen in `ws-client.ts` aufgerufen. Der Cache enthält alle für den Export notwendigen Daten.

#### Phase 2: `export.ts` — Kernfunktionen

```typescript
// Öffentliche API:
export function updateExportCache(patch: Partial<ClientBoardSnapshot>): void
export function getExportSnapshot(): ClientBoardSnapshot
export function exportPng(renderer: THREE.WebGLRenderer): void
export function exportJson(): void
export function exportPdf(renderer: THREE.WebGLRenderer): Promise<void>
export function initExportButtons(renderer: THREE.WebGLRenderer): void
```

**PNG-Export**:
```typescript
export function exportPng(renderer: THREE.WebGLRenderer): void {
  // Einmalig rendern um aktuellen Frame zu sichern
  // (renderer.domElement hat bereits den letzten Frame dank preserveDrawingBuffer)
  const dataUrl = renderer.domElement.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = `brett-${new Date().toISOString().slice(0,10)}.png`;
  a.click();
}
```

**Wichtig**: Three.js `WebGLRenderer` erstellt den Canvas standardmäßig mit `preserveDrawingBuffer: false`. Das bedeutet, der Canvas ist nach jedem `render()`-Aufruf geleert. `toDataURL()` liefert nur dann ein korrektes Bild, wenn es **innerhalb desselben Frames** nach dem letzten `renderer.render()` aufgerufen wird — oder wenn `preserveDrawingBuffer: true` gesetzt ist.

**Architektur-Entscheidung**: `scene.ts` erhält ein optionales `preserveDrawingBuffer`-Flag — oder besser: Wir setzen es generell auf `true` (nur bei PNG-Export ein Performance-Tradeoff, aber im Coaching-Kontext irrelevant) und ändern `initScene()` entsprechend. Alternativ: `triggerExportPng()` setzt ein `pendingPngExport`-Flag, das im Tick-Loop nach `renderer.render()` ausgewertet wird.

**Gewählte Lösung**: `preserveDrawingBuffer: true` in `initScene()`, da das Coaching-Brett kein Performance-Critical-Rendering macht (keine 60fps-Spiellogik).

**JSON-Export**:
```typescript
export function exportJson(): void {
  const snapshot = getExportSnapshot();
  const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `brett-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
```

**PDF-Export** (via dynamischer jsPDF-Import):
```typescript
export async function exportPdf(renderer: THREE.WebGLRenderer): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const snapshot = getExportSnapshot();
  const imgData = renderer.domElement.toDataURL('image/png');
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  // Bild: 250mm x 160mm zentriert
  doc.addImage(imgData, 'PNG', 20, 20, 250, 160);
  // Metadaten
  const y = 190;
  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.text(`Exportiert: ${snapshot.exportedAt}`, 20, y);
  if (snapshot.sessionCode) doc.text(`Session: ${snapshot.sessionCode}`, 100, y);
  doc.text(`Phase: ${snapshot.phase} · Figuren: ${snapshot.figures.length}`, 180, y);
  // Figurenliste
  doc.setFontSize(8);
  snapshot.figures.forEach((f, i) => {
    if (f.label) {
      doc.text(`${i + 1}. ${f.label}${f.figureType ? ` (${f.figureType})` : ''}`, 20, y + 8 + i * 6);
    }
  });
  doc.save(`brett-${new Date().toISOString().slice(0,10)}.pdf`);
}
```

#### Phase 3: HUD-Integration in `board-boot.ts`

`initExportButtons(renderer)` wird aus `board-boot.ts` aufgerufen, nachdem `initScene()` die Renderer-Instanz liefert. Die Buttons werden im Topbar (`#topbar`) als neue Button-Gruppe eingefügt.

```typescript
// In board-boot.ts, nach hud.initPersons():
import * as exportUi from './ui/export';
exportUi.initExportButtons(sceneApi.renderer);
```

#### Phase 4: HUD-Buttons in `index.html`

Neue Button-Gruppe im `#topbar`:
```html
<div class="group" id="export-group" style="display:none">
  <span class="sep"></span>
  <button id="btn-export-png" class="icon-btn" title="Als PNG exportieren">📷 PNG</button>
  <button id="btn-export-json" class="icon-btn" title="Als JSON exportieren">{ } JSON</button>
  <button id="btn-export-pdf" class="icon-btn" title="Als PDF exportieren">📄 PDF</button>
</div>
```

Die Gruppe ist initial `display:none` und wird von `initExportButtons()` per Feature-Flag sichtbar gemacht.

### Tests

`brett/test/export.test.ts` — Node.js built-in test runner (`node:test`), JSDOM-ähnliche Mock-Umgebung via tsx.

Testfälle:
1. **`updateExportCache` + `getExportSnapshot`**: Cache wird korrekt aktualisiert, Defaults sind sauber.
2. **`exportJson` im Offline-Modus**: Prüft, dass `Blob`/`URL.createObjectURL` aufgerufen werden (Mock-DOM).
3. **`exportPng` im Offline-Modus**: Prüft, dass `renderer.domElement.toDataURL` aufgerufen und ein `<a>`-Click ausgelöst wird.
4. **`exportPdf` im Offline-Modus**: Prüft, dass `jsPDF` importiert und `doc.save()` aufgerufen wird (gemockter jsPDF-Import).
5. **Figurenliste-Serialisierung**: Prüft dass `ExportFigure`-Felder korrekt aus `STATE.figures` extrahiert werden.

---

## Sicherheit & Datenschutz

- Alle Exports sind rein client-seitig. Keine Daten verlassen den Browser außer durch den Nutzer-initiierten Download.
- `sessionCode` und Teilnehmernamen sind im JSON/PDF enthalten — dieses ist beabsichtigt (Coaching-Dokumentation). Der Nutzer kontrolliert, wer die Datei erhält.
- `renderer.domElement.toDataURL()` ist nur auf Same-Origin-Canvases möglich (Three.js-Canvas ist immer Same-Origin).

---

## Offene Fragen / Risiken

| Risiko | Wahrscheinlichkeit | Mitigation |
|--------|-------------------|------------|
| `preserveDrawingBuffer: true` verlangsamt Rendering | Gering (Coaching, kein Spiel) | Akzeptiert |
| jsPDF-Bundle-Größe (~250 KB) | Mittel | Dynamischer Import (`await import`) |
| `toDataURL` bei leerem Canvas (kein Frame gerendert) | Gering | Export-Buttons erst sichtbar wenn Board gebootet |
| PDF-Layout bricht auf kleinen Figuren-Anzahlen | Gering | Figurenliste nur wenn `label` vorhanden |

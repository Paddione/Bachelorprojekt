# Brett Board-Export (PNG / PDF / JSON-Snapshot) — Design-Spec

**Ticket:** T000605  
**Branch:** feature/T000605-brett-export  
**Datum:** 2026-06-11  
**Autor:** dev-flow-plan (autonom)  
**Status:** staged

---

## Kontext & Ausgangslage

Das Brett (3D-Systembrett, `brett/`) hat bereits eine vollständige, aber hinter einem Feature-Flag verborgene Export-Implementierung (Ticket T000466) für PNG, JSON und PDF. Diese ist in `brett/src/client/ui/export.ts` + `import.ts` implementiert, getestet (`export.test.ts`, `import.test.ts`) und in das HUD-HTML eingebettet (`#export-group`, initial `display:none`).

**T000605 hat folgende Aufgabe:**
1. Das Feature-Flag `T000466` aktivieren (produktionsreif schalten)
2. Den Export-Snapshot um fehlende Board-Elemente vervollständigen (Lines, Anchors, Zones)
3. ExportFigure um fehlende serialisierbare Felder erweitern (boneOverrides, appearance, note, scale, preset)
4. JSON-Snapshot Import um Lines/Anchors/Zones erweitern (Roundtrip-Garantie)
5. jsPDF von devDependencies → dependencies promoten
6. Schema-Versionierung einführen (Migration auf alte Snapshots)
7. Tests für neue Felder + Roundtrip

---

## Ziel-Zustand (Was nach T000605 gilt)

- Export-Buttons (PNG / PDF / JSON) sind für alle eingeloggten Brett-Nutzer sichtbar (kein Feature-Flag mehr nötig)
- Ein exportierter JSON-Snapshot enthält den **vollständigen Board-Zustand**: Figuren (alle serialisierbaren Felder), Beziehungslinien, Boden-Anker, Zonen, Optik-Einstellungen
- Ein importierter JSON-Snapshot stellt diesen Zustand vollständig wieder her
- PDF enthält den Screenshot + Figurenliste + ggf. Linien-Tabelle
- jsPDF ist in `dependencies` (kein devDependencies)
- Der Export-Cache (`_cache` in `export.ts`) wird von `ws-client.ts` vollständig synchron gehalten

---

## Architektur-Entscheidungen

### A1: Feature-Flag abschalten vs. Config-driven

**Entscheidung:** Feature-Flag `T000466` wird **entfernt** (nicht nur auf `true` gesetzt). Der Export-Code ist seit T000466 stabil, getestet und ready. Ein permanentes Flag ist technische Schuld. Die `initExportButtons()`-Guard-Prüfung wird entfernt; Buttons sind immer sichtbar.

**Konsequenz:** `if (!feats['T000466']) return;` in `initExportButtons()` fällt weg. Der `__brettFeatures`-Mechanismus bleibt für andere Flags unverändert.

### A2: Snapshot-Schema-Version

**Entscheidung:** Wir fügen dem `ClientBoardSnapshot` ein `version: number`-Feld ein (aktuell: `1`). Alte Snapshots (ohne `version`) werden als `version: 0` behandelt und beim Import mit leeren Lines/Anchors/Zones vervollständigt. So bleibt die Abwärtskompatibilität gewahrt.

### A3: Lines im Snapshot

`STATE.lines` ist ein `BrettLine[]`-Array (definiert in `types/state.ts`), direkt als Plain-Data in `state.ts` gehalten. Es wird in `updateExportCache()` aufgenommen. Serialisiert werden: `id`, `fromId`, `toId`, `lineType`.

### A4: Anchors & Zones im Snapshot

`ground-objects.ts` hält `anchorMeshes: Map<string, THREE.Group>` und `zoneMeshes: Map<string, THREE.Group>`. Die Plain-Data liegt nicht als separates Array vor. 

**Entscheidung:** Wir fügen in `state.ts` zwei neue Arrays `STATE.anchors: Anchor[]` und `STATE.zones: Zone[]` ein. `ground-objects.ts` pflegt diese Arrays zusätzlich zu den Mesh-Maps (bei `applyAnchorAdded` → `STATE.anchors.push()`, bei `applyAnchorRemoved` → splice, ebenso für Zones). `initGroundObjectsFromSnapshot()` befüllt die Arrays aus dem WS-Snapshot. So entsteht kein Deep-Copy aus den Meshes.

### A5: ExportFigure-Erweiterung

Die aktuelle `ExportFigure` enthält nur: `id, label, x, z, facingY, color, figureType, ownerId`. Für einen vollständigen Roundtrip fehlen: `boneOverrides`, `appearance`, `note`, `scale`, `preset`.

**Entscheidung:** Wir erweitern `ExportFigure` um diese optionalen Felder. In `ws-client.ts` wird die `_toExportFig()`-Hilfsfunktion angepasst. Die Validierung in `import.ts` bleibt lenient (optionale Felder, keine Pflichtprüfung).

### A6: Import-UI

Das Import-Feature (JSON-Datei einlesen) ist in `import.ts` implementiert, aber kein UI-Einstiegspunkt ist in der HUD vorhanden. 

**Entscheidung:** Wir fügen einen `📂 Import`-Button in den `#export-group`-Container in `index.html` ein und verbinden ihn über einen versteckten `<input type="file">`. Das Import-Flow: File-Picker → `FileReader` → `validateSnapshot()` → `applyImportedSnapshot()`. Die Import-Funktion wird in `export.ts`'s `initExportButtons()` mitregistriert (da Symmetrie und gleiche DOM-Lebenszeit).

### A7: PDF-Erweiterung

Das PDF enthält aktuell Screenshot + Figurenliste. Nach T000605 ergänzen wir eine kleine Tabelle der Beziehungslinien (fromLabel → toLabel via lineType), falls Lines vorhanden sind. Die Tabelle entfällt wenn `snapshot.lines` leer.

### A8: jsPDF in dependencies

`jsPDF ^4.2.1` wird von devDependencies zu dependencies verschoben. Der dynamic `import('jspdf')` bleibt — Code-Splitting funktioniert unabhängig davon, ob das Paket in dev oder prod-dependencies liegt.

---

## Datenstruktur: ClientBoardSnapshot (neu)

```typescript
interface ClientBoardSnapshot {
  version: 1;                          // NEU — für Migration
  exportedAt: string;                  // ISO-8601
  sessionCode: string | null;
  phase: string;
  stiffness: number;
  figures: ExportFigure[];
  lines: ExportLine[];                 // NEU — war immer null
  anchors: Anchor[];                   // NEU
  zones: Zone[];                       // NEU
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
  // NEU:
  scale?: number;
  preset?: string;
  note?: string;
  boneOverrides?: Record<string, { x: number; z: number }>;
  appearance?: FigureAppearance;
}

interface ExportLine {
  id: string;
  fromId: string;
  toId: string;
  lineType: LineType;
}
```

---

## Betroffene Dateien

| Datei | Änderung |
|-------|----------|
| `brett/src/client/ui/export.ts` | Version-Feld, `lines/anchors/zones` im Snapshot, ExportFigure-Erweiterung, Feature-Flag entfernen, Import-Button registrieren |
| `brett/src/client/ui/import.ts` | validateSnapshot um lines/anchors/zones, applyImportedSnapshot um Lines-Restore + Anchor/Zone-Restore |
| `brett/src/client/state.ts` | `STATE.anchors: Anchor[]` + `STATE.zones: Zone[]` hinzufügen |
| `brett/src/client/ground-objects.ts` | STATE.anchors/zones pflegen |
| `brett/src/client/ws-client.ts` | `_toExportFig()` erweitern, `updateExportCache` mit lines/anchors/zones aufrufen |
| `brett/src/client/scene-lines.ts` | Bei `initLinesFromSnapshot` + `applyLineMessage` auch `updateExportCache` updaten |
| `brett/public/index.html` | Import-Button `📂 Import` + `<input type="file" id="input-import-json">` hinzufügen |
| `brett/package.json` | jsPDF von devDependencies → dependencies |
| `brett/test/export.test.ts` | Tests für version, lines, anchors, zones, ExportFigure-Felder |
| `brett/test/import.test.ts` | Tests für v0→v1-Migration, lines/anchors/zones round-trip |

---

## Playwright-Projekt-Gate

Keine neuen E2E-Tests geplant (die Unit-Tests in `brett/test/` decken das Export-Modul vollständig ab). Falls in einem späteren Step ein E2E-Test für den Export-Button ergänzt werden soll, ist das Playwright-Projekt `brett` zu wählen (lokaler k3d-Cluster, Prefix `SA-BRETT-*`).

---

## Scope-Grenzen (Out of Scope)

- Keine server-seitige Snapshot-Persistierung (bleibt als Datei-Download)
- Kein Cloud-Upload / kein Sharing-Link
- Kein Print-CSS oder druckbarer Ansicht-Modus
- Keine UI für Template-basiertes Import (Snapshots als Coaching-Templates — das ist T000xxx)
- Keine Änderungen an der Snapshot-REST-API (`/api/snapshots` — das ist ein separater Persistierungspfad)

---

## Akzeptanzkriterien

1. **PNG-Export:** Klick auf 📷 PNG → Browser-Download `brett-YYYY-MM-DD.png` mit dem aktuellen Board-Screenshot
2. **PDF-Export:** Klick auf 📄 PDF → Browser-Download `brett-YYYY-MM-DD.pdf` mit Screenshot + Figurenliste + Linientabelle
3. **JSON-Export:** Klick auf `{ } JSON` → Browser-Download `brett-YYYY-MM-DD.json`, enthält `version:1`, figures (alle Felder), lines, anchors, zones, optik
4. **JSON-Import:** Klick auf 📂 Import → File-Picker → valide Datei → Board wird wiederhergestellt inkl. Lines, Anchors, Zones; invalide Datei → Fehlermeldung in Konsole + kein State-Wechsel
5. **Roundtrip:** Export JSON → Import JSON → Board-Zustand ist identisch (alle Figuren, alle Lines, alle Anchors+Zones)
6. **Abwärtskompatibilität:** Alte Snapshots (ohne `version`-Feld, ohne `lines`/`anchors`/`zones`) können importiert werden (fehlende Felder werden als leere Arrays/null defaultet)
7. **Tests grün:** `npm test` in `brett/` ist grün, alle neuen Test-Cases passen

# Partial p1 — openspec-embed.mjs: tasks.d/ support + metadata

**Ticket:** T002453
**Rolle:** `openspec-embed`
**Ziel-Dateien:** `scripts/openspec-embed.mjs`
**Abhängigkeiten:** keine

## Ziel

buildChunks() und embedSlug() so erweitern, dass tasks.d/*.md als vierte Quelle indexiert wird,
vollständige Slot-Metadaten aus der Manifest-Tabelle parsed, und ein single-write-path etabliert wird.

## 1. buildChunks() erweitern

Nach dem bestehenden `if (files.tasks != null)` Block einen vierten Block einfügen:

```js
if (files.partials != null) {
  for (const [partialId, content] of Object.entries(files.partials)) {
    for (const c of chunkSections(content)) {
      out.push({ ...c, position: pos++, fileType: 'partial' });
    }
  }
}
```

Wichtig: `chunkSections` wird verwendet (nicht `chunkProposal`), weil Partials Markdown mit Section-Headern sind. Der Section-Title wird zum partial_id (z.B. "Partial p1 — Daemon Core").

## 2. embedSlug() um tasks.d/ ergänzen

In `embedSlug()`, NACH dem Lesen von proposal/tasks/spec, tasks.d/ Dateien lesen:

```js
// ---- NEW: tasks.d/ partials ----
const tasksDir = path.join(changeDir, 'tasks.d');
let partials = null;
if (existsSync(tasksDir)) {
  partials = {};
  const entries = readdirSync(tasksDir).filter(f => f.endsWith('.md')).sort();
  for (const entry of entries) {
    partials[entry.replace(/\.md$/, '')] = readFileSync(path.join(tasksDir, entry), 'utf8');
  }
}
files.partials = partials;
```

Importe ergänzen: `import { readdirSync } from 'node:fs';`

## 3. Manifest-Parser für Metadaten

Aus der Manifest-Tabelle in tasks.md die Spalten `id|file|role|target_files|depends_on` parsen.
Implementieren als neue exportierte Funktion `parsePartialManifest(tasksMd)`.

```js
export function parsePartialManifest(tasksMd) {
  const lines = tasksMd.split('\n');
  let inTable = false;
  const rows = [];
  for (const line of lines) {
    if (/^## Partials/.test(line)) { inTable = true; continue; }
    if (!inTable) continue;
    if (/^## /.test(line)) break;  // nächste Section
    if (/^\|/.test(line)) {
      const cells = line.split('|').slice(1, -1).map(c => c.trim());
      if (cells.length >= 4 && !cells[0].includes('---')) {
        rows.push({
          partialId: cells[0],
          targetFiles: cells[3] ? cells[3].split(',').map(s => s.trim()) : [],
          dependsOn: cells[4] ? cells[4].split(',').map(s => s.trim()).filter(s => s !== '—') : [],
        });
      }
    }
  }
  return rows;
}
```

## 4. Metadaten in Chunk-INSERT ergänzen

In `embedSlug()`, nach dem Parsen der Manifest-Tabelle, beim INSERT der partial-Chunks:

```js
// Nach buildChunks(), die Chunks durchgehen und metadata ergänzen
for (const c of chunks) {
  if (c.fileType === 'partial') {
    const manifest = partialManifest.find(m => m.partialId === c.sectionTitle);
    if (manifest) {
      c.metadata = {
        ...c.metadata,
        partial_id: manifest.partialId,
        role: cells[2],  // aus der Manifest-Zeile
        target_files: manifest.targetFiles,
        depends_on: manifest.dependsOn,
        token_estimate: approxTokens(c.text),
      };
    }
  }
}
```

## 5. Single Write Path: ACTIVE_STATUSES-Konstante

```js
export const ACTIVE_STATUSES = ['planning', 'plan_staged', 'active'];
```

Statusfilter in main() und im Backfill-Skript auf diese Konstante umstellen.

## Abnahmekriterien

1. buildChunks() liefert für einen Plan mit tasks.d genau einen Chunk je Partial, fileType='partial'
2. Für einen Plan OHNE tasks.d bleibt das Ergebnis unverändert (kein partial-Chunk)
3. depends_on einer leeren Zelle ist [], nicht ['—']
4. Chunk-Metadaten enthalten partial_id, role, target_files, depends_on, token_estimate

## Notizen

- `chunkSections` zerlegt Text nach Markdown-Überschriften — das ist korrekt für Partials, die eine klare Section-Struktur haben
- Die Manifest-Tabelle wird aus tasks.md geparst, nicht aus der Partial-Datei selbst (SSOT)

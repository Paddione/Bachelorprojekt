# Design: Plan-Partials als Factory-Slot-Einheit in pgvector embedden

**Ticket:** T002453
**Slug:** plan-partials-embedding
**Branch:** feature/plan-partials-embedding-T002453
**Target Spec:** openspec-embedding

## Problem

tasks.d/ wird NICHT indexiert. scripts/openspec-embed.mjs embedSlug() liest ausschließlich proposal.md, tasks.md und specs/<slug>.md — "tasks.d" kommt 0x in der Datei vor. 10 Pläne mit tasks.d/ sind vollständig unauffindbar. (BEFUND 1)

Die Chunk-Dimension ist zu klein (avg 647 Zeichen) für einen echten Partial (6.500-10.600 Token). Metadaten tragen keine Slot-Identität (partial_id, role, target_files, depends_on fehlen). (BEFUND 2+3)

Zwei Schreibpfade existieren: einer schreibt 39 active-Status-Dokumente, die nicht aus dem bekannten Backfill stammen können. (BEFUND 4)

## Lösung

### A) buildChunks() erhält tasks.d/*.md als vierte Quelle

Jede Partial-Datei wird als GANZES ein Chunk, `file_type: 'partial'`. Keine Section-Zerlegung — die Einheit ist der Slot.

```js
// In buildChunks(), nach den existing 3 sources:
if (files.partials) {
  for (const [partialId, content] of Object.entries(files.partials)) {
    out.push({
      position: pos++,
      text: content,
      fileType: 'partial',
      sectionTitle: partialId,  // e.g. 'p2-source-adapters'
      charOffset: 0,
    });
  }
}
```

### B) Manifest-Parser für metadata

partial_id, role, target_files, depends_on, token_estimate werden aus der Manifest-Tabelle in tasks.md geparst (Spalten `id|file|role|target_files|depends_on`), NICHT aus dem Partial selbst.

```js
function parsePartialManifest(tasksMd) {
  const table = extractTable(tasksMd, '## Partials');
  return table.map(row => ({
    partialId: row[0],
    file: row[1],
    role: row[2],
    targetFiles: row[3].split(',').map(s => s.trim()),
    dependsOn: row[4] ? row[4].split(',').map(s => s.trim()) : [],
  }));
}
```

Leere depends_on-Zelle → `[]`, nicht `['—']`.

### C) Größen-Gate in plan-lint

`plan-lint.sh` FAILT, wenn token_estimate eines Partials > 7000 Token. bge-m3 verarbeitet 8192 Token; 7000 ist die Schwelle mit Sicherheitsmarge.

```bash
# In plan-lint.sh, neuer Check nach dem existing partial-lint:
for partial in tasks.d/*.md; do
  tokens=$(estimate_tokens "$partial")
  if [ "$tokens" -gt 7000 ]; then
    echo "FAIL: $partial hat ~${tokens} Token (>7000). Slot zu gross." >&2
    exit 1
  fi
done
```

### D) Single Write Path

`openspec-embed.mjs` wird der einzige Schreibpfad. Der Statusfilter kommt in EINE exportierte Konstante `ACTIVE_STATUSES`, die Backfill-Task und Gate gemeinsam lesen.

```js
export const ACTIVE_STATUSES = ['planning', 'plan_staged', 'active'];
```

Neuer Check: `countIndexed() vs countLocal()` — Abweichung = Fehlermeldung.

### E) Zweiten Schreibpfad identifizieren und entfernen

TODO im Code: Logging beim INSERT ergänzen, um die Quelle jedes Dokuments zu markieren.

## Files to touch

| File | Change |
|------|--------|
| `scripts/openspec-embed.mjs` | buildChunks() + embedSlug(): tasks.d/ support, metadata, single write path |
| `scripts/plan-lint.sh` | Größen-Gate >7000 Token für Partials |
| `tests/` | Tests für buildChunks, Manifest-Parser, Größen-Gate |

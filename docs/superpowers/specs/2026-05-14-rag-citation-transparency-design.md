# RAG Citation Transparency — Design

**Date:** 2026-05-14  
**Status:** Draft  
**Scope:** Admin-Assistent erhält strukturierte Quellenangaben aus der Vektordatenbank

---

## Ziel

Der Admin-Assistent nutzt bereits RAG (`useBooks=true` → `queryNearest` → 4 Chunks in System-Prompt). Was fehlt ist Transparenz: der Coach sieht nicht welche Buchpassagen genutzt wurden. Dieses Design fügt strukturierte Zitationen hinzu — Inline-Nummern `[1]` im Text und eine aufklappbare Quellen-Box darunter.

---

## Architektur

Kein Architekturwechsel. Context-Injection bleibt der Mechanismus. Drei Schichten werden erweitert:

1. **`knowledge-db.ts`** — `queryNearest` liefert zusätzlich `bookTitle` und `slug` via JOIN auf `coaching.books`
2. **`llm.ts`** — System-Prompt-Ergänzung + strukturierte `sources`-Rückgabe statt `sourcesUsed: number`
3. **Frontend** — `AssistantMessage` rendert `[n]`-Badges, neue `SourcesBox`-Komponente

---

## Datenmodell

### Neuer Typ `AssistantSource` (in `types.ts`)

```ts
export interface AssistantSource {
  index: number;       // 1-basiert, korrespondiert mit [1] im Antworttext
  bookTitle: string;
  slug: string;        // für Link zu /admin/knowledge/books/[slug]
  page: number | null;
  excerpt: string;     // chunk.text, gekürzt auf max. 300 Zeichen
  chunkId: string;
}
```

`AssistantChatResult` erhält `sources?: AssistantSource[]` — `sourcesUsed?: number` entfällt.

Sources werden **nicht** in der DB persistiert. Sie kommen nur in der HTTP-Antwort zurück und sind nur für die aktuelle Sitzung sichtbar.

---

## Backend

### `knowledge-db.ts` — `queryNearest` erweitern

Aktuell gibt `queryNearest` `id`, `text`, `position`, `metadata` zurück. Neuer JOIN:

```sql
SELECT
  kc.id, kc.text, kc.position, kc.metadata,
  cb.title  AS book_title,
  kc2.name  AS collection_name   -- für slug-Ableitung
FROM knowledge.chunks kc
JOIN knowledge.collections kc2 ON kc2.id = kc.collection_id
LEFT JOIN coaching.books cb ON cb.knowledge_collection_id = kc.collection_id
WHERE kc.collection_id = ANY($1)
  AND kc.embedding <=> $2 < $3
ORDER BY kc.embedding <=> $2
LIMIT $4
```

Rückgabe-Typ erhält `bookTitle: string | null` und `collectionName: string`.

### `llm.ts` — System-Prompt + Rückgabe

System-Prompt-Ergänzung wenn Chunks vorhanden (ersetzt bisherige simple `<Quellenpassagen>`-Injektion):

```
Die folgenden Passagen stammen aus Fachbüchern des Coachs.
Prüfe zuerst ob eine der Passagen zur Frage relevant ist.
- Wenn ja: beantworte die Frage unter Nutzung der Passage(n) und zitiere inline mit [1], [2] etc.
- Wenn nein: antworte aus deinem Allgemeinwissen und schreibe einen Satz wie
  „Die verfügbaren Buchstellen passen hier nicht direkt — aus meinem Wissen:..."

Zitiere nur wenn du wirklich aus einer Passage schöpfst, nicht bei jeder Aussage.

<Quellenpassagen>
[1] "..."
[2] "..."
</Quellenpassagen>
```

Rückgabe:

```ts
const sources: AssistantSource[] = chunks.map((c, i) => ({
  index: i + 1,
  bookTitle: c.bookTitle ?? 'Unbekanntes Buch',
  slug: c.collectionName.startsWith('coaching-')
    ? c.collectionName.slice('coaching-'.length)
    : c.collectionName,
  page: (c.metadata?.page as number | null) ?? null,
  excerpt: c.text.slice(0, 300),
  chunkId: c.id,
}));

return { reply, sources };
```

### `api/assistant/chat.ts`

`sourcesUsed` aus Response entfernen, `sources` weitergeben:

```ts
return json({ message: stored, sources: result.sources ?? [] });
```

---

## Frontend

### `AssistantMessage.svelte` — Inline-Zitat-Rendering

Regex-Replace auf dem `content`-String vor der Anzeige:

```ts
function renderCitations(text: string): string {
  return text.replace(/\[(\d+)\]/g, (_, n) =>
    `<sup class="citation-badge">[${n}]</sup>`
  );
}
```

`sources` werden als Prop mitgegeben.

### Neue `SourcesBox.svelte`

Aufklappbares Panel (`<details>`/`<summary>`) direkt unter der Nachricht, nur wenn `sources.length > 0`:

```
▼ 2 Quellen verwendet
┌─────────────────────────────────────┐
│ [1] Systemische Therapie, S. 42     │
│ "Vertrauen entsteht durch konsisten-│
│  tes Handeln über Zeit..."          │
├─────────────────────────────────────┤
│ [2] Innere Anteile, S. 17           │
│ "Der innere Kritiker ist oft eine   │
│  internalisierte Stimme..."         │
└─────────────────────────────────────┘
```

Styling: konsistent mit dem bestehenden Admin-Assistent-Design (dunkles Theme, Brass-Akzente).

---

## Fehlerverhalten

- `queryNearest` schlägt fehl → `sources = []`, Antwort läuft ohne Buchkontext (wie bisher, kein Breaking Change)
- Claude zitiert `[5]` obwohl nur 4 Chunks kamen → SourcesBox rendert nur indices die in `sources` existieren; out-of-range Badges werden als plain text dargestellt
- `bookTitle` null (Chunk aus Collection ohne coaching.books Eintrag) → Fallback `'Unbekanntes Buch'`

---

## Was sich nicht ändert

- `useBooks` Flag bleibt — RAG ist opt-in per Admin-Anfrage
- Conversation History in DB bleibt unverändert (nur `role` + `content`)
- Portal-Assistent bleibt unberührt
- Embedding-Pipeline und `queryNearest`-Threshold (0.62) bleiben unverändert

---

## Betroffene Dateien

| Datei | Änderung |
|-------|----------|
| `website/src/lib/assistant/types.ts` | `AssistantSource` Typ, `AssistantChatResult` Update |
| `website/src/lib/knowledge-db.ts` | `queryNearest` JOIN + Rückgabe-Typ |
| `website/src/lib/assistant/llm.ts` | System-Prompt + `sources` Rückgabe |
| `website/src/pages/api/assistant/chat.ts` | `sources` in Response |
| `website/src/components/assistant/AssistantMessage.svelte` | Citation-Rendering + SourcesBox einbinden |
| `website/src/components/assistant/SourcesBox.svelte` | Neue Komponente |

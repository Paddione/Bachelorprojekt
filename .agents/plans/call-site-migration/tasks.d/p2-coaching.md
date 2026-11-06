# p2 — Coaching-Welle (Impl, 7 Sites / 5 Dateien)

## Ziel
Alle Produktions-Importe `scripts/coaching/* → components/website/src/lib/*`
auf `lib/ports` umstellen. Größte echte Prod-Welle, daher zuerst nach p1.

## Schritte (Datei für Datei, je ≤ 3 Sites)
1. `ingest-book.mts`: `chunking.ts` + `embeddings.ts` → `ports/content`
   (`chunkText`, `embedBatch`). Danach Skript-Smoke (Batch-Probe klein).
2. `batch-ingest-dir.mts`: beide dynamischen `await import(...)` auf
   `ports/content` umstellen (Pfad-String ersetzen, kein Logic-Touch).
3. `classify-book.mts`: `coaching-classifier.ts` + `coaching-db.ts` →
   `ports/content` (`classifyChunk`, `insertDraft`, Konstanten).
4. `ingest-json.mts`: `ingest-json-core.js` → `ports/content`.
5. `merge-books.mts`: `coaching-merge.ts` → `ports/content`.
6. Allowlist im Boundary-Test um genau diese 5 Dateien kürzen
   (Zeilen löschen, nicht auskommentieren) — Test MUSS weiter grün sein,
   sonst Rollback der Datei (Import doch direkt → Fail sichtbar).

## Gates (p2Done, pro Datei)
- `npm run typecheck` grün.
- Betroffene Tests: `batch-ingest-dir.test.mts`-Nachbar + `task test:changed` grün.
- Boundary-Test grün MIT gekürzter Allowlist (= Count sinkt nachweislich).
- `phase-events.log`: Zwischenstand Boundary-Tabelle (p0-Methode wiederholen).

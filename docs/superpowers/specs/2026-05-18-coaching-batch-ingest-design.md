# Coaching Batch-Ingest Pipeline — Design Spec

**Date:** 2026-05-18  
**Branch:** feature/coaching-batch-ingest  
**Status:** approved

## Kontext

Zwei Verzeichnisse mit Coaching-Ausbildungsunterlagen sollen in pgvector ingestiert werden:

- `ki/` — Coachingausbildung Co2 2023 (Block 1–5), 77 Dateien
- `ki2/` — Grundkurs LG29 2022–2023 (Block 1–6), 88 Dateien

**Problem:** 165 Dateien gesamt, aber nur 96 einzigartige Inhalte (69 Duplikate), davon 38 mit Nextcloud-Hash-Suffix (`_abcd1234ef...`). Zusätzlich enthalten die Verzeichnisse nicht-Coaching-Inhalte (Kontoauszug, Router-Manual), Bilder (JPG/PNG) und DOC/DOCX-Dateien, die `lib-extract.mjs` noch nicht unterstützt.

Das bestehende `ingest-book.mts` ist ein Single-File-Ingest — es gibt keinen Batch-Mechanismus, keine Dedup-Logik und keine interaktive Prüfung vor dem Ingest.

## Ziele

1. **Keine verschwendete Embedding-Kapazität** — jeder einzigartige Text-Inhalt wird genau einmal eingebettet
2. **DOC/DOCX-Support** — `lib-extract.mjs` wird um `.doc`/`.docx`-Extraktion erweitert
3. **Interaktive Review** — User bestätigt jeden Kandidaten vor dem Ingest, mit Text-Vorschau
4. **Dual-Collection-Ingest** — jede Datei landet in Block-Collection UND Kurs-Collection
5. **Idempotenz** — Re-Run ohne Doppelingest via SHA256-Hash

## Architektur

### 4-Phasen-Pipeline in `scripts/coaching/batch-ingest-dir.mts`

```
Verzeichnis-Input
    │
    ▼
Phase 1: Scan & Dedup
  - Rekursiv alle PDF, DOC, DOCX einlesen
  - SHA256 pro Datei
  - Duplikate eliminieren: bei Hashkollision bevorzuge clean name (ohne _[0-9a-f]{32})
  - Bilder (jpg/png/gif), MM-Dateien → übersprungen (geloggt)
    │
    ▼
Phase 2: Text-Extraktion
  - PDF → pdf-parse (bestehend, mit Seiten-Anchor)
  - DOC/DOCX → mammoth (neu, reines Node.js)
  - Leerer oder sehr kurzer Text (<100 Zeichen) → Warnung, User entscheidet
    │
    ▼
Phase 3: Interaktive Review (überspringbar via --yes oder --dry-run)
  - Pro Datei: Dateiname, Block, Kurs, erste ~300 Zeichen extrahierter Text
  - Prompt: y (ingestieren) | n (überspringen) | a (alle restlichen) | q (abbrechen)
  - --dry-run: zeigt alles, schreibt nichts in DB
    │
    ▼
Phase 4: Dual-Collection Ingest
  - Pro bestätigter Datei: upsertDocumentAndChunks in Block-Collection UND Kurs-Collection
  - Block-Collection: coaching-<kurs-slug>-block<N>  (z.B. coaching-co2-block1)
  - Kurs-Collection:  coaching-<kurs-slug>            (z.B. coaching-co2-2023)
  - Idempotenz: SHA256-Hash verhindert Doppel-Embedding bei Re-Run
```

### Metadaten-Ableitung aus Verzeichnisstruktur

| Verzeichnispfad | kurs-slug | block | Block-Collection | Kurs-Collection |
|----------------|-----------|-------|-----------------|-----------------|
| `ki/block1/…`  | `co2` | 1 | `coaching-co2-block1` | `coaching-co2-2023` |
| `ki/block2/…`  | `co2` | 2 | `coaching-co2-block2` | `coaching-co2-2023` |
| `ki2/block3/…` | `grundkurs-lg29` | 3 | `coaching-grundkurs-lg29-block3` | `coaching-grundkurs-lg29` |
| `ki/` (root)   | `co2` | – | — | `coaching-co2-2023` (nur Kurs-Collection) |

Dateien im Wurzelverzeichnis (kein `blockN`-Unterordner) werden nur in die Kurs-Collection ingestiert.

## Geänderte / neue Dateien

### 1. `scripts/coaching/lib-extract.mjs` (geändert)

```
extractText(filePath):
  .pdf  → bestehende extractPdf()
  .epub → bestehende extractEpub()
  .doc  → NEU: extractDoc() via mammoth
  .docx → NEU: extractDocx() via mammoth
  else  → Error: Unsupported extension
```

`mammoth` gibt direkt plain text zurück (`mammoth.extractRawText()`). `pageCount` = `null` für DOC-Dateien (mammoth hat kein Seitenkonzept).

### 2. `scripts/coaching/batch-ingest-dir.mts` (neu)

CLI-Interface:
```
Usage: batch-ingest-dir.mts <dir> <kurs-slug> [--dry-run] [--yes] [--classify]
  dir         Eingabeverzeichnis (ki/ oder ki2/)
  kurs-slug   z.B. co2-2023 oder grundkurs-lg29
  --dry-run   Keine DB-Schreiboperationen, zeigt Review-Vorschau
  --yes       Überspringt interaktive Review (alle ingestieren)
  --classify  Startet nach Ingest den Classifier (wie in ingest-book.mts)
```

Interne Struktur:
- `scanAndDedup(dir)` → `FileCandidate[]`
- `extractWithPreview(candidate)` → `{text, preview, pageCount, format}`
- `interactiveReview(candidates)` → `FileCandidate[]` (bestätigt)
- `ingestDual(candidate, pool, opts)` → ingestiert in Block + Kurs Collection

### 3. `Taskfile.yml` (geändert)

Neuer Task `coaching:batch-ingest`:
```yaml
coaching:batch-ingest:
  desc: Batch-ingest a directory of coaching PDFs/DOCs into pgvector
  cmds:
    - source scripts/env-resolve.sh "{{.ENV | default "mentolder"}}"
    - npx tsx scripts/coaching/batch-ingest-dir.mts {{.CLI_ARGS}}
```

### 4. `scripts/coaching/package.json` (geändert)

Neue Abhängigkeit: `mammoth` (für DOC/DOCX-Extraktion).

## Nicht im Scope

- Bilder (JPG/PNG) — kein OCR, werden übersprungen
- FreeMind Mind Maps (.mm) — werden übersprungen
- EPUB (bereits unterstützt, kein Handlungsbedarf)
- Web-UI für Review (Terminal-Prompt reicht für einmaligen Batch)
- Automatische Klassifizierung nach Ingest (über `--classify` Flag opt-in)

## Fehlerbehandlung

- Scan-PDF (kein extrahierbarer Text): Review zeigt Warnung, User kann n drücken
- 429 bei Voyage API: bestehender Retry-Mechanismus aus `ingest-book.mts` wird übernommen
- Datei nicht lesbar: in Review als FEHLER markiert, automatisch übersprungen
- `q` im Review: bereits ingestierte Dateien bleiben erhalten (partial run ist ok)

## Aufruf-Beispiel (post-implementation)

```bash
# Dry-run: was würde ingestiert werden?
task coaching:batch-ingest -- /mnt/c/Users/PatrickKorczewski/Downloads/ki co2-2023 --dry-run

# Interaktiver Ingest mit Review
task coaching:batch-ingest -- /mnt/c/Users/PatrickKorczewski/Downloads/ki co2-2023

# Alles ohne Review + direkt klassifizieren
task coaching:batch-ingest -- /mnt/c/Users/PatrickKorczewski/Downloads/ki2 grundkurs-lg29 --yes --classify
```

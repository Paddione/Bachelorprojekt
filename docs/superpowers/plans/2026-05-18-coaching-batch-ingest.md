---
ticket_id: T000473
title: Coaching Batch-Ingest Pipeline Implementation Plan
domains: []
status: active
pr_number: null
---

# Coaching Batch-Ingest Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Batch-ingest-Skript für Coaching-PDF/DOC-Verzeichnisse mit Dedup, interaktiver Review und Dual-Collection-Ingest in pgvector.

**Architecture:** Vier-Phasen-Pipeline in `scripts/coaching/batch-ingest-dir.mts`: Scan+Dedup via SHA256 → Text-Extraktion (PDF+DOC/DOCX) → interaktive Terminal-Review → upsertDocumentAndChunks in Block- und Kurs-Collection. Jede Phase ist eine pure oder fast-pure Funktion, die unabhängig testbar ist.

**Tech Stack:** Node.js (tsx/ESM), `mammoth` (DOC/DOCX), `pdf-parse` (bestehend), `node:readline/promises` (interaktive Review), `pg` (pgvector via bestehende lib-knowledge-pg.mjs).

---

## File Map

| Datei | Aktion | Verantwortung |
|-------|--------|---------------|
| `scripts/coaching/package.json` | Ändern | mammoth als Dependency |
| `scripts/coaching/lib-extract.mjs` | Ändern | DOC/DOCX-Extraktion via mammoth |
| `scripts/coaching/lib-extract.test.mjs` | Ändern | Test-Fix für .docx + neuer DOC-Test |
| `scripts/coaching/batch-ingest-dir.mts` | Neu | Hauptskript: Scan, Dedup, Review, Ingest |
| `scripts/coaching/batch-ingest-dir.test.mts` | Neu | Unit-Tests für scanAndDedup, deriveMetadata |
| `Taskfile.yml` | Ändern | `coaching:batch-ingest` Task |

---

## Task 1: mammoth-Dependency hinzufügen

**Files:**
- Modify: `scripts/coaching/package.json`

- [ ] **Schritt 1: mammoth in package.json eintragen**

Datei `scripts/coaching/package.json` — `dependencies`-Block:

```json
{
  "name": "bachelorprojekt-coaching-scripts",
  "private": true,
  "type": "module",
  "description": "Coaching ingest pipeline scripts. node_modules is symlinked to ../../website/node_modules to avoid duplicate installs.",
  "dependencies": {
    "epub2": "3.0.2",
    "mammoth": "^1.8.0",
    "pdf-parse": "^2.4.5"
  }
}
```

- [ ] **Schritt 2: installieren**

```bash
cd scripts/coaching && npm install
```

Erwartete Ausgabe: `added N packages` (ohne Fehler).

- [ ] **Schritt 3: Commit**

```bash
git add scripts/coaching/package.json scripts/coaching/package-lock.json
git commit -m "chore(coaching): add mammoth for DOC/DOCX extraction"
```

---

## Task 2: DOC/DOCX-Extraktion in lib-extract.mjs

**Files:**
- Modify: `scripts/coaching/lib-extract.mjs`
- Modify: `scripts/coaching/lib-extract.test.mjs`

- [ ] **Schritt 1: Bestehenden Test reparieren (er testet mit .docx — bricht nach Änderung)**

`scripts/coaching/lib-extract.test.mjs` — ersten Test anpassen (`.docx` → `.xyz`):

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractText } from './lib-extract.mjs';

test('extractText rejects unknown extension', async () => {
  await assert.rejects(
    () => extractText('/tmp/nope.xyz'),
    /Unsupported extension/,
  );
});

test('extractText reads a tiny PDF', async () => {
  const fixture = process.env.PDF_FIXTURE ?? new URL('./fixtures/sample.pdf', import.meta.url).pathname;
  try {
    const { text, pageCount } = await extractText(fixture);
    assert.ok(text.length > 0, 'should return non-empty text');
    assert.ok(pageCount >= 1, 'should report page count');
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.warn('skipping PDF fixture test — sample.pdf not present');
      return;
    }
    throw err;
  }
});

test('extractText reads a DOCX file', async () => {
  const fixture = process.env.DOCX_FIXTURE ?? new URL('./fixtures/sample.docx', import.meta.url).pathname;
  try {
    const { text, pageCount, format } = await extractText(fixture);
    assert.ok(text.length > 0, 'should return non-empty text');
    assert.strictEqual(pageCount, null, 'DOC pageCount should be null');
    assert.strictEqual(format, 'docx');
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.warn('skipping DOCX fixture test — sample.docx not present');
      return;
    }
    throw err;
  }
});
```

- [ ] **Schritt 2: Test laufen lassen — erwartet: 1 PASS, 1 PASS/SKIP, 1 FAIL (DOCX not yet implemented)**

```bash
cd scripts/coaching && node --test lib-extract.test.mjs
```

Erwartete Ausgabe: `extractText rejects unknown extension` PASS, `extractText reads a DOCX file` FAIL mit `Unsupported extension`.

- [ ] **Schritt 3: extractDoc in lib-extract.mjs implementieren**

`scripts/coaching/lib-extract.mjs` — vollständige neue Version:

```js
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import EPub from 'epub2';
import mammoth from 'mammoth';

export async function extractText(filePath) {
  const ext = extname(filePath).toLowerCase();
  if (ext === '.pdf')  return extractPdf(filePath);
  if (ext === '.epub') return extractEpub(filePath);
  if (ext === '.docx') return extractDoc(filePath, 'docx');
  if (ext === '.doc')  return extractDoc(filePath, 'doc');
  throw new Error(`Unsupported extension: ${ext}`);
}

async function extractPdf(filePath) {
  const buf = await readFile(filePath);
  const pageMap = [];
  let cursor = 0;
  const data = await pdfParse(buf, {
    pagerender: (pageData) => pageData.getTextContent().then((tc) => {
      const pageText = tc.items.map((it) => it.str).join(' ');
      pageMap.push({ page: pageData.pageNumber, charStart: cursor });
      cursor += pageText.length + 1;
      return pageText;
    }),
  });
  return { text: data.text, pageCount: data.numpages, pageMap, format: 'pdf' };
}

async function extractEpub(filePath) {
  const epub = await EPub.createAsync(filePath);
  const chapters = [];
  for (const item of epub.flow) {
    const html = await new Promise((res, rej) =>
      epub.getChapter(item.id, (err, txt) => (err ? rej(err) : res(txt))),
    );
    const text = stripHtml(html);
    if (text.trim()) chapters.push(text);
  }
  return { text: chapters.join('\n\n'), pageCount: chapters.length, pageMap: null, format: 'epub' };
}

async function extractDoc(filePath, format) {
  const result = await mammoth.extractRawText({ path: filePath });
  if (result.messages.length > 0) {
    for (const msg of result.messages) {
      if (msg.type === 'warning') console.warn(`[extract] ${format} warning in ${filePath}: ${msg.message}`);
    }
  }
  return { text: result.value, pageCount: null, pageMap: null, format };
}

function stripHtml(html) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}
```

- [ ] **Schritt 4: Tests laufen lassen — alle PASS (DOCX-Test SKIP wenn kein Fixture)**

```bash
cd scripts/coaching && node --test lib-extract.test.mjs
```

Erwartete Ausgabe: alle Tests PASS oder SKIP.

- [ ] **Schritt 5: Commit**

```bash
git add scripts/coaching/lib-extract.mjs scripts/coaching/lib-extract.test.mjs
git commit -m "feat(coaching): add DOC/DOCX extraction via mammoth"
```

---

## Task 3: scanAndDedup + deriveMetadata mit Tests

**Files:**
- Create: `scripts/coaching/batch-ingest-dir.mts`
- Create: `scripts/coaching/batch-ingest-dir.test.mts`

- [ ] **Schritt 1: Tests schreiben (failing)**

`scripts/coaching/batch-ingest-dir.test.mts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { scanAndDedup, deriveMetadata } from './batch-ingest-dir.mts';

// ── deriveMetadata ────────────────────────────────────────────────────────────

test('deriveMetadata: file in blockN subdir', () => {
  const m = deriveMetadata('/input/ki/block3/some-file.pdf', '/input/ki', 'co2-2023');
  assert.strictEqual(m.blockSlug, 'block3');
  assert.strictEqual(m.blockCollection, 'coaching-co2-2023-block3');
  assert.strictEqual(m.courseCollection, 'coaching-co2-2023');
});

test('deriveMetadata: file in root dir (no block)', () => {
  const m = deriveMetadata('/input/ki/overview.pdf', '/input/ki', 'co2-2023');
  assert.strictEqual(m.blockSlug, null);
  assert.strictEqual(m.blockCollection, null);
  assert.strictEqual(m.courseCollection, 'coaching-co2-2023');
});

test('deriveMetadata: nested deeper than block', () => {
  const m = deriveMetadata('/input/ki2/block1/sub/file.pdf', '/input/ki2', 'grundkurs-lg29');
  assert.strictEqual(m.blockSlug, 'block1');
  assert.strictEqual(m.blockCollection, 'coaching-grundkurs-lg29-block1');
});

// ── scanAndDedup ──────────────────────────────────────────────────────────────

test('scanAndDedup: deduplicates identical content, prefers clean name', async () => {
  const dir = join(tmpdir(), `dedup-test-${Date.now()}`);
  await mkdir(dir);
  try {
    await writeFile(join(dir, 'clean.pdf'), 'same content');
    await writeFile(join(dir, 'clean_abcdef1234567890abcdef1234567890.pdf'), 'same content');
    await writeFile(join(dir, 'unique.pdf'), 'different content');

    const results = await scanAndDedup(dir);
    assert.strictEqual(results.length, 2, 'should have 2 unique files');
    const names = results.map((r) => r.filename);
    assert.ok(names.includes('clean.pdf'), 'should keep clean name');
    assert.ok(!names.includes('clean_abcdef1234567890abcdef1234567890.pdf'), 'should drop hash-suffix duplicate');
    assert.ok(names.includes('unique.pdf'), 'should keep unique file');
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('scanAndDedup: skips images and .mm files', async () => {
  const dir = join(tmpdir(), `skip-test-${Date.now()}`);
  await mkdir(dir);
  try {
    await writeFile(join(dir, 'photo.jpg'), 'image data');
    await writeFile(join(dir, 'map.mm'), '<map></map>');
    await writeFile(join(dir, 'doc.pdf'), 'pdf content');

    const results = await scanAndDedup(dir);
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].filename, 'doc.pdf');
  } finally {
    await rm(dir, { recursive: true });
  }
});
```

- [ ] **Schritt 2: Tests laufen lassen — erwartet: FAIL (Modul nicht gefunden)**

```bash
cd scripts/coaching && node --test batch-ingest-dir.test.mts
```

Erwartete Ausgabe: Import-Fehler, da `batch-ingest-dir.mts` noch nicht existiert.

- [ ] **Schritt 3: scanAndDedup + deriveMetadata implementieren (Datei-Skeleton)**

`scripts/coaching/batch-ingest-dir.mts` — nur die zwei exportierten Funktionen, kein main():

```ts
import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, relative, extname, basename, dirname } from 'node:path';

const SUPPORTED_EXTS = new Set(['.pdf', '.doc', '.docx', '.epub']);
const HASH_SUFFIX_RE = /_[0-9a-f]{32}(\.[^.]+)$/i;

export interface FileCandidate {
  filePath: string;
  filename: string;
  sha256: string;
  relPath: string;        // relative to input dir
  blockSlug: string | null;
  blockCollection: string | null;
  courseCollection: string;
  preview: string | null; // first 300 chars of extracted text, set in main()
}

export interface FileMetadata {
  blockSlug: string | null;
  blockCollection: string | null;
  courseCollection: string;
}

export function deriveMetadata(filePath: string, inputDir: string, courseSlug: string): FileMetadata {
  const rel = relative(inputDir, filePath);
  const parts = rel.split('/');
  // parts[0] is either a blockN folder or a filename (if in root)
  const blockMatch = parts.length > 1 ? parts[0].match(/^block(\d+)$/i) : null;
  const blockSlug = blockMatch ? parts[0].toLowerCase() : null;
  const courseCollection = `coaching-${courseSlug}`;
  const blockCollection = blockSlug ? `${courseCollection}-${blockSlug}` : null;
  return { blockSlug, blockCollection, courseCollection };
}

export async function scanAndDedup(dir: string): Promise<Omit<FileCandidate, 'blockSlug' | 'blockCollection' | 'courseCollection'>[]> {
  const allFiles = await collectFiles(dir);
  const supported = allFiles.filter((f) => SUPPORTED_EXTS.has(extname(f).toLowerCase()));

  // Hash all files
  const hashed = await Promise.all(supported.map(async (f) => {
    const buf = await readFile(f);
    const hash = createHash('sha256').update(buf).digest('hex');
    return { filePath: f, filename: basename(f), sha256: hash };
  }));

  // Dedup: per hash, prefer clean name (no _<32hex> suffix)
  const byHash = new Map<string, typeof hashed[0]>();
  for (const entry of hashed) {
    const existing = byHash.get(entry.sha256);
    if (!existing) {
      byHash.set(entry.sha256, entry);
    } else {
      const currentIsClean = !HASH_SUFFIX_RE.test(existing.filename);
      const newIsClean = !HASH_SUFFIX_RE.test(entry.filename);
      if (newIsClean && !currentIsClean) byHash.set(entry.sha256, entry);
    }
  }

  return Array.from(byHash.values());
}

async function collectFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const results: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...await collectFiles(full));
    } else if (entry.isFile()) {
      results.push(full);
    }
  }
  return results;
}
```

- [ ] **Schritt 4: Tests laufen lassen — alle PASS**

```bash
cd scripts/coaching && node --test batch-ingest-dir.test.mts
```

Erwartete Ausgabe: 5 Tests PASS.

- [ ] **Schritt 5: Commit**

```bash
git add scripts/coaching/batch-ingest-dir.mts scripts/coaching/batch-ingest-dir.test.mts
git commit -m "feat(coaching): scanAndDedup + deriveMetadata with tests"
```

---

## Task 4: Interaktive Review + Vollständiges CLI

**Files:**
- Modify: `scripts/coaching/batch-ingest-dir.mts` (main() + interactiveReview() hinzufügen)

- [ ] **Schritt 1: interactiveReview() + main() an batch-ingest-dir.mts anhängen**

Füge am Ende von `scripts/coaching/batch-ingest-dir.mts` hinzu (nach den bestehenden exports):

```ts
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { extractText } from './lib-extract.mjs';
import {
  makePool, sha256, ensureCollection, upsertDocumentAndChunks, bumpCollectionStats,
} from '../knowledge/lib-knowledge-pg.mjs';
import { chunkText } from '../../website/src/lib/chunking.ts';
import { embedBatch } from '../../website/src/lib/embeddings.ts';

interface CliFlags {
  dryRun: boolean;
  yes: boolean;
  classify: boolean;
  courseSlug: string;
  inputDir: string;
}

async function interactiveReview(candidates: FileCandidate[]): Promise<FileCandidate[]> {
  const rl = createInterface({ input, output });
  const confirmed: FileCandidate[] = [];
  let acceptAll = false;

  for (const c of candidates) {
    if (acceptAll) { confirmed.push(c); continue; }

    console.log('\n─────────────────────────────────────────');
    console.log(`📄 ${c.relPath}`);
    console.log(`   Block: ${c.blockSlug ?? '(root)'} · Collection: ${c.blockCollection ?? c.courseCollection}`);
    console.log(`   Preview: ${c.preview ?? '(no text extracted)'}`);
    console.log('─────────────────────────────────────────');

    let answer = '';
    while (!['y','n','a','q'].includes(answer)) {
      answer = (await rl.question('  Ingestieren? [y]es / [n]o / [a]ll / [q]uit: ')).trim().toLowerCase();
    }

    if (answer === 'q') { rl.close(); return confirmed; }
    if (answer === 'a') { acceptAll = true; confirmed.push(c); continue; }
    if (answer === 'y') confirmed.push(c);
  }

  rl.close();
  return confirmed;
}

async function ingestDual(
  pool: ReturnType<typeof makePool>,
  candidate: FileCandidate,
  text: string,
  pageCount: number | null,
  format: string,
  opts: { dryRun: boolean },
): Promise<void> {
  const textHash = sha256(text);
  const chunks = chunkText(text, { mode: 'plain', targetTokens: 600, overlapTokens: 80 });

  if (opts.dryRun) {
    console.log(`  [dry-run] would embed ${chunks.length} chunks into:`);
    if (candidate.blockCollection) console.log(`    - ${candidate.blockCollection}`);
    console.log(`    - ${candidate.courseCollection}`);
    return;
  }

  const { embeddings, tokens } = await embedBatch(
    chunks.map((c) => c.text),
    { model: process.env.LLM_ENABLED === 'true' ? 'bge-m3' : 'voyage-multilingual-2', purpose: 'index' },
  );
  console.log(`  embedded ${chunks.length} chunks (${tokens} tokens)`);

  const chunksWithEmbeddings = chunks.map((c, i) => ({
    position: c.position,
    text: c.text,
    embedding: embeddings[i],
    metadata: pageCount && pageCount > 0
      ? { page: Math.min(Math.floor((i * pageCount) / chunks.length) + 1, pageCount) }
      : {},
  }));

  const collectionsToIngest: string[] = [];
  if (candidate.blockCollection) collectionsToIngest.push(candidate.blockCollection);
  collectionsToIngest.push(candidate.courseCollection);

  for (const collName of collectionsToIngest) {
    const collectionId = await ensureCollection(pool, {
      name: collName, source: 'custom', brand: 'mentolder', description: collName,
    });
    await upsertDocumentAndChunks(pool, {
      collectionId,
      title: candidate.filename,
      sourceUri: `file://${candidate.filename}`,
      rawText: text,
      hash: textHash,
      metadata: { format, pageCount },
      chunks: chunksWithEmbeddings,
    });
    await bumpCollectionStats(pool, collectionId);
    console.log(`  ✓ ${collName}`);
  }
}

function parseArgs(): CliFlags {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error('Usage: batch-ingest-dir.mts <dir> <kurs-slug> [--dry-run] [--yes] [--classify]');
    process.exit(2);
  }
  return {
    inputDir: args[0],
    courseSlug: args[1],
    dryRun: args.includes('--dry-run'),
    yes: args.includes('--yes'),
    classify: args.includes('--classify'),
  };
}

async function main() {
  const flags = parseArgs();
  console.log(`[batch-ingest] scanning ${flags.inputDir}…`);

  const rawCandidates = await scanAndDedup(flags.inputDir);
  console.log(`[batch-ingest] ${rawCandidates.length} unique files after dedup`);

  // Attach metadata + extract text for preview
  const candidates: FileCandidate[] = await Promise.all(
    rawCandidates.map(async (c) => {
      const meta = deriveMetadata(c.filePath, flags.inputDir, flags.courseSlug);
      let preview: string | null = null;
      try {
        const { text } = await extractText(c.filePath);
        preview = text.slice(0, 300).replace(/\s+/g, ' ').trim();
      } catch {
        preview = null;
      }
      return {
        ...c,
        relPath: relative(flags.inputDir, c.filePath),
        ...meta,
        preview,
      };
    }),
  );

  const toIngest = flags.yes ? candidates : await interactiveReview(candidates);
  console.log(`\n[batch-ingest] ${toIngest.length} files confirmed for ingest`);

  if (flags.dryRun) {
    console.log('[batch-ingest] --dry-run: no DB writes');
    for (const c of toIngest) {
      const { text, pageCount, format } = await extractText(c.filePath);
      await ingestDual(null as any, c, text, pageCount ?? null, format, { dryRun: true });
    }
    return;
  }

  const pool = makePool();
  try {
    let i = 0;
    for (const c of toIngest) {
      i++;
      console.log(`\n[${i}/${toIngest.length}] ${c.relPath}`);
      try {
        const { text, pageCount, format } = await extractText(c.filePath);
        if (text.trim().length < 100) {
          console.warn(`  ⚠ very short text (${text.trim().length} chars) — possible scan-only PDF, skipping`);
          continue;
        }
        await ingestDual(pool, c, text, pageCount ?? null, format, { dryRun: false });
      } catch (err) {
        console.error(`  ✗ failed: ${err instanceof Error ? err.message : err}`);
      }
    }
  } finally {
    await pool.end();
  }

  if (flags.classify) {
    console.log('\n[batch-ingest] running classifier (--classify)…');
    const { spawn } = await import('node:child_process');
    const child = spawn('npx', ['tsx', new URL('./classify-book.mts', import.meta.url).pathname, `--slug=${flags.courseSlug}`], { stdio: 'inherit' });
    const code: number = await new Promise((r) => child.on('exit', (c) => r(c ?? 1)));
    if (code !== 0) { console.error(`classifier exited ${code}`); process.exit(code); }
  }

  console.log('\n[batch-ingest] done.');
}

main().catch((err) => { console.error(err); process.exit(1); });
```

- [ ] **Schritt 2: Smoke-Test mit --dry-run**

```bash
cd scripts/coaching && npx tsx batch-ingest-dir.mts \
  /mnt/c/Users/PatrickKorczewski/Downloads/ki co2-2023 --dry-run --yes 2>&1 | head -40
```

Erwartete Ausgabe: Scan-Ausgabe mit ~77 Dateien, dedup auf ~50, dann `[dry-run] would embed N chunks into: coaching-co2-2023-block1` etc. — **kein** DB-Zugriff, kein Fehler.

- [ ] **Schritt 3: Unit-Tests laufen lassen (scanAndDedup + deriveMetadata müssen weiterhin PASS)**

```bash
cd scripts/coaching && node --test batch-ingest-dir.test.mts
```

Erwartete Ausgabe: alle 5 Tests PASS.

- [ ] **Schritt 4: Commit**

```bash
git add scripts/coaching/batch-ingest-dir.mts
git commit -m "feat(coaching): add interactive review + full CLI to batch-ingest-dir"
```

---

## Task 5: Taskfile-Task hinzufügen

**Files:**
- Modify: `Taskfile.yml`

- [ ] **Schritt 1: Bestehenden `coaching:ingest`-Task finden**

```bash
grep -n "coaching:ingest" Taskfile.yml | head -5
```

Notiere die Zeilennummer des Tasks.

- [ ] **Schritt 2: `coaching:batch-ingest`-Task einfügen (direkt nach `coaching:ingest`)**

Den folgenden Block nach dem `coaching:ingest`-Task einfügen:

```yaml
  coaching:batch-ingest:
    desc: "Batch-ingest a directory of coaching PDFs/DOCs — Usage: task coaching:batch-ingest -- <dir> <kurs-slug> [--dry-run] [--yes] [--classify]"
    cmds:
      - source scripts/env-resolve.sh "{{.ENV | default "mentolder"}}"
      - cd scripts/coaching && npx tsx batch-ingest-dir.mts {{.CLI_ARGS}}
```

- [ ] **Schritt 3: Task-Listing prüfen**

```bash
task --list | grep coaching
```

Erwartete Ausgabe: `coaching:batch-ingest` erscheint in der Liste.

- [ ] **Schritt 4: Dry-run via task**

```bash
task coaching:batch-ingest -- /mnt/c/Users/PatrickKorczewski/Downloads/ki co2-2023 --dry-run --yes 2>&1 | tail -20
```

Erwartete Ausgabe: `[batch-ingest] done.` ohne Fehler.

- [ ] **Schritt 5: Commit**

```bash
git add Taskfile.yml
git commit -m "feat(coaching): add coaching:batch-ingest Taskfile task"
```

---

## Task 6: PR erstellen

- [ ] **Schritt 1: Alle Tests laufen lassen**

```bash
cd scripts/coaching && node --test lib-extract.test.mjs batch-ingest-dir.test.mts
```

Erwartete Ausgabe: alle Tests PASS oder SKIP.

- [ ] **Schritt 2: Push**

```bash
git push -u origin feature/coaching-batch-ingest
```

- [ ] **Schritt 3: PR erstellen**

```bash
gh pr create \
  --title "feat(coaching): batch-ingest pipeline with dedup, DOC support, interactive review" \
  --body "$(cat <<'EOF'
## Summary
- Adds `scripts/coaching/batch-ingest-dir.mts`: 4-phase pipeline (scan+dedup → extract → interactive review → dual-collection ingest)
- Extends `lib-extract.mjs` with DOC/DOCX support via mammoth
- 96 unique files from ki/ and ki2/ ingestible in one run; 69 content-duplicates eliminated via SHA256
- Dual-collection ingest: each file goes into block-level collection AND course-level collection
- `--dry-run` mode for safe preview; `--yes` to skip interactive review

## Test plan
- [ ] `node --test lib-extract.test.mjs` — all pass
- [ ] `node --test batch-ingest-dir.test.mts` — all pass
- [ ] `task coaching:batch-ingest -- <ki-dir> co2-2023 --dry-run --yes` — no errors, shows chunk counts
EOF
)"
```

- [ ] **Schritt 4: PR mergen (nach CI grün)**

```bash
gh pr merge --squash --auto
```

---

## Aufruf nach Merge

```bash
# ki/ (Co2 2023) ingestieren
task coaching:batch-ingest -- /mnt/c/Users/PatrickKorczewski/Downloads/ki co2-2023

# ki2/ (Grundkurs LG29) ingestieren
task coaching:batch-ingest -- /mnt/c/Users/PatrickKorczewski/Downloads/ki2 grundkurs-lg29

# Beide mit Auto-Klassifizierung (ohne Review)
task coaching:batch-ingest -- /mnt/c/Users/PatrickKorczewski/Downloads/ki co2-2023 --yes --classify
task coaching:batch-ingest -- /mnt/c/Users/PatrickKorczewski/Downloads/ki2 grundkurs-lg29 --yes --classify
```

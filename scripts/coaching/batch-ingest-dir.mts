import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join, relative, extname, basename } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const SUPPORTED_EXTS = new Set(['.pdf', '.doc', '.docx', '.epub']);
const HASH_SUFFIX_RE = /_[0-9a-f]{32}(\.[^.]+)$/i;

export interface FileCandidate {
  filePath: string;
  filename: string;
  sha256: string;
  relPath: string;
  blockSlug: string | null;
  blockCollection: string | null;
  courseCollection: string;
  preview: string | null;
}

export interface FileMetadata {
  blockSlug: string | null;
  blockCollection: string | null;
  courseCollection: string;
}

export function deriveMetadata(filePath: string, inputDir: string, courseSlug: string): FileMetadata {
  const rel = relative(inputDir, filePath);
  const parts = rel.split('/');
  const blockMatch = parts.length > 1 ? parts[0].match(/^block(\d+)$/i) : null;
  const blockSlug = blockMatch ? parts[0].toLowerCase() : null;
  const courseCollection = `coaching-${courseSlug}`;
  const blockCollection = blockSlug ? `${courseCollection}-${blockSlug}` : null;
  return { blockSlug, blockCollection, courseCollection };
}

export async function scanAndDedup(dir: string): Promise<Omit<FileCandidate, 'relPath' | 'blockSlug' | 'blockCollection' | 'courseCollection' | 'preview'>[]> {
  const allFiles = await collectFiles(dir);
  const supported = allFiles.filter((f) => SUPPORTED_EXTS.has(extname(f).toLowerCase()));

  const hashed = (await Promise.all(supported.map(async (f) => {
    const buf = await readFile(f);
    if (buf.length === 0) {
      console.warn(`[batch-ingest] skipping empty file (0 bytes): ${basename(f)}`);
      return null;
    }
    const hash = createHash('sha256').update(buf).digest('hex');
    return { filePath: f, filename: basename(f), sha256: hash };
  }))).filter((x): x is NonNullable<typeof x> => x !== null);

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

// ── CLI-only code (imports resolved lazily to avoid test-runner breakage) ─────

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
    console.log(`  ${c.relPath}`);
    console.log(`   Block: ${c.blockSlug ?? '(root)'} · Collection: ${c.blockCollection ?? c.courseCollection}`);
    console.log(`   Preview: ${c.preview ?? '(no text extracted)'}`);
    console.log('─────────────────────────────────────────');

    let answer = '';
    while (!['y', 'n', 'a', 'q'].includes(answer)) {
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
  pool: import('pg').Pool,
  candidate: FileCandidate,
  text: string,
  pageCount: number | null,
  format: string,
  opts: { dryRun: boolean },
): Promise<void> {
  const { sha256, ensureCollection, upsertDocumentAndChunks, bumpCollectionStats } =
    await import('../knowledge/lib-knowledge-pg.mjs') as any;
  const { chunkText } = await import('../../website/src/lib/chunking.ts') as any;
  const { embedBatch } = await import('../../website/src/lib/embeddings.ts') as any;

  const textHash = sha256(text);
  const chunks = chunkText(text, { mode: 'plain', targetTokens: 600, overlapTokens: 80 });

  if (opts.dryRun) {
    console.log(`  [dry-run] would embed ${chunks.length} chunks into:`);
    if (candidate.blockCollection) console.log(`    - ${candidate.blockCollection}`);
    console.log(`    - ${candidate.courseCollection}`);
    return;
  }

  const { embeddings, tokens } = await embedBatch(
    chunks.map((c: any) => c.text),
    { model: process.env.LLM_ENABLED === 'true' ? 'bge-m3' : 'voyage-multilingual-2', purpose: 'index' },
  );
  console.log(`  embedded ${chunks.length} chunks (${tokens} tokens)`);

  const chunksWithEmbeddings = chunks.map((c: any, i: number) => ({
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
  console.log(`[batch-ingest] scanning ${flags.inputDir}...`);

  const rawCandidates = await scanAndDedup(flags.inputDir);
  console.log(`[batch-ingest] ${rawCandidates.length} unique files after dedup`);

  const { extractText } = await import('./lib-extract.mjs') as any;

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
      return { ...c, relPath: relative(flags.inputDir, c.filePath), ...meta, preview };
    }),
  );

  const toIngest = flags.yes ? candidates : await interactiveReview(candidates);
  console.log(`\n[batch-ingest] ${toIngest.length} files confirmed for ingest`);

  if (flags.dryRun) {
    console.log('[batch-ingest] --dry-run: no DB writes');
    let i = 0;
    for (const c of toIngest) {
      i++;
      console.log(`\n[${i}/${toIngest.length}] ${c.relPath}`);
      try {
        const { text, pageCount, format } = await extractText(c.filePath);
        await ingestDual(null as any, c, text, pageCount ?? null, format, { dryRun: true });
      } catch (err) {
        console.error(`  failed: ${err instanceof Error ? err.message : err}`);
      }
    }
    return;
  }

  const { makePool } = await import('../knowledge/lib-knowledge-pg.mjs') as any;
  const pool = makePool();
  try {
    let i = 0;
    for (const c of toIngest) {
      i++;
      console.log(`\n[${i}/${toIngest.length}] ${c.relPath}`);
      try {
        const { text, pageCount, format } = await extractText(c.filePath);
        if (text.trim().length < 100) {
          console.warn(`  very short text (${text.trim().length} chars) — possible scan-only PDF, skipping`);
          continue;
        }
        await ingestDual(pool, c, text, pageCount ?? null, format, { dryRun: false });
      } catch (err) {
        console.error(`  failed: ${err instanceof Error ? err.message : err}`);
      }
    }
  } finally {
    await pool.end();
  }

  if (flags.classify) {
    console.log('\n[batch-ingest] running classifier (--classify)...');
    const { spawn } = await import('node:child_process');
    const child = spawn('npx', ['tsx', new URL('./classify-book.mts', import.meta.url).pathname, `--slug=${flags.courseSlug}`], { stdio: 'inherit' });
    const code: number = await new Promise((r) => child.on('exit', (c: number | null) => r(c ?? 1)));
    if (code !== 0) { console.error(`classifier exited ${code}`); process.exit(code); }
  }

  console.log('\n[batch-ingest] done.');
}

// Only run main() when invoked directly, not when imported by test runner
import { pathToFileURL } from 'node:url';
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => { console.error(err); process.exit(1); });
}

#!/usr/bin/env node
import { makePool, sha256, ensureCollection, upsertDocumentAndChunks, bumpCollectionStats, embedAllWithModel, chunkPlain } from './lib-knowledge-pg.mjs';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join, relative, basename } from 'node:path';

const REPO_ROOT = resolve(import.meta.dirname, '../../');
const COLLECTION_NAME = 'Specs & Plans';
const COLLECTION_SOURCE = 'specs_plans';

function findMarkdownFiles() {
  const files = [];
  // Flat *.md per dir — mirrors the k1-embed-job selective trigger
  // (.agents/plans/*.md|docs/adr/*.md|docs/runbooks/*.md). docs/brain is
  // flat (no subdirs as of 2026-10-04); keep flat here so the script and
  // the job trigger can never drift apart silently.
  const flatDirs = [
    join(REPO_ROOT, 'docs/superpowers/specs'),
    join(REPO_ROOT, 'docs/adr'),
    join(REPO_ROOT, 'docs/runbooks'),
    join(REPO_ROOT, 'docs/brain'),
  ];
  for (const dir of flatDirs) {
    try {
      for (const f of readdirSync(dir)) {
        if (f.endsWith('.md')) files.push(join(dir, f));
      }
    } catch { /* dir may not exist yet */ }
  }
  // Staged plans are part of the searchable planning corpus.
  const plansDir = join(REPO_ROOT, '.agents/plans');
  try {
    for (const entry of readdirSync(plansDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const planDir = join(plansDir, entry.name);
      for (const f of readdirSync(planDir)) {
        if (f.endsWith('.md')) files.push(join(planDir, f));
      }
    }
  } catch { /* plans may not exist yet */ }
  // Always include CLAUDE.md at repo root
  files.push(join(REPO_ROOT, 'CLAUDE.md'));
  return files;
}

function splitMarkdownChunks(text) {
  // Use heading-aware chunking: split on H2/H3 boundaries first, then by token budget.
  const H2H3 = /^#{2,3}\s/m;
  const parts = [];
  let buf = '';
  for (const line of text.split('\n')) {
    if (H2H3.test(line) && buf.length > 0) {
      parts.push(buf);
      buf = '';
    }
    buf += line + '\n';
  }
  if (buf.length > 0) parts.push(buf);

  const chunks = [];
  let pos = 0;
  for (const part of parts) {
    for (const c of chunkPlain(part)) {
      chunks.push({ position: pos++, text: c.text });
    }
  }
  return chunks;
}

async function main() {
  const pool = makePool();
  try {
    const collectionId = await ensureCollection(pool, {
      name: COLLECTION_NAME,
      source: COLLECTION_SOURCE,
      description: 'Specs, plans, ADRs, runbooks, brain notes, and CLAUDE.md from the repository',
    });

    const files = findMarkdownFiles();
    console.log(`Found ${files.length} markdown files`);

    for (const filePath of files) {
      const text = readFileSync(filePath, 'utf8');
      const hash = sha256(text);
      const relPath = relative(REPO_ROOT, filePath);
      const sourceUri = `file:${relPath}`;
      const title = basename(filePath, '.md');

      const rawChunks = splitMarkdownChunks(text);
      const { embeddings, model: embeddingModel } = await embedAllWithModel(rawChunks.map(c => c.text));
      const chunks = rawChunks.map((c, i) => ({
        ...c,
        embedding: embeddings[i],
        metadata: { ...(c.metadata ?? {}), embedding_model: embeddingModel },
      }));

      await upsertDocumentAndChunks(pool, {
        collectionId,
        title,
        sourceUri,
        rawText: text,
        hash,
        metadata: { path: relPath },
        chunks,
      });
      process.stdout.write('.');
    }

    console.log('\nBumping collection stats...');
    await bumpCollectionStats(pool, collectionId);
    console.log('Done.');
  } finally {
    await pool.end();
  }
}

main().catch(err => { console.error(err); process.exit(1); });

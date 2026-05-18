#!/usr/bin/env tsx
// scripts/coaching/merge-books.mts
import { Pool } from 'pg';
import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import {
  listSmallBooks,
  proposeTitleFromBooks,
  mergeBooks,
  clusterByEmbedding,
} from '../../website/src/lib/coaching-merge.ts';

interface Flags {
  mode: 'pattern' | 'semantic' | 'list';
  pattern?: string;
  minSimilarity: number;
  yes: boolean;
}

function parseFlags(args: string[]): Flags {
  const flags: Flags = { mode: 'list', minSimilarity: 0.75, yes: false };
  for (const arg of args) {
    if (arg.startsWith('--mode=')) flags.mode = arg.slice(7) as Flags['mode'];
    if (arg.startsWith('--pattern=')) flags.pattern = arg.slice(10);
    if (arg.startsWith('--min-similarity=')) flags.minSimilarity = parseFloat(arg.slice(17));
    if (arg === '--yes') flags.yes = true;
  }
  return flags;
}

function slugify(t: string): string {
  return t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

async function confirm(rl: readline.Interface, spec: { title: string; slug: string; sourceBookIds: string[] }, books: { id: string; title: string; chunkCount: number }[], yes: boolean): Promise<{ title: string; slug: string } | null> {
  const totalChunks = books.filter(b => spec.sourceBookIds.includes(b.id)).reduce((s, b) => s + b.chunkCount, 0);
  console.log(`\nProposed merge: "${spec.title}"  [slug: ${spec.slug}]`);
  console.log(`  Sources (${spec.sourceBookIds.length} books, ${totalChunks} chunks total):`);
  for (const id of spec.sourceBookIds) {
    const b = books.find(bk => bk.id === id);
    if (b) console.log(`    ${b.title} (${b.chunkCount} chunk${b.chunkCount === 1 ? '' : 's'})`);
  }
  console.log(`  ✎ Proposed title: "${spec.title}"  — accept? [Y/n/rename]`);

  if (yes) { console.log('  → --yes: auto-accepting'); return { title: spec.title, slug: spec.slug }; }

  const answer = (await rl.question('  > ')).trim().toLowerCase();
  if (answer === 'n') return null;
  if (answer === 'rename') {
    const newTitle = (await rl.question('  New title: ')).trim();
    if (!newTitle) return null;
    return { title: newTitle, slug: slugify(newTitle) };
  }
  return { title: spec.title, slug: spec.slug };
}

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  const pool = new Pool();
  const rl = readline.createInterface({ input, output });

  try {
    const allSmall = await listSmallBooks(pool);

    if (flags.mode === 'list') {
      console.log(`Small books (≤5 chunks): ${allSmall.length}`);
      for (const b of allSmall) {
        console.log(`  [${b.chunkCount}] ${b.title}  (id=${b.id})`);
      }
      return;
    }

    let specs: { title: string; slug: string; sourceBookIds: string[] }[] = [];

    if (flags.mode === 'pattern') {
      if (!flags.pattern) { console.error('--pattern=<keyword> required'); process.exit(1); }
      const pat = flags.pattern.toLowerCase();
      const matched = allSmall.filter(b =>
        b.title.toLowerCase().includes(pat) || b.sourceFilename.toLowerCase().includes(pat)
      );
      if (matched.length < 2) { console.log(`Only ${matched.length} books match "${flags.pattern}" — need ≥2`); return; }
      const title = proposeTitleFromBooks(matched);
      specs = [{ title, slug: slugify(title), sourceBookIds: matched.map(b => b.id) }];
    }

    if (flags.mode === 'semantic') {
      specs = await clusterByEmbedding(pool, flags.minSimilarity);
      if (specs.length === 0) { console.log('No clusters found at the given similarity threshold.'); return; }
    }

    for (const spec of specs) {
      const confirmed = await confirm(rl, spec, allSmall, flags.yes);
      if (!confirmed) { console.log('  → skipped\n'); continue; }
      console.log(`  → merging…`);
      const result = await mergeBooks(pool, { ...spec, ...confirmed });
      console.log(`  ✓ merged: ${result.chunksReassigned} chunks, ${result.draftsDeleted} drafts deleted`);
      console.log(`  → classify: npx tsx scripts/coaching/classify-book.mts --slug=${confirmed.slug} --delay-ms=200\n`);
    }
  } finally {
    rl.close();
    await pool.end();
  }
}

main().catch(err => { console.error(err); process.exit(1); });
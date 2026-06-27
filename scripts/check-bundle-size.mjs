#!/usr/bin/env node
// G-FE02: Client-JS-Bundle messen + Budget (kein Netto-Zuwachs/Release).
// SSOT: openspec/changes/g-fe02-bundle-budget/
// Node ESM (builtins only: fs, path, zlib).

import { readdirSync, readFileSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';

function parseArgs() {
  const args = {};
  for (const a of process.argv.slice(2)) {
    if (a === '--update-baseline') args.updateBaseline = true;
    else if (a === '--check') args.check = true;
    else if (a === '--fail') args.fail = true;
    else if (a.startsWith('--threshold=')) args.threshold = Number(a.split('=')[1]);
    else if (a.startsWith('--dir=')) args.dir = a.split('=')[1];
    else if (a.startsWith('--baseline=')) args.baseline = a.split('=')[1];
  }
  args.threshold = args.threshold ?? (Number(process.env.BUNDLE_BUDGET_PCT) || 5);
  args.dir = args.dir || 'website/dist/client';
  args.baseline = args.baseline || 'website/bundle-baseline.json';
  return args;
}

function collectJsFiles(dir) {
  const files = [];
  try {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        files.push(...collectJsFiles(full));
      } else if (entry.endsWith('.js')) {
        files.push(full);
      }
    }
  } catch { }
  return files;
}

function measure(dir) {
  if (!existsSync(dir)) {
    console.error(`ERROR: directory not found — ${dir}`);
    console.error('Build the website first (pnpm --dir website build).');
    process.exit(1);
  }
  const files = collectJsFiles(dir);
  let totalGzipBytes = 0;
  for (const f of files) {
    totalGzipBytes += gzipSync(readFileSync(f)).length;
  }
  return { totalGzipBytes, fileCount: files.length, generatedAt: new Date().toISOString() };
}

function formatBytes(n) {
  return n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`;
}

const args = parseArgs();

if (args.updateBaseline) {
  const dir = resolve(args.dir);
  const data = measure(dir);
  data.generatedAt = new Date().toISOString();
  const json = JSON.stringify(data, null, 2) + '\n';
  writeFileSync(resolve(args.baseline), json, 'utf-8');
  console.log(`✓ Baseline written to ${args.baseline}`);
  console.log(`  totalGzipBytes: ${data.totalGzipBytes} (${formatBytes(data.totalGzipBytes)})`);
  console.log(`  fileCount:      ${data.fileCount}`);
  process.exit(0);
}

// Check mode (default)
const dir = resolve(args.dir);
const current = measure(dir);
const baselinePath = resolve(args.baseline);
if (!existsSync(baselinePath)) {
  console.error(`ERROR: baseline not found at ${args.baseline}`);
  console.error('Run with --update-baseline first, or point --baseline to an existing file.');
  process.exit(1);
}
const baseline = JSON.parse(readFileSync(baselinePath, 'utf-8'));
const delta = current.totalGzipBytes - baseline.totalGzipBytes;
const pct = baseline.totalGzipBytes > 0 ? (delta / baseline.totalGzipBytes) * 100 : 0;
const pctFormatted = `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`;
const absFormatted = `${delta >= 0 ? '+' : ''}${formatBytes(Math.abs(delta))}`;

console.log(`  baseline:   ${formatBytes(baseline.totalGzipBytes)} (${baseline.fileCount} files)`);
console.log(`  current:    ${formatBytes(current.totalGzipBytes)} (${current.fileCount} files)`);
console.log(`  delta:      ${absFormatted} (${pctFormatted})`);

if (pct > args.threshold) {
  console.error(`FAIL: bundle grew by ${pctFormatted} — exceeds threshold of ${args.threshold}%`);
  if (args.fail) process.exit(1);
  console.warn(`(--fail not set; exit 0 with warning)`);
  process.exit(0);
}
if (delta > 0) {
  console.log(`OK (within ${args.threshold}% threshold)`);
} else if (delta === 0) {
  console.log(`OK (no change)`);
} else {
  console.log(`OK (bundle shrank by ${absFormatted} / ${pctFormatted})`);
}
process.exit(0);

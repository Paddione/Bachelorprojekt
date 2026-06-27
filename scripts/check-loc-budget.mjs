#!/usr/bin/env node
// scripts/check-loc-budget.mjs
// LOC-Budget quality gate (G-SIZE04 / S6).
// Counts lines across the S1 scan-universe and enforces growth thresholds
// against a committed baseline in docs/code-quality/loc-budget.json.
//
// Usage:
//   node scripts/check-loc-budget.mjs                  # check mode (default)
//   node scripts/check-loc-budget.mjs --update-baseline # write/refresh baseline
//   node scripts/check-loc-budget.mjs --fail            # promote WARN → FAIL
//   node scripts/check-loc-budget.mjs --baseline=<path> # custom baseline file
//   node scripts/check-loc-budget.mjs --warn-pct=N --fail-pct=N --absolute-cap=N
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const args = {
    updateBaseline: false,
    failOnWarn: false,
    baselinePath: null,
    warnPct: null,
    failPct: null,
    absoluteCap: null,
  };
  for (const a of argv.slice(2)) {
    if (a === '--update-baseline') { args.updateBaseline = true; continue; }
    if (a === '--fail') { args.failOnWarn = true; continue; }
    const m = a.match(/^--([a-z-]+)=(.+)$/);
    if (!m) continue;
    const [, key, val] = m;
    if (key === 'baseline') { args.baselinePath = val; continue; }
    if (key === 'warn-pct')     { args.warnPct = Number(val); continue; }
    if (key === 'fail-pct')     { args.failPct = Number(val); continue; }
    if (key === 'absolute-cap') { args.absoluteCap = Number(val); continue; }
  }
  return args;
}

// ---------------------------------------------------------------------------
// Gates / scan-universe loading
// ---------------------------------------------------------------------------
function loadGates() {
  // Load gates.yaml via a require-compatible yaml parser if available,
  // else fall back to a minimal inline YAML-to-JS parser for the simple
  // list-of-strings shape we need.
  const gatesPath = join(REPO_ROOT, 'docs', 'code-quality', 'gates.yaml');
  const raw = readFileSync(gatesPath, 'utf8');
  // Try yaml from node_modules (installed at repo root)
  try {
    const req = createRequire(join(REPO_ROOT, 'package.json'));
    const yaml = req('yaml');
    return yaml.parse(raw);
  } catch {
    // Minimal YAML parser — handles only the list structure we need
    return parseMinimalYaml(raw);
  }
}

function parseMinimalYaml(text) {
  const lines = text.split('\n');
  const result = {};
  const stack = [{ indent: -1, obj: result }];

  for (const rawLine of lines) {
    if (!rawLine.trim() || rawLine.trim().startsWith('#')) continue;
    const indent = rawLine.search(/\S/);
    const line = rawLine.trim();

    // Pop stack to current indent level
    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }
    const parent = stack[stack.length - 1].obj;

    if (line.startsWith('- ')) {
      // List item
      const val = line.slice(2).replace(/^["']|["']$/g, '');
      const key = stack[stack.length - 1].listKey;
      if (key && Array.isArray(parent[key])) {
        parent[key].push(val);
      }
    } else if (line.endsWith(':')) {
      // Object key with no value
      const key = line.slice(0, -1);
      parent[key] = {};
      stack.push({ indent, obj: parent[key], listKey: null });
    } else {
      const colonIdx = line.indexOf(':');
      if (colonIdx < 0) continue;
      const key = line.slice(0, colonIdx).trim();
      const val = line.slice(colonIdx + 1).trim().replace(/^["']|["']$/g, '');
      if (val === '') {
        // Will be followed by children or list items
        parent[key] = [];
        stack.push({ indent, obj: parent, listKey: key });
      } else {
        parent[key] = val;
      }
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Scan-universe import (dynamic to keep this file self-contained)
// ---------------------------------------------------------------------------
async function getScanUniverse(gates) {
  const { scanUniverse } = await import('./code-quality/scan.mjs');
  return scanUniverse(REPO_ROOT, gates);
}

// ---------------------------------------------------------------------------
// Line counting
// ---------------------------------------------------------------------------
function countLines(filePath) {
  try {
    const content = readFileSync(filePath, 'utf8');
    // Count newlines (same method as S1 lineCount())
    let n = 0;
    for (let i = 0; i < content.length; i++) {
      if (content[i] === '\n') n++;
    }
    // If file doesn't end with newline, count last line too
    if (content.length > 0 && content[content.length - 1] !== '\n') n++;
    return n;
  } catch {
    return 0;
  }
}

function measure(files) {
  let total = 0;
  for (const rel of files) {
    total += countLines(join(REPO_ROOT, rel));
  }
  return { total_lines: total, file_count: files.length };
}

// ---------------------------------------------------------------------------
// Git helpers
// ---------------------------------------------------------------------------
function gitShortHead() {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    }).trim();
  } catch {
    return 'unknown';
  }
}

// ---------------------------------------------------------------------------
// Baseline I/O
// ---------------------------------------------------------------------------
function defaultBaselinePath() {
  return join(REPO_ROOT, 'docs', 'code-quality', 'loc-budget.json');
}

function loadBaseline(path) {
  if (!existsSync(path)) return null;
  const raw = readFileSync(path, 'utf8').trim();
  if (!raw) return null;
  return JSON.parse(raw);
}

function writeBaseline(path, data) {
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

// ---------------------------------------------------------------------------
// Default thresholds
// ---------------------------------------------------------------------------
const DEFAULTS = {
  warn_pct: 5,
  fail_pct: 15,
  absolute_cap: 350000,
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const args = parseArgs(process.argv);
  const baselinePath = args.baselinePath ?? defaultBaselinePath();

  // Load gates + universe
  let gates;
  try {
    gates = loadGates();
  } catch (e) {
    console.error(`ERROR: Failed to load docs/code-quality/gates.yaml: ${e.message}`);
    process.exit(1);
  }

  let files;
  try {
    files = await getScanUniverse(gates);
  } catch (e) {
    console.error(`ERROR: Failed to build scan universe: ${e.message}`);
    process.exit(1);
  }

  const { total_lines, file_count } = measure(files);

  // --update-baseline mode
  if (args.updateBaseline) {
    const existing = loadBaseline(baselinePath);
    const thresholds = existing?.thresholds ?? { ...DEFAULTS };
    const baseline = {
      total_lines,
      file_count,
      commit: gitShortHead(),
      measured_at: new Date().toISOString(),
      thresholds,
    };
    writeBaseline(baselinePath, baseline);
    console.log(`✓ LOC baseline updated: ${total_lines.toLocaleString()} lines across ${file_count} files`);
    console.log(`  Written to: ${baselinePath}`);
    process.exit(0);
  }

  // Check mode
  const existing = loadBaseline(baselinePath);
  if (!existing) {
    console.error(`ERROR: LOC baseline not found at: ${baselinePath}`);
    console.error(`  Run 'task loc:update-baseline' to generate it.`);
    process.exit(1);
  }

  // Resolve effective thresholds (CLI overrides > baseline file > defaults)
  const thresholds = existing.thresholds ?? { ...DEFAULTS };
  const warnPct     = args.warnPct     ?? thresholds.warn_pct     ?? DEFAULTS.warn_pct;
  const failPct     = args.failPct     ?? thresholds.fail_pct     ?? DEFAULTS.fail_pct;
  const absoluteCap = args.absoluteCap ?? thresholds.absolute_cap ?? DEFAULTS.absolute_cap;

  const baseline_lines = existing.total_lines;
  const delta = total_lines - baseline_lines;
  const delta_pct = baseline_lines > 0 ? (delta / baseline_lines) * 100 : 0;

  console.log(`LOC-Budget check (G-SIZE04):`);
  console.log(`  Baseline : ${baseline_lines.toLocaleString()} lines (commit ${existing.commit})`);
  console.log(`  Current  : ${total_lines.toLocaleString()} lines across ${file_count} files`);
  console.log(`  Delta    : ${delta >= 0 ? '+' : ''}${delta.toLocaleString()} lines (${delta_pct >= 0 ? '+' : ''}${delta_pct.toFixed(2)}%)`);
  console.log(`  Thresholds: warn=${warnPct}% / fail=${failPct}% / cap=${absoluteCap.toLocaleString()}`);

  // Gate logic (order matters: cap check before pct check)
  if (delta < 0) {
    console.log(`✓ PASS — LOC decreased by ${Math.abs(delta).toLocaleString()} lines`);
    process.exit(0);
  }

  if (total_lines > absoluteCap) {
    console.error(`✗ FAIL — Total LOC (${total_lines.toLocaleString()}) exceeds absolute cap (${absoluteCap.toLocaleString()})`);
    console.error(`  Reduce the codebase size or update the cap with 'task loc:update-baseline'.`);
    process.exit(1);
  }

  if (delta_pct > failPct) {
    console.error(`✗ FAIL — LOC grew ${delta_pct.toFixed(2)}% (limit: ${failPct}%)`);
    console.error(`  Reduce new code or update baseline with 'task loc:update-baseline'.`);
    process.exit(1);
  }

  if (delta_pct > warnPct) {
    const msg = `⚠ WARN — LOC grew ${delta_pct.toFixed(2)}% (warn at ${warnPct}%, fail at ${failPct}%)`;
    if (args.failOnWarn) {
      console.error(msg);
      console.error(`  --fail flag is set: promoting WARN to FAIL.`);
      process.exit(1);
    }
    console.warn(msg);
    console.warn(`  Consider updating the baseline with 'task loc:update-baseline'.`);
    process.exit(0);
  }

  console.log(`✓ PASS — LOC growth ${delta_pct.toFixed(2)}% is within budget (warn: ${warnPct}%)`);
  process.exit(0);
}

main().catch((e) => {
  console.error(`ERROR: Unexpected failure: ${e.message}`);
  process.exit(1);
});

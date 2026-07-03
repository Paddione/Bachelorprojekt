#!/usr/bin/env node
/**
 * build-api-map.mjs — API Surface Map from Astro routes (LAD-2)
 *
 * Crawls website/src/pages/api/**\/*.ts, extracts:
 * - HTTP methods (export const GET/POST/PATCH/DELETE/PUT)
 * - Auth level (isAdmin, getSession, requireAdmin, requireAuth patterns)
 * - URL path derived from file path
 *
 * Output:
 *   docs/generated/api-map.json   — machine-readable endpoint list
 *   docs/generated/api-surface.md — Markdown table for human review
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(__dirname, '..');
const API_DIR = join(ROOT, 'website/src/pages/api');

// ── File glob ─────────────────────────────────────────────────────────────────
function globTs(dir) {
  const results = [];
  function walk(d) {
    let entries;
    try { entries = readdirSync(d); } catch { return; }
    for (const entry of entries) {
      const full = join(d, entry);
      let stat;
      try { stat = statSync(full); } catch { continue; }
      if (stat.isDirectory()) {
        walk(full);
      } else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts') && !entry.endsWith('.spec.ts')) {
        results.push(full);
      }
    }
  }
  walk(dir);
  return results;
}

// ── File path → URL path ──────────────────────────────────────────────────────
function fileToUrlPath(filePath) {
  const rel = relative(join(ROOT, 'website/src/pages'), filePath);
  // Remove .ts extension
  let urlPath = rel.replace(/\.ts$/, '');
  // Convert [param] → {param}
  urlPath = urlPath.replace(/\[([^\]]+)\]/g, '{$1}');
  // Normalize slashes
  urlPath = '/' + urlPath.replace(/\\/g, '/');
  // Remove /index suffix
  urlPath = urlPath.replace(/\/index$/, '');
  return urlPath;
}

// ── Extract HTTP methods ──────────────────────────────────────────────────────
const METHOD_RE = /export\s+const\s+(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\s*[=:]/g;

function extractMethods(content) {
  const methods = [];
  let m;
  METHOD_RE.lastIndex = 0;
  while ((m = METHOD_RE.exec(content)) !== null) {
    if (!methods.includes(m[1])) methods.push(m[1]);
  }
  return methods;
}

// ── Determine auth level ──────────────────────────────────────────────────────
function extractAuthLevel(content, urlPath) {
  if (
    /isAdmin\s*\(/.test(content) ||
    /requireAdmin/.test(content) ||
    /role.*admin/i.test(content) ||
    /admin.*role/i.test(content) ||
    // T001490: admin save endpoints delegate the getSession+isAdmin(401)
    // guard to the shared publish handler instead of inlining it.
    /handleAdminSave\s*\(/.test(content)
  ) {
    return 'admin';
  }
  if (
    /getSession\s*\(/.test(content) ||
    /requireAuth/.test(content) ||
    /getServerSession/.test(content) ||
    /session\s*=\s*await/.test(content) ||
    /verifyToken/.test(content) ||
    /checkAuth/.test(content)
  ) {
    return 'session';
  }
  if (
    /INTERNAL_API_TOKEN/.test(content) ||
    /x-internal-token/.test(content) ||
    urlPath.startsWith('/api/internal/')
  ) {
    return 'internal';
  }
  if (
    /CRON_SECRET/.test(content) ||
    /Bearer \$\{CRON_SECRET\}/.test(content)
  ) {
    return 'cron';
  }
  return 'unclassified';
}

// ── Main ──────────────────────────────────────────────────────────────────────
function main() {
  const tsFiles = globTs(API_DIR);
  const endpoints = [];

  for (const filePath of tsFiles) {
    let content;
    try { content = readFileSync(filePath, 'utf8'); } catch { continue; }

    const methods = extractMethods(content);
    if (methods.length === 0) continue; // Skip files with no exports

    const path = fileToUrlPath(filePath);
    const auth = extractAuthLevel(content, path);
    const fileRel = relative(ROOT, filePath);

    endpoints.push({ path, methods, auth, file: fileRel });
  }

  // Sort alphabetically by path
  endpoints.sort((a, b) => a.path.localeCompare(b.path));

  const output = {
    generatedAt: new Date().toISOString(),
    endpoints,
  };

  mkdirSync(join(ROOT, 'docs/generated'), { recursive: true });

  function hasStructuralChange(path, newContent) {
    try {
      const existing = readFileSync(path, 'utf8');
      const oldData = JSON.parse(existing);
      const newData = JSON.parse(newContent);
      delete oldData.generatedAt;
      delete newData.generatedAt;
      return JSON.stringify(oldData) !== JSON.stringify(newData);
    } catch { return true; }
  }

  function hasMdStructuralChange(path, newContent) {
    try {
      const existing = readFileSync(path, 'utf8');
      const stripTs = (s) => s.replace(/^> Generated at .*/m, '');
      return stripTs(existing) !== stripTs(newContent);
    } catch { return true; }
  }

  // Write JSON (skip if only timestamp changed)
  const jsonPath = join(ROOT, 'docs/generated/api-map.json');
  const jsonContent = JSON.stringify(output, null, 2);
  if (hasStructuralChange(jsonPath, jsonContent)) {
    writeFileSync(jsonPath, jsonContent);
    console.log(`✓ api-map.json: ${endpoints.length} endpoints → ${jsonPath}`);
  } else {
    console.log(`○ api-map.json: no structural change, skipped`);
  }

  // Write Markdown table (skip if only timestamp changed)
  const mdLines = [
    '# API Surface Map',
    '',
    `> Generated at ${output.generatedAt}`,
    '',
    '| Path | Methods | Auth | File |',
    '|------|---------|------|------|',
  ];
  for (const ep of endpoints) {
    const methods = ep.methods.join(', ');
    const authBadge = ep.auth === 'admin' ? '🔐 admin'
      : ep.auth === 'session' ? '🔑 session'
      : ep.auth === 'internal' ? '🔒 internal'
      : ep.auth === 'cron' ? '⏰ cron'
      : ep.auth === 'unclassified' ? '❓ unclassified'
      : '🌐 public';
    mdLines.push(`| \`${ep.path}\` | ${methods} | ${authBadge} | \`${ep.file}\` |`);
  }
  mdLines.push('');

  const mdPath = join(ROOT, 'docs/generated/api-surface.md');
  const mdContent = mdLines.join('\n');
  if (hasMdStructuralChange(mdPath, mdContent)) {
    writeFileSync(mdPath, mdContent);
    console.log(`✓ api-surface.md: ${endpoints.length} rows → ${mdPath}`);
  } else {
    console.log(`○ api-surface.md: no structural change, skipped`);
  }
}

main();

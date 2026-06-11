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
function extractAuthLevel(content) {
  // Check for admin-level auth
  if (
    /isAdmin\s*\(/.test(content) ||
    /requireAdmin/.test(content) ||
    /role.*admin/i.test(content) ||
    /admin.*role/i.test(content)
  ) {
    return 'admin';
  }
  // Check for auth-required (any session)
  if (
    /getSession\s*\(/.test(content) ||
    /requireAuth/.test(content) ||
    /getServerSession/.test(content) ||
    /session\s*=\s*await/.test(content) ||
    /verifyToken/.test(content) ||
    /checkAuth/.test(content)
  ) {
    return 'auth';
  }
  return 'public';
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
    const auth = extractAuthLevel(content);
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

  // Write JSON
  const jsonPath = join(ROOT, 'docs/generated/api-map.json');
  writeFileSync(jsonPath, JSON.stringify(output, null, 2));

  // Write Markdown table
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
    const authBadge = ep.auth === 'admin' ? '🔐 admin' : ep.auth === 'auth' ? '🔑 auth' : '🌐 public';
    mdLines.push(`| \`${ep.path}\` | ${methods} | ${authBadge} | \`${ep.file}\` |`);
  }
  mdLines.push('');

  const mdPath = join(ROOT, 'docs/generated/api-surface.md');
  writeFileSync(mdPath, mdLines.join('\n'));

  console.log(`✓ api-map.json: ${endpoints.length} endpoints → ${jsonPath}`);
  console.log(`✓ api-surface.md: ${endpoints.length} rows → ${mdPath}`);
}

main();

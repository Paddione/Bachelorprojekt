#!/usr/bin/env node
/**
 * api-auth-check.mjs — CI gate: every API endpoint must be classified and
 * public/unclassified endpoints must have an allowlist entry.
 *
 * Usage: node scripts/api-auth-check.mjs [--regression --main-map <path>]
 * Env:   API_MAP_PATH, ALLOWLIST_PATH (optional overrides for testing)
 *
 * Exit 0 = all endpoints classified + allowlisted
 * Exit 1 = one or more gaps found
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const DEFAULT_MAP = join(ROOT, 'docs/generated/api-map.json');
const DEFAULT_ALLOWLIST = join(ROOT, 'website/api-public-allowlist.json');

function parseArgs(argv) {
  const args = { regression: false, mainMap: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--regression') args.regression = true;
    if (argv[i] === '--main-map' && argv[i + 1]) args.mainMap = argv[++i];
  }
  return args;
}

function loadJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function buildAllowlistIndex(allowlist) {
  const index = new Map();
  for (const entry of allowlist) {
    const key = entry.path;
    if (!index.has(key)) index.set(key, new Set());
    for (const m of entry.methods) index.get(key).add(m.toUpperCase());
  }
  return index;
}

function isAllowlisted(endpoint, allowlistIndex) {
  const methods = allowlistIndex.get(endpoint.path);
  if (!methods) return false;
  return endpoint.methods.some(m => methods.has(m.toUpperCase()));
}

const PASS_THROUGH = new Set(['admin', 'session', 'internal', 'cron']);

function checkEndpoints(endpoints, allowlistIndex) {
  const failures = [];
  for (const ep of endpoints) {
    if (PASS_THROUGH.has(ep.auth)) continue;
    if (isAllowlisted(ep, allowlistIndex)) continue;
    failures.push(ep);
  }
  return failures;
}

function checkRegression(currentEndpoints, mainEndpoints, allowlistIndex) {
  const mainMap = new Map();
  for (const ep of mainEndpoints) mainMap.set(ep.path, ep.auth);

  const regressions = [];
  for (const ep of currentEndpoints) {
    const prevAuth = mainMap.get(ep.path);
    if (!prevAuth) continue;
    if (PASS_THROUGH.has(prevAuth) && !PASS_THROUGH.has(ep.auth)) {
      if (!isAllowlisted(ep, allowlistIndex)) {
        regressions.push({ ...ep, prevAuth });
      }
    }
  }
  return regressions;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const mapPath = process.env.API_MAP_PATH || DEFAULT_MAP;
  const allowlistPath = process.env.ALLOWLIST_PATH || DEFAULT_ALLOWLIST;

  const apiMap = loadJson(mapPath);
  const allowlist = loadJson(allowlistPath);
  const allowlistIndex = buildAllowlistIndex(allowlist);

  const failures = checkEndpoints(apiMap.endpoints, allowlistIndex);

  if (args.regression && args.mainMap) {
    const mainMap = loadJson(args.mainMap);
    const regressions = checkRegression(apiMap.endpoints, mainMap.endpoints, allowlistIndex);
    if (regressions.length > 0) {
      console.error(`\n✗ API auth regression: ${regressions.length} endpoint(s) weakened without allowlist update:`);
      for (const r of regressions) {
        console.error(`  ${r.path} [${r.methods.join(',')}]  ${r.prevAuth} → ${r.auth}`);
      }
      console.error('\n  Add the endpoint to website/api-public-allowlist.json or restore its auth guard.');
      process.exit(1);
    }
  }

  if (failures.length > 0) {
    console.error(`\n✗ API auth coverage gate: ${failures.length} endpoint(s) unclassified and not allowlisted:`);
    for (const f of failures) {
      console.error(`  ${f.path} [${f.methods.join(',')}]  auth=${f.auth}`);
    }
    console.error('\n  Either add an auth guard or register in website/api-public-allowlist.json with a reason.');
    process.exit(1);
  }

  const summary = {};
  for (const ep of apiMap.endpoints) {
    summary[ep.auth] = (summary[ep.auth] || 0) + 1;
  }
  console.log(`✓ API auth gate passed — ${apiMap.endpoints.length} endpoints`);
  for (const [auth, count] of Object.entries(summary).sort()) {
    console.log(`    ${auth}: ${count}`);
  }
}

main();

#!/usr/bin/env node
// scripts/code-quality/baseline-key-count-assertion.mjs
// Extracted from Taskfile.yml Phase 3 (T001155) — hardened baseline key-count guard.
// Blocks new baseline.json keys unless PR body contains [baseline-allow:<reason>].
//
// Exit codes:
//   0 — pass (no new keys OR new keys have explicit allow tag)
//   1 — fail (new keys without allow tag, or baseline grew beyond frozen main violations)
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const REPO_ROOT = process.cwd();
const BASELINE_PATH = path.join(REPO_ROOT, 'docs/code-quality/baseline.json');

function readMainBaseline() {
  try {
    const raw = execSync('git show origin/main:docs/code-quality/baseline.json', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function readPrBody() {
  // In CI, gh-axi / gh pr view provides the body. Locally, fall back to
  // $PR_BODY env var (set by the calling Taskfile step).
  if (process.env.PR_BODY) return process.env.PR_BODY;
  try {
    return execSync('gh pr view --json body -q .body', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return '';
  }
}

function main() {
  const current = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
  const mainBase = readMainBaseline();
  const currentKeys = new Set(Object.keys(current));
  const mainKeys = new Set(Object.keys(mainBase));

  const newKeys = [...currentKeys].filter((k) => !mainKeys.has(k));
  const prBody = readPrBody();
  const hasAllowTag = /\[baseline-allow:[^\]]+\]/i.test(prBody);

  if (newKeys.length === 0) {
    console.log(`✓ baseline.json has no new keys vs origin/main (${currentKeys.size} total)`);
    return 0;
  }

  if (hasAllowTag) {
    const match = prBody.match(/\[baseline-allow:([^\]]+)\]/i);
    console.log(`✓ ${newKeys.length} new baseline key(s) allowed via [baseline-allow:${match[1]}]: ${newKeys.join(', ')}`);
    return 0;
  }

  console.error(
    `ERROR: ${newKeys.length} new baseline key(s) require [baseline-allow:<reason>] tag in PR body:`
  );
  for (const k of newKeys) console.error(`  - ${k}`);
  console.error(`Add the tag to the PR description (e.g. [baseline-allow:vendor-exclude]).`);
  return 1;
}

process.exit(main());

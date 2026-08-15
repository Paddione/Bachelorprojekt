#!/usr/bin/env node
// Ensure the Playwright Docker image version matches @playwright/test version.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

function readJSON(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function fail(msg) {
  console.error(`\n[playwright:verify] ${msg}\n`);
  process.exit(1);
}

try {
  const pkg = readJSON(path.join(ROOT, 'package.json'));
  const pwDep = (pkg.devDependencies && pkg.devDependencies['@playwright/test']) || (pkg.dependencies && pkg.dependencies['@playwright/test']);
  if (!pwDep) {
    // Nothing to check
    process.exit(0);
  }
  const versionMatch = String(pwDep).match(/(\d+)\.(\d+)\.(\d+)/);
  if (!versionMatch) {
    fail(`Unable to parse @playwright/test version from package.json: "${pwDep}"`);
  }
  const [, pkgMajor, pkgMinor] = versionMatch;

  const compose = fs.readFileSync(path.join(ROOT, 'docker-compose.yml'), 'utf8');
  const imageLine = compose.split(/\r?\n/).find((l) => l.includes('mcr.microsoft.com/playwright:')) || '';
  const imageMatch = imageLine.match(/playwright:v(\d+)\.(\d+)\.(\d+)-/);
  if (!imageMatch) {
    fail('Could not find Playwright image tag in docker-compose.yml.');
  }
  const [, imgMajor, imgMinor] = imageMatch;

  if (pkgMajor !== imgMajor || pkgMinor !== imgMinor) {
    fail(`Version mismatch: @playwright/test is ^${pkgMajor}.${pkgMinor}.x but docker image is v${imgMajor}.${imgMinor}.x.\nUpdate docker-compose.yml to use mcr.microsoft.com/playwright:v${pkgMajor}.${pkgMinor}.0-jammy (or bump devDependency).`);
  }

  // Optional: sanity check that dev server won't crash from DB by mistake
  const devServiceBlock = compose.split(/\r?\n/).slice(0).join('\n');
  const hasDbDisabled = /videovault-dev:[\s\S]*?environment:[\s\S]*?DATABASE_URL=\s*$/m.test(devServiceBlock);
  if (!hasDbDisabled) {
    console.warn('[playwright:verify] Note: videovault-dev DATABASE_URL not cleared in docker-compose.yml; E2E may require db migrations.');
  }

  // All good
  process.exit(0);
} catch (err) {
  fail(err.message || String(err));
}


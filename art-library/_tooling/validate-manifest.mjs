#!/usr/bin/env node
// Validates every sets/*/manifest.json against ../manifest.schema.json
// and asserts every files.* path exists. Exits 0 on success, 1 on any failure.

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '..');                       // art-library/
const schema = JSON.parse(readFileSync(join(ROOT, 'manifest.schema.json'), 'utf8'));

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const validate = ajv.compile(schema);

const setsDir = join(ROOT, 'sets');
if (!existsSync(setsDir)) { console.error('no sets/ directory'); process.exit(1); }

const sets = readdirSync(setsDir).filter(n => {
  const p = join(setsDir, n);
  return statSync(p).isDirectory() && existsSync(join(p, 'manifest.json'));
});

if (sets.length === 0) {
  console.log('No sets found — nothing to validate (empty repo state).');
  process.exit(0);
}

let failures = 0;
for (const setName of sets) {
  const setDir = join(setsDir, setName);
  const manifestPath = join(setDir, 'manifest.json');
  let manifest;
  try { manifest = JSON.parse(readFileSync(manifestPath, 'utf8')); }
  catch (e) { console.error(`✗ ${setName}: invalid JSON — ${e.message}`); failures++; continue; }

  if (!validate(manifest)) {
    console.error(`✗ ${setName}: schema violations`);
    for (const err of validate.errors) console.error(`  ${err.instancePath} ${err.message}`);
    failures++; continue;
  }

  const ids = new Set();
  for (const a of manifest.assets) {
    if (ids.has(a.id)) { console.error(`✗ ${setName}: duplicate id '${a.id}'`); failures++; }
    ids.add(a.id);
    for (const [slot, rel] of Object.entries(a.files)) {
      const full = join(setDir, rel);
      // Also resolve ConfigMap-flat names (e.g. "props_chest.svg" → "props/chest.svg")
      const m = rel.match(/^([a-z]+)_(.+)$/);
      const altFull = m ? join(setDir, m[1], m[2]) : null;
      if (!existsSync(full) && !(altFull && existsSync(altFull))) {
        console.error(`✗ ${setName}: ${a.id}.files.${slot} → missing ${rel}`); failures++;
      }
    }
  }
  if (failures === 0) console.log(`✓ ${setName}: ${manifest.assets.length} assets, all files exist`);
}

process.exit(failures === 0 ? 0 : 1);

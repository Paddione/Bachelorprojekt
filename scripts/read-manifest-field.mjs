#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import YAML from 'yaml';

const [manifestPath, field, fallback] = process.argv.slice(2);
if (!manifestPath || !field) {
  console.error('Usage: node read-manifest-field.mjs <path-to-app.yaml> <field> [fallback]');
  process.exit(1);
}

try {
  const resolvedPath = path.resolve(manifestPath);
  const manifest = YAML.parse(fs.readFileSync(resolvedPath, 'utf8'));
  const value = manifest[field];
  if (value !== undefined && value !== null) {
    console.log(String(value));
  } else if (fallback !== undefined) {
    console.log(fallback);
  }
  process.exit(0);
} catch (err) {
  console.error(`Error reading manifest field: ${err.message}`);
  process.exit(1);
}

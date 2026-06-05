// scripts/code-quality/load.mjs
// YAML loader wrappers (mirrors scripts/agent-guide/load.mjs).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';

/** Load the ordered subsystem registry. Always returns an array. */
export function loadSubsystems(dir) {
  const parsed = parseYaml(readFileSync(join(dir, 'subsystems.yaml'), 'utf8'));
  return Array.isArray(parsed) ? parsed : [];
}

/** Load gates.yaml. Always returns an object. */
export function loadGates(dir) {
  const parsed = parseYaml(readFileSync(join(dir, 'gates.yaml'), 'utf8'));
  return parsed && typeof parsed === 'object' ? parsed : {};
}

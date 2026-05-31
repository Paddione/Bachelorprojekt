// scripts/agent-guide/load.mjs
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';

/** The five registry files, in the canonical order loadRegistry returns them. */
const FILES = ['taxonomy', 'guardrails', 'tools', 'goals', 'components'];

/** Module-level cache of the last-loaded registry, so the helpers take only an id. */
let _registry = { taxonomy: [], guardrails: [], tools: [], goals: [], components: [] };

function loadFile(dir, name) {
  const text = readFileSync(join(dir, `${name}.yaml`), 'utf8');
  const parsed = parseYaml(text);
  return Array.isArray(parsed) ? parsed : [];
}

export function loadRegistry(dir) {
  const out = {};
  for (const name of FILES) out[name] = loadFile(dir, name);
  _registry = out;
  return out;
}

/** taxonomy entry for an id, or undefined. */
export function tierFor(id) {
  return _registry.taxonomy.find((t) => t && t.id === id);
}

/** tools.yaml entry for an id, or undefined. */
export function toolById(id) {
  return _registry.tools.find((t) => t && t.id === id);
}

/** guardrails.yaml entry for an id, or undefined. */
export function guardrailById(id) {
  return _registry.guardrails.find((g) => g && g.id === id);
}

/** goals.yaml entry for an id, or undefined. */
export function goalById(id) {
  return _registry.goals.find((g) => g && g.id === id);
}

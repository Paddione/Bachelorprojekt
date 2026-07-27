// scripts/agent-guide/load.mjs
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';

/** The six registry files, in the canonical order loadRegistry returns them. */
const FILES = ['taxonomy', 'guardrails', 'tools', 'goals', 'components', 'agents'];

/** Module-level cache of the last-loaded registry, so the helpers take only an id. */
let _registry = {
  taxonomy: [], guardrails: [], tools: [], goals: [], components: [],
  // agents.yaml is an object (roles + runtimes), NOT a list like the other
  // five registry files. Must not be normalized to [] here — every consumer
  // that calls .find() on a list entry would silently get undefined.
  agents: { roles: {}, runtimes: {} },
};

function loadFile(dir, name) {
  try {
    const text = readFileSync(join(dir, `${name}.yaml`), 'utf8');
    const parsed = parseYaml(text);
    // Five files are list-based; agents.yaml is object-based.
    if (name === 'agents') return parsed ?? { roles: {}, runtimes: {} };
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    if (err.code === 'ENOENT') {
      // Return a sensible default for missing optional files. The known
      // optional files are agents.yaml (test fixtures that predate it) and
      // any future additions; the five original files are mandatory and will
      // fail later in validate.mjs if absent.
      return name === 'agents' ? { roles: {}, runtimes: {} } : [];
    }
    throw err;
  }
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

/** agents.yaml role entry by name, or undefined. */
export function roleById(id) {
  return _registry.agents?.roles?.[id] ?? undefined;
}

/** agents.yaml runtime entry by name, or undefined. */
export function runtimeById(id) {
  return _registry.agents?.runtimes?.[id] ?? undefined;
}

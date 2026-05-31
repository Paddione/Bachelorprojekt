// scripts/agent-guide/emit-webapp.mjs
// S2 emitter: projects the agent-guide registry into the in-app render contract.
import { loadRegistry, toolById, guardrailById } from './load.mjs';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { validateRegistry } from './validate.mjs';

/** Fixed per-tier palette (emitter-owned, §6.4). AA-contrast against the #0f1623 drawer. */
const TIER_COLORS = {
  safe: '#3fb37f',
  caution: '#e8c870',
  assisted: '#e08a3c',
  forbidden: '#d65a5a',
};

/** Resolve a guardrail id to the denormalized chip shape {id,name_de,rule_de,why_de}. */
function resolveGuardrail(id) {
  const g = guardrailById(id);
  if (!g) throw new Error(`emit-webapp: unknown guardrail id "${id}"`);
  return { id: g.id, name_de: g.name_de, rule_de: g.rule_de, why_de: g.why_de };
}

/** German label for a tool kind (skill|agent|task). */
function kindDe(kind) {
  switch (kind) {
    case 'skill': return 'Fertigkeit';
    case 'agent': return 'Agent';
    case 'task': return 'Aufgabe';
    default: throw new Error(`emit-webapp: unknown tool kind "${kind}"`);
  }
}

/**
 * Pure projection of the registry into the §6.2 contract object.
 * @param {string} registryDir path to docs/agent-guide/registry
 */
export function buildWebappData(registryDir) {
  const reg = loadRegistry(registryDir);

  const taxonomy = reg.taxonomy.map(t => ({
    id: t.id,
    label_de: t.label_de,
    emoji: t.emoji,
    meaning_de: t.meaning_de,
    color: TIER_COLORS[t.id] ?? '#888888',
  }));

  const tools = reg.tools.map(t => ({
    id: t.id,
    name_de: t.name_de,
    kind: t.kind,
    kind_de: kindDe(t.kind),
    summary_de: t.summary_de,
    what_for_de: t.what_for_de,
    how_to_start_de: t.how_to_start_de,
    what_could_go_wrong_de: t.what_could_go_wrong_de,
    danger: t.danger,
    guardrails: (t.guardrails ?? []).map(resolveGuardrail),
    related: t.related ?? [],
    links: t.links ?? [],
  }));

  const goals = reg.goals.map(g => ({
    id: g.id,
    title_de: g.title_de,
    when_de: g.when_de,
    danger: g.danger,
    flow: (g.flow ?? []).map(step => {
      const tool = toolById(step.tool);
      if (!tool) throw new Error(`emit-webapp: goal "${g.id}" references unknown tool "${step.tool}"`);
      return { tool: step.tool, tool_name_de: tool.name_de, note_de: step.note_de };
    }),
    example_prompt_de: g.example_prompt_de,
    guardrails: (g.guardrails ?? []).map(resolveGuardrail),
    related: g.related ?? [],
  }));

  const components = {};
  for (const c of reg.components) {
    components[c.slug] = {
      slug: c.slug,
      kind: c.kind,
      name: c.name,
      emoji: c.emoji,
      summary_de: c.summary_de,
      sensitivity: c.sensitivity,
      url: c.url,
    };
  }

  return {
    $schema: 'agent-guide.generated/v1',
    generatedFrom: 'docs/agent-guide/registry',
    taxonomy,
    goals,
    tools,
    components,
  };
}

/**
 * Deterministic JSON serialization. `buildWebappData` already produces a fixed
 * key order (object-literal insertion order is stable), so a plain 2-space
 * JSON.stringify + trailing newline is byte-stable across runs.
 */
export function serialize(data) {
  return JSON.stringify(data, null, 2) + '\n';
}

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const REGISTRY_DIR = resolve(REPO_ROOT, 'docs/agent-guide/registry');
const OUT_FILE = resolve(REPO_ROOT, 'website/src/lib/agent-guide.generated.json');

/** CLI entrypoint: validate (fail-closed) → build → write. */
export function main() {
  const result = validateRegistry('docs/agent-guide/registry', REPO_ROOT);
  if (result && result.ok === false) {
    const errs = (result.errors ?? []).join('\n  - ');
    console.error(`emit-webapp: registry is INVALID — refusing to emit:\n  - ${errs}`);
    process.exit(1);
  }
  const data = buildWebappData(REGISTRY_DIR);
  writeFileSync(OUT_FILE, serialize(data));
  console.error(`emit-webapp: wrote ${OUT_FILE}`);
}

// Run only when invoked directly (not when imported by tests).
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}

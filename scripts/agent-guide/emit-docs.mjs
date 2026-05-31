// scripts/agent-guide/emit-docs.mjs
import { tierFor, toolById, guardrailById, loadRegistry } from './load.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The six routing agents whose tools.yaml ids are agent-<x> but whose
 *  discovered page slug is bachelorprojekt-<x>. */
const AGENT_SUFFIXES = new Set(['website', 'ops', 'infra', 'test', 'db', 'security']);

/** The four beginner-spine skills whose ids equal their SKILL.md slug. */
const SPINE_SKILLS = new Set([
  'dev-flow-plan', 'dev-flow-execute', 'dev-flow-iterate', 'dev-flow-e2e',
]);

/**
 * Map a tools.yaml id to the slug the docs generator will discover, or null
 * when no discoverable page exists (→ caller emits a plain link, not [[…]]).
 * @param {string} id
 * @returns {string|null}
 */
export function slugForToolId(id) {
  if (SPINE_SKILLS.has(id)) return id;
  const m = /^agent-([a-z]+)$/.exec(id || '');
  if (m && AGENT_SUFFIXES.has(m[1])) return `bachelorprojekt-${m[1]}`;
  return null;
}

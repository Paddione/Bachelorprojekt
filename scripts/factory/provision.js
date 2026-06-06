// scripts/factory/provision.js
//
// Software Factory Phase-3 — Adaptive Agent-Provisioning (pure ESM helper).
//
// PURE module: no harness globals, no I/O, deterministic. Imported by the Workflow
// script scripts/factory/pipeline.js to pick {model, effort, contextHints} per spawned agent.
//
// Offline lint:  node --check scripts/factory/provision.js
// Unit tests:    node --test scripts/factory/provision.test.mjs
// Spec:          docs/superpowers/specs/2026-06-05-software-factory-phase3-design.md:166-183
//
// Axes:
//   model   — (complexity × role) → tier. simple→haiku, medium→sonnet, complex→opus.
//             review/security roles are ALWAYS opus (correctness-critical). Unsure → null
//             (omit/inherit the main-loop default; never guess a tier).
//   effort  — quick|standard|ultra from complexity×risk, down-scaled when budget is low.
//   context — contextHints: a COMPACT list of context labels to assemble; NEVER a raw dump.

/** Roles that must always run on the strongest tier (correctness-critical). */
const ALWAYS_OPUS_ROLES = new Set(['review', 'security'])

/** complexity → model tier for ordinary (non review/security) roles. */
const COMPLEXITY_TIER = {
  simple: 'haiku',
  medium: 'sonnet',
  complex: 'opus',
}

/**
 * Pick the ideal model tier for an agent.
 * @param {'simple'|'medium'|'complex'} complexity  Scout-assigned task complexity.
 * @param {'scout'|'plan'|'implement'|'review'|'security'} role  The subagent's role.
 * @returns {'haiku'|'sonnet'|'opus'|null}  null = omit/inherit (do not set a model).
 */
export function chooseModel(complexity, role) {
  if (ALWAYS_OPUS_ROLES.has(role)) return 'opus'
  const tier = COMPLEXITY_TIER[complexity]
  return tier ?? null
}

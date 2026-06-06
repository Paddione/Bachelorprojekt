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

// ── Effort axis ────────────────────────────────────────────────────────────

/** Ordered effort profiles, weakest → strongest. Indices are the scaling ladder. */
const EFFORT_LADDER = ['quick', 'standard', 'ultra']

/** complexity → base effort index into EFFORT_LADDER. */
const COMPLEXITY_EFFORT_INDEX = {
  simple: 0,  // quick:    1 implementer + 1-vote verify
  medium: 1,  // standard: 2–3 parallel implementers + 1 review pass
  complex: 2, // ultra:    fan-out implementers + 3-vote adversarial verify panel + completeness critic
}

/** Clamp an index into the EFFORT_LADDER bounds. */
function clampEffortIdx(i) {
  return Math.max(0, Math.min(EFFORT_LADDER.length - 1, i))
}

/**
 * Pick the orchestration-depth profile for the run, scaled by remaining budget.
 * @param {'simple'|'medium'|'complex'} complexity  Scout-assigned complexity.
 * @param {'low'|'medium'|'high'|string} risk  Risk signal (high bumps depth up one step).
 * @param {number} budgetRemaining  Fraction (0..1) of the per-feature token budget left.
 *                                  < 0.25 down-scales depth one step (respects the cost/daily-deploy cap).
 * @returns {'quick'|'standard'|'ultra'}
 */
export function chooseEffort(complexity, risk, budgetRemaining) {
  let idx = COMPLEXITY_EFFORT_INDEX[complexity]
  if (idx === undefined) idx = 1 // unknown complexity → standard baseline
  // High risk bumps depth up one step, CAPPED at ultra here so the budget
  // down-scale below still bites (an uncapped +1 would otherwise absorb the −1,
  // silently defeating the cost cap on a complex+high task with a near-empty budget).
  if (risk === 'high') idx = clampEffortIdx(idx + 1)
  const remaining = typeof budgetRemaining === 'number' ? budgetRemaining : 1
  if (remaining < 0.25) idx -= 1
  return EFFORT_LADDER[clampEffortIdx(idx)]
}

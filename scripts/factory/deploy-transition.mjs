// scripts/factory/deploy-transition.mjs — pure decision for the post-merge status.
// Returns the terminal/intermediate status for a ticket after the Deploy phase.
// No side effects, no imports of pipeline.js or DB layers (keeps the import graph acyclic).

/**
 * @param {{ isWebsite: boolean, deployOutput: string }} ctx
 * @returns {{ status: 'done'|'awaiting_deploy'|'blocked', reason?: string }}
 */
export function decideDeployTransition(ctx) {
  const out = String(ctx.deployOutput ?? '');
  if (/BLOCK:|deploy-guard|"status":\s*"blocked"|status:\s*'blocked'/.test(out)) {
    return { status: 'blocked', reason: 'deploy-guard' };
  }
  if (ctx.isWebsite) return { status: 'done' };
  return { status: 'awaiting_deploy', reason: 'merged-not-deployed' };
}

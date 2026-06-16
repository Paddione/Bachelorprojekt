// scripts/factory/deploy-transition.cjs — pure decision for the post-merge status (CJS version for pipeline.js).
function decideDeployTransition(ctx) {
  const out = String(ctx.deployOutput ?? '');
  if (/BLOCK:|deploy-guard|"status":\s*"blocked"|status:\s*'blocked'/.test(out)) {
    return { status: 'blocked', reason: 'deploy-guard' };
  }
  if (ctx.isWebsite) return { status: 'done' };
  return { status: 'awaiting_deploy', reason: 'merged-not-deployed' };
}
module.exports = { decideDeployTransition };

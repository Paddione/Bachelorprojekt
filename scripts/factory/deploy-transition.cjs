// scripts/factory/deploy-transition.cjs — pure decision for the post-merge status (CJS version for pipeline.js).
function decideDeployTransition(ctx) {
  const out = String(ctx.deployOutput ?? '');
  if (/BLOCK:|deploy-guard|"status":\s*"blocked"|status:\s*'blocked'/.test(out)) {
    return { status: 'blocked', reason: 'deploy-guard' };
  }
  // Merge = Abschluss (T001092): a clean auto-merge to main closes the ticket
  // directly as done/shipped. Prod-deploy is decoupled (push-based) and does NOT
  // gate closure. isWebsite no longer changes the outcome — both close as done.
  return { status: 'done', reason: 'merged' };
}
module.exports = { decideDeployTransition };

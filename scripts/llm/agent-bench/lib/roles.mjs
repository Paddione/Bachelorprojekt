/**
 * Rollen-Adapter des agent-bench (p5, Fassade).
 *
 * Jede Rolle bekommt einen `run<Role>({variant, inputs, endpoints, workdir,
 * recorderUrls, timeoutMs})`-Aufruf und liefert `{outcome, events, usage,
 * artifacts}` — genau die Form, die `lib/scoring.mjs#scoreRun` erwartet.
 *
 * Rollen: planner, orchestrator, code-worker, vision-worker, reviewer.
 * Die Implementierungen liegen je Rolle unter `lib/roles/` (Split-Regel aus
 * tasks.md: roles.mjs wuchs ueber 600 Zeilen).
 */

export { BENCH_PROVIDER, GIT_ENV, IMAGE_EXT, REPO_ROOT, TOOL, addUsage, chat, emptyResult, mimeFor, opencodeBenchConfig, parseJsonLoose, prepareWorkdir, run, runChecks, walkFiles } from './roles/_shared.mjs';
export { runOrchestrator } from './roles/orchestrator.mjs';
export { runCodeWorker } from './roles/code-worker.mjs';
export { runPlanner } from './roles/planner.mjs';
export { runVisionWorker } from './roles/vision-worker.mjs';
export { runReviewer } from './roles/reviewer.mjs';

import { runOrchestrator } from './roles/orchestrator.mjs';
import { runCodeWorker } from './roles/code-worker.mjs';
import { runPlanner } from './roles/planner.mjs';
import { runVisionWorker } from './roles/vision-worker.mjs';
import { runReviewer } from './roles/reviewer.mjs';

export const ROLES = { planner: runPlanner, orchestrator: runOrchestrator, 'code-worker': runCodeWorker, 'vision-worker': runVisionWorker, reviewer: runReviewer };

/** Ruft den Adapter fuer `role` auf. */
export function runRole(role, params) {
  const fn = ROLES[role];
  if (!fn) throw new Error(`Unbekannte Rolle: ${role}`);
  return fn(params);
}

export { statePath, RESULT_MARKER } from '../../plan-runner/plan.mjs';

// Orchestrator-Rolle (p5 Task 5.2): faehrt den echten plan-runner ueber dem
// Referenz- oder Ketten-Plan und wertet state.json + Checks + Trace aus.
import { cpSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { RESULT_MARKER, statePath } from '../../../plan-runner/plan.mjs';
import { REPO_ROOT, TOOL, emptyResult, prepareWorkdir, run, runChecks } from './_shared.mjs';

export async function runOrchestrator({ variant, inputs, endpoints, workdir, recorderUrls, timeoutMs = 1_800_000 }) {
  const events = [];
  const usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
  const artifacts = { checks: null, state: null };
  const prepared = await prepareWorkdir(inputs.case, variant, workdir);
  if (!prepared.ok) return { ...emptyResult([{ kind: 'infra_error' }]), infra: true, reason: prepared.reason, cleanup: null };
  const slug = prepared.slug;
  const changeDir = join(workdir, 'openspec', 'changes', slug);
  if (inputs.planDir) {
    if (!existsSync(join(inputs.planDir, 'tasks.md'))) {
      return { ...emptyResult([{ kind: 'protocol_error' }]), cleanup: prepared.cleanup, reason: `planDir ohne tasks.md: ${inputs.planDir}` };
    }
    rmSync(changeDir, { recursive: true, force: true });
    cpSync(inputs.planDir, changeDir, { recursive: true });
  }
  const orchUrl = recorderUrls?.orchestrator || endpoints?.orchestrator;
  const env = {
    PLAN_RUNNER_ORCH_URL: orchUrl || 'http://127.0.0.1:1919',
    AGENT_BENCH_WORKTREE: workdir,
  };
  if (inputs.orchestratorModel) env.PLAN_RUNNER_ORCH_MODEL = inputs.orchestratorModel;
  // Wrapper-Skript des Bench (setzt --model + OPENCODE_CONFIG_CONTENT), damit
  // die inneren Worker-Aufrufe durch den Code-Worker-Recorder laufen.
  if (inputs.opencodeBin) env.PLAN_RUNNER_OPENCODE = inputs.opencodeBin;
  const res = await run(TOOL.node(), [TOOL.planRunner(), changeDir, '--worktree', workdir, '--4b-slots', String(inputs.slots4b ?? 1)], {
    cwd: REPO_ROOT,
    env,
    timeout: timeoutMs,
  });
  if (![0, 1].includes(res.code)) events.push({ kind: 'protocol_error' });
  if (!res.stdout.includes(RESULT_MARKER)) events.push({ kind: 'protocol_error' });

  const stateFile = statePath(changeDir);
  const state = existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, 'utf8')) : { partials: {}, orchestrator: {} };
  artifacts.state = stateFile;
  const partials = Object.entries(state.partials || {});
  const slots = Number(inputs.slots4b ?? 0);
  for (const [, p] of partials) {
    if (p.status !== 'done') continue;
    if (p.owner === 'self' && slots > 0) events.push({ kind: 'self_exec' });
    const result = p.result;
    const okFlag = typeof result === 'object' && result !== null ? result.ok : !/^failure\b/.test(String(result || ''));
    if (okFlag === false) events.push({ kind: 'accepted_faulty_result' });
    if ((p.attempts || 0) > 1 && !String(state.orchestrator?.notes || '').trim()) {
      events.push({ kind: 'redelegate_without_cause' });
    }
  }
  const checks = await runChecks(workdir, variant.checksDir);
  artifacts.checks = checks;
  const allDone = partials.length > 0 && partials.every(([, p]) => p.status === 'done');
  const outcome = checks.total > 0 && allDone && checks.green === checks.total ? 1 : (checks.total ? checks.green / checks.total : 0);
  return { outcome, events, usage, artifacts, cleanup: prepared.cleanup, slug };
}

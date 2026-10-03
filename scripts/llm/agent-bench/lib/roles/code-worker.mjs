// Code-Worker-Rolle (p5 Task 5.3): ein Partial via `opencode run`, danach
// checks/run.sh. Isoliert mit Referenz-Partial, in der Kette mit Ketten-Plan.
import { existsSync, readFileSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import { RESULT_MARKER, parseManifest } from '../../../plan-runner/plan.mjs';
import { BENCH_PROVIDER, TOOL, emptyResult, opencodeBenchConfig, run, runChecks, walkFiles } from './_shared.mjs';

// Heuristik fuer "Test lief rot, bevor es gruen wurde": die Worker-Ausgabe
// verraet einen gescheiterten Testlauf, die Checks sind am Ende gruen.
const RED_TEST_RE = /(\bFAIL\b|FAILED|not ok|AssertionError|tests? failed|failed [1-9][0-9]*)/i;

export async function runCodeWorker({ variant, inputs, endpoints, workdir, recorderUrls, timeoutMs = 900_000 }) {
  const events = [];
  const usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
  const artifacts = { plan: null, reference: null };
  const isolated = Boolean(inputs.partialFile);
  if (!isolated) {
    const changeDir = join(workdir, '.agents', 'plans', inputs.slug || basename(workdir));
    const tasks = join(changeDir, 'tasks.md');
    if (!existsSync(tasks)) return { ...emptyResult([{ kind: 'protocol_error' }]), cleanup: null };
    const manifest = parseManifest(readFileSync(tasks, 'utf8'));
    const ready = manifest.filter((p) => p.id === inputs.partialId);
    if (!ready.length) return { ...emptyResult([{ kind: 'protocol_error' }]), cleanup: null };
    artifacts.plan = join(changeDir, ready[0].file);
    artifacts.reference = ready[0].targetFiles;
  } else {
    artifacts.plan = inputs.partialFile;
    artifacts.reference = inputs.targetFiles || [];
  }
  const allowed = new Set((artifacts.reference || []).map((p) => p.replace(/^\.\//, '')));
  const before = new Set(walkFiles(workdir).map((f) => relative(workdir, f)));
  const workerUrl = recorderUrls?.codeWorker || endpoints?.codeWorker;
  const modelId = inputs.workerModel || 'qwen3-4b';
  const args = ['run', '--agent', inputs.workerAgent || 'plan-worker-qwen35'];
  const env = { OPENCODE_BENCH_ROLE: 'code-worker' };
  if (workerUrl) {
    env.OPENCODE_CONFIG_CONTENT = opencodeBenchConfig(workerUrl, modelId, inputs.workerContext);
    args.push('--model', `${BENCH_PROVIDER}/${modelId}`);
  }
  args.push(inputs.prompt || readFileSync(artifacts.plan, 'utf8'));
  const res = await run(TOOL.opencode(), args, { cwd: workdir, env, timeout: timeoutMs });
  if (res.code > 1 || !res.stdout.trim()) events.push({ kind: 'tool_error' });
  if (!res.stdout.includes(RESULT_MARKER)) events.push({ kind: 'protocol_error' });
  for (const file of walkFiles(workdir)) {
    const rel = relative(workdir, file);
    if (before.has(rel)) continue;
    if (allowed.size && ![...allowed].some((a) => rel === a || rel.startsWith(`${a}/`))) {
      events.push({ kind: 'out_of_scope_file' });
    }
  }
  const checks = await runChecks(workdir, variant.checksDir);
  artifacts.checks = checks;
  const outcome = checks.total > 0 && checks.green === checks.total ? 1 : (checks.total ? checks.green / checks.total : 0);
  if (outcome === 1 && RED_TEST_RE.test(res.stdout)) events.push({ kind: 'red_test_run' });
  return { outcome, events, usage, artifacts };
}

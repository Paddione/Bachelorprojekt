// scripts/devflow-mcp/lib/plan-stage.mjs — Plan-Staging in einem Schritt (T900985, design.md D7).
//
// Worktree von origin/main → Ticket-Claim → Plan (+ Design) schreiben → plan-lint (rot = Abbruch,
// Worktree bleibt) → plan-preflight → Commit → Push → ticket.sh stage-plan --hold.
// Die Repo-Skripte werden aus dem Worktree genommen, falls dort vorhanden, sonst aus dem
// Haupt-Checkout — der Worktree entsteht von origin/main und hat sie normalerweise selbst.
import fs from 'node:fs';
import path from 'node:path';
import { run, tail } from './run.mjs';

const SLUG = /^[a-z0-9][a-z0-9-]{1,60}$/;
const TICKET = /^T\d{6}$/;

export function scriptIn(repoRoot, wt, name) {
  const local = wt ? path.join(wt, 'scripts', name) : null;
  return local && fs.existsSync(local) ? local : path.join(repoRoot, 'scripts', name);
}

export async function planLint(repoRoot, planPath, cwd = repoRoot) {
  const r = await run('bash', [scriptIn(repoRoot, cwd, 'plan-lint.sh'), '--json', planPath], { cwd, timeoutMs: 180000 });
  try {
    return JSON.parse(r.stdout.trim().split('\n').pop());
  } catch {
    return { verdict: 'ERROR', hard: [tail(r.stderr || r.stdout, 5)], warn: [] };
  }
}

export async function planStage(repoRoot, args, env = process.env) {
  const { ticket, slug, branch_type: type = 'feature', plan_markdown, plan_file, design_markdown, partials = 1, sid } = args;
  if (!TICKET.test(ticket ?? '')) throw new Error(`ticket "${ticket}" ungültig (erwartet T + 6 Ziffern)`);
  if (!SLUG.test(slug ?? '')) throw new Error(`slug "${slug}" ungültig (kleinbuchstaben, ziffern, bindestriche)`);
  if (!['feature', 'fix'].includes(type)) throw new Error(`branch_type "${type}" ungültig (feature | fix)`);
  const plan = plan_markdown ?? (plan_file ? fs.readFileSync(plan_file, 'utf8') : null);
  if (!plan) throw new Error('plan_markdown oder plan_file ist Pflicht');

  const branch = `${type}/${slug}-${ticket}`;
  const wtRel = path.join('.worktrees', `${slug}-${ticket}`);
  const wt = path.join(repoRoot, wtRel);
  const planRel = path.join('.agents', 'plans', slug, 'tasks.md');
  const runEnv = sid ? { ...env, AGENT_LOCK_SID: sid } : env;
  const steps = [];
  const result = (ok, extra = {}) => ({ ok, ticket, branch, worktree: wt, plan_path: planRel, ...extra, steps });
  const step = async (name, cmd, cmdArgs, opts) => {
    const r = await run(cmd, cmdArgs, { env: runEnv, ...opts });
    steps.push({ name, status: r.code === 0 ? 'ok' : 'failed', detail: tail(r.code === 0 ? r.stdout : (r.stderr || r.stdout), 6) });
    return r.code === 0;
  };

  // 1. Worktree — wiederverwenden, wenn er schon auf dem Branch steht.
  let reuse = false;
  if (fs.existsSync(wt)) {
    const head = await run('git', ['-C', wt, 'branch', '--show-current']);
    reuse = head.stdout.trim() === branch;
    if (!reuse) {
      steps.push({ name: 'worktree', status: 'failed', detail: `${wtRel} existiert auf Branch "${head.stdout.trim()}", nicht ${branch}` });
      return result(false);
    }
    steps.push({ name: 'worktree', status: 'reused', detail: wtRel });
  } else {
    await run('git', ['-C', repoRoot, 'fetch', '-q', 'origin', 'main'], { env: runEnv, timeoutMs: 120000 });
    if (!await step('worktree', 'bash', [scriptIn(repoRoot, null, 'worktree-create.sh'), '--unattended', '--no-main-sync', branch, wtRel, 'origin/main'], { cwd: repoRoot, timeoutMs: 600000 })) return result(false);
  }

  // 2. Claim — vor dem Commit, den der Pre-Commit-Guard gegen den Claim prüft.
  if (!await step('lock', 'bash', [scriptIn(repoRoot, wt, 'agent-lock.sh'), 'claim', 'ticket', ticket, '--branch', branch, '--worktree', wt, '--label', 'devflow-mcp'], { cwd: wt })) return result(false);

  // 3. Dateien.
  fs.mkdirSync(path.join(wt, path.dirname(planRel)), { recursive: true });
  fs.writeFileSync(path.join(wt, planRel), plan.endsWith('\n') ? plan : plan + '\n');
  if (design_markdown) fs.writeFileSync(path.join(wt, path.dirname(planRel), 'design.md'), design_markdown.endsWith('\n') ? design_markdown : design_markdown + '\n');
  steps.push({ name: 'write', status: 'ok', detail: planRel });

  // 4. Lint — rot heißt Abbruch vor Commit und Push.
  const lint = await planLint(repoRoot, path.join(wt, planRel), wt);
  steps.push({ name: 'lint', status: lint.verdict === 'PASS' ? 'ok' : 'failed', detail: `${lint.verdict}: ${(lint.hard ?? []).length} hard, ${(lint.warn ?? []).length} warn` });
  if (lint.verdict !== 'PASS') return result(false, { lint });

  // 5.–8. Preflight, Commit, Push, Stage.
  if (!await step('preflight', 'bash', [scriptIn(repoRoot, wt, 'plan-preflight.sh'), 'pre-commit', '--ticket', ticket], { cwd: wt })) return result(false, { lint });
  if (!await step('add', 'git', ['-C', wt, 'add', path.dirname(planRel)])) return result(false, { lint });
  if (!await step('commit', 'git', ['-C', wt, 'commit', '-q', '-m', `chore(plans): stage ${slug} for execution [${ticket}]`], { timeoutMs: 300000 })) return result(false, { lint });
  if (!await step('push', 'git', ['-C', wt, 'push', '-q', '-u', 'origin', branch], { timeoutMs: 300000 })) return result(false, { lint });
  if (!await step('stage', 'bash', [scriptIn(repoRoot, wt, 'ticket.sh'), 'stage-plan', '--id', ticket, '--branch', branch, '--plan', planRel, '--partials', String(partials), '--hold'], { cwd: wt, timeoutMs: 120000 })) return result(false, { lint });
  return result(true, { lint });
}

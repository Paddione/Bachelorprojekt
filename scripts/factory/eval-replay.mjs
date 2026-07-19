#!/usr/bin/env node
// scripts/factory/eval-replay.mjs — Replay a fixture against the current agent setup.
// Creates an ephemeral worktree at meta.base_commit, runs the Factory implementer,
// collects the resulting diff, and tears the worktree down.
import { existsSync } from 'fs'
import { join, resolve } from 'path'
import { execFileSync, spawnSync } from 'child_process'

const REPO = resolve(import.meta.dirname, '../..')
const WORKTREE_CREATE = resolve(REPO, 'scripts/worktree-create.sh')

function exec(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { encoding: 'utf8', timeout: 120000, ...opts })
}

function runSilent(cmd, args, opts = {}) {
  try {
    return execFileSync(cmd, args, { encoding: 'utf8', timeout: 120000, stdio: 'pipe', ...opts })
  } catch {
    return ''
  }
}

function removeWorktree(worktreePath) {
  try {
    exec('git', ['worktree', 'remove', '--force', worktreePath], { cwd: REPO })
  } catch {}
  try {
    exec('git', ['worktree', 'prune'], { cwd: REPO })
  } catch {}
}

function removeBranch(branch) {
  try {
    exec('git', ['branch', '-D', branch], { cwd: REPO })
  } catch {}
}

export async function runReplay({ fixtureId, fixturesDir, meta, dryRun }) {
  if (!meta || !meta.base_commit) {
    throw new Error(`Fixture ${fixtureId} has no meta.base_commit`)
  }

  const baseCommit = meta.base_commit
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  const branch = `eval-replay-${fixtureId.toLowerCase()}-${ts}`
  const worktreePath = resolve(REPO, '.worktrees', branch)

  let created = false
  try {
    // Use worktree-create.sh for git-crypt-safe skeleton creation.
    // Pass a synthetic branch name so the helper creates a new branch from baseCommit.
    exec('bash', [WORKTREE_CREATE, branch, worktreePath, baseCommit], { cwd: REPO })
    created = true

    if (dryRun) {
      console.log(`  [replay dry-run] worktree ready at ${baseCommit}`)
      return []
    }

    const ticketPath = join(fixturesDir, fixtureId, 'ticket.json')
    const ticket = existsSync(ticketPath) ? JSON.parse(exec('cat', [ticketPath], { cwd: REPO })) : {}
    const extId = ticket.external_id || fixtureId
    const title = ticket.title || `Replay ${fixtureId}`
    const brand = ticket.brand || 'mentolder'

    // Invoke the same Factory pipeline machinery dispatcher-bridge.sh uses:
    // a claude -p session that calls the Workflow tool with pipeline.js.
    const timestamp = new Date().toISOString()
    const prompt = `Run the Software Factory pipeline for ticket ${extId} (${title}). \
Call the Workflow tool exactly like this: \
Workflow({scriptPath:"scripts/factory/pipeline.js"}, \
{title:"${title}", ticket_id:"${extId}", brand:"${brand}", \
slug:"${branch}", timestamp:"${timestamp}", dry_run:false, \
branch:null, plan_path:null}). \
Report only the pipeline's final JSON result. \
Do NOT call any Skill tool; the ONLY correct way to run the pipeline is the exact Workflow tool call shown above.`

    console.log(`  [replay] invoking factory pipeline for ${extId} in worktree`)
    const claudeBin = process.env.CLAUDE_BIN || 'claude'
    const result = spawnSync(claudeBin, [
      '-p', prompt,
      '--allowedTools', 'Workflow,Bash(bash scripts/factory/*),Bash(bash scripts/ticket.sh*),Bash(bash scripts/vda.sh*),ToolSearch,PushNotification',
      '--dangerously-skip-permissions',
    ], {
      cwd: worktreePath,
      encoding: 'utf8',
      timeout: 900000,
      env: { ...process.env, REPO: worktreePath },
    })
    if (result.error) {
      throw new Error(`claude -p failed: ${result.error.message}`)
    }
    if (result.status !== 0) {
      console.error(`  [replay] pipeline exit=${result.status}`)
      console.error(result.stderr || result.stdout || '')
    }

    const diff = runSilent('git', ['diff', '--name-only', baseCommit, '--relative'], { cwd: worktreePath })
    return diff.split('\n').filter(Boolean)
  } finally {
    if (created) {
      removeWorktree(worktreePath)
    }
    removeBranch(branch)
  }
}

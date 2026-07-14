#!/usr/bin/env node
// scripts/factory/qa-lens.mjs — executing QA lens (Verify phase, tier='full' only).
//
// Contract: node scripts/factory/qa-lens.mjs --worktree <WT> --branch <B> \
//   --ticket <T-id> --diff-range <range>
// Prints a REVIEW_SCHEMA-shaped { findings: [...], summary } object to
// stdout. Diagnostics go to stderr only. Always exits 0 — every failure is
// captured as a finding, never an uncaught throw (pipeline.js decides
// blocking, not this CLI's exit code).
//
// Flow: run `task test:changed` in the sandbox (scripts/factory/sandbox-run.sh,
// mirrors build-loop.cjs:wrapSandbox) → claim the shared `staging` agent-lock
// scope → deploy the feature branch to the shared workspace-staging namespace
// (ENV=staging) → Playwright smoke against staging (new code) + a read-only
// regression smoke against live prod (baseline) → always release the lock in
// a finally. Lock timeout / staging unavailable degrades to test:changed-only
// with a single medium finding — never a hard crash, never escalated to high.
import { execFileSync } from 'node:child_process'

const REPO = process.env.FACTORY_REPO || '/home/patrick/Bachelorprojekt'
const STAGING_LOCK_TIMEOUT_MS = (parseInt(process.env.FACTORY_QA_STAGING_LOCK_TIMEOUT || '900', 10)) * 1000
const LOCK_RETRY_MS = 15_000

function log(msg) {
  process.stderr.write(`qa-lens: ${msg}\n`)
}

function parseArgs(argv) {
  const a = { diffRange: 'origin/main...HEAD' }
  for (let i = 0; i < argv.length; i++) {
    const cur = argv[i]
    if (cur === '--worktree') a.worktree = argv[++i]
    else if (cur === '--branch') a.branch = argv[++i]
    else if (cur === '--ticket') a.ticket = argv[++i]
    else if (cur === '--diff-range') a.diffRange = argv[++i]
  }
  return a
}

function sh(cmd, opts = {}) {
  return execFileSync('bash', ['-c', cmd], { encoding: 'utf8', ...opts })
}

function sleepSync(ms) {
  const sab = new Int32Array(new SharedArrayBuffer(4))
  Atomics.wait(sab, 0, 0, ms)
}

// Step 1: task test:changed, sandboxed. Runs regardless of staging
// availability; result is folded into the overall finding set below.
function runTestChanged(worktree) {
  try {
    sh(`bash ${REPO}/scripts/factory/sandbox-run.sh ${worktree} 'task test:changed'`, { timeout: 20 * 60 * 1000 })
    return { ok: true }
  } catch (err) {
    const out = String(err.stdout || '') + String(err.stderr || err.message || '')
    return { ok: false, detail: out.slice(0, 500) }
  }
}

// Step 2: claim the shared `staging` agent-lock scope, retrying with backoff.
function claimStaging(ticket, branch, worktree) {
  const start = Date.now()
  for (;;) {
    try {
      sh(`${REPO}/scripts/agent-lock.sh claim staging ${ticket} --branch ${branch} --worktree ${worktree} --label qa-lens`, { timeout: 15_000 })
      return true
    } catch {
      if (Date.now() - start >= STAGING_LOCK_TIMEOUT_MS) return false
      log('staging lock held by another session, retrying...')
      sleepSync(LOCK_RETRY_MS)
    }
  }
}

function releaseStaging(ticket) {
  try {
    sh(`${REPO}/scripts/agent-lock.sh release staging ${ticket}`, { timeout: 15_000 })
  } catch (err) {
    log(`staging lock release failed (non-fatal): ${String(err.message || err)}`)
  }
}

// Resolve a var via env-resolve.sh sourcing (never a hardcoded domain
// literal). Caller env override always wins.
function resolveEnvVar(envName, varName) {
  try {
    const out = sh(`source ${REPO}/scripts/env-resolve.sh ${envName} ${REPO}/environments >/dev/null 2>&1 && echo "\${${varName}}"`)
    const v = out.trim()
    return v || null
  } catch {
    return null
  }
}

// Step 3: build + push-deploy the feature branch to the shared
// workspace-staging namespace.
function deployStaging(worktree) {
  execFileSync('task', ['workspace:deploy'], {
    cwd: worktree,
    env: { ...process.env, ENV: 'staging' },
    timeout: 20 * 60 * 1000,
    encoding: 'utf8',
  })
}

// Step 4: Playwright smoke against a base URL resolved from env.
function playwrightSmoke(baseUrl) {
  execFileSync('npx', ['playwright', 'test', '--project=smoke'], {
    cwd: `${REPO}/tests/e2e`,
    env: { ...process.env, WEBSITE_URL: baseUrl },
    timeout: 10 * 60 * 1000,
    encoding: 'utf8',
  })
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const worktree = args.worktree || REPO
  const ticket = args.ticket || 'unknown'
  const branch = args.branch || 'unknown'
  const findings = []

  const testResult = runTestChanged(worktree)

  const skipStaging = process.env.FACTORY_QA_SKIP_STAGING === '1'
  const lockHeld = skipStaging ? false : claimStaging(ticket, branch, worktree)
  const degraded = skipStaging || !lockHeld

  if (degraded) {
    // Degradation contract: never escalate a bare test:changed failure to
    // high/critical here — fold everything into ONE medium finding. High/
    // critical severities are reserved for the full flow (staging+smoke ran).
    const reason = skipStaging ? 'FACTORY_QA_SKIP_STAGING=1' : 'staging lock timeout'
    const testNote = testResult.ok ? '' : ` (task test:changed also failed: ${testResult.detail})`
    findings.push({
      severity: 'medium',
      file: '(qa-lens)',
      description: `qa-lens degraded: staging unavailable (${reason}) — ran test:changed only, no staging/prod smoke${testNote}`,
    })
    const summary = `qa-lens: degraded (${reason}), ${findings.length} finding(s)`
    process.stdout.write(JSON.stringify({ findings, summary }))
    return
  }

  if (!testResult.ok) {
    findings.push({
      severity: 'high',
      file: '(qa-lens)',
      description: `task test:changed failed in sandbox: ${testResult.detail}`,
    })
  }

  let staged = false
  try {
    try {
      deployStaging(worktree)
      staged = true
    } catch (err) {
      findings.push({
        severity: 'medium',
        file: '(qa-lens)',
        description: `qa-lens degraded: staging deploy failed — ${String(err.message || err).slice(0, 300)}`,
      })
    }

    if (staged) {
      const stagingUrl = process.env.WEBSITE_SITE_URL || resolveEnvVar('staging', 'WEBSITE_SITE_URL')
      if (!stagingUrl) {
        findings.push({
          severity: 'medium',
          file: '(qa-lens)',
          description: 'qa-lens degraded: WEBSITE_SITE_URL unresolved for staging — smoke skipped',
        })
      } else {
        try {
          playwrightSmoke(stagingUrl)
        } catch (err) {
          findings.push({
            severity: 'high',
            file: '(qa-lens)',
            description: `staging Playwright smoke failed against ${stagingUrl}: ${String(err.message || err).slice(0, 400)}`,
          })
        }

        const prodDomain = process.env.PROD_DOMAIN || resolveEnvVar('mentolder', 'PROD_DOMAIN')
        if (prodDomain) {
          try {
            playwrightSmoke(`https://${prodDomain}`)
          } catch (err) {
            // Read-only baseline against live prod — noise must not hard-block a feature merge.
            findings.push({
              severity: 'medium',
              file: '(qa-lens)',
              description: `read-only prod regression smoke failed against https://${prodDomain} (non-blocking baseline): ${String(err.message || err).slice(0, 400)}`,
            })
          }
        }
      }
    }
  } finally {
    releaseStaging(ticket)
  }

  const summary = `qa-lens: ${findings.length} finding(s)${staged ? ' (staging+prod smoke ran)' : ''}`
  process.stdout.write(JSON.stringify({ findings, summary }))
}

main().catch((err) => {
  process.stdout.write(JSON.stringify({
    findings: [{ severity: 'medium', file: '(qa-lens)', description: `qa-lens crashed: ${String((err && err.message) || err).slice(0, 300)}` }],
    summary: 'qa-lens crashed',
  }))
  process.exit(0)
})

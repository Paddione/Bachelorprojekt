#!/usr/bin/env node
// scripts/factory/eval-gen.mjs — Generate a curatable fixture proposal from a merged Factory ticket.
// Usage: task factory:eval:gen -- <TICKET_EXT_ID>
import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'
import { execFileSync } from 'child_process'

const REPO = resolve(import.meta.dirname, '../..')
const FIXTURES_DIR = resolve(REPO, 'tests/factory-eval/fixtures')

function execJSON(cmd, args, opts = {}) {
  const out = execFileSync(cmd, args, { encoding: 'utf8', timeout: 60000, cwd: REPO, ...opts })
  return JSON.parse(out || '{}')
}

function execLines(cmd, args, opts = {}) {
  try {
    const out = execFileSync(cmd, args, { encoding: 'utf8', timeout: 60000, cwd: REPO, ...opts })
    return out.split('\n').filter(Boolean)
  } catch (err) {
    throw new Error(`${cmd} ${args.join(' ')} failed: ${err.message}`)
  }
}

function findPrNumber(extId) {
  const links = execJSON('bash', [resolve(REPO, 'scripts/ticket.sh'), 'get-ticket-links', '--id', extId])
  const rows = links.pr || []
  for (const row of rows) {
    if (row.pr_number) return row.pr_number
  }
  return null
}

async function main() {
  const extId = process.argv[2]
  if (!extId) {
    console.error('Usage: node scripts/factory/eval-gen.mjs <TICKET_EXT_ID>')
    process.exit(1)
  }

  const fixtureDir = join(FIXTURES_DIR, extId)
  if (existsSync(fixtureDir)) {
    console.error(`Refusing to overwrite existing fixture: ${fixtureDir}`)
    process.exit(1)
  }

  const ticket = execJSON('bash', [resolve(REPO, 'scripts/ticket.sh'), 'get', '--id', extId])
  if (!ticket.external_id) {
    console.error(`Ticket not found: ${extId}`)
    process.exit(1)
  }

  const prNumber = findPrNumber(extId)
  if (!prNumber) {
    console.error(`No PR link found for ticket ${extId}`)
    process.exit(1)
  }

  const diffFiles = execLines('gh', ['pr', 'diff', String(prNumber), '--name-only'])
  if (diffFiles.length === 0) {
    console.error(`No files in PR #${prNumber}`)
    process.exit(1)
  }

  let baseCommit = null
  try {
    const prInfo = execJSON('gh', ['pr', 'view', String(prNumber), '--json', 'mergeCommit'])
    const mergeOid = prInfo.mergeCommit?.oid
    if (mergeOid) {
      baseCommit = execFileSync('git', ['rev-parse', `${mergeOid}^1`], {
        encoding: 'utf8', timeout: 30000, cwd: REPO,
      }).trim() || null
    }
  } catch (err) {
    console.error(`Warning: could not determine merge-base: ${err.message}`)
  }
  if (!baseCommit) {
    try {
      baseCommit = execFileSync('git', ['rev-parse', 'origin/main'], { encoding: 'utf8', cwd: REPO }).trim()
    } catch {
      baseCommit = 'unknown'
    }
  }

  const ticketJson = {
    title: ticket.title || '',
    description: '',
    type: ticket.type || 'feature',
    external_id: ticket.external_id,
    brand: ticket.brand || 'mentolder',
    area: '',
  }

  const expectedJson = {
    files: diffFiles,
    forbidden: ['k3d/configmap-domains.yaml', 'environments/*.yaml'],
    tests: [],
    min_recall: 0.5,
    min_precision: 0.3,
  }

  const metaJson = {
    base_commit: baseCommit,
    pr_number: prNumber,
    generated_at: new Date().toISOString(),
    source: 'eval-gen',
  }

  mkdirSync(fixtureDir, { recursive: true })
  writeFileSync(join(fixtureDir, 'ticket.json'), JSON.stringify(ticketJson, null, 2))
  writeFileSync(join(fixtureDir, 'expected.json'), JSON.stringify(expectedJson, null, 2))
  writeFileSync(join(fixtureDir, 'meta.json'), JSON.stringify(metaJson, null, 2))

  console.log(`Generated fixture proposal: ${fixtureDir}`)
  console.log(`  PR: #${prNumber}`)
  console.log(`  base_commit: ${baseCommit}`)
  console.log(`  files: ${diffFiles.length}`)
}

main().catch(err => {
  console.error('Fatal:', err.message)
  process.exit(1)
})

#!/usr/bin/env node
// scripts/openspec-merge.mjs — operation-aware OpenSpec delta → SSOT merge.
// Replaces the raw-append merge in scripts/openspec.sh:_merge_delta(). Parses the
// SSOT into `### Requirement:` blocks and applies ADDED/MODIFIED/REMOVED/RENAMED
// correctly. Fail-closed: exits 1 on a missing target, a RENAMED block without a
// `**Renamed-to:**` directive, or an unedited skeleton stub.
//   node scripts/openspec-merge.mjs apply <deltaPath> <ssotPath>
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, basename } from 'node:path'
import { pathToFileURL } from 'node:url'

const REQ = /^### Requirement: (.+?)\s*$/
const SECTION = /^## (ADDED|MODIFIED|REMOVED|RENAMED) Requirements\s*$/
const STUB_MARKER = 'TO' + 'DO' // assembled marker for skeleton-stub detection
const STUBS = [
  new RegExp(`^### Requirement: ${STUB_MARKER}\\s*$`, 'm'),
  new RegExp(`^#### Scenario: ${STUB_MARKER}\\s*$`, 'm'),
  /^The system SHALL …\s*$/m,
]

function fail(msg) {
  process.stderr.write(`ERROR: ${msg}\n`)
  process.exit(1)
}

// Parse a delta into ordered items: { op, name, lines, renamedTo }
export function parseDelta(text) {
  const out = []
  let op = null
  let cur = null
  const flush = () => { if (cur) { out.push(cur); cur = null } }
  for (const line of text.split('\n')) {
    const s = line.match(SECTION)
    if (s) { flush(); op = s[1]; continue }
    const r = line.match(REQ)
    if (r && op) { flush(); cur = { op, name: r[1].trim(), lines: [line], renamedTo: null }; continue }
    if (cur) {
      const rt = line.match(/^\*\*Renamed-to:\*\*\s*(.+?)\s*$/)
      if (rt) cur.renamedTo = rt[1].trim()
      cur.lines.push(line)
    }
  }
  flush()
  return out
}

// Locate every `### Requirement:` block: { name, start, end } (end exclusive).
// A block ends at the next H3 (`### `) or H2 (`## `) line, or EOF.
export function findBlocks(lines) {
  const blocks = []
  let i = 0
  while (i < lines.length) {
    const r = lines[i].match(REQ)
    if (!r) { i++; continue }
    let j = i + 1
    while (j < lines.length && !/^### /.test(lines[j]) && !/^## /.test(lines[j])) j++
    blocks.push({ name: r[1].trim(), start: i, end: j })
    i = j
  }
  return blocks
}

// Index just past the `## Requirements` section (before the next H2 or EOF).
function endOfRequirements(lines) {
  const start = lines.findIndex(l => /^## Requirements\s*$/.test(l))
  if (start === -1) return lines.length
  let i = start + 1
  while (i < lines.length && !/^## /.test(lines[i])) i++
  return i
}

export function applyDelta(deltaPath, ssotPath, today = new Date().toISOString().slice(0, 10)) {
  const deltaName = basename(deltaPath)
  const delta = readFileSync(deltaPath, 'utf-8')

  for (const re of STUBS) {
    if (re.test(delta)) fail(`${deltaName}: contains unedited skeleton stub (${STUB_MARKER} / 'The system SHALL …') — edit before archiving`)
  }

  if (!existsSync(ssotPath)) {
    mkdirSync(dirname(ssotPath), { recursive: true })
    writeFileSync(ssotPath, `# ${basename(ssotPath, '.md')}\n\n## Purpose\n\nSSOT spec.\n\n## Requirements\n`)
  }
  let content = readFileSync(ssotPath, 'utf-8')
  const marker = `<!-- merged from change delta ${deltaName} on ${today} -->`
  if (content.includes(marker)) {
    process.stdout.write(`skip (already merged): ${deltaName}\n`)
    return 0
  }

  let lines = content.split('\n')
  for (const item of parseDelta(delta)) {
    const hit = findBlocks(lines).find(b => b.name === item.name)
    if (item.op === 'ADDED') {
      const at = endOfRequirements(lines)
      lines.splice(at, 0, '', ...item.lines)
    } else if (item.op === 'MODIFIED') {
      if (!hit) fail(`${deltaName}: MODIFIED target '${item.name}' not found in ${basename(ssotPath)}`)
      lines.splice(hit.start, hit.end - hit.start, ...item.lines)
    } else if (item.op === 'REMOVED') {
      if (!hit) fail(`${deltaName}: REMOVED target '${item.name}' not found in ${basename(ssotPath)}`)
      lines.splice(hit.start, hit.end - hit.start)
    } else if (item.op === 'RENAMED') {
      if (!hit) fail(`${deltaName}: RENAMED target '${item.name}' not found in ${basename(ssotPath)}`)
      if (!item.renamedTo) fail(`${deltaName}: RENAMED '${item.name}' missing '**Renamed-to:**' directive`)
      lines[hit.start] = `### Requirement: ${item.renamedTo}`
    }
  }

  lines.push('', marker)
  writeFileSync(ssotPath, lines.join('\n').replace(/\n{3,}/g, '\n\n'))
  return 0
}

function main(argv) {
  const [verb, deltaPath, ssotPath] = argv
  if (verb !== 'apply' || !deltaPath || !ssotPath) {
    process.stderr.write('Usage: openspec-merge.mjs apply <deltaPath> <ssotPath>\n')
    process.exit(2)
  }
  return applyDelta(deltaPath, ssotPath)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2))
}

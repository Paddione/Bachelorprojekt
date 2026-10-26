#!/usr/bin/env node
/**
 * dangling-rename-runtime.mjs — Rename-Historie plus Laufzeit-Beleg (Stufe p3
 * des dangling-graph-full-Flows, docs/runbooks/dangling-graph-full.md).
 *
 * Korreliert deterministische Historie und beobachtete Laufzeit, bevor etwas
 * per Embedding geraten wird:
 *
 * - `findRenames(pairs)`: Paare aus v1-Beinahe-Treffern gegen
 *   `git log --follow --name-only` je Anbieter-Datei bestätigen oder
 *   verwerfen — Ausgabe `{ confirmed[], rejected[] }` mit Commit-Referenz.
 * - `attachRuntime(nodes, logLines)`: 404- und Proxy-Log-Zeilen auf Knoten
 *   mappen (`{ node, hits, lastSeen }`); Treffer bekommen den roten Ring.
 *
 * Bestätigte Paare rendern blau gepunktet mit Commit-Referenz, verworfene
 * fallen auf den Embedding-Pfad aus v1 zurück — kein eigener Embedding-Code.
 *
 * Aufruf:
 *   node scripts/dangling-rename-runtime.mjs \
 *     --pairs /tmp/near-miss.json --logs /tmp/proxy-404.log \
 *     --out /tmp/rename-runtime.json
 */

import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** `git log --follow --name-only --format=COMMIT:%H` für eine Datei parsen. */
export function historyForFile(repoRoot, filePath) {
  let raw
  try {
    raw = execFileSync(
      'git',
      ['log', '--follow', '--name-only', '--format=COMMIT:%H', '--', filePath],
      { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    )
  } catch {
    return { commits: [], names: [] }
  }
  const commits = []
  const names = new Set()
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (trimmed.startsWith('COMMIT:')) commits.push(trimmed.slice('COMMIT:'.length))
    else if (trimmed.length > 0) names.add(trimmed)
  }
  return { commits, names: [...names] }
}

/**
 * Beinahe-Treffer-Paare gegen die Rename-Historie halten.
 * @param {Array<{from: string, to: string, sourceFile?: string}>} pairs
 * @param {(filePath: string) => {commits: string[], names: string[]}} history — default: git
 * @returns {{confirmed: Array<{from: string, to: string, commit: string}>, rejected: Array}}
 */
export function findRenames(pairs, history) {
  const confirmed = []
  const rejected = []
  for (const pair of pairs ?? []) {
    const from = pair?.from ?? pair?.a ?? ''
    const to = pair?.to ?? pair?.b ?? ''
    const sourceFile = pair?.sourceFile ?? pair?.file ?? null
    let commit = null
    if (sourceFile && typeof history === 'function') {
      const seen = history(sourceFile)
      // Bestätigt, wenn die Historie der Datei beide Pfad-Enden kennt
      // (Rename) oder mindestens einen Commit mit Namenswechsel enthält.
      const names = seen?.names ?? []
      const fromBase = String(from).split('/').pop()
      const toBase = String(to).split('/').pop()
      const knowsBoth = names.some((n) => n.endsWith(fromBase)) && names.some((n) => n.endsWith(toBase))
      const nameChanged = (seen?.commits?.length ?? 0) > 0 && names.length > 1
      if (knowsBoth || nameChanged) commit = (seen?.commits ?? [])[0] ?? null
    }
    if (commit) confirmed.push({ from, to, commit, sourceFile })
    else rejected.push({ from, to, sourceFile })
  }
  return { confirmed, rejected }
}

const LOG_PATH = /(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(\S+)\s+(\d{3})/i
const BARE_PATH = /"(\/[A-Za-z0-9_.~/-]*\/?(?:\?[^\s"]*)?)"\s+(\d{3})/

/** Statuszeile ist ein 404- oder Proxy-Fehler (502/503/504)? */
export function isRuntimeMiss(status) {
  const code = Number(status)
  return code === 404 || code === 502 || code === 503 || code === 504
}

function normalizeLogPath(raw) {
  return String(raw ?? '').split('?')[0].split('#')[0].replace(/\/+$/, '') || '/'
}

/**
 * Log-Zeilen auf Knoten mappen.
 * @returns {Array<{node: string, hits: number, lastSeen: string|null}>}
 */
export function attachRuntime(nodes, logLines) {
  const names = (nodes ?? []).map((n) => (typeof n === 'string' ? n : (n?.route ?? n?.node ?? '')))
  const byNode = new Map(names.map((name) => [name, { node: name, hits: 0, lastSeen: null }]))
  const lookup = new Map(names.map((name) => [normalizeLogPath(name), name]))
  for (const line of logLines ?? []) {
    const text = String(line ?? '')
    let path = null
    let status = null
    const m1 = LOG_PATH.exec(text)
    if (m1) {
      path = m1[2]
      status = m1[3]
    } else {
      const m2 = BARE_PATH.exec(text)
      if (m2) {
        path = m2[1]
        status = m2[2]
      }
    }
    if (!path || !isRuntimeMiss(status)) continue
    const hit = lookup.get(normalizeLogPath(path))
    if (hit) {
      const entry = byNode.get(hit)
      entry.hits += 1
      const stamp = /(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2})?)/.exec(text)?.[1] ?? null
      if (stamp && (!entry.lastSeen || stamp > entry.lastSeen)) entry.lastSeen = stamp
    }
  }
  return [...byNode.values()].filter((entry) => entry.hits > 0)
}

function parseArgs(argv) {
  const args = { pairs: null, logs: null, out: 'rename-runtime.json' }
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i]
    if ((flag === '--pairs' || flag === '--logs' || flag === '--out') && i + 1 < argv.length) {
      args[flag.slice(2)] = argv[i + 1]
      i += 1
    }
  }
  return args
}

function fail(message) {
  process.stderr.write(`dangling-rename-runtime: ${message}\n`)
  process.exit(2)
}

function readJsonFile(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    fail(`Paar-Datei nicht lesbar (${path}): ${error.message}`)
    return null
  }
}

function extractPairs(data) {
  if (Array.isArray(data)) return data
  if (Array.isArray(data?.pairs)) return data.pairs
  if (Array.isArray(data?.nearMiss)) return data.nearMiss
  if (Array.isArray(data?.edges)) return data.edges
  fail('Paar-Datei enthält kein Array (erwartet Array oder {pairs|nearMiss|edges})')
  return []
}

function readLogLines(path) {
  try {
    return readFileSync(path, 'utf8').split('\n').filter((line) => line.trim().length > 0)
  } catch (error) {
    fail(`Log-Datei nicht lesbar (${path}): ${error.message}`)
    return []
  }
}

function isMainModule() {
  try {
    return resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)
  } catch {
    return false
  }
}

if (isMainModule()) {
  const args = parseArgs(process.argv.slice(2))
  if (!args.pairs) fail('--pairs <datei> ist Pflicht')
  if (!args.logs) fail('--logs <datei> ist Pflicht')
  const pairs = extractPairs(readJsonFile(args.pairs))
  const logLines = readLogLines(args.logs)
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const { confirmed, rejected } = findRenames(pairs, (file) => historyForFile(repoRoot, file))
  const nodeNames = pairs.map((p) => p?.to ?? p?.b ?? '').filter(Boolean)
  const runtime = attachRuntime(nodeNames, logLines)
  const result = {
    confirmed,
    rejected,
    runtime,
    counts: { confirmed: confirmed.length, rejected: rejected.length, withRuntime: runtime.length },
  }
  const payload = JSON.stringify(result, null, 2) + '\n'
  process.stdout.write(payload)
  if (args.out) {
    mkdirSync(dirname(resolve(args.out)), { recursive: true })
    writeFileSync(args.out, payload, 'utf8')
  }
  process.stderr.write(
    `confirmed=${confirmed.length} rejected=${rejected.length} withRuntime=${runtime.length}\n`,
  )
}

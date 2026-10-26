#!/usr/bin/env node
/**
 * dangling-scope-env.mjs — Scope-Ausweitung über HTTP hinaus (letzte Stufe
 * des dangling-graph-full-Flows, docs/runbooks/dangling-graph-full.md).
 *
 * - `collectEnvRefs(root)`: EnvVar-Verwendungen inventarisieren, gegen
 *   definierte Vars joinen — exakt zuerst, Reste per Namens-Ähnlichkeit mit
 *   derselben τ-Methodik wie v1 (kalibriert, nicht geschätzt).
 * - Danach dieselbe Inventar-plus-Match-Schleife für MCP-Tools und
 *   Taskfile-Tasks; Scope-Funde rendern violett geclustert.
 *
 * Aufruf:
 *   node scripts/dangling-scope-env.mjs \
 *     --root components/website/src --env /tmp/defined-env.json \
 *     --out /tmp/scope-env.json
 */

import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
export const REPO_ROOT = resolve(HERE, '..')

const SOURCE_EXTENSION = /\.(?:ts|tsx|mts|js|mjs|cjs|astro|svelte)$/i
const IGNORED_FILE = /^(?:.*\.(?:test|spec|stories)\.[cm]?[jt]sx?|.*\.d\.ts)$/i
const IGNORED_DIR = new Set(['__tests__', 'node_modules', '__mocks__', 'dist', '.astro'])
const DEFAULT_SEED = 20260101
const EMBED_DIM = 256

const ENV_PATTERNS = [
  /process\.env\.([A-Z][A-Z0-9_]*)/g,
  /import\.meta\.env\.([A-Z][A-Z0-9_]*)/g,
  /\b([A-Z][A-Z0-9_]{2,})\b(?=\s*[-:?|}=,);])/g,
]

const MCP_TOOL_PATTERN = /(?:mcp__[A-Za-z0-9_]+__[A-Za-z0-9_.-]+|[A-Za-z0-9_-]+\.mcp\.tool|[Tt]ool\(['"][A-Za-z0-9_.-]+['"]\))/g
const TASK_PATTERN = /task\s+([A-Za-z0-9][A-Za-z0-9_:./-]*)/g

function walkFiles(dir, out) {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  const sorted = [...entries].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  for (const entry of sorted) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (!IGNORED_DIR.has(entry.name)) walkFiles(full, out)
    } else if (entry.isFile()) {
      if (!IGNORED_FILE.test(entry.name) && SOURCE_EXTENSION.test(entry.name)) out.push(full)
    }
  }
  return out
}

function refsInSource(source, patterns) {
  const found = new Map()
  for (const pattern of patterns) {
    pattern.lastIndex = 0
    let match
    while ((match = pattern.exec(source)) !== null) {
      const name = match[1] ?? match[0]
      found.set(name, (found.get(name) ?? 0) + 1)
    }
  }
  return found
}

/**
 * EnvVar-Verwendungen unter `root` inventarisieren.
 * @returns {Array<{name: string, files: string[], hits: number}>}
 */
export function collectEnvRefs(root) {
  const abs = resolve(String(root ?? ''))
  const files = walkFiles(abs, [])
  const byName = new Map()
  for (const full of files) {
    let source
    try {
      source = readFileSync(full, 'utf8')
    } catch {
      continue
    }
    const rel = relative(abs, full).replace(/\\/g, '/')
    for (const [name, hits] of refsInSource(source, ENV_PATTERNS)) {
      if (!/^[A-Z]/.test(name)) continue
      const entry = byName.get(name) ?? { name, files: [], hits: 0 }
      if (!entry.files.includes(rel)) entry.files.push(rel)
      entry.hits += hits
      byName.set(name, entry)
    }
  }
  return [...byName.values()].sort((a, b) => (a.name < b.name ? -1 : 1))
}

/** MCP-Tool-Referenzen inventarisieren (gleiche Schleife, andere Muster). */
export function collectMcpRefs(root) {
  const abs = resolve(String(root ?? ''))
  const files = walkFiles(abs, [])
  const byName = new Map()
  for (const full of files) {
    let source
    try {
      source = readFileSync(full, 'utf8')
    } catch {
      continue
    }
    const rel = relative(abs, full).replace(/\\/g, '/')
    MCP_TOOL_PATTERN.lastIndex = 0
    let match
    while ((match = MCP_TOOL_PATTERN.exec(source)) !== null) {
      const name = match[0]
      const entry = byName.get(name) ?? { name, files: [], hits: 0 }
      if (!entry.files.includes(rel)) entry.files.push(rel)
      entry.hits += 1
      byName.set(name, entry)
    }
  }
  return [...byName.values()].sort((a, b) => (a.name < b.name ? -1 : 1))
}

/** Taskfile-Task-Referenzen inventarisieren. */
export function collectTaskRefs(root) {
  const abs = resolve(String(root ?? ''))
  const files = walkFiles(abs, [])
  const byName = new Map()
  for (const full of files) {
    let source
    try {
      source = readFileSync(full, 'utf8')
    } catch {
      continue
    }
    const rel = relative(abs, full).replace(/\\/g, '/')
    TASK_PATTERN.lastIndex = 0
    let match
    while ((match = TASK_PATTERN.exec(source)) !== null) {
      const name = match[1]
      const entry = byName.get(name) ?? { name, files: [], hits: 0 }
      if (!entry.files.includes(rel)) entry.files.push(rel)
      entry.hits += 1
      byName.set(name, entry)
    }
  }
  return [...byName.values()].sort((a, b) => (a.name < b.name ? -1 : 1))
}

// ── Ähnlichkeit: gehashte Zeichen-n-Gramm-Vektoren + Kosinus (τ-Methodik wie v1) ──

function hash32(value) {
  let hash = 0x811c9dc5
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

function charGrams(value, size) {
  const padded = `^${value}$`
  const grams = new Set()
  for (let i = 0; i + size <= padded.length; i += 1) grams.add(padded.slice(i, i + size))
  if (grams.size === 0) grams.add(padded)
  return grams
}

function embedName(value) {
  const vector = new Float64Array(EMBED_DIM)
  const upper = String(value ?? '').toUpperCase()
  for (const token of upper.split(/[_\-.]+/)) {
    if (!token) continue
    const key = `t:${token}`
    const h = hash32(key)
    vector[h % vector.length] += (h & 0x80000000) === 0 ? 1 : -1
    for (const gram of charGrams(token, 3)) {
      const gh = hash32(`c:${gram}`)
      vector[gh % vector.length] += ((gh & 0x80000000) === 0 ? 1 : -1) * 0.5
    }
  }
  let norm = 0
  for (const v of vector) norm += v * v
  norm = Math.sqrt(norm)
  if (norm > 0) for (let i = 0; i < vector.length; i += 1) vector[i] /= norm
  return vector
}

/** Kosinus-Ähnlichkeit zweier Namen (0–1). */
export function similarity(a, b) {
  const va = embedName(a)
  const vb = embedName(b)
  let dot = 0
  for (let i = 0; i < va.length; i += 1) dot += va[i] * vb[i]
  return (dot + 1) / 2
}

/** Deterministische 1-Edit-Variante (Mitte streichen) — synthetische Positive für τ. */
export function variantOf(name) {
  const text = String(name ?? '')
  if (text.length <= 3) return `${text}X`
  const mid = Math.floor(text.length / 2)
  return text.slice(0, mid) + text.slice(mid + 1)
}

function mulberry32(seed) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * τ kalibrieren: Youden-J über den Kandidaten-Schwellen aus positiven und
 * negativen Paaren — kalibriert, nicht geschätzt.
 */
export function calibrateThreshold(input) {
  const positives = (input?.positives ?? []).map(([a, b]) => similarity(a, b))
  const negatives = (input?.negatives ?? []).map(([a, b]) => similarity(a, b))
  const candidates = [...new Set([...positives, ...negatives])].sort((x, y) => x - y)
  let best = { tau: 0.5, tpr: 0, fpr: 1, separation: -1 }
  for (const tau of candidates.length > 0 ? candidates : [0.5]) {
    const tp = positives.filter((s) => s >= tau).length
    const fp = negatives.filter((s) => s >= tau).length
    const tpr = positives.length > 0 ? tp / positives.length : 0
    const fpr = negatives.length > 0 ? fp / negatives.length : 0
    const separation = tpr - fpr
    if (separation > best.separation) best = { tau, tpr, fpr, separation }
  }
  return { ...best, positives, negatives, method: 'youden-j' }
}

/** Deterministische Negativpaare aus den definierten Namen ziehen. */
export function sampleNegatives(defined, count, seed = DEFAULT_SEED) {
  const rand = mulberry32(seed)
  const names = [...defined]
  const pairs = []
  let guard = 0
  while (pairs.length < count && guard < count * 50 + 10) {
    guard += 1
    const a = names[Math.floor(rand() * names.length)]
    const b = names[Math.floor(rand() * names.length)]
    if (a && b && a !== b) pairs.push([a, b])
  }
  return pairs
}

/**
 * Scope-Match: exakt zuerst, Reste per kalibriertem τ.
 * @returns {{matched: Array, nearMiss: Array<{from: string, to: string, score: number}>, orphan: Array, calibration: object}}
 */
export function matchScope(refs, defined) {
  const definedSet = new Set(defined ?? [])
  const matched = []
  const rest = []
  for (const ref of refs ?? []) {
    if (definedSet.has(ref.name)) matched.push({ ...ref, kind: 'exact' })
    else rest.push(ref)
  }
  const positives = [...definedSet].slice(0, 8).map((d) => [d, variantOf(d)])
  const negatives = sampleNegatives(definedSet.size > 0 ? definedSet : rest.map((r) => r.name), 16)
  const calibration = calibrateThreshold({ positives, negatives })
  const nearMiss = []
  const orphan = []
  for (const ref of rest) {
    let bestName = null
    let bestScore = -1
    for (const target of definedSet) {
      const score = similarity(ref.name, target)
      if (score > bestScore) {
        bestScore = score
        bestName = target
      }
    }
    if (bestName !== null && bestScore >= calibration.tau) {
      nearMiss.push({ from: ref.name, to: bestName, score: bestScore, files: ref.files })
    } else {
      orphan.push(ref)
    }
  }
  return { matched, nearMiss, orphan, calibration }
}

function parseArgs(argv) {
  const args = { root: join(REPO_ROOT, 'components', 'website', 'src'), env: null, out: 'scope-env.json' }
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i]
    if ((flag === '--root' || flag === '--env' || flag === '--out') && i + 1 < argv.length) {
      args[flag.slice(2)] = argv[i + 1]
      i += 1
    }
  }
  return args
}

function fail(message) {
  process.stderr.write(`dangling-scope-env: ${message}\n`)
  process.exit(2)
}

function readJsonFile(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    fail(`Env-Definitionsdatei nicht lesbar (${path}): ${error.message}`)
    return null
  }
}

function extractDefined(data) {
  if (Array.isArray(data)) return data.map((d) => (typeof d === 'string' ? d : (d?.name ?? '')))
  if (Array.isArray(data?.vars)) return data.vars.map((d) => (typeof d === 'string' ? d : (d?.name ?? '')))
  if (Array.isArray(data?.defined)) return data.defined.map((d) => (typeof d === 'string' ? d : (d?.name ?? '')))
  if (data && typeof data === 'object') return Object.keys(data)
  fail('Env-Datei enthält keine Definitionen (erwartet Array, {vars|defined} oder Objekt)')
  return []
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
  if (!args.env) fail('--env <datei> ist Pflicht')
  let rootStat = null
  try {
    rootStat = statSync(args.root)
  } catch {
    rootStat = null
  }
  if (!rootStat || !rootStat.isDirectory()) fail(`Root-Verzeichnis fehlt: ${args.root}`)
  const defined = extractDefined(readJsonFile(args.env))
  const envRefs = collectEnvRefs(args.root)
  const mcpRefs = collectMcpRefs(args.root)
  const taskRefs = collectTaskRefs(args.root)
  const env = matchScope(envRefs, defined)
  const result = {
    env,
    mcp: { total: mcpRefs.length, refs: mcpRefs },
    tasks: { total: taskRefs.length, refs: taskRefs },
    counts: {
      envMatched: env.matched.length,
      envNearMiss: env.nearMiss.length,
      envOrphan: env.orphan.length,
      mcpRefs: mcpRefs.length,
      taskRefs: taskRefs.length,
      tau: env.calibration.tau,
    },
  }
  const payload = JSON.stringify(result, null, 2) + '\n'
  process.stdout.write(payload)
  if (args.out) {
    mkdirSync(dirname(resolve(args.out)), { recursive: true })
    writeFileSync(args.out, payload, 'utf8')
  }
  const c = result.counts
  process.stderr.write(
    `envMatched=${c.envMatched} envNearMiss=${c.envNearMiss} envOrphan=${c.envOrphan} mcpRefs=${c.mcpRefs} taskRefs=${c.taskRefs} tau=${c.tau.toFixed(3)}\n`,
  )
}

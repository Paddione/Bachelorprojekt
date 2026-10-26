#!/usr/bin/env node
/**
 * dangling-handles-audit.mjs — HANDLES-Lücken-Audit (Stufe p1 des
 * dangling-graph-full-Flows, docs/runbooks/dangling-graph-full.md).
 *
 * Misst die Indexer-Lücke statt sie zu umgehen: jede Astro-Dateiroute unter
 * `--providers` wird gegen die Route-Knoten aus `--routes` gehalten.
 * Jeder `unlinked[]`-Eintrag trägt `sourceFile` plus die vermutete Route —
 * das ist der Entscheidungsbeleg für oder gegen einen Indexer-Umbau.
 * Kein Umbau hier.
 *
 * Reines Modul ohne Rück-Import, keine Brand-Domain-Literale.
 *
 * Aufruf:
 *   node scripts/dangling-handles-audit.mjs \
 *     --providers src/pages/api --routes /tmp/route-nodes.json \
 *     --out /tmp/handles-audit.json
 */

import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
export const REPO_ROOT = resolve(HERE, '..')
export const DEFAULT_PROVIDERS_DIR = join(REPO_ROOT, 'components', 'website', 'src', 'pages', 'api')

const ROUTE_EXTENSION = /\.(?:ts|tsx|mts|js|mjs|astro)$/i
const IGNORED_FILE = /^(?:_.*|.*\.(?:test|spec|stories)\.[cm]?[jt]sx?|.*\.d\.ts)$/i
const IGNORED_DIR = new Set(['__tests__', 'node_modules', '__mocks__'])

/** Ein Segment einer Dateiroute auf Parameterform bringen. */
function normalizeSegment(segment) {
  const catchAll = /^\[\[?\.\.\.([A-Za-z0-9_]+)\]\]?$/.exec(segment)
  if (catchAll) return `:${catchAll[1]}*`
  const braceCatchAll = /^\{\.\.\.([A-Za-z0-9_]+)\}$/.exec(segment)
  if (braceCatchAll) return `:${braceCatchAll[1]}*`
  const dynamic = /^\[([A-Za-z0-9_]+)\]$/.exec(segment)
  if (dynamic) return `:${dynamic[1]}`
  const brace = /^\{([A-Za-z0-9_]+)\}$/.exec(segment)
  if (brace) return `:${brace[1]}`
  return segment
}

/** Query/Fragment, doppelte Slashes und Trailing-Slash entfernen. */
export function normalizeRoutePath(raw) {
  const withoutQuery = String(raw ?? '')
    .trim()
    .split('#')[0]
    .split('?')[0]
    .replace(/\\/g, '/')
  const segments = withoutQuery
    .replace(/^\/+/, '')
    .split('/')
    .filter((segment) => segment.length > 0)
    .map(normalizeSegment)
  const route = `/${segments.join('/')}`
  return route === '/' ? '/' : route.replace(/\/+$/, '')
}

/** Relativer Dateipfad unterhalb von pages/api → API-Route. */
export function routeFromFile(relPath) {
  const clean = String(relPath ?? '')
    .replace(/\\/g, '/')
    .replace(ROUTE_EXTENSION, '')
  const segments = clean.split('/').filter((segment) => segment.length > 0 && segment !== '.')
  if (segments[segments.length - 1] === 'index') segments.pop()
  return normalizeRoutePath(['api', ...segments].join('/'))
}

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
      if (!IGNORED_FILE.test(entry.name) && ROUTE_EXTENSION.test(entry.name)) out.push(full)
    }
  }
  return out
}

/**
 * Dateirouten unter `root` einsammeln.
 * @returns {Array<{route: string, sourceFile: string}>}
 */
export function collectFileRoutes(root) {
  const abs = resolve(String(root ?? ''))
  const files = walkFiles(abs, [])
  return files.map((full) => {
    const rel = relative(abs, full).replace(/\\/g, '/')
    return { route: routeFromFile(rel), sourceFile: rel }
  })
}

/** Route-Knoten-Eintrag (String oder {route}) auf die normalisierte Route bringen. */
export function normalizeNodeRoute(node) {
  const raw = typeof node === 'string' ? node : (node?.route ?? node?.path ?? '')
  return normalizeRoutePath(raw)
}

/**
 * Join der Dateirouten über die normalisierte Route gegen die Knoten.
 * @returns {{linked: Array, unlinked: Array<{route: string, sourceFile: string}>, counts: {total: number, linked: number, unlinked: number}}}
 */
export function auditHandles(fileRoutes, routeNodes) {
  const nodeSet = new Set((routeNodes ?? []).map(normalizeNodeRoute))
  const linked = []
  const unlinked = []
  for (const fileRoute of fileRoutes ?? []) {
    const route = normalizeRoutePath(fileRoute.route ?? fileRoute)
    const entry = {
      route,
      sourceFile: fileRoute.sourceFile ?? null,
    }
    if (nodeSet.has(route)) linked.push(entry)
    else unlinked.push(entry)
  }
  return {
    linked,
    unlinked,
    counts: { total: linked.length + unlinked.length, linked: linked.length, unlinked: unlinked.length },
  }
}

function parseArgs(argv) {
  const args = { providers: DEFAULT_PROVIDERS_DIR, routes: null, out: 'handles-audit.json' }
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i]
    if ((flag === '--providers' || flag === '--routes' || flag === '--out') && i + 1 < argv.length) {
      args[flag.slice(2)] = argv[i + 1]
      i += 1
    }
  }
  return args
}

function fail(message) {
  process.stderr.write(`dangling-handles-audit: ${message}\n`)
  process.exit(2)
}

function readJsonFile(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    fail(`Route-Knoten nicht lesbar (${path}): ${error.message}`)
    return null
  }
}

function extractNodes(data) {
  if (Array.isArray(data)) return data
  if (Array.isArray(data?.nodes)) return data.nodes
  if (Array.isArray(data?.routes)) return data.routes
  if (Array.isArray(data?.routeNodes)) return data.routeNodes
  fail('Route-Knoten-JSON enthält kein Array (erwartet Array oder {nodes|routes|routeNodes})')
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
  if (!args.routes) fail('--routes <datei> ist Pflicht')
  let providersStat = null
  try {
    providersStat = statSync(args.providers)
  } catch {
    providersStat = null
  }
  if (!providersStat || !providersStat.isDirectory()) fail(`Providers-Verzeichnis fehlt: ${args.providers}`)
  const nodes = extractNodes(readJsonFile(args.routes))
  const fileRoutes = collectFileRoutes(args.providers)
  if (fileRoutes.length === 0) fail(`keine Dateirouten unter ${args.providers}`)
  const result = auditHandles(fileRoutes, nodes)
  const payload = JSON.stringify(result, null, 2) + '\n'
  process.stdout.write(payload)
  if (args.out) {
    mkdirSync(dirname(resolve(args.out)), { recursive: true })
    writeFileSync(args.out, payload, 'utf8')
  }
  const { total, linked, unlinked } = result.counts
  process.stderr.write(`linked=${linked} unlinked=${unlinked} total=${total}\n`)
}

#!/usr/bin/env node
/**
 * dangling-callers.mjs — Aufrufer-Auflösung mit Belegpfad (Stufe p2 des
 * dangling-graph-full-Flows, docs/runbooks/dangling-graph-full.md).
 *
 * Löst von jedem Aufrufer aus auf statt Mengen zu differenzieren: Ziel
 * normalisieren (Query strippen, Trailing-Slash, `:id`-Form, Service-DNS-
 * Prefix entfernen), exakter Join gegen die Anbieter — sonst Belegpfad
 * `{ caller, rawTarget, normalizedTarget, steps[], gap }`.
 * `steps[]` hält jeden Normalisierungsschritt als Paar `{ from, to, rule }`.
 *
 * Ausgabe `{ resolved, broken[] }` als JSON; `broken[]` speist die roten
 * fetten Knoten des Graphen. Keine Abhängigkeit zu v1-Artefakten.
 *
 * Aufruf:
 *   node scripts/dangling-callers.mjs \
 *     --calls /tmp/http-calls.json --providers /tmp/providers.json \
 *     --out /tmp/caller-paths.json
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HTTP_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i

/** Ein Segment auf Parameterform bringen (Zahlen, UUIDs, Mongo-Ids → :id). */
function toParamSegment(segment) {
  if (/^\d+$/.test(segment)) return ':id'
  if (/^[0-9a-f]{24}$/i.test(segment)) return ':id'
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment)) return ':id'
  return segment
}

/**
 * Ziel normalisieren; jeder Schritt landet als {from, to, rule} in steps.
 * @returns {{normalized: string, steps: Array<{from: string, to: string, rule: string}>}}
 */
export function normalizeTarget(raw) {
  const steps = []
  let current = String(raw ?? '').trim()
  const push = (next, rule) => {
    if (next !== current) steps.push({ from: current, to: next, rule })
    current = next
  }
  push(current.split('#')[0].split('?')[0], 'strip-query')
  if (HTTP_SCHEME.test(current)) {
    try {
      push(new URL(current).pathname || '/', 'strip-origin')
    } catch {
      push(current.replace(HTTP_SCHEME, '/'), 'strip-origin-fallback')
    }
  } else if (current.startsWith('//')) {
    const rest = current.slice(2)
    const slash = rest.indexOf('/')
    push(slash === -1 ? '/' : rest.slice(slash), 'strip-protocol-relative')
  } else {
    const bare = /^([A-Za-z0-9][A-Za-z0-9._-]*)(?::(\d+))?(\/.*)?$/.exec(current)
    if (bare && (bare[2] !== undefined || current.includes('.') || current.includes(':')) && bare[3]) {
      push(bare[3], 'strip-service-dns')
    }
  }
  push(current.replace(/\\/g, '/'), 'backslash')
  const collapsed = current.replace(/\/{2,}/g, '/')
  push(collapsed, 'collapse-slashes')
  if (collapsed.length > 1) push(collapsed.replace(/\/+$/, ''), 'trailing-slash')
  const segments = current.replace(/^\/+/, '').split('/').filter((s) => s.length > 0)
  const parammed = `/${segments.map(toParamSegment).join('/')}`
  push(parammed === '/' ? current || '/' : parammed, 'param-form')
  const normalized = current.length === 0 ? '/' : current
  if (normalized !== current) push(normalized, 'empty-root')
  return { normalized, steps }
}

/**
 * Einen Aufruf gegen die Anbieter auflösen.
 * @param {string|object} call — String-Ziel oder {caller, target}
 * @param {Set<string>|Array<string>} providers — normalisierte Anbieter-Routen
 * @returns {object} Treffer `{status:'resolved', ...}` oder Belegpfad `{status:'broken', caller, rawTarget, normalizedTarget, steps, gap}`
 */
export function resolveCaller(call, providers) {
  const rawTarget = typeof call === 'string' ? call : (call?.target ?? call?.url ?? '')
  const caller = typeof call === 'string' ? null : (call?.caller ?? call?.source ?? null)
  const { normalized, steps } = normalizeTarget(rawTarget)
  const set = providers instanceof Set ? providers : new Set((providers ?? []).map((p) => (typeof p === 'string' ? p : (p?.route ?? p?.normalized ?? ''))))
  if (set.has(normalized)) {
    return { status: 'resolved', caller, rawTarget, normalizedTarget: normalized, steps }
  }
  // gap: erstes Segment, das in keinem Anbieter-Route-Präfix vorkommt — sonst die ganze Route.
  let gap = normalized
  const prefixes = new Set()
  for (const route of set) {
    const parts = String(route).split('/').filter(Boolean)
    let prefix = ''
    for (const part of parts) {
      prefix += `/${part}`
      prefixes.add(prefix)
    }
  }
  const parts = normalized.split('/').filter(Boolean)
  let prefix = ''
  for (const part of parts) {
    prefix += `/${part}`
    if (!prefixes.has(prefix) && !prefixes.has(prefix.replace(/^\/[^/]+/, '/:id'))) {
      gap = prefix
      break
    }
  }
  return { status: 'broken', caller, rawTarget, normalizedTarget: normalized, steps, gap }
}

/**
 * Alle Aufrufe auflösen.
 * @returns {{resolved: Array, broken: Array}}
 */
export function resolveAll(calls, providers) {
  const resolved = []
  const broken = []
  for (const call of calls ?? []) {
    const result = resolveCaller(call, providers)
    if (result.status === 'resolved') resolved.push(result)
    else broken.push(result)
  }
  return { resolved, broken }
}

function parseArgs(argv) {
  const args = { calls: null, providers: null, out: 'caller-paths.json' }
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i]
    if ((flag === '--calls' || flag === '--providers' || flag === '--out') && i + 1 < argv.length) {
      args[flag.slice(2)] = argv[i + 1]
      i += 1
    }
  }
  return args
}

function fail(message) {
  process.stderr.write(`dangling-callers: ${message}\n`)
  process.exit(2)
}

function readJsonFile(path, label) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    fail(`${label} nicht lesbar (${path}): ${error.message}`)
    return null
  }
}

function extractCalls(data) {
  if (Array.isArray(data)) return data
  if (Array.isArray(data?.calls)) return data.calls
  if (Array.isArray(data?.targets)) return data.targets
  if (Array.isArray(data?.httpCalls)) return data.httpCalls
  fail('Calls-JSON enthält kein Array (erwartet Array oder {calls|targets|httpCalls})')
  return []
}

function extractProviders(data) {
  if (Array.isArray(data)) return data.map((p) => (typeof p === 'string' ? p : (p?.route ?? p?.normalized ?? '')))
  if (Array.isArray(data?.providers)) return extractProviders(data.providers)
  if (Array.isArray(data?.routes)) return data.routes.map((p) => (typeof p === 'string' ? p : (p?.route ?? '')))
  fail('Providers-JSON enthält kein Array (erwartet Array oder {providers|routes})')
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
  if (!args.calls) fail('--calls <datei> ist Pflicht')
  if (!args.providers) fail('--providers <datei> ist Pflicht')
  const calls = extractCalls(readJsonFile(args.calls, 'Calls'))
  const providers = extractProviders(readJsonFile(args.providers, 'Provider'))
  if (calls.length === 0) fail('keine Aufrufe in der Calls-Datei')
  const { resolved, broken } = resolveAll(calls, providers)
  const result = {
    resolved,
    broken,
    counts: { total: resolved.length + broken.length, resolved: resolved.length, broken: broken.length },
  }
  const payload = JSON.stringify(result, null, 2) + '\n'
  process.stdout.write(payload)
  if (args.out) {
    mkdirSync(dirname(resolve(args.out)), { recursive: true })
    writeFileSync(args.out, payload, 'utf8')
  }
  process.stderr.write(`resolved=${resolved.length} broken=${broken.length} total=${resolved.length + broken.length}\n`)
}

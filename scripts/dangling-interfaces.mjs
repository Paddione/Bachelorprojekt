#!/usr/bin/env node
/**
 * dangling-interfaces.mjs — Anbieter-Inventar und exakter HTTP_CALLS-Abgleich.
 *
 * Stufe 1 des Dangling-Interfaces-Flows (docs/runbooks/dangling-interfaces.md):
 *
 *  1. Anbieter-Inventar: Astro-Dateirouten unter `src/pages/api/**` werden
 *     deterministisch auf API-Routen abgebildet
 *     (`flux/values.ts` → `/api/flux/values`, `[id]` → `:id`, `[...rest]` → `:rest*`).
 *  2. Aufrufziele: Query/Fragment strippen, Trailing-Slash entfernen,
 *     Service-DNS (`host:port`) auf den Pfadanteil reduzieren.
 *  3. Exakter Join: Treffer, Anbieter-Waisen, Verbraucher-Waisen.
 *
 * Das Modul ist rein (kein Netzwerk, keine Kante zum Report-Modul) und wird
 * auch von scripts/dangling-interfaces.test.ts importiert.
 *
 * Aufruf:
 *   node scripts/dangling-interfaces.mjs \
 *     --providers components/website/src/pages/api \
 *     --calls /tmp/calls.json \
 *     --out /tmp/dangling-exact.json
 */

import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
export const REPO_ROOT = resolve(HERE, '..')
export const DEFAULT_PROVIDERS_DIR = join(REPO_ROOT, 'components', 'website', 'src', 'pages', 'api')

const ROUTE_EXTENSION = /\.(?:ts|tsx|mts|js|mjs|astro)$/i
const IGNORED_FILE = /^(?:_.*|.*\.(?:test|spec|stories)\.[cm]?[jt]sx?|.*\.d\.ts)$/i
const IGNORED_DIR = new Set(['__tests__', 'node_modules', '__mocks__'])
const HTTP_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i
const SERVICE_HOST = /^([A-Za-z0-9][A-Za-z0-9._-]*)(?::(\d+))?(\/.*)?$/

/** Ein Segment einer Datei- oder Aufrufroute auf Parameterform bringen. */
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

/** `host:port/pfad`, absolute URLs und protocol-relative Ziele auf den Pfad reduzieren. */
function stripOrigin(value) {
  if (HTTP_SCHEME.test(value)) {
    try {
      return new URL(value).pathname
    } catch {
      return value
    }
  }
  if (value.startsWith('//')) {
    const rest = value.slice(2)
    const slash = rest.indexOf('/')
    return slash === -1 ? '/' : rest.slice(slash)
  }
  return value
}

function hasService(services, host) {
  if (!services) return false
  if (typeof services.has === 'function') return services.has(host)
  if (Array.isArray(services)) return services.includes(host)
  return Object.prototype.hasOwnProperty.call(services, host)
}

/**
 * Service-DNS deterministisch strippen: `svc:8080/api/x` → `/api/x`.
 *
 * Gestrippt wird nur, wenn ein Port vorhanden ist, der Host einen Punkt enthält
 * (FQDN wie `svc.ns.svc.cluster.local`) oder der Host in --services steht.
 * Ein einwortiger Host ohne Port bleibt stehen, damit relative Ziele wie
 * `api/flux/values` nicht als Host fehlinterpretiert werden.
 */
function stripServicePrefix(value, services) {
  const match = SERVICE_HOST.exec(value)
  if (!match) return value
  const [, host, port, rest] = match
  const path = rest && rest.length > 0 ? rest : '/'
  if (hasService(services, host)) return path
  if (port) return path
  if (host.includes('.')) return path
  return value
}

/** Aufrufziel normalisieren (Query, Fragment, Trailing-Slash, Service-DNS, `{id}`). */
export function normalizeCallTarget(raw, options = {}) {
  let value = String(raw ?? '').trim()
  if (!value) return '/'
  value = value.split('#')[0]
  value = stripOrigin(value)
  value = stripServicePrefix(value, options.services)
  return normalizeRoutePath(value)
}

/** Alle .ts-Routen unterhalb des pages/api-Verzeichnisses einsammeln. */
export function collectProviders(apiDir) {
  const root = resolve(apiDir)
  const providers = []
  const walk = (dir) => {
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (!IGNORED_DIR.has(entry.name)) walk(full)
        continue
      }
      if (!entry.isFile() || IGNORED_FILE.test(entry.name) || !ROUTE_EXTENSION.test(entry.name)) continue
      const sourceFile = relative(root, full).replace(/\\/g, '/')
      const route = routeFromFile(sourceFile)
      providers.push({ route, normalized: route, sourceFile })
    }
  }
  walk(root)
  return providers.sort(
    (left, right) => left.route.localeCompare(right.route) || left.sourceFile.localeCompare(right.sourceFile),
  )
}

/**
 * --calls-Formate:
 *   ["/api/a", ...]
 *   [{ "to": "/api/a" } | { "target": ... } | { "url": ... } | { "path": ... } | { "route": ... }]
 *   { "edges": [{ "kind": "HTTP_CALLS", "to": "/api/a" }, ...] }
 */
export function extractCallTargets(data) {
  const found = []
  const push = (value) => {
    if (typeof value === 'string' && value.trim().length > 0) found.push(value.trim())
  }
  const fromObject = (item) => {
    if (!item || typeof item !== 'object') return
    push(item.to ?? item.target ?? item.url ?? item.path ?? item.route)
  }
  if (Array.isArray(data)) {
    for (const item of data) {
      if (typeof item === 'string') push(item)
      else fromObject(item)
    }
  } else if (data && typeof data === 'object') {
    if (Array.isArray(data.edges)) {
      for (const edge of data.edges) {
        if (!edge || typeof edge !== 'object') continue
        const kind = edge.kind ?? edge.type ?? 'HTTP_CALLS'
        if (String(kind).toUpperCase() !== 'HTTP_CALLS') continue
        fromObject(edge)
      }
    } else if (Array.isArray(data.calls)) {
      return extractCallTargets(data.calls)
    }
  }
  return [...new Set(found)]
}

/** Datei einlesen und in Zielleisten übersetzen — wirft mit klarer Meldung. */
export function loadCallTargets(file) {
  let text
  try {
    text = readFileSync(file, 'utf8')
  } catch (error) {
    throw new Error(`--calls ${file} nicht lesbar: ${error.message}`)
  }
  let data
  try {
    data = JSON.parse(text)
  } catch (error) {
    throw new Error(`--calls ${file} ist kein gültiges JSON: ${error.message}`)
  }
  const targets = extractCallTargets(data)
  if (targets.length === 0) {
    throw new Error(`--calls ${file} enthält keine HTTP_CALLS-Ziele (erwartet Array oder {edges:[…]})`)
  }
  return targets
}

/** Exakter Join: Treffer, Anbieter-Waisen, Verbraucher-Waisen. */
export function exactMatch(providers, callTargets, options = {}) {
  const byRoute = new Map()
  for (const provider of providers) {
    const key = provider.normalized ?? provider.route
    const list = byRoute.get(key) ?? []
    list.push(provider)
    byRoute.set(key, list)
  }

  const matched = []
  const matchedKeys = new Set()
  const consumers = new Map()
  const rawTargets = [...new Set((callTargets ?? []).filter((value) => typeof value === 'string' && value.trim()))]

  for (const rawTarget of rawTargets) {
    const target = normalizeCallTarget(rawTarget, options)
    const providerList = byRoute.get(target)
    if (providerList && providerList.length > 0) {
      for (const provider of providerList) {
        const key = `${provider.route}\u0000${target}`
        if (matchedKeys.has(key)) continue
        matchedKeys.add(key)
        matched.push({ route: provider.route, target, rawTarget, sourceFile: provider.sourceFile })
      }
      continue
    }
    const entry = consumers.get(target) ?? { target, rawTarget, count: 0 }
    entry.count += 1
    consumers.set(target, entry)
  }

  const matchedRoutes = new Set(matched.map((entry) => entry.route))
  const orphanProviders = providers.filter((provider) => !matchedRoutes.has(provider.route))
  const orphanConsumers = [...consumers.values()].sort((left, right) => left.target.localeCompare(right.target))

  const warnings = []
  for (const [route, list] of byRoute) {
    if (list.length > 1) {
      warnings.push(`Doppelte Route ${route}: ${list.map((provider) => provider.sourceFile).join(', ')}`)
    }
  }

  return {
    counts: {
      providers: providers.length,
      calls: rawTargets.length,
      matched: matched.length,
      orphanProviders: orphanProviders.length,
      orphanConsumers: orphanConsumers.length,
    },
    matched,
    orphanProviders,
    orphanConsumers,
    warnings,
  }
}

/** --services: JSON-Objekt, String-Array oder K8s-Service-Liste → Set von Hostnamen. */
export function loadServiceHosts(file) {
  const data = JSON.parse(readFileSync(file, 'utf8'))
  const hosts = new Set()
  const add = (value) => {
    if (typeof value === 'string' && value.length > 0) hosts.add(value)
  }
  if (Array.isArray(data)) {
    for (const item of data) {
      if (typeof item === 'string') add(item)
      else if (item && typeof item === 'object') add(item.name ?? item.metadata?.name)
    }
  } else if (data && typeof data === 'object' && Array.isArray(data.items)) {
    for (const item of data.items) add(item?.metadata?.name)
  } else if (data && typeof data === 'object') {
    for (const key of Object.keys(data)) add(key)
  }
  return hosts
}

function parseArgs(argv) {
  const args = { providers: null, calls: null, out: null, services: null, help: false }
  const valueFlags = new Map([
    ['--providers', 'providers'],
    ['--calls', 'calls'],
    ['--out', 'out'],
    ['--services', 'services'],
  ])
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]
    if (flag === '--help' || flag === '-h') {
      args.help = true
      continue
    }
    const key = valueFlags.get(flag)
    if (!key) throw new Error(`Unbekanntes Argument: ${flag}`)
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) throw new Error(`${flag} erwartet einen Wert`)
    args[key] = value
    index += 1
  }
  return args
}

const USAGE = `dangling-interfaces — Anbieter-Inventar und exakter HTTP_CALLS-Abgleich

  node scripts/dangling-interfaces.mjs --calls <calls.json> [Optionen]

Optionen:
  --providers <dir>   Astro-pages/api-Verzeichnis (Default: ${relative(process.cwd(), DEFAULT_PROVIDERS_DIR) || '.'})
  --calls <datei>     Pflicht. Array von Strings/Objekten oder {edges:[{kind:"HTTP_CALLS",to:…}]}
  --out <datei>       JSON-Ausgabe (Default: dangling-exact.json)
  --services <datei>  Optional: Hostnamen (JSON) für Service-DNS-Stripping
  -h, --help          Diese Hilfe`

function summarize(counts) {
  return (
    `dangling-interfaces: ${counts.providers} Anbieter, ${counts.calls} Ziele · ` +
    `matched ${counts.matched} · orphanProviders ${counts.orphanProviders} · ` +
    `orphanConsumers ${counts.orphanConsumers}`
  )
}

/** CLI-Einstieg; Rückgabewert ist der Exit-Code. */
export function main(argv = process.argv.slice(2)) {
  let args
  try {
    args = parseArgs(argv)
  } catch (error) {
    console.error(`Fehler: ${error.message}`)
    console.error(USAGE)
    return 2
  }
  if (args.help) {
    console.log(USAGE)
    return 0
  }
  if (!args.calls) {
    console.error('Fehler: --calls <datei> fehlt (HTTP_CALLS-Ziele als JSON).')
    console.error(USAGE)
    return 2
  }

  const providersDir = resolve(args.providers ?? DEFAULT_PROVIDERS_DIR)
  const outPath = resolve(args.out ?? 'dangling-exact.json')
  const providers = collectProviders(providersDir)
  if (providers.length === 0) {
    console.error(`Fehler: keine Anbieter-Routen unter ${providersDir} gefunden.`)
    return 2
  }

  let services = new Set()
  if (args.services) {
    try {
      services = loadServiceHosts(resolve(args.services))
    } catch (error) {
      console.error(`Warnung: --services ${args.services} nicht lesbar (${error.message}) — fahre ohne Service-Mapping fort.`)
    }
  }

  let targets
  try {
    targets = loadCallTargets(resolve(args.calls))
  } catch (error) {
    console.error(`Fehler: ${error.message}`)
    return 2
  }

  const result = exactMatch(providers, targets, { services })
  const payload = {
    providersDir: relative(REPO_ROOT, providersDir).split('\\').join('/') || '.',
    counts: result.counts,
    matched: result.matched,
    orphanProviders: result.orphanProviders,
    orphanConsumers: result.orphanConsumers,
    warnings: result.warnings,
  }

  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`)
  console.error(summarize(result.counts))
  for (const warning of result.warnings) console.error(`Warnung: ${warning}`)
  console.log(JSON.stringify(payload, null, 2))
  return 0
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main()
}

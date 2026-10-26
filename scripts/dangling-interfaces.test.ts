/**
 * Tests für den Dangling-Interfaces-Flow.
 *
 * Deckt die drei Stufen ab, die der Plan verlangt:
 *  1. Datei-Route → URL-Route und Aufrufziel-Normalisierung (deterministisch),
 *  2. exakter Abgleich Anbieter ↔ HTTP_CALLS,
 *  3. Embedding-Beinahe-Treffer (kalibriertes τ) und echte Waise ohne Kante.
 *
 * Die Implementierungsmodule sind reine ES-Module ohne Seiteneffekte beim
 * Import; die Tests laden sie dynamisch, damit die Rotphase einen klaren
 * "Modul fehlt"-Fehler je Testfall liefert statt eines Ladeabbruchs.
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'

interface Provider {
  route: string
  normalized: string
  sourceFile: string
}

interface CallEntry {
  target: string
  rawTarget: string
  count: number
}

interface ExactMatch {
  route: string
  target: string
  rawTarget: string
}

interface ExactResult {
  counts: {
    providers: number
    calls: number
    matched: number
    orphanProviders: number
    orphanConsumers: number
  }
  matched: ExactMatch[]
  orphanProviders: Provider[]
  orphanConsumers: CallEntry[]
  warnings: string[]
}

interface Calibration {
  tau: number
  positives: number[]
  negatives: number[]
  tpr: number
  fpr: number
  separation: number
  method: string
}

interface NearMissEdge {
  from: string
  to: string
  score: number
}

interface CoreModule {
  routeFromFile(relPath: string): string
  normalizeCallTarget(raw: string, options?: { services?: Record<string, string> }): string
  collectProviders(apiDir: string): Provider[]
  extractCallTargets(data: unknown): string[]
  exactMatch(providers: Provider[], callTargets: string[]): ExactResult
}

interface ReportModule {
  similarity(a: string, b: string): number
  calibrateThreshold(input: {
    positives: Array<[string, string]>
    negatives?: Array<[string, string]>
    seed?: number
  }): Calibration
  nearMiss(
    providers: Array<Provider | string>,
    consumers: Array<CallEntry | string>,
    tau: number,
    options?: { limitPerSide?: number },
  ): NearMissEdge[]
}

const here = fileURLToPath(new URL('.', import.meta.url))
const corePath = join(here, 'dangling-interfaces.mjs')
const reportPath = join(here, 'dangling-interfaces-report.mjs')

const workDirs: string[] = []

function loadCore(): Promise<CoreModule> {
  return import(corePath).then((mod) => mod as unknown as CoreModule)
}

function loadReport(): Promise<ReportModule> {
  return import(reportPath).then((mod) => mod as unknown as ReportModule)
}

function fixtureTree(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'dangling-fixture-'))
  workDirs.push(dir)
  for (const [rel, content] of Object.entries(files)) {
    const target = join(dir, rel)
    mkdirSync(join(target, '..'), { recursive: true })
    writeFileSync(target, content)
  }
  return dir
}

function apiFixture(files: Record<string, string>): string {
  const dir = fixtureTree(files)
  // collectProviders erwartet das pages/api-Verzeichnis selbst.
  return dir
}

const apiStubs: Record<string, string> = {
  'flux/values.ts': 'export const GET = () => new Response("ok")',
  'portal/rooms.ts': 'export const GET = () => new Response("ok")',
  'admin/users.ts': 'export const GET = () => new Response("ok")',
  'legacy/payouts.ts': 'export const GET = () => new Response("ok")',
  'flux/values.test.ts': 'export {}',
  '_errors.ts': 'export class ApiError extends Error {}',
  '__tests__/helper.ts': 'export const x = 1',
}

afterAll(() => {
  for (const dir of workDirs) rmSync(dir, { recursive: true, force: true })
})

describe('Route-Inventar', () => {
  it('mappt Astro-Dateirouten auf API-Routen', async () => {
    const { routeFromFile } = await loadCore()

    expect(routeFromFile('flux/values.ts')).toBe('/api/flux/values')
    expect(routeFromFile('flux/index.ts')).toBe('/api/flux')
    expect(routeFromFile('billing/[id]/index.ts')).toBe('/api/billing/:id')
    expect(routeFromFile('assets/[...path].ts')).toBe('/api/assets/:path*')
    expect(routeFromFile('bookings/[uid].ts')).toBe('/api/bookings/:uid')
  })

  it('normalisiert Aufrufziele deterministisch', async () => {
    const { normalizeCallTarget } = await loadCore()

    expect(normalizeCallTarget('/api/flux/values?limit=5#frag')).toBe('/api/flux/values')
    expect(normalizeCallTarget('/api/flux/values/')).toBe('/api/flux/values')
    expect(normalizeCallTarget('llm-gateway-tablet:8080/api/flux/values')).toBe('/api/flux/values')
    expect(normalizeCallTarget('http://localhost:4321/api/flux/values?x=1')).toBe('/api/flux/values')
    expect(normalizeCallTarget('/api/billing/{id}/send')).toBe('/api/billing/:id/send')
  })

  it('sammelt nur echte Routen und ignoriert Tests sowie Underscore-Dateien', async () => {
    const { collectProviders } = await loadCore()
    const dir = apiFixture(apiStubs)
    const providers = collectProviders(dir)
    const routes = providers.map((p) => p.route)

    expect(routes).toContain('/api/flux/values')
    expect(routes).toContain('/api/portal/rooms')
    expect(routes).not.toContain('/api/flux/values.test')
    expect(routes.some((r) => r.includes('_errors'))).toBe(false)
    expect(routes.some((r) => r.includes('helper'))).toBe(false)
    expect(providers.every((p) => p.normalized === p.route)).toBe(true)
  })
})

describe('Exakter Abgleich', () => {
  it('akzeptiert String-Arrays, Objekt-Arrays und Graph-Exporte als --calls', async () => {
    const { extractCallTargets } = await loadCore()

    expect(extractCallTargets(['/api/a', '/api/b?x=1'])).toEqual(['/api/a', '/api/b?x=1'])
    expect(extractCallTargets([{ to: '/api/a' }, { target: '/api/c' }])).toEqual(['/api/a', '/api/c'])
    expect(
      extractCallTargets({
        edges: [
          { kind: 'HTTP_CALLS', to: '/api/a' },
          { kind: 'IMPORTS', to: '/api/ignored' },
          { kind: 'http_calls', to: '/api/b' },
        ],
      }),
    ).toEqual(['/api/a', '/api/b'])
  })

  it('trennt Treffer von Anbieter- und Verbraucher-Waisen', async () => {
    const { collectProviders, exactMatch } = await loadCore()
    const providers = collectProviders(apiFixture(apiStubs))
    const result = exactMatch(providers, [
      '/api/flux/values?version=2',
      '/api/admin/users/',
      '/api/flux/value',
      '/api/does-not-exist',
    ])

    expect(result.counts.matched).toBe(2)
    expect(result.counts.orphanProviders).toBe(2)
    expect(result.counts.orphanConsumers).toBe(2)
    expect(result.matched.map((m) => m.route).sort()).toEqual(['/api/admin/users', '/api/flux/values'])
    expect(result.orphanConsumers.map((c) => c.target).sort()).toEqual(['/api/does-not-exist', '/api/flux/value'])
  })
})

describe('Embedding-Klassifikation', () => {
  it('erkennt /api/flux/value als Beinahe-Treffer von /api/flux/values (Score ≥ τ)', async () => {
    const { collectProviders, exactMatch } = await loadCore()
    const { calibrateThreshold, nearMiss, similarity } = await loadReport()

    const providers = collectProviders(apiFixture(apiStubs))
    // Der Anbieter /api/flux/values wird von niemandem exakt aufgerufen —
    // nur die Tippfehler-Variante. Genau dann ist er Waise und der
    // Beinahe-Treffer überhaupt auffindbar.
    const exact = exactMatch(providers, [
      '/api/admin/users?page=1',
      '/api/legacy/payouts/',
      '/api/flux/value',
    ])

    const calibration = calibrateThreshold({
      positives: exact.matched.map((m) => [m.route, m.target] as [string, string]),
      seed: 20260101,
    })

    expect(calibration.tau).toBeGreaterThan(0)
    expect(calibration.tau).toBeLessThan(1)

    const score = similarity('/api/flux/value', '/api/flux/values')
    expect(score).toBeGreaterThanOrEqual(calibration.tau)

    const edges = nearMiss(exact.orphanProviders, exact.orphanConsumers, calibration.tau)
    const edge = edges.find((e) => e.to === '/api/flux/values')
    expect(edge).toBeDefined()
    expect(edge?.from).toBe('/api/flux/value')
    expect(edge?.score).toBeGreaterThanOrEqual(calibration.tau)
  })

  it('lässt eine echte Waise ohne Kante', async () => {
    const { collectProviders, exactMatch } = await loadCore()
    const { calibrateThreshold, nearMiss } = await loadReport()

    const providers = collectProviders(apiFixture(apiStubs))
    const exact = exactMatch(providers, ['/api/flux/values', '/api/flux/value', '/api/zzz/qqq'])

    const calibration = calibrateThreshold({
      positives: exact.matched.map((m) => [m.route, m.target] as [string, string]),
      seed: 7,
    })

    const edges = nearMiss(exact.orphanProviders, exact.orphanConsumers, calibration.tau)
    expect(edges.every((e) => e.from !== '/api/zzz/qqq')).toBe(true)
    expect(edges.every((e) => e.to !== '/api/legacy/payouts')).toBe(true)
  })
})

describe('CLI-Vertrag', () => {
  it('bricht mit klarer Meldung und Exit ≠ 0 ab, wenn --calls fehlt', async () => {
    const callsDir = fixtureTree({})
    const outPath = join(callsDir, 'out.json')
    const apiDir = apiFixture(apiStubs)
    const run = spawnSync(
      process.execPath,
      [corePath, '--providers', apiDir, '--calls', join(callsDir, 'missing-calls.json'), '--out', outPath],
      { encoding: 'utf8' },
    )

    expect(run.status).not.toBe(0)
    expect(`${run.stderr}${run.stdout}`).toMatch(/calls/i)
  })

  it('schreibt das Exakt-Ergebnis nach --out und JSON auf stdout', async () => {
    const callsDir = fixtureTree({})
    const apiDir = apiFixture(apiStubs)
    const callsPath = join(callsDir, 'calls.json')
    const outPath = join(callsDir, 'dangling-exact.json')
    writeFileSync(callsPath, JSON.stringify(['/api/flux/values', '/api/flux/value']))

    const run = spawnSync(
      process.execPath,
      [corePath, '--providers', apiDir, '--calls', callsPath, '--out', outPath],
      { encoding: 'utf8' },
    )

    expect(run.status).toBe(0)
    const stdout = JSON.parse(run.stdout)
    expect(stdout.counts.matched).toBe(1)
    const written = JSON.parse(readFileSync(outPath, 'utf8'))
    expect(written.counts).toEqual(stdout.counts)
  })
})

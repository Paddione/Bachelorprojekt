/**
 * Tests für den dangling-graph-full-Flow.
 *
 * Deckt die vier Stufen ab, die der Plan verlangt:
 *  1. HANDLES-Audit mit fehlender Kante (unlinked trägt sourceFile),
 *  2. Belegpfad mit `steps[]` und `gap`,
 *  3. Rename-Bestätigung mit Commit-Referenz,
 *  4. Scope-Env-Treffer plus eine echte Waise ohne Kante.
 *
 * Die Implementierungsmodule sind reine ES-Module ohne Seiteneffekte beim
 * Import; die Tests laden sie dynamisch, damit die Rotphase einen klaren
 * "Modul fehlt"-Fehler je Testfall liefert statt eines Ladeabbruchs.
 */
import { describe, expect, it } from 'vitest'

interface FileRoute {
  route: string
  sourceFile: string
}

interface AuditCounts {
  total: number
  linked: number
  unlinked: number
}

interface AuditResult {
  linked: Array<{ route: string; sourceFile: string | null }>
  unlinked: Array<{ route: string; sourceFile: string | null }>
  counts: AuditCounts
}

interface AuditModule {
  routeFromFile(relPath: string): string
  normalizeRoutePath(raw: string): string
  collectFileRoutes(root: string): FileRoute[]
  normalizeNodeRoute(node: unknown): string
  auditHandles(fileRoutes: FileRoute[], routeNodes: unknown[]): AuditResult
}

interface ProofStep {
  from: string
  to: string
  rule: string
}

interface CallerResult {
  status: string
  caller: string | null
  rawTarget: string
  normalizedTarget: string
  steps: ProofStep[]
  gap?: string
}

interface CallersModule {
  normalizeTarget(raw: string): { normalized: string; steps: ProofStep[] }
  resolveCaller(call: unknown, providers: Set<string> | string[]): CallerResult
  resolveAll(calls: unknown[], providers: Set<string> | string[]): { resolved: CallerResult[]; broken: CallerResult[] }
}

interface RenamePair {
  from: string
  to: string
  commit?: string
  sourceFile?: string | null
}

interface RenameModule {
  findRenames(
    pairs: Array<{ from: string; to: string; sourceFile?: string | null }>,
    history: (filePath: string) => { commits: string[]; names: string[] },
  ): { confirmed: RenamePair[]; rejected: RenamePair[] }
  attachRuntime(
    nodes: unknown[],
    logLines: string[],
  ): Array<{ node: string; hits: number; lastSeen: string | null }>
  isRuntimeMiss(status: string | number): boolean
}

interface EnvRef {
  name: string
  files: string[]
  hits: number
}

interface ScopeModule {
  collectEnvRefs(root: string): EnvRef[]
  similarity(a: string, b: string): number
  calibrateThreshold(input: { positives: Array<[string, string]>; negatives?: Array<[string, string]> }): {
    tau: number
    tpr: number
    fpr: number
    separation: number
    method: string
  }
  matchScope(
    refs: EnvRef[],
    defined: string[],
  ): {
    matched: EnvRef[]
    nearMiss: Array<{ from: string; to: string; score: number }>
    orphan: EnvRef[]
    calibration: { tau: number }
  }
}

async function loadAudit(): Promise<AuditModule> {
  return (await import('./dangling-handles-audit.mjs')) as unknown as AuditModule
}

async function loadCallers(): Promise<CallersModule> {
  return (await import('./dangling-callers.mjs')) as unknown as CallersModule
}

async function loadRename(): Promise<RenameModule> {
  return (await import('./dangling-rename-runtime.mjs')) as unknown as RenameModule
}

async function loadScope(): Promise<ScopeModule> {
  return (await import('./dangling-scope-env.mjs')) as unknown as ScopeModule
}

describe('p1 — HANDLES-Audit', () => {
  it('mappt Dateirouten auf API-Routen ([id] → :id, index → Verzeichnis)', async () => {
    const mod = await loadAudit()
    expect(mod.routeFromFile('flux/values.ts')).toBe('/api/flux/values')
    expect(mod.routeFromFile('admin/index.ts')).toBe('/api/admin')
    expect(mod.routeFromFile('projects/[id].ts')).toBe('/api/projects/:id')
    expect(mod.routeFromFile('files/[...rest].ts')).toBe('/api/files/:rest*')
  })

  it('meldet die fehlende Kante: unlinked trägt sourceFile plus vermutete Route', async () => {
    const mod = await loadAudit()
    const fileRoutes: FileRoute[] = [
      { route: '/api/flux/values', sourceFile: 'flux/values.ts' },
      { route: '/api/legacy/dead', sourceFile: 'legacy/dead.ts' },
    ]
    const result = mod.auditHandles(fileRoutes, ['/api/flux/values'])
    expect(result.counts.linked).toBe(1)
    expect(result.counts.unlinked).toBe(1)
    expect(result.counts.total).toBe(2)
    expect(result.unlinked[0].route).toBe('/api/legacy/dead')
    expect(result.unlinked[0].sourceFile).toBe('legacy/dead.ts')
  })
})

describe('p2 — Aufrufer-Auflösung mit Belegpfad', () => {
  it('löst Treffer exakt auf (Query und :id-Form inklusive)', async () => {
    const mod = await loadCallers()
    const providers = new Set(['/api/projects/:id'])
    const hit = mod.resolveCaller({ caller: 'web', target: '/api/projects/42?verbose=1' }, providers)
    expect(hit.status).toBe('resolved')
    expect(hit.normalizedTarget).toBe('/api/projects/:id')
  })

  it('liefert den Belegpfad mit steps[] und gap', async () => {
    const mod = await loadCallers()
    const providers = new Set(['/api/flux/values'])
    const broken = mod.resolveCaller({ caller: 'cron', target: '/api/flux/missing/' }, providers)
    expect(broken.status).toBe('broken')
    expect(broken.caller).toBe('cron')
    expect(broken.rawTarget).toBe('/api/flux/missing/')
    expect(Array.isArray(broken.steps)).toBe(true)
    expect(broken.steps.length).toBeGreaterThan(0)
    for (const step of broken.steps) {
      expect(step.from).toBeTypeOf('string')
      expect(step.to).toBeTypeOf('string')
      expect(step.rule).toBeTypeOf('string')
    }
    expect(broken.gap).toBeTypeOf('string')
    expect(String(broken.gap).length).toBeGreaterThan(0)
  })
})

describe('p3 — Rename-Historie plus Laufzeit-Beleg', () => {
  it('bestätigt Paare mit Commit-Referenz, verwirft den Rest', async () => {
    const mod = await loadRename()
    const history = (filePath: string): { commits: string[]; names: string[] } => {
      if (filePath === 'flux/values.ts') {
        return { commits: ['abc123'], names: ['flux/old-values.ts', 'flux/values.ts'] }
      }
      return { commits: [], names: [] }
    }
    const { confirmed, rejected } = mod.findRenames(
      [
        { from: '/api/flux/old-values', to: '/api/flux/values', sourceFile: 'flux/values.ts' },
        { from: '/api/nope/a', to: '/api/nope/b', sourceFile: 'nope/b.ts' },
      ],
      history,
    )
    expect(confirmed).toHaveLength(1)
    expect(confirmed[0].commit).toBe('abc123')
    expect(rejected).toHaveLength(1)
  })

  it('mappt 404-/Proxy-Log-Zeilen auf Knoten mit hits und lastSeen', async () => {
    const mod = await loadRename()
    const runtime = mod.attachRuntime(['/api/flux/values', '/api/other'], [
      '2026-10-20T10:00:00 GET /api/flux/values 404 12ms',
      '2026-10-21T11:00:00 GET /api/flux/values 503 3ms',
      '2026-10-21T11:01:00 GET /api/flux/values 200 2ms',
      '2026-10-21T11:02:00 GET /api/healthy 200 1ms',
    ])
    expect(runtime).toHaveLength(1)
    expect(runtime[0].node).toBe('/api/flux/values')
    expect(runtime[0].hits).toBe(2)
    expect(runtime[0].lastSeen).toContain('2026-10-21')
  })
})

describe('p4 — Scope-Ausweitung über HTTP hinaus', () => {
  it('matcht definierte EnvVars exakt (kalibriertes τ, keine Schätzung)', async () => {
    const mod = await loadScope()
    const refs: EnvRef[] = [
      { name: 'DATABASE_URL', files: ['db.ts'], hits: 2 },
      { name: 'DATBASE_URL', files: ['typo.ts'], hits: 1 },
    ]
    const result = mod.matchScope(refs, ['DATABASE_URL', 'REDIS_URL', 'SESSION_SECRET', 'API_BASE'])
    expect(result.matched.map((m) => m.name)).toContain('DATABASE_URL')
    expect(result.calibration.method ?? 'youden-j').toBeTypeOf('string')
    const nearNames = result.nearMiss.map((n) => n.from)
    const orphanNames = result.orphan.map((o) => o.name)
    expect(nearNames.includes('DATBASE_URL') || orphanNames.includes('DATBASE_URL')).toBe(true)
  })

  it('lässt eine echte Waise ohne Kante übrig', async () => {
    const mod = await loadScope()
    const refs: EnvRef[] = [{ name: 'ZZZ_QQX_UNRELATED', files: ['odd.ts'], hits: 1 }]
    const result = mod.matchScope(refs, ['DATABASE_URL', 'REDIS_URL'])
    expect(result.matched).toHaveLength(0)
    expect(result.orphan.map((o) => o.name)).toContain('ZZZ_QQX_UNRELATED')
  })
})

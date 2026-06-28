---
title: "G-CQ02: any-Typen 463→≤200 — TypeScript-Sicherheitsnetz stärken"
ticket_id: T001285
domains: [website, quality]
status: completed
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# cq02-any-types-200 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans

**Goal:** Explizite `any`-Verwendungen in `website/src` von 463 auf ≤200 reduzieren. Messgröße:
```bash
grep -rn ': any\|<any>\|as any' website/src --include=*.ts --include=*.svelte --include=*.astro | wc -l
```

**Strategie:** Test-Dateien zuerst (einfache Mock-Patterns, hoher Impact), dann API-Handler (K8s-Interfaces), dann Library-Dateien (Generics), schließlich Svelte/Astro-Komponenten.

**Architecture:** Keine neuen Abhängigkeiten. Alle Ersetzungen bleiben innerhalb `website/src`. Wo Typen fehlen, werden lokale Interfaces angelegt — keine separaten Type-Dateien außer explizit genannt.

## Global Constraints

- `as any` in Tests → `as unknown as T` (konkrete Typ-Assertion) oder direkt typisiertes Objekt
- `vi.fn()` Parameter: `(..._args: any[])` → `(..._args: unknown[])`
- `{ ... } as any` für Mock-Locals → explizite `MockLocals`-Interface oder `Partial<APIContext>`
- `getSession(...)` Mock-Return: `as any` → konkrete `SessionData`-Typ-Assertion oder `satisfies`
- K8s-API-Responses: `any` in `.map((pod: any) => ...)` → `(pod: K8sPod)` mit lokalem Interface
- `rows.map((row: any) => ...)` → `(row: Record<string, unknown>)` oder konkrete Row-Interfaces
- Keine Einführung von `@ts-ignore` oder `@ts-expect-error` als Ersatz für `any`

## File Structure

Dateien geordnet nach Impact (Anzahl `any`-Vorkommen, absteigend):

```
# Task 1 — Test-Mocks: Session/Locals-Pattern (~72 any)
website/src/pages/api/admin/sessions/history/index.test.ts    23 any
website/src/pages/api/admin/sessions/templates/index.test.ts   8 any
website/src/pages/api/admin/sessions/index.test.ts             8 any
website/src/pages/api/admin/sessions/templates/[id].test.ts    6 any
website/src/pages/api/auth/me.test.ts                          5 any

# Task 2 — Test-Mocks: Billing/Admin-API (~40 any)
website/src/pages/api/admin/billing/datev-export.test.ts       8 any
website/src/pages/api/admin/billing/[id]/payments.test.ts      8 any
website/src/pages/api/admin/dora-metrics.test.ts               8 any
website/src/pages/api/admin/billing/sepa-export.test.ts        5 any
website/src/pages/api/admin/billing/[id]/validate.test.ts      3 any
website/src/pages/api/billing/invoice/[id]/xrechnung.xml.test.ts 4 any

# Task 3 — Test-Mocks: System/Content/Factory (~34 any)
website/src/pages/api/admin/systemtest/seed.test.ts            7 any
website/src/pages/api/admin/content-sections-save.test.ts      7 any
website/src/pages/api/factory-floor/inject.test.ts             6 any
website/src/pages/api/admin/systemtest/board.test.ts           6 any
website/src/pages/api/admin/content/save.test.ts               4 any
website/src/pages/api/factory-floor/ci.test.ts                 3 any

# Task 4 — Test-Mocks: Questionnaires/Evidence/Openspec (~22 any)
website/src/pages/api/admin/questionnaires/assignments/[id]/archive.test.ts 6 any
website/src/pages/api/admin/questionnaires/assignments/[id]/reassign.test.ts 5 any
website/src/pages/api/admin/openspec/save-proposal.test.ts     3 any
website/src/pages/api/admin/evidence/upload.test.ts            3 any
website/src/pages/api/admin/angebote/save.test.ts              3 any
website/src/pages/api/admin/ai-quality.test.ts                 4 any

# Task 5 — Test-Mocks: Lib Tests (~19 any)
website/src/lib/knowledge-db.test.ts                          17 any
website/src/lib/tickets/__tests__/cockpit-api.test.ts          5 any
website/src/lib/sessions/templates.test.ts                     5 any
website/src/lib/factory-floor.test.ts                          5 any
website/src/lib/comfy-client.test.ts                           5 any
website/src/lib/delivery-metrics.test.ts                       4 any

# Task 6 — API-Handler: Kubernetes-Responses (~28 any)
website/src/pages/api/admin/monitoring.ts                     13 any
website/src/pages/api/admin/cluster/pods-list.ts               6 any
website/src/pages/api/admin/dora-metrics.ts                    3 any
website/src/pages/api/admin/cluster/warnings.ts                3 any
website/src/pages/api/admin/billing/[id]/item.ts               3 any

# Task 7 — Library-Dateien: DB-Queries, Store, Factory (~26 any)
website/src/lib/website-db.ts                                  9 any
website/src/lib/factory-floor.ts                               9 any
website/src/lib/admin/behaviorStore.ts                         8 any

# Task 8 — Svelte/Astro-Komponenten (~21 any)
website/src/components/kore/KoreHomepage.svelte                6 any
website/src/components/admin/framework/SchemaEditor.svelte     6 any
website/src/pages/admin/inhalte.astro                          6 any
website/src/pages/admin/coaching/sessions/[id].astro           3 any

# Task 9 — Kleinere verbleibende Dateien (Rest)
website/src/lib/sessions/archive.ts                            6 any
website/src/lib/k8s.ts                                         6 any
website/src/lib/tickets/cockpit-table-actions.ts               4 any
website/src/lib/bulk-status.ts                                 4 any
website/src/lib/planning-office.ts                             3 any
website/src/pages/api/admin/coaching/drafts/[id]/accept.ts     4 any
website/src/pages/kontakt.astro                                3 any
```

---

## Task 0: Failing-Test anlegen (RED)

**Files:**
- Create: `tests/spec/g-cq02-any-types.bats`

Der Test soll RED sein (463 > 200) und nach Implementierung GREEN werden.

```bash
#!/usr/bin/env bats
# SSOT: openspec/changes/cq02-any-types-200/proposal.md
# G-CQ02: any-Typen in website/src auf ≤200 reduzieren.

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
}

@test "G-CQ02: explicit any count in website/src is at most 200" {
  run bash -c "grep -rn ': any\|<any>\|as any' '$REPO_ROOT/website/src' \
    --include='*.ts' --include='*.svelte' --include='*.astro' | wc -l"
  echo "any count: $output"
  [ "$output" -le 200 ]
}
```

Vor Implementierung: `bats tests/spec/g-cq02-any-types.bats` → FAIL (463 > 200). Expected.

---

## Task 1: Test-Mocks — Session/Locals-Pattern (~72 any eliminiert)

**Zieldateien:**
- `website/src/pages/api/admin/sessions/history/index.test.ts` (23)
- `website/src/pages/api/admin/sessions/templates/index.test.ts` (8)
- `website/src/pages/api/admin/sessions/index.test.ts` (8)
- `website/src/pages/api/admin/sessions/templates/[id].test.ts` (6)
- `website/src/pages/api/auth/me.test.ts` (5)

**Muster und Ersetzungen:**

1. `locals as any` — die Konstante `const locals = { requestLogger: { error: vi.fn() } } as any` tritt in vielen Test-Dateien auf. Durch ein lokales Interface ersetzen:
   ```typescript
   // Vorher:
   const locals = { requestLogger: { error: vi.fn() } } as any;

   // Nachher — direkt typisiert:
   interface MockLocals {
     requestLogger: { error: ReturnType<typeof vi.fn> };
   }
   const locals: MockLocals = { requestLogger: { error: vi.fn() } };
   ```

2. `{ request: req, locals } as any` bei API-Handler-Aufrufen → `as Parameters<typeof GET>[0]` oder `as { request: Request; locals: MockLocals }`:
   ```typescript
   // Vorher:
   const res = await getHistoryList({ request: req, locals } as any);

   // Nachher:
   const res = await getHistoryList({ request: req, locals } as { request: Request; locals: MockLocals });
   ```

3. `getSession(...).mockResolvedValue({ preferred_username: 'gekko' } as any)` → Session-Shape explizit tippen:
   ```typescript
   // Vorher:
   vi.mocked(getSession).mockResolvedValue({ preferred_username: 'gekko' } as any);

   // Nachher:
   vi.mocked(getSession).mockResolvedValue({
     preferred_username: 'gekko',
     sub: 'mock-sub',
     email: 'mock@test.de',
   } satisfies Partial<SessionData> as SessionData);
   ```
   Oder mit `as unknown as SessionData` wenn `SessionData`-Import verfügbar.

4. `getHistoryItem({ ..., params: { id: 'g1' }, locals } as any)` → konkrete Assertion:
   ```typescript
   getHistoryItem({ request: new Request('http://x'), params: { id: 'g1' }, locals } as {
     request: Request; params: { id: string }; locals: MockLocals;
   });
   ```

**Geschätzte Reduktion:** ~72 any → ~8 verbleibend (einige schwer vermeidbare Stellen in Edge-Cases)

---

## Task 2: Test-Mocks — Billing/Admin-API (~36 any eliminiert)

**Zieldateien:**
- `website/src/pages/api/admin/billing/datev-export.test.ts` (8)
- `website/src/pages/api/admin/billing/[id]/payments.test.ts` (8)
- `website/src/pages/api/admin/dora-metrics.test.ts` (8)
- `website/src/pages/api/admin/billing/sepa-export.test.ts` (5)
- `website/src/pages/api/admin/billing/[id]/validate.test.ts` (3)
- `website/src/pages/api/billing/invoice/[id]/xrechnung.xml.test.ts` (4)

**Muster:**

1. Identisches `locals`-Mock-Pattern wie in Task 1 → gleiche `MockLocals`-Interface-Lösung.

2. `mockResponse as any` in Billing-Tests → konkrete Typen. Wenn der Test `new Response(...)` zurückgibt und `.json()` aufruft:
   ```typescript
   // Vorher:
   const body = (await res.json()) as any;
   expect(body.total).toBe(3);

   // Nachher:
   const body = (await res.json()) as { total: number; items: unknown[] };
   expect(body.total).toBe(3);
   ```

3. `vi.fn().mockResolvedValue({ ... } as any)` für DB-Mocks → explizite Return-Typen:
   ```typescript
   // Vorher:
   vi.mocked(getInvoice).mockResolvedValue({ id: '1', amount: 100 } as any);

   // Nachher:
   vi.mocked(getInvoice).mockResolvedValue({ id: '1', amount: 100 } as Awaited<ReturnType<typeof getInvoice>>);
   ```

**Geschätzte Reduktion:** ~36 any → ~0-2 verbleibend

---

## Task 3: Test-Mocks — System/Content/Factory (~33 any eliminiert)

**Zieldateien:**
- `website/src/pages/api/admin/systemtest/seed.test.ts` (7)
- `website/src/pages/api/admin/content-sections-save.test.ts` (7)
- `website/src/pages/api/factory-floor/inject.test.ts` (6)
- `website/src/pages/api/admin/systemtest/board.test.ts` (6)
- `website/src/pages/api/admin/content/save.test.ts` (4)
- `website/src/pages/api/factory-floor/ci.test.ts` (3)

**Muster:**

1. `locals`-Pattern → `MockLocals` (wie Task 1).

2. `inject.test.ts` und `ci.test.ts` (factory-floor): Mock-Objekte für Factory-API-Requests:
   ```typescript
   // Vorher:
   const res = await POST({ request: new Request('http://x', { method: 'POST', body: JSON.stringify(payload) }), locals } as any);

   // Nachher:
   type MockContext = { request: Request; locals: MockLocals };
   const res = await POST({ request: new Request('http://x', { method: 'POST', body: JSON.stringify(payload) }), locals } as MockContext);
   ```

3. `content-sections-save.test.ts`: `body as any` nach `res.json()` → `as { success: boolean; message?: string }`.

**Geschätzte Reduktion:** ~33 any → ~0 verbleibend

---

## Task 4: Test-Mocks — Questionnaires/Evidence/Openspec (~24 any eliminiert)

**Zieldateien:**
- `website/src/pages/api/admin/questionnaires/assignments/[id]/archive.test.ts` (6)
- `website/src/pages/api/admin/questionnaires/assignments/[id]/reassign.test.ts` (5)
- `website/src/pages/api/admin/openspec/save-proposal.test.ts` (3)
- `website/src/pages/api/admin/evidence/upload.test.ts` (3)
- `website/src/pages/api/admin/angebote/save.test.ts` (3)
- `website/src/pages/api/admin/ai-quality.test.ts` (4)

**Muster:** Identisch zu Tasks 1-3. Alle nutzen dasselbe `locals as any` + `{ request, locals } as any`-Schema. `MockLocals`-Interface aus Task 1 in eine gemeinsame `tests/helpers/mockLocals.ts` auslagern oder je Datei lokal definieren (lokale Definition bevorzugt für Test-Isolation).

**Geschätzte Reduktion:** ~24 any → ~0 verbleibend

---

## Task 5: Test-Mocks — Lib Tests (~36 any eliminiert)

**Zieldateien:**
- `website/src/lib/knowledge-db.test.ts` (17)
- `website/src/lib/tickets/__tests__/cockpit-api.test.ts` (5)
- `website/src/lib/sessions/templates.test.ts` (5)
- `website/src/lib/factory-floor.test.ts` (5)
- `website/src/lib/comfy-client.test.ts` (5)
- `website/src/lib/delivery-metrics.test.ts` (4)

**Muster knowledge-db.test.ts** (17 any — höchster Einzelwert unter Lib-Tests):

Das File nutzt `pg-mem` mit einem komplexen Pool-Setup. Die `any`-Vorkommen entstehen typischerweise durch:

1. Pool-Ergebnis-Typen: `rows.map((row: any) => ...)` aus `pgmem`-Abfragen → `Record<string, unknown>`:
   ```typescript
   // Vorher:
   const rows: any[] = result.rows;

   // Nachher:
   const rows: Record<string, unknown>[] = result.rows;
   ```

2. `pgmem`-Rückgabewerte: Wenn der Pool-Typ nicht exportiert wird, `typeof pool` nutzen (die komplexe Typ-Herleitung in Zeile 5 des Files ist bereits korrekt — dort `any` nicht nötig, aber der Pool selbst):
   ```typescript
   // Vorher:
   let pool: any;

   // Nachher (wie Zeile 5 schon beginnt):
   let pool: ReturnType<...>; // bereits korrekt, prüfen ob alle pool-Stellen typisiert sind
   ```

3. Mock-Funktions-Parameter: `vi.fn(async (..._args: any[]) => ...)` → `vi.fn(async (..._args: unknown[]) => ...)`.

**Muster factory-floor.test.ts / cockpit-api.test.ts:**
- `mockDb.query.mockResolvedValue({ rows: [...] } as any)` → `as { rows: Array<Record<string, unknown>> }`
- `vi.mocked(fn).mockResolvedValue(x as any)` → `as Awaited<ReturnType<typeof fn>>`

**Geschätzte Reduktion:** ~36 any → ~3 verbleibend (pg-mem interne Typen teils schwer vollständig auszudrücken)

---

## Task 6: API-Handler — Kubernetes-Response-Interfaces (~28 any eliminiert)

**Zieldateien:**
- `website/src/pages/api/admin/monitoring.ts` (13)
- `website/src/pages/api/admin/cluster/pods-list.ts` (6)
- `website/src/pages/api/admin/dora-metrics.ts` (3)
- `website/src/pages/api/admin/cluster/warnings.ts` (3)
- `website/src/pages/api/admin/billing/[id]/item.ts` (3)

**Muster monitoring.ts** (13 any):

Alle `any`-Stellen entstehen durch untypisierte K8s-API-Responses. Lokale Interfaces am Dateianfang einführen:

```typescript
// Interfaces oben in monitoring.ts einfügen:
interface K8sContainer {
  ready: boolean;
  restartCount: number;
  usage?: { cpu: string; memory: string };
}

interface K8sPod {
  metadata: { name: string; labels?: Record<string, string> };
  status: {
    phase: string;
    containerStatuses?: K8sContainer[];
  };
}

interface K8sPodMetrics {
  metadata: { name: string };
  containers: Array<{ usage?: { cpu: string; memory: string } }>;
}

interface K8sEvent {
  type: string;
  reason: string;
  message: string;
  lastTimestamp?: string;
  eventTime?: string;
  involvedObject: { name: string };
}

interface K8sNode {
  metadata: { name: string };
  status: { capacity: { cpu: string; memory: string } };
  usage?: { cpu: string; memory: string };
}

interface K8sListResponse<T> {
  items: T[];
}
```

Dann Ersetzungen:
- `pods.value.items.map((pod: any) => ...)` → `(pod: K8sPod)`
- `(podMetricsResult as PromiseFulfilledResult<any>).value` → `(podMetricsResult as PromiseFulfilledResult<K8sListResponse<K8sPodMetrics>>).value`
- `containerStatuses.every((c: any) => c.ready)` → `(c: K8sContainer)`
- `events.items.sort((a: any, b: any) => ...)` → `(a: K8sEvent, b: K8sEvent)`
- `events.items.map((event: any) => ...)` → `(event: K8sEvent)`
- `capacityItems.find((n: any) => ...)` → `(n: K8sNode)`

**Muster pods-list.ts** (6 any): Identische K8sPod/K8sContainer-Interfaces verwenden.

**Muster billing/[id]/item.ts** (3 any): Konkrete DB-Row-Interfaces für Billing-Zeilen einführen:
```typescript
interface BillingItemRow {
  id: string;
  description: string;
  amount: number;
  // weitere Felder nach Schema
}
```

**Geschätzte Reduktion:** ~28 any → ~2 verbleibend (PromiseFulfilledResult-Cast-Stellen können resilienter sein)

---

## Task 7: Library-Dateien — DB-Queries, Store, Factory (~26 any eliminiert)

**Zieldateien:**
- `website/src/lib/website-db.ts` (9)
- `website/src/lib/factory-floor.ts` (9)
- `website/src/lib/admin/behaviorStore.ts` (8)

**Muster website-db.ts** (9 any — DB-Row-Mappings):

```typescript
// Vorher:
return r.rows.map((row: any) => ({ id: row.id, name: row.name }));

// Nachher — konkrete Row-Interface pro Abfrage:
interface TicketRow { id: string; name: string; /* weitere Felder */ }
return r.rows.map((row: TicketRow) => ({ id: row.id, name: row.name }));
```

Alternativ für alle DB-Row-Stellen die generische Form:
```typescript
return r.rows.map((row: Record<string, unknown>) => ({
  id: row.id as string,
  name: row.name as string,
}));
```

**Muster factory-floor.ts** (9 any):
- `return r.rows.map((row: any) => ...)` → `(row: Record<string, unknown>)` + Cast bei Feldzugriff
- `function mapInjection(r: any): InjectionRow` → `function mapInjection(r: Record<string, unknown>): InjectionRow`

**Muster behaviorStore.ts** (8 any):

```typescript
// Vorher:
export interface Conflict { currentVersion: number; currentValue: any }
initialValue: any;
validate: (value: any) => Errors;
saveFn: (contentKey: string, baseVersion: number, value: any) => Promise<{ version: number }>;
interface Snapshot { value: any; version: number; ... }
let timer: any = null;

// Nachher — Generic Store:
export interface Conflict<T = unknown> { currentVersion: number; currentValue: T }

export interface BehaviorStoreOptions<T> {
  initialValue: T;
  validate: (value: T) => Errors;
  saveFn: (contentKey: string, baseVersion: number, value: T) => Promise<{ version: number }>;
}

interface Snapshot<T> { value: T; version: number; state: SaveState; errors: Errors; conflict?: Conflict<T> }
let timer: ReturnType<typeof setTimeout> | null = null;

// catch (e: any) → catch (e: unknown)
} catch (e: unknown) {
  const message = e instanceof Error ? e.message : String(e);
  // ...
}

// setValue(value: any) → parametrisierter Store:
setValue(value: T) { ... }
```

**Geschätzte Reduktion:** ~26 any → ~1 verbleibend

---

## Task 8: Svelte/Astro-Komponenten (~21 any eliminiert)

**Zieldateien:**
- `website/src/components/kore/KoreHomepage.svelte` (6)
- `website/src/components/admin/framework/SchemaEditor.svelte` (6)
- `website/src/pages/admin/inhalte.astro` (6)
- `website/src/pages/admin/coaching/sessions/[id].astro` (3)

**Muster KoreHomepage.svelte** (6 any — Event-Handler und Store-Typen):

```typescript
// Vorher (typische Svelte-Event-Handler):
function handleClick(e: any) { ... }
let data: any = null;

// Nachher:
function handleClick(e: MouseEvent) { ... }
// oder für CustomEvent:
function handleCustom(e: CustomEvent<{ detail: string }>) { ... }
let data: TimelineItem | null = null;
```

**Muster SchemaEditor.svelte** (6 any):
- `let schema: any` → `let schema: Record<string, unknown> | null = null`
- Event-Handler-Typen: `(e: any) =>` → `(e: Event) =>` oder `(e: InputEvent) =>`
- Fetch-Response-Parsing: `const data: any = await res.json()` → typisierte Interfaces

**Muster inhalte.astro** (6 any):
- Props-Typen: `const { sections }: any = Astro.props` → explizite `Props`-Interface
- API-Response-Shapes beim `fetch()` → lokale Interfaces

**Muster coaching/sessions/[id].astro** (3 any): Analog zu inhalte.astro.

**Geschätzte Reduktion:** ~21 any → ~2 verbleibend (einige Svelte-interne Typ-Lücken)

---

## Task 9: Verbleibende kleinere Dateien (~20 any eliminiert)

**Zieldateien (3-6 any each):**
- `website/src/lib/sessions/archive.ts` (6)
- `website/src/lib/k8s.ts` (6)
- `website/src/lib/tickets/cockpit-table-actions.ts` (4)
- `website/src/lib/bulk-status.ts` (4)
- `website/src/lib/planning-office.ts` (3)
- `website/src/pages/api/admin/coaching/drafts/[id]/accept.ts` (4)
- `website/src/pages/kontakt.astro` (3)

**Muster k8s.ts** (6 any): Der K8s-Client wrapping-Layer — Interfaces für K8s-Antworten, analog zu Task 6.

**Muster archive.ts** (6 any): Metadata-Objekte typisieren:
```typescript
// Vorher:
const meta: any = JSON.parse(content);

// Nachher:
interface SessionMeta { id: string; slug: string; type: string; title: string; date: string; owner: string; participants: string[]; content_available: boolean; }
const meta = JSON.parse(content) as SessionMeta;
```

**Muster cockpit-table-actions.ts** / **bulk-status.ts** (4 each): Action-Objekte und DB-Rows typisieren.

**Muster coaching drafts accept.ts** (4 any): Request-Body und Response-Shape mit lokalen Interfaces.

**Geschätzte Reduktion:** ~30 any → ~10 verbleibend (einige echte Grenzfälle)

---

## Task 10: Verify — Measure, Test, Regenerate, PR

### Step 1: Count prüfen

```bash
cd website
grep -rn ': any\|<any>\|as any' src --include=*.ts --include=*.svelte --include=*.astro | wc -l
# Erwartung: ≤200
```

### Step 2: BATS-Test ausführen (muss GREEN sein)

```bash
bats tests/spec/g-cq02-any-types.bats
# Erwartung: 1 test, 0 failures
```

### Step 3: TypeScript-Build prüfen (kein Rückschritt durch falsche Typen)

```bash
bash scripts/vda.sh oracle 'run astro type check website'
```

### Step 4: Vitest läuft durch

```bash
bash scripts/vda.sh oracle 'run website unit tests'
```

### Step 5: Test-Inventory regenerieren (CI-Gate)

```bash
bash scripts/vda.sh oracle 'regenerate test inventory'
```

### Step 6: Freshness regenerieren und prüfen

```bash
bash scripts/vda.sh oracle 'regenerate freshness artifacts'
task freshness:check
```

### Step 7: PR erstellen

```bash
gh pr create \
  --title "fix(types): reduce any count 463→≤200 (G-CQ02) [T001285]" \
  --body "..."
gh pr merge <n> --squash --auto
```

---

## Reduction Summary

| Task | Dateien | any vorher | any danach (est.) | Reduktion |
|------|---------|-----------|-------------------|-----------|
| 1 — Session/Locals Tests | 5 | 50 | ~5 | ~45 |
| 2 — Billing/Admin Tests | 6 | 36 | ~2 | ~34 |
| 3 — System/Content/Factory Tests | 6 | 33 | ~0 | ~33 |
| 4 — Questionnaires/Evidence Tests | 6 | 24 | ~0 | ~24 |
| 5 — Lib Tests | 6 | 41 | ~3 | ~38 |
| 6 — API-Handler K8s | 5 | 28 | ~2 | ~26 |
| 7 — Library-Dateien | 3 | 26 | ~1 | ~25 |
| 8 — Svelte/Astro-Komponenten | 4 | 21 | ~2 | ~19 |
| 9 — Verbleibende Dateien | 7 | 30 | ~10 | ~20 |
| **Gesamt** | **48** | **289** | **~25** | **~264** |

Ausgehend von 463 total ergibt eine Reduktion um ~264 einen Zielwert von **~199** — knapp unter der 200er-Grenze. Puffer: Tasks 1-5 sind konservativ geschätzt; die meisten Mock-`as any`-Ersetzungen sind 1:1-Substitutionen ohne Restrisiko.

---
title: Projekttickets-Vollansicht (Container-Detailansicht) + Sidekick-Eintrag Implementation Plan
ticket_id: T000950
domains: [website, test]
status: active
pr_number: null
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Projekttickets-Vollansicht (Container-Detailansicht) + Sidekick-Eintrag Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Baue `/admin/tickets/[id].astro` zur aggregierten Container-Vollansicht aus (conditional bei `type ∈ {project,feature}`: Rollup, Plan, DoR, gruppierte Kind-Liste) und ergänze einen Admin-only Sidekick-Eintrag „Projekttickets" mit Count-Badge.

**Architecture:** Alle neuen Datenfunktionen leben in einem **neuen reinen pg-Modul** `website/src/lib/tickets/container-detail.ts` (kein Svelte-Import → S2-sicher) — so bleiben `admin.ts` (S1-Budget 0!) und `cockpit-db.ts` unangetastet. Vier fokussierte Komponenten unter `website/src/components/admin/` rendern die Container-Sektionen; `[id].astro` bindet sie nur conditional ein und ersetzt seine lokalen, veralteten Status-Maps durch die `cockpit-labels.ts`-SSOT (spart Zeilen → Container-Einbindung netto-neutral). Der Sidekick-Eintrag ist ein reiner `href`-Row nach dem bestehenden `loslernen`-Muster (kein neuer View-Slug), die Badge-Zahl kommt aus einem neuen `/api/admin/cockpit/container-count`-Endpoint nach dem `inbox/count`-Muster.

**Tech Stack:** Astro (SSR) + Svelte 5 (Runes), PostgreSQL (`pg` pool über `website-db`), Vitest + `pg-mem`-Adapter, Testing-Library/Svelte.

## Global Constraints

- **Ticket:** T000950. Branch: `feature/projekttickets-cockpit`. Worktree: `/home/patrick/Bachelorprojekt/tmp/feature/projekttickets-cockpit` — NUR hier arbeiten.
- **S1-Zeilenbudgets (wirksame Schwelle = Baseline falls gebaselined, sonst Extension-Limit):**
  - `website/src/lib/tickets/admin.ts`: Ist 677 · **Baseline 677 → Budget 0**. **NICHT anfassen / nicht erweitern.**
  - `website/src/lib/tickets/cockpit-db.ts`: Ist 381 · nicht-baselined · Limit 600 (`.ts`). **Nicht erweitern** (Architekturentscheidung: alles Neue nach `container-detail.ts`).
  - `website/src/pages/admin/tickets/[id].astro`: Ist 394 · nicht-baselined · **Limit 400 (`.astro`) → Budget +6**. Status-Map-Entfernung (Z. 55–72 lokale Maps) spart ~18 Zeilen → Container-Einbindung MUSS netto im Budget bleiben (Ziel: ≤ 400 nach Änderung).
  - `website/src/components/PortalSidekick.svelte`: Ist 419 · nicht-baselined · Limit 500 (`.svelte`) → Budget +81. Badge minimal-invasiv (~10 Zeilen).
  - `website/src/components/assistant/SidekickHome.svelte`: Ist 347 · nicht-baselined · Limit 500 → Budget +153. +1 Item-Zeile.
  - `website/src/lib/tickets/cockpit-labels.ts`: Ist 62 · nicht-baselined · Limit 600. Nicht geändert (nur importiert).
  - **NEU** `website/src/lib/tickets/container-detail.ts`: Limit 600 (`.ts`) — Wachstumsreserve einplanen.
  - **NEU** `.svelte`-Komponenten: Limit 500 je Datei. **NEU** `.astro`-Komponente: Limit 400.
- **S2:** `container-detail.ts` ist ein **reines pg-Modul** (importiert nur `pool` aus `../website-db`, Typen, `cockpit-labels.ts`-freie Helfer). NIE aus einer `.svelte`-Datei importieren (Astro-Frontmatter ist server-seitig → erlaubt). Labels in Komponenten kommen aus `cockpit-labels.ts` (reines Modul).
- **S3:** Keine `*.mentolder.de` / `*.korczewski.de`-Literale in Code. PR-Links nutzen das bestehende GitHub-URL-Muster (`https://github.com/Paddione/Bachelorprojekt/...`, kein Brand-Domain).
- **CLAUDE.md-Footgun:** `tickets.ticket_plans.content` NIE breit selektieren — immer `WHERE ticket_id = $1` für genau ein Ticket.
- **Brand-Scoping:** Jede Query filtert über `brand` bzw. validiert die Container-Brand; kein cross-brand-Zugriff.
- **Fail-soft:** Jede Container-Datenquelle in `[id].astro` in try/catch laden (→ `null`/leeres Aggregat), Muster wie der bestehende questionnaire-Fetch (Z. 37–53). Fehlende Quelle blendet ihre Sektion aus.
- **`BRAND`:** `process.env.BRAND_ID ?? process.env.BRAND ?? 'mentolder'` (wie in `[id].astro` Z. 23).

---

## Verifizierte Schema-Fakten (am echten Code geprüft — nicht raten)

- **`tickets.v_cockpit_rollup`** (`cockpit-schema.ts`) ist je **`container_id` = Ticket-`id` (uuid)** verschlüsselt, NICHT `external_id`. Spalten: `container_id, total_leaves, done_leaves, blocked_leaves, in_progress_leaves, awaiting_deploy_leaves, open_leaves, pct_done, health`. → `getContainerRollup` nimmt die **uuid** entgegen (in `[id].astro` liegt `ticket.id` bereits vor; kein extId→id-Lookup nötig).
- **`tickets.ticket_plans`** (`tickets-db.ts:328`) Spalten: `id BIGSERIAL, ticket_id UUID, slug TEXT, branch TEXT, content TEXT, pr_number INTEGER, archived_at TIMESTAMPTZ DEFAULT now()`. Kein `is_archived`-Flag — „neuester Plan" = höchstes `archived_at`/`id` für das `ticket_id`. (Es gibt keine separate „nicht-archiviert"-Spalte; jeder Plan-Eintrag wird beim Schreiben mit `archived_at=now()` gespeichert.)
- **DoR-Felder** liegen auf `tickets.tickets`: `value_prop, effort, areas (TEXT[]), depends_on (TEXT[]), readiness (JSONB), requirements_list (TEXT[])`. `dorScore(readiness)` zählt die 4 `DOR_KEYS` (`spec_skizziert, offene_fragen_geklaert, abhaengigkeiten_klar, aufwand_geschaetzt`) aus `planning-office.ts`. Lesemuster: `planning-office.ts:51–61` (`listOffice`) + `mapRow` (Z. 33–49).
- **`RollupMetrics`** (`cockpit-types.ts:6`): `{ total, done, blocked, inProgress, awaitingDeploy, open, pctDone }`. `HealthStatus = 'green'|'amber'|'red'`. `toRollup`-Mapping siehe `cockpit-db.ts:9–19`.
- **`getTicketDetail`** (`admin.ts:253`) liefert bereits `children: ListedTicket[]` (jedes mit `id, externalId, type, title, status, priority`). Die Kind-Liste braucht KEINE neue Query.
- **Sidekick href-Row-Muster:** `SidekickHome.svelte:43` (`loslernen`) — `item.id` ist ein Pseudo-Wert außerhalb der `View`-Union, mit `href` gerendert über den `{#if item.href}`-Zweig (Z. 80–102). → „Projekttickets" analog, **kein** Eintrag in der `View`-Union / `sidekick-nudge.ts` nötig.
- **Badge-Fetch-Muster:** `PortalSidekick.svelte:120–136` (Admin-`$effect`, `helpContext==='admin'`, try/catch → Badge bleibt 0). Endpoint-Muster: `inbox/count.ts`.

---

## File Structure (Dateistruktur / Decomposition)

| Datei | Verantwortung | Aktion |
|---|---|---|
| `website/src/lib/tickets/container-detail.ts` | `getContainerRollup`, `getTicketPlan`, `getContainerDor` (reines pg-Modul) | **NEU** |
| `website/src/lib/tickets/container-detail.test.ts` | Vitest für die drei Loader (pg-mem) | **NEU** |
| `website/src/components/admin/ContainerRollupHeader.svelte` | Fortschrittsbalken + Status-Breakdown + Health-Punkt + Lifecycle-Streifen | **NEU** |
| `website/src/components/admin/TicketPlanPanel.svelte` | Plan-Metadaten (branch/PR/slug) + collapsible Markdown-`content` | **NEU** |
| `website/src/components/admin/ContainerDorPanel.svelte` | DoR-Checkliste + dorScore + valueProp/effort/areas/dependsOn + requirementsList | **NEU** |
| `website/src/components/admin/ContainerChildrenList.astro` | Kind-Tickets nach Status gruppiert, Status-/Prio-Chips | **NEU** |
| `website/src/pages/admin/tickets/[id].astro` | Status-Maps → `cockpit-labels.ts`; conditional Container-Sektionen | **MODIFY** |
| `website/src/pages/api/admin/cockpit/container-count.ts` | Count offener `project`/`feature`-Container (Badge) | **NEU** |
| `website/src/components/assistant/SidekickHome.svelte` | +1 href-Item „Projekttickets" mit Badge + `no`-Renumbering | **MODIFY** |
| `website/src/components/PortalSidekick.svelte` | Badge-Count-Fetch im Admin-`$effect` + Prop an `SidekickHome` | **MODIFY** |
| `website/src/components/PortalSidekick.test.ts` | +Test: Admin-Kontext zeigt „Projekttickets", Portal nicht | **MODIFY** |

---

## Task 1: Datenmodul `container-detail.ts` — `getContainerRollup`

**Files:**
- Create: `website/src/lib/tickets/container-detail.ts`
- Test: `website/src/lib/tickets/container-detail.test.ts`

**Interfaces:**
- Consumes: `pool` aus `../website-db`; Typen `RollupMetrics`, `HealthStatus` aus `./cockpit-types`.
- Produces: `export interface ContainerRollup extends RollupMetrics { health: HealthStatus }` und `export async function getContainerRollup(brand: string, containerId: string): Promise<ContainerRollup | null>`. `containerId` = Ticket-**uuid**. Liefert `null`, wenn der Container nicht zur Brand gehört oder die View keine Zeile hat.

- [ ] **Step 1: Failing-Test schreiben**

Test prüft: bekanntes Feature mit zwei `task`-Leaves (1 done, 1 blocked) → `{ total:2, done:1, blocked:1, pctDone:50, health:'red' }`; unbekannte id → `null`; fremde Brand → `null`.

```ts
// website/src/lib/tickets/container-detail.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { pool } from '../website-db';
import { initTicketsSchema } from '../tickets-db';
import { ensureCockpitViews } from './cockpit-schema';
import { getContainerRollup } from './container-detail';

let featureId: string;

beforeAll(async () => {
  await initTicketsSchema();
  await ensureCockpitViews(pool);
  const f = await pool.query(
    `INSERT INTO tickets.tickets (type, brand, title, status, priority)
     VALUES ('feature','mentolder','Feature A','backlog','mittel') RETURNING id`);
  featureId = f.rows[0].id;
  await pool.query(
    `INSERT INTO tickets.tickets (type, brand, title, status, priority, parent_id)
     VALUES ('task','mentolder','Leaf done','done','mittel',$1),
            ('task','mentolder','Leaf blocked','blocked','mittel',$1)`, [featureId]);
});
afterAll(async () => { await pool.query(`DELETE FROM tickets.tickets WHERE brand='mentolder'`); });

describe('getContainerRollup', () => {
  it('maps the rollup view for a feature container', async () => {
    const r = await getContainerRollup('mentolder', featureId);
    expect(r).not.toBeNull();
    expect(r!.total).toBe(2);
    expect(r!.done).toBe(1);
    expect(r!.blocked).toBe(1);
    expect(r!.pctDone).toBe(50);
    expect(r!.health).toBe('red');
  });
  it('returns null for an unknown container id', async () => {
    expect(await getContainerRollup('mentolder', '00000000-0000-0000-0000-000000000000')).toBeNull();
  });
  it('returns null when the container belongs to another brand', async () => {
    expect(await getContainerRollup('korczewski', featureId)).toBeNull();
  });
});
```

- [ ] **Step 2: Test ausführen → FAIL**

Run: `cd website && pnpm vitest run src/lib/tickets/container-detail.test.ts`
Expected: FAIL mit `Cannot find module './container-detail'` / `getContainerRollup is not a function`.

- [ ] **Step 3: Minimale Implementierung**

```ts
// website/src/lib/tickets/container-detail.ts
//
// Container-Detail-Datenquellen für die Projekttickets-Vollansicht (T000950).
// Reines pg-Modul (S2): importiert nur den pool + Typen, KEINE Svelte/UI.
// Liest die vorhandene View tickets.v_cockpit_rollup (per container uuid) sowie
// tickets.ticket_plans (content NUR pro einzelnem ticket_id — CLAUDE.md-Footgun).

import { pool } from '../website-db';
import type { RollupMetrics, HealthStatus } from './cockpit-types';

export interface ContainerRollup extends RollupMetrics {
  health: HealthStatus;
}

// Rollup für einen einzelnen Container (project/feature) per uuid. Die View ist
// nicht brand-gefiltert (siehe cockpit-schema.ts), daher joinen wir gegen die
// Container-Zeile mit Brand-Guard → fremde Brand / unbekannte id ⇒ null.
export async function getContainerRollup(
  brand: string, containerId: string,
): Promise<ContainerRollup | null> {
  const { rows } = await pool.query(
    `SELECT r.total_leaves, r.done_leaves, r.blocked_leaves,
            r.in_progress_leaves, r.awaiting_deploy_leaves, r.open_leaves,
            r.pct_done, r.health
       FROM tickets.tickets t
       JOIN tickets.v_cockpit_rollup r ON r.container_id = t.id
      WHERE t.id = $1 AND t.brand = $2 AND t.type IN ('project','feature')`,
    [containerId, brand],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    total: Number(r.total_leaves ?? 0),
    done: Number(r.done_leaves ?? 0),
    blocked: Number(r.blocked_leaves ?? 0),
    inProgress: Number(r.in_progress_leaves ?? 0),
    awaitingDeploy: Number(r.awaiting_deploy_leaves ?? 0),
    open: Number(r.open_leaves ?? 0),
    pctDone: Number(r.pct_done ?? 0),
    health: (r.health ?? 'amber') as HealthStatus,
  };
}
```

- [ ] **Step 4: Test ausführen → PASS**

Run: `cd website && pnpm vitest run src/lib/tickets/container-detail.test.ts`
Expected: 3 passed.

> **Hinweis pg-mem:** Sollte `WITH RECURSIVE` der View im pg-mem-Adapter nicht laufen, prüfe wie `cockpit-schema.test.ts` / `cockpit-db.test.ts` die View dort behandeln und übernimm deren Setup-Muster (ggf. `ensureCockpitViews` skippen und das Aggregat über eine Test-eigene Materialisierung prüfen). Erst messen (`pnpm vitest run src/lib/tickets/cockpit-schema.test.ts`), dann anpassen — nicht spekulativ umbauen.

- [ ] **Step 5: Commit**

```bash
git add website/src/lib/tickets/container-detail.ts website/src/lib/tickets/container-detail.test.ts
git commit -m "feat(cockpit): add getContainerRollup loader for container detail [T000950]"
```

---

## Task 2: `getTicketPlan` — gefilterter Plan-Load (Footgun-sicher)

**Files:**
- Modify: `website/src/lib/tickets/container-detail.ts`
- Test: `website/src/lib/tickets/container-detail.test.ts`

**Interfaces:**
- Produces: `export interface TicketPlan { id: number; slug: string; branch: string | null; prNumber: number | null; content: string; archivedAt: Date }` und `export async function getTicketPlan(brand: string, ticketId: string): Promise<TicketPlan | null>`. Lädt `content` NUR für genau dieses `ticket_id` (Brand-Guard über Join), neuester Eintrag (höchstes `archived_at`, Tiebreak `id`). Kein Plan → `null`.

- [ ] **Step 1: Failing-Test (an die bestehende Datei anhängen)**

```ts
// append to website/src/lib/tickets/container-detail.test.ts
import { getTicketPlan } from './container-detail';

describe('getTicketPlan', () => {
  it('returns the newest plan for the ticket only', async () => {
    const t = await pool.query(
      `INSERT INTO tickets.tickets (type, brand, title, status, priority)
       VALUES ('feature','mentolder','With Plan','backlog','mittel') RETURNING id`);
    const tid = t.rows[0].id;
    await pool.query(
      `INSERT INTO tickets.ticket_plans (ticket_id, slug, branch, content, pr_number, archived_at)
       VALUES ($1,'old-plan','feature/old','# Old',101, now() - interval '2 days'),
              ($1,'new-plan','feature/new','# New',202, now())`, [tid]);
    const p = await getTicketPlan('mentolder', tid);
    expect(p).not.toBeNull();
    expect(p!.slug).toBe('new-plan');
    expect(p!.branch).toBe('feature/new');
    expect(p!.prNumber).toBe(202);
    expect(p!.content).toBe('# New');
  });
  it('returns null when no plan exists', async () => {
    const t = await pool.query(
      `INSERT INTO tickets.tickets (type, brand, title, status, priority)
       VALUES ('feature','mentolder','No Plan','backlog','mittel') RETURNING id`);
    expect(await getTicketPlan('mentolder', t.rows[0].id)).toBeNull();
  });
  it('returns null for a ticket of another brand', async () => {
    const t = await pool.query(
      `INSERT INTO tickets.tickets (type, brand, title, status, priority)
       VALUES ('feature','mentolder','Brandcheck','backlog','mittel') RETURNING id`);
    await pool.query(
      `INSERT INTO tickets.ticket_plans (ticket_id, slug, content) VALUES ($1,'p','# c')`,
      [t.rows[0].id]);
    expect(await getTicketPlan('korczewski', t.rows[0].id)).toBeNull();
  });
});
```

- [ ] **Step 2: Test ausführen → FAIL**

Run: `cd website && pnpm vitest run src/lib/tickets/container-detail.test.ts -t getTicketPlan`
Expected: FAIL (`getTicketPlan is not a function`).

- [ ] **Step 3: Implementierung anhängen**

```ts
// append to website/src/lib/tickets/container-detail.ts
export interface TicketPlan {
  id: number;
  slug: string;
  branch: string | null;
  prNumber: number | null;
  content: string;
  archivedAt: Date;
}

// Lädt den neuesten Plan für GENAU dieses Ticket. content wird strikt per
// ticket_id gefiltert (CLAUDE.md: niemals content breit selektieren). Brand-Guard
// via Join auf tickets.tickets → fremde Brand ⇒ null.
export async function getTicketPlan(
  brand: string, ticketId: string,
): Promise<TicketPlan | null> {
  const { rows } = await pool.query(
    `SELECT p.id, p.slug, p.branch, p.pr_number, p.content, p.archived_at
       FROM tickets.ticket_plans p
       JOIN tickets.tickets t ON t.id = p.ticket_id AND t.brand = $2
      WHERE p.ticket_id = $1
      ORDER BY p.archived_at DESC, p.id DESC
      LIMIT 1`,
    [ticketId, brand],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    id: Number(r.id),
    slug: String(r.slug),
    branch: r.branch ?? null,
    prNumber: r.pr_number != null ? Number(r.pr_number) : null,
    content: String(r.content),
    archivedAt: r.archived_at,
  };
}
```

- [ ] **Step 4: Test ausführen → PASS**

Run: `cd website && pnpm vitest run src/lib/tickets/container-detail.test.ts`
Expected: alle passed.

- [ ] **Step 5: Commit**

```bash
git add website/src/lib/tickets/container-detail.ts website/src/lib/tickets/container-detail.test.ts
git commit -m "feat(cockpit): add getTicketPlan loader (filtered content) [T000950]"
```

---

## Task 3: `getContainerDor` — DoR/Lastenheft-Felder

**Files:**
- Modify: `website/src/lib/tickets/container-detail.ts`
- Test: `website/src/lib/tickets/container-detail.test.ts`

**Interfaces:**
- Consumes: `dorScore`, `DOR_KEYS`, `type Readiness` aus `../planning-office`.
- Produces: `export interface ContainerDor { valueProp: string | null; effort: string | null; areas: string[]; dependsOn: string[]; readiness: Readiness; dorScore: number; requirementsList: string[] }` und `export async function getContainerDor(brand: string, containerId: string): Promise<ContainerDor | null>`. `null` bei fremder Brand / Nicht-Container.

> **Architekturnotiz (Spec „Offene Annahmen"):** Die Spec ließ offen, ob die DoR-Felder in `getTicketDetail` ergänzt oder separat geladen werden. **Entscheidung: separater Loader in `container-detail.ts`.** Grund: `admin.ts` hat S1-Budget **0** — eine Erweiterung von `getTicketDetail`/`LIST_COLS` würde die Datei wachsen lassen und CI rot machen. Der separate Loader hält die Constraint sauber und bleibt S2-rein. `[id].astro` lädt ihn parallel (ein zusätzlicher `Promise.all`-Eintrag, conditional).

- [ ] **Step 1: Failing-Test**

```ts
// append to website/src/lib/tickets/container-detail.test.ts
import { getContainerDor } from './container-detail';

describe('getContainerDor', () => {
  it('reads DoR fields and computes dorScore', async () => {
    const t = await pool.query(
      `INSERT INTO tickets.tickets
         (type, brand, title, status, priority, value_prop, effort, areas, depends_on,
          readiness, requirements_list)
       VALUES ('feature','mentolder','DoR Feature','planning','mittel',
               'Nutzen X','mittel', ARRAY['website'], ARRAY['T000001'],
               '{"spec_skizziert":true,"aufwand_geschaetzt":true}'::jsonb,
               ARRAY['Req 1','Req 2'])
       RETURNING id`);
    const d = await getContainerDor('mentolder', t.rows[0].id);
    expect(d).not.toBeNull();
    expect(d!.valueProp).toBe('Nutzen X');
    expect(d!.effort).toBe('mittel');
    expect(d!.areas).toEqual(['website']);
    expect(d!.dependsOn).toEqual(['T000001']);
    expect(d!.requirementsList).toEqual(['Req 1','Req 2']);
    expect(d!.dorScore).toBe(2);
  });
  it('returns null for another brand', async () => {
    const t = await pool.query(
      `INSERT INTO tickets.tickets (type, brand, title, status, priority)
       VALUES ('feature','mentolder','Brand DoR','planning','mittel') RETURNING id`);
    expect(await getContainerDor('korczewski', t.rows[0].id)).toBeNull();
  });
});
```

- [ ] **Step 2: Test ausführen → FAIL**

Run: `cd website && pnpm vitest run src/lib/tickets/container-detail.test.ts -t getContainerDor`
Expected: FAIL (`getContainerDor is not a function`).

- [ ] **Step 3: Implementierung anhängen**

```ts
// append to website/src/lib/tickets/container-detail.ts
import { dorScore, DOR_KEYS, type Readiness } from '../planning-office';

export interface ContainerDor {
  valueProp: string | null;
  effort: string | null;
  areas: string[];
  dependsOn: string[];
  readiness: Readiness;
  dorScore: number;
  requirementsList: string[];
}

// DoR/Lastenheft-Felder für einen Container. Liest dieselben Spalten wie
// planning-office.ts (value_prop/effort/areas/depends_on/readiness/requirements_list)
// und berechnet dorScore über DOR_KEYS. Brand-Guard inline.
export async function getContainerDor(
  brand: string, containerId: string,
): Promise<ContainerDor | null> {
  const { rows } = await pool.query(
    `SELECT value_prop, effort, areas, depends_on, readiness, requirements_list
       FROM tickets.tickets
      WHERE id = $1 AND brand = $2 AND type IN ('project','feature')`,
    [containerId, brand],
  );
  const r = rows[0];
  if (!r) return null;
  const readiness: Readiness = r.readiness ?? {};
  return {
    valueProp: r.value_prop ?? null,
    effort: r.effort ?? null,
    areas: r.areas ?? [],
    dependsOn: r.depends_on ?? [],
    readiness,
    dorScore: dorScore(readiness),
    requirementsList: r.requirements_list ?? [],
  };
}

// Re-export der DoR-Schlüssel-Reihenfolge für die UI-Checkliste (S2: reine Konstante).
export { DOR_KEYS };
```

- [ ] **Step 4: Test ausführen → PASS**

Run: `cd website && pnpm vitest run src/lib/tickets/container-detail.test.ts`
Expected: alle passed.

- [ ] **Step 5: S2-Zyklencheck + Commit**

Run: `cd website && pnpm vitest run src/lib/tickets/container-detail.test.ts && wc -l src/lib/tickets/container-detail.ts`
Expected: passed; `container-detail.ts` deutlich < 600 (Wachstumsreserve ok).

```bash
git add website/src/lib/tickets/container-detail.ts website/src/lib/tickets/container-detail.test.ts
git commit -m "feat(cockpit): add getContainerDor loader [T000950]"
```

---

## Task 4: `ContainerChildrenList.astro` — gruppierte Kind-Liste

**Files:**
- Create: `website/src/components/admin/ContainerChildrenList.astro`

**Interfaces:**
- Consumes: `ListedTicket[]` (aus `getTicketDetail.children`); `statusLabel`, `priorityLabel` aus `../../lib/tickets/cockpit-labels`.
- Produces: Astro-Komponente mit Prop `children: { id: string; externalId: string | null; title: string; status: string; priority: string }[]`. Rendert die Tickets nach Status gruppiert mit `role="list"`/`role="listitem"`, Status- und Prio-Chips. Ersetzt die flache `<ul>` (`[id].astro` Z. 165–186).

- [ ] **Step 1: Komponente schreiben (keine eigene Test-Datei — wird via Playwright-Smoke in Task 9 abgedeckt)**

```astro
---
// website/src/components/admin/ContainerChildrenList.astro
// Kind-Tickets eines Containers, nach Status gruppiert. S1: .astro Limit 400.
import { statusLabel, priorityLabel } from '../../lib/tickets/cockpit-labels';

interface Child { id: string; externalId: string | null; title: string; status: string; priority: string; }
const { children } = Astro.props as { children: Child[] };

// Anzeige-Reihenfolge der Status-Gruppen (offen → aktiv → fertig).
const GROUP_ORDER = ['blocked','in_progress','in_review','qa_review','awaiting_deploy',
                     'triage','planning','plan_staged','backlog','done','archived'];
const byStatus = new Map<string, Child[]>();
for (const c of children) {
  (byStatus.get(c.status) ?? byStatus.set(c.status, []).get(c.status)!).push(c);
}
const groups = GROUP_ORDER.filter(s => byStatus.has(s)).map(s => ({ status: s, items: byStatus.get(s)! }));
const PRIO_CLS: Record<string, string> = { hoch: 'text-red-400', mittel: 'text-yellow-400', niedrig: 'text-green-400' };
---
<div class="bg-dark-light rounded-2xl border border-dark-lighter p-6">
  <h2 class="text-sm font-semibold text-light mb-3 font-serif uppercase tracking-wide">
    Kind-Tickets ({children.length})
  </h2>
  {groups.map(g => (
    <div class="mb-4 last:mb-0">
      <h3 class="text-xs text-muted uppercase tracking-wide mb-2">{statusLabel(g.status)} ({g.items.length})</h3>
      <ul class="space-y-2" role="list">
        {g.items.map(c => (
          <li class="flex items-center gap-3 text-sm" role="listitem">
            <span class="font-mono text-xs text-gold w-32 shrink-0">{c.externalId ?? c.id.slice(0, 8)}</span>
            <a href={`/admin/tickets/${c.id}`} class="text-light hover:text-gold flex-1 truncate">{c.title}</a>
            <span class={`text-xs font-semibold ${PRIO_CLS[c.priority] ?? 'text-muted'}`}>{priorityLabel(c.priority)}</span>
          </li>
        ))}
      </ul>
    </div>
  ))}
</div>
```

- [ ] **Step 2: Build-Check**

Run: `cd website && pnpm astro check --minimumSeverity error 2>&1 | tail -20` (oder, falls `astro check` zu langsam, `pnpm exec tsc --noEmit -p tsconfig.json` für die `.astro`-frei prüfbaren Teile überspringen und stattdessen in Task 8 via `pnpm build` validieren).
Expected: keine Errors in `ContainerChildrenList.astro`.

- [ ] **Step 3: Commit**

```bash
git add website/src/components/admin/ContainerChildrenList.astro
git commit -m "feat(cockpit): add ContainerChildrenList grouped by status [T000950]"
```

---

## Task 5: `ContainerRollupHeader.svelte` — Rollup + Lifecycle

**Files:**
- Create: `website/src/components/admin/ContainerRollupHeader.svelte`

**Interfaces:**
- Consumes: `ContainerRollup` (Task 1, importiert als `type` aus `../../lib/tickets/container-detail`); `statusLabel` aus `../../lib/tickets/cockpit-labels`.
- Produces: Svelte-5-Komponente mit Props `{ rollup: ContainerRollup; status: string; planBranch?: string | null; prNumber?: number | null }`. Rendert Fortschrittsbalken (`pctDone`), Breakdown-Zeile (done/blocked/in_progress/awaiting_deploy/open), Health-Punkt (Farbe aus `health`) und einen Lifecycle-Streifen (aktueller Status-Label + Plan-Branch + PR-Link aus bereits geladenen Daten). Kein Fetch.

- [ ] **Step 1: Komponente schreiben**

```svelte
<script lang="ts">
  // website/src/components/admin/ContainerRollupHeader.svelte
  // Rollup-Header für die Container-Vollansicht. Nur Anzeige bereits geladener
  // Daten (kein Fetch, keine SSE — Spec Nicht-Ziel). S1: .svelte Limit 500.
  import type { ContainerRollup } from '../../lib/tickets/container-detail';
  import { statusLabel } from '../../lib/tickets/cockpit-labels';

  let { rollup, status, planBranch = null, prNumber = null }:
    { rollup: ContainerRollup; status: string; planBranch?: string | null; prNumber?: number | null } = $props();

  const healthColor: Record<string, string> = { green: '#34d399', amber: '#fbbf24', red: '#f87171' };
</script>

<div class="bg-dark-light rounded-2xl border border-dark-lighter p-6">
  <div class="flex items-center gap-3 mb-3">
    <span class="inline-block w-3 h-3 rounded-full" style={`background:${healthColor[rollup.health] ?? '#fbbf24'}`} aria-hidden="true"></span>
    <span class="text-sm font-semibold text-light font-serif uppercase tracking-wide">Fortschritt</span>
    <span class="ml-auto text-sm font-mono text-gold">{rollup.pctDone}%</span>
  </div>
  <div class="w-full h-2 rounded-full bg-dark overflow-hidden mb-4">
    <div class="h-full bg-gold" style={`width:${rollup.pctDone}%`}></div>
  </div>
  <div class="flex flex-wrap gap-3 text-xs">
    <span class="text-green-400">Fertig {rollup.done}</span>
    <span class="text-red-400">Blockiert {rollup.blocked}</span>
    <span class="text-yellow-400">In Arbeit {rollup.inProgress}</span>
    <span class="text-blue-300">Wartet auf Deploy {rollup.awaitingDeploy}</span>
    <span class="text-muted">Offen {rollup.open}</span>
    <span class="text-muted ml-auto">Σ {rollup.total}</span>
  </div>
  <!-- Lifecycle-Streifen: Status + Plan-Branch + PR (bereits geladen) -->
  <div class="flex flex-wrap items-center gap-3 mt-4 pt-3 border-t border-dark-lighter text-xs">
    <span class="px-2 py-0.5 rounded-full border border-dark-lighter text-muted">{statusLabel(status)}</span>
    {#if planBranch}<span class="font-mono text-muted">⎇ {planBranch}</span>{/if}
    {#if prNumber}
      <a href={`https://github.com/Paddione/Bachelorprojekt/pull/${prNumber}`}
         target="_blank" rel="noopener" class="text-gold/70 hover:text-gold font-mono">PR #{prNumber}</a>
    {/if}
  </div>
</div>
```

- [ ] **Step 2: Commit**

```bash
git add website/src/components/admin/ContainerRollupHeader.svelte
git commit -m "feat(cockpit): add ContainerRollupHeader component [T000950]"
```

---

## Task 6: `TicketPlanPanel.svelte` — Plan-Metadaten + collapsible Markdown

**Files:**
- Create: `website/src/components/admin/TicketPlanPanel.svelte`

**Interfaces:**
- Consumes: `TicketPlan` (Task 2, `type`-Import aus `../../lib/tickets/container-detail`); `renderMarkdown` aus `../../lib/markdown` (bereits in `[id].astro` Z. 16 genutzt).
- Produces: Svelte-5-Komponente mit Props `{ plan: TicketPlan; renderedHtml: string }`. Plan-Metadaten (branch, PR, status/slug) immer sichtbar; `content` als Markdown in einem `<details>` (collapsible). **Wichtig:** `renderMarkdown` ist ein server-seitiger Helper — wird in `[id].astro` aufgerufen und als `renderedHtml`-String an die Komponente gereicht (Komponente importiert `renderMarkdown` NICHT selbst → kein S2-Risiko, da `markdown.ts` aber rein ist, ist auch ein direkter Import unkritisch; wir reichen das HTML durch, um Doppel-Rendern zu vermeiden).

- [ ] **Step 1: Komponente schreiben**

```svelte
<script lang="ts">
  // website/src/components/admin/TicketPlanPanel.svelte
  // Plan-Anzeige: Metadaten immer sichtbar, content-Markdown collapsible.
  import type { TicketPlan } from '../../lib/tickets/container-detail';

  let { plan, renderedHtml }: { plan: TicketPlan; renderedHtml: string } = $props();
</script>

<div class="bg-dark-light rounded-2xl border border-dark-lighter p-6">
  <h2 class="text-sm font-semibold text-light mb-3 font-serif uppercase tracking-wide">Plan</h2>
  <dl class="flex flex-wrap gap-x-6 gap-y-2 text-xs mb-3">
    <div><dt class="text-muted uppercase">Slug</dt><dd class="text-light font-mono">{plan.slug}</dd></div>
    {#if plan.branch}<div><dt class="text-muted uppercase">Branch</dt><dd class="text-light font-mono">{plan.branch}</dd></div>{/if}
    {#if plan.prNumber}
      <div><dt class="text-muted uppercase">PR</dt>
        <dd><a href={`https://github.com/Paddione/Bachelorprojekt/pull/${plan.prNumber}`}
               target="_blank" rel="noopener" class="text-gold hover:underline font-mono">#{plan.prNumber}</a></dd></div>
    {/if}
  </dl>
  <details>
    <summary class="cursor-pointer text-sm text-gold hover:underline">Plan-Inhalt anzeigen</summary>
    <div class="md-body text-light/90 mt-3">{@html renderedHtml}</div>
  </details>
</div>
```

- [ ] **Step 2: Commit**

```bash
git add website/src/components/admin/TicketPlanPanel.svelte
git commit -m "feat(cockpit): add TicketPlanPanel component [T000950]"
```

---

## Task 7: `ContainerDorPanel.svelte` — DoR-Checkliste

**Files:**
- Create: `website/src/components/admin/ContainerDorPanel.svelte`

**Interfaces:**
- Consumes: `ContainerDor`, `DOR_KEYS` (Task 3, aus `../../lib/tickets/container-detail`).
- Produces: Svelte-5-Komponente mit Prop `{ dor: ContainerDor }`. Zeigt DoR-Checkliste (4 `DOR_KEYS` aus `dor.readiness`, je ✓/✗), `dorScore`/4, valueProp, effort, areas-Chips, dependsOn-Chips, requirementsList als Liste. Read-only (kein Toggle — Bearbeitung bleibt im Planungsbüro).

- [ ] **Step 1: Komponente schreiben**

```svelte
<script lang="ts">
  // website/src/components/admin/ContainerDorPanel.svelte
  // DoR / Lastenheft (read-only) für die Container-Vollansicht.
  import type { ContainerDor } from '../../lib/tickets/container-detail';
  import { DOR_KEYS } from '../../lib/tickets/container-detail';

  let { dor }: { dor: ContainerDor } = $props();

  const DOR_LABELS: Record<string, string> = {
    spec_skizziert: 'Spec skizziert',
    offene_fragen_geklaert: 'Offene Fragen geklärt',
    abhaengigkeiten_klar: 'Abhängigkeiten klar',
    aufwand_geschaetzt: 'Aufwand geschätzt',
  };
</script>

<div class="bg-dark-light rounded-2xl border border-dark-lighter p-6">
  <div class="flex items-center justify-between mb-3">
    <h2 class="text-sm font-semibold text-light font-serif uppercase tracking-wide">Definition of Ready</h2>
    <span class="text-xs font-mono text-gold">{dor.dorScore}/4</span>
  </div>
  <ul class="space-y-1 text-sm mb-4" role="list">
    {#each DOR_KEYS as k}
      <li class="flex items-center gap-2" role="listitem">
        <span class={dor.readiness[k] ? 'text-green-400' : 'text-muted'}>{dor.readiness[k] ? '✓' : '○'}</span>
        <span class="text-light">{DOR_LABELS[k] ?? k}</span>
      </li>
    {/each}
  </ul>
  {#if dor.valueProp}<p class="text-sm text-light/90 mb-2"><span class="text-muted">Nutzen:</span> {dor.valueProp}</p>{/if}
  <div class="flex flex-wrap gap-3 text-xs mb-2">
    {#if dor.effort}<span class="text-muted">Aufwand: <span class="text-light">{dor.effort}</span></span>{/if}
    {#each dor.areas as a}<span class="px-1.5 py-0.5 rounded bg-dark border border-dark-lighter text-muted">{a}</span>{/each}
  </div>
  {#if dor.dependsOn.length > 0}
    <p class="text-xs text-muted mb-2">Abhängig von: {dor.dependsOn.join(', ')}</p>
  {/if}
  {#if dor.requirementsList.length > 0}
    <h3 class="text-xs text-muted uppercase tracking-wide mt-3 mb-1">Lastenheft</h3>
    <ul class="list-disc list-inside text-sm text-light/90 space-y-0.5" role="list">
      {#each dor.requirementsList as r}<li role="listitem">{r}</li>{/each}
    </ul>
  {/if}
</div>
```

- [ ] **Step 2: Commit**

```bash
git add website/src/components/admin/ContainerDorPanel.svelte
git commit -m "feat(cockpit): add ContainerDorPanel component [T000950]"
```

---

## Task 8: `[id].astro` — Status-Map-Fix + conditional Container-Sektionen (S1-kritisch)

**Files:**
- Modify: `website/src/pages/admin/tickets/[id].astro`

**Interfaces:**
- Consumes: `getContainerRollup`, `getTicketPlan`, `getContainerDor` (`container-detail.ts`); `statusLabel`, `priorityLabel`, `typeLabel`, `STATUS_LABELS` aus `cockpit-labels.ts`; die 4 neuen Komponenten.
- Produces: keine (Endpunkt-Seite).

**S1-Buchhaltung (Ist 394 · Limit 400 · Budget +6):**
- **ENTFERNEN** Z. 55–72: lokale `STATUS_LABEL`, `STATUS_CLS`, `TYPE_LABEL`, `PRIO_CLS`, `PRIO_ICON` (~18 Zeilen) → ersetzt durch 1 Import-Zeile aus `cockpit-labels.ts` + Beibehaltung der Farb-Klassen-Maps NUR falls weiter genutzt (siehe unten). Netto-Einsparung sichert das Budget für die Container-Einbindung.
- Die `STATUS_CLS`/`PRIO_CLS`/`PRIO_ICON`-**Farbmaps** sind reine CSS-Klassen (keine Labels). `cockpit-labels.ts` liefert nur Text-Labels. Behalte die Farbmaps schlank inline ODER lagere sie in eine kleine reine Konstante in `cockpit-labels.ts` aus — **bevorzugt: inline behalten, aber die Label-Maps löschen** (Label kommt jetzt aus `statusLabel()`/`typeLabel()`/`priorityLabel()`).

- [ ] **Step 1: Imports + Map-Ersatz**

Ersetze den Import-Block-Zusatz und lösche die Label-Maps. Neue Imports (nach Z. 16):

```ts
import { statusLabel, typeLabel, priorityLabel, STATUS_LABELS } from '../../../lib/tickets/cockpit-labels';
import { getContainerRollup, getTicketPlan, getContainerDor } from '../../../lib/tickets/container-detail';
import ContainerRollupHeader from '../../../components/admin/ContainerRollupHeader.svelte';
import TicketPlanPanel from '../../../components/admin/TicketPlanPanel.svelte';
import ContainerDorPanel from '../../../components/admin/ContainerDorPanel.svelte';
import ContainerChildrenList from '../../../components/admin/ContainerChildrenList.astro';
```

Lösche Z. 55–72 (`STATUS_LABEL`, `TYPE_LABEL`) und ersetze die verbleibenden Farbmaps durch eine kompakte Form (Status-Farbe darf für unbekannte neue Status leer sein — kein Crash):

```ts
const STATUS_CLS: Record<string, string> = {
  triage:'bg-purple-900/40 text-purple-300 border-purple-800',
  backlog:'bg-slate-900/40 text-slate-300 border-slate-700',
  in_progress:'bg-yellow-900/40 text-yellow-300 border-yellow-800',
  in_review:'bg-blue-900/40 text-blue-300 border-blue-800',
  blocked:'bg-red-900/40 text-red-300 border-red-800',
  done:'bg-green-900/40 text-green-300 border-green-800',
  archived:'bg-dark text-muted border-dark-lighter',
};
const PRIO_CLS: Record<string, string> = { hoch:'text-red-400', mittel:'text-yellow-400', niedrig:'text-green-400' };
const PRIO_ICON: Record<string, string> = { hoch:'▲', mittel:'●', niedrig:'▼' };
```

Ersetze die Verwendungen im Markup:
- `{TYPE_LABEL[ticket.type] ?? ticket.type}` → `{typeLabel(ticket.type)}` (Z. 102)
- `{STATUS_LABEL[ticket.status] ?? ticket.status}` → `{statusLabel(ticket.status)}` (Z. 105)
- `{STATUS_LABEL[c.status] ?? c.status}` in der Kind-Liste entfällt (Liste wird in Step 3 ersetzt).
- Sidebar-`STATUS_LABELS` (importiert) wird nicht direkt gebraucht; den Import auf die tatsächlich genutzten Funktionen reduzieren, wenn `STATUS_LABELS` ungenutzt → entfernen, damit kein Lint-Fehler entsteht.

- [ ] **Step 2: Container-Daten conditional laden (Frontmatter, nach Z. 53)**

```ts
const isContainer = ticket.type === 'project' || ticket.type === 'feature';
let containerRollup = null, ticketPlan = null, containerDor = null, planHtml = '';
try {
  if (isContainer) {
    [containerRollup, containerDor] = await Promise.all([
      getContainerRollup(BRAND, ticket.id),
      getContainerDor(BRAND, ticket.id),
    ]);
  }
  ticketPlan = await getTicketPlan(BRAND, ticket.id);
  if (ticketPlan) planHtml = renderMarkdown(ticketPlan.content);
} catch (err) {
  console.error('[admin/tickets/[id]] container data fetch failed:', err);
}
```

- [ ] **Step 3: Markup — Sektionen einbinden**

Direkt nach der Action-Bar (`[id].astro` Z. 133), VOR `<div class="grid ...">` (oder als erste Karten der Main-Column), einfügen:

```astro
{isContainer && containerRollup && (
  <div class="mb-6">
    <ContainerRollupHeader client:load
      rollup={containerRollup} status={ticket.status}
      planBranch={ticketPlan?.branch ?? null} prNumber={ticketPlan?.prNumber ?? null} />
  </div>
)}
```

In der Main-Column: ersetze den flachen Kind-Block (Z. 165–186) durch:

```astro
{isContainer && ticket.children.length > 0 ? (
  <ContainerChildrenList children={ticket.children} />
) : ticket.children.length > 0 && (
  <div class="bg-dark-light rounded-2xl border border-dark-lighter p-6">
    <h2 class="text-sm font-semibold text-light mb-3 font-serif uppercase tracking-wide">
      Kind-Tickets ({ticket.children.length})
    </h2>
    <ul class="space-y-2">
      {ticket.children.map(c => (
        <li class="flex items-center gap-3 text-sm">
          <span class="font-mono text-xs text-gold w-32 shrink-0">{c.externalId ?? c.id.slice(0, 8)}</span>
          <a href={`/admin/tickets/${c.id}`} class="text-light hover:text-gold flex-1 truncate">{c.title}</a>
          <span class={`text-xs px-2 py-0.5 rounded-full border whitespace-nowrap ${STATUS_CLS[c.status] ?? ''}`}>{statusLabel(c.status)}</span>
        </li>
      ))}
    </ul>
  </div>
)}
```

Plan- und DoR-Panels (Plan für jeden Typ mit Plan; DoR nur Container) in der Main-Column nach der Beschreibung:

```astro
{ticketPlan && <TicketPlanPanel client:load plan={ticketPlan} renderedHtml={planHtml} />}
{isContainer && containerDor && <ContainerDorPanel client:load dor={containerDor} />}
```

- [ ] **Step 4: Zeilen + Build verifizieren**

Run: `cd website && wc -l src/pages/admin/tickets/'[id]'.astro`
Expected: **≤ 400** (sonst Farbmaps weiter verschlanken oder ein kleines reines `cockpit-status-classes.ts` extrahieren — KEINE kosmetische Zeilenstauchung).

Run: `cd website && pnpm build 2>&1 | tail -30`
Expected: Build ok, keine Type-Errors in `[id].astro` / den 4 Komponenten.

- [ ] **Step 5: Commit**

```bash
git add "website/src/pages/admin/tickets/[id].astro"
git commit -m "feat(cockpit): wire container sections into ticket detail + cockpit-labels SSOT [T000950]"
```

---

## Task 9: Badge-Endpoint `container-count.ts`

**Files:**
- Create: `website/src/pages/api/admin/cockpit/container-count.ts`

**Interfaces:**
- Consumes: `getSession`, `isAdmin` aus `../../../../lib/auth`; `pool` aus `../../../../lib/website-db`.
- Produces: `GET` → `{ total: number }`. Zählt offene `project`/`feature`-Container der Brand (Status NOT IN `('done','archived')`, `is_test_data=false`). 403 ohne Admin. Muster: `inbox/count.ts`.

- [ ] **Step 1: Endpoint schreiben**

```ts
// website/src/pages/api/admin/cockpit/container-count.ts
// Offene project/feature-Container der Brand → Sidekick-Badge "Projekttickets".
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { pool } from '../../../../lib/website-db';

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
  }
  const brand = process.env.BRAND_ID ?? process.env.BRAND ?? 'mentolder';
  let total = 0;
  try {
    const r = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM tickets.tickets
        WHERE brand = $1 AND type IN ('project','feature')
          AND status NOT IN ('done','archived') AND is_test_data = false`,
      [brand]);
    total = Number(r.rows[0]?.count ?? 0);
  } catch { /* fail-soft: badge stays 0 */ }
  return new Response(JSON.stringify({ total }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
```

- [ ] **Step 2: Build-Check**

Run: `cd website && pnpm build 2>&1 | tail -20`
Expected: keine Errors.

- [ ] **Step 3: Commit**

```bash
git add website/src/pages/api/admin/cockpit/container-count.ts
git commit -m "feat(cockpit): add container-count endpoint for sidekick badge [T000950]"
```

---

## Task 10: Sidekick-Eintrag „Projekttickets" (SidekickHome + PortalSidekick + Test)

**Files:**
- Modify: `website/src/components/assistant/SidekickHome.svelte`
- Modify: `website/src/components/PortalSidekick.svelte`
- Modify: `website/src/components/PortalSidekick.test.ts`

**Interfaces:**
- `SidekickHome`: neues Prop `pendingContainers = 0` (Badge); neuer href-Item nach dem `loslernen`-Muster.
- `PortalSidekick`: neuer State `pendingContainers`, Fetch im Admin-`$effect`, Prop-Durchreichung an `SidekickHome` + Einrechnung in FAB-Badge-Summe.

- [ ] **Step 1: Failing-Test (PortalSidekick.test.ts erweitern)**

```ts
// append to website/src/components/PortalSidekick.test.ts
describe('PortalSidekick — Projekttickets entry', () => {
  it('shows the Projekttickets link only in the admin context', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ authenticated: true, user: {}, total: 0 }),
    } as Response);
    const { getByLabelText, getByText } = render(PortalSidekick, { helpContext: 'admin' });
    await fireEvent.click(getByLabelText('Sidekick öffnen'));
    const link = getByText('Projekttickets').closest('a');
    expect(link?.getAttribute('href')).toBe('/admin/cockpit');
  });

  it('does NOT show Projekttickets in the portal context', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ authenticated: true, user: {} }),
    } as Response);
    const { getByLabelText, queryByText } = render(PortalSidekick, { helpContext: 'portal' });
    await fireEvent.click(getByLabelText('Sidekick öffnen'));
    expect(queryByText('Projekttickets')).toBeNull();
  });
});
```

- [ ] **Step 2: Test ausführen → FAIL**

Run: `cd website && pnpm vitest run src/components/PortalSidekick.test.ts -t Projekttickets`
Expected: FAIL (kein „Projekttickets"-Element).

- [ ] **Step 3a: `SidekickHome.svelte` — Prop + Item**

Prop ergänzen (im `$props()`-Destructuring, nach `pendingInbox`):

```ts
    pendingContainers = 0,
```
und im Typ-Block:
```ts
    pendingContainers?: number;
```

Im `items`-Array (nach der `inbox`-Zeile, Z. 37) einfügen — href-Item nach dem `loslernen`-Muster (`id` ist Pseudo-Wert außerhalb der `View`-Union, daher `as View`-Cast NICHT nötig, da `Item.id: View` — siehe Hinweis):

```ts
    { id: 'projekttickets' as View, no: '03', title: 'Projekttickets', sub: 'Container-Vollansicht: Rollup, Plan, DoR', badge: pendingContainers > 0 ? pendingContainers : undefined, show: isAdmin, href: '/admin/cockpit' },
```

**Renumbering:** Die `no`-Werte sind rein kosmetisch (Anzeige-Index). Setze die Admin-`no`-Folge fortlaufend neu: `tickets=01, inbox=02, projekttickets=03, pipeline=04, grilling=05, questionnaire=isAdmin?'06':'01', support='07'/'02', agent-guide='08'/'03', loslernen='09'/'04', mediaviewer='10'/'05', help='11'/'06'`. Passe die bestehenden `no`-Literale entsprechend an.

> **Hinweis zum `Item.id`-Typ:** `Item.id` ist als `View` typisiert, aber das bestehende `loslernen`-Item nutzt bereits einen Wert außerhalb der Union ohne Cast (TS toleriert das via String-Literal-Widening im Array-Literal nicht immer — falls `tsc` meckert, identisch zu `loslernen` behandeln: prüfe ob `loslernen` einen Cast hat; wenn nein, braucht `projekttickets` auch keinen; wenn `tsc` doch meckert, ergänze `as View` bei BEIDEN Pseudo-Items oder erweitere den `View`-Type lokal um die zwei href-only Pseudo-Ids). Der href-Zweig (`{#if item.href}`) rendert ohne `onNavigate(item.id)`-Aufruf, daher ist die Laufzeit unkritisch.

- [ ] **Step 3b: `PortalSidekick.svelte` — State + Fetch + Durchreichung**

State nach `inboxPending` (Z. 38):
```ts
  let pendingContainers = $state(0);
```

Im Admin-`$effect` (nach dem inbox-Fetch-Block, Z. 129–136) ergänzen:
```ts
          try {
            const cRes = await fetch('/api/admin/cockpit/container-count', { credentials: 'same-origin' });
            if (cRes.ok) {
              const cd = await cRes.json() as { total?: number };
              pendingContainers = cd.total ?? 0;
            }
          } catch { /* badge stays 0 */ }
```

FAB-Badge-Summe erweitern (Z. 199–201): `pendingQuestionnaires + pendingTickets + inboxPending + pendingContainers` (an beiden Stellen: Bedingung Z. 199 UND Summe Z. 200; auch in `showLearnDot` Z. 51).

`SidekickHome`-Aufruf (Z. 251–260) um `pendingContainers={pendingContainers}` ergänzen.

- [ ] **Step 4: Test ausführen → PASS**

Run: `cd website && pnpm vitest run src/components/PortalSidekick.test.ts`
Expected: alle passed (inkl. bestehender mediaviewer-Test).

- [ ] **Step 5: Zeilen-Check + Commit**

Run: `cd website && wc -l src/components/PortalSidekick.svelte src/components/assistant/SidekickHome.svelte`
Expected: PortalSidekick ≤ 500, SidekickHome ≤ 500.

```bash
git add website/src/components/PortalSidekick.svelte website/src/components/assistant/SidekickHome.svelte website/src/components/PortalSidekick.test.ts
git commit -m "feat(cockpit): add admin Projekttickets sidekick entry with badge [T000950]"
```

---

## Task 11: OpenSpec-Artefakte aktualisieren

**Files:**
- Modify: `openspec/changes/projekttickets-cockpit/proposal.md`
- Modify: `openspec/changes/projekttickets-cockpit/tasks.md`
- Modify: `openspec/changes/projekttickets-cockpit/specs/projekttickets-cockpit.md`

- [ ] **Step 1: proposal.md füllen** (Why/What aus der Spec, 1 Absatz je Abschnitt).
- [ ] **Step 2: tasks.md** = dieselben Tasks 1–10 als OpenSpec-Checklisten (eine `## Task N`-Sektion je Task, `- [ ]`-Items).
- [ ] **Step 3: specs/projekttickets-cockpit.md** = `## ADDED Requirements` mit H3-Requirements + H4-Scenarios (siehe OpenSpec-Datei dieses Plans — identischer Inhalt).
- [ ] **Step 4: Validieren**

Run: `bash scripts/openspec.sh validate` (oder `task test:openspec`)
Expected: grün (keine Validierungsfehler im `projekttickets-cockpit`-Change-Tree).

- [ ] **Step 5: Commit**

```bash
git add openspec/changes/projekttickets-cockpit
git commit -m "docs(openspec): fill projekttickets-cockpit proposal/tasks/spec [T000950]"
```

---

## Task 12: Optionaler Playwright-Smoke (nur falls Live-Env verfügbar)

**Files:**
- Modify/Extend: bestehende Cockpit/Admin-Playwright-Suite (zuerst suchen: `grep -rl "admin/tickets" tests e2e website/tests 2>/dev/null`); KEINE neue Datei, wenn eine passende Suite existiert.

**Interfaces:** Smoke gegen ein bekanntes `feature`-Ticket: Rollup-Header + Plan-Panel + DoR-Panel sichtbar; ein `task`-Leaf zeigt sie NICHT.

- [ ] **Step 1:** Bestehende Admin-E2E-Suite finden und einen `test()`-Block ergänzen (Selektoren: Texte „Fortschritt", „Plan", „Definition of Ready"). Falls keine Live-Env/Suite vorhanden → diesen Task als „deferred to dev-flow-e2e nach Deploy" notieren und überspringen (Spec markiert Playwright als optional).

- [ ] **Step 2: Commit** (nur falls Test ergänzt).

---

## Task 13: Finaler Verifikations-Task (PFLICHT)

**Files:** keine neuen — nur Verifikation + ggf. generierte Artefakte.

- [ ] **Step 1: Test-Inventar regenerieren** (es wurden Tests hinzugefügt)

Run: `task test:inventory`
Dann: `git add website/src/data/test-inventory.json`
Expected: Inventar enthält `container-detail.test.ts` + neue PortalSidekick-Cases.

- [ ] **Step 2: Gezielte Tests der geänderten Domains**

Run: `task test:changed`
Expected: PASS (vitest --changed + BATS-Selection + quality für die berührten Dateien).

- [ ] **Step 3: OpenSpec validieren**

Run: `task test:openspec` (oder `bash scripts/openspec.sh validate`)
Expected: grün.

- [ ] **Step 4: Freshness-Artefakte regenerieren**

Run: `task freshness:regenerate`
Dann: `git add` der regenerierten Artefakte (test-inventory, repo-index, …).

- [ ] **Step 5: CI-Äquivalent (S1–S4-Ratchet + Baseline-Assertion)**

Run: `task freshness:check`
Expected: **grün** — insbesondere:
- `[id].astro` ≤ 400 (S1 neu/nicht-baselined),
- `container-detail.ts` < 600, neue Komponenten < 500 / `.astro` < 400,
- `admin.ts`/`cockpit-db.ts` UNVERÄNDERT (keine Baseline-Verschlechterung),
- keine neuen Baseline-Keys (Key-Count-Assertion),
- S2: keine neuen Import-Zyklen (`container-detail.ts` rein),
- S3: keine Brand-Domain-Literale.

Falls `[id].astro` > 400: Farb-Klassen-Maps in ein neues reines Modul `website/src/lib/tickets/cockpit-status-classes.ts` (Limit 600, S2-rein) extrahieren und importieren — echter Split, keine kosmetische Stauchung.

- [ ] **Step 6: Commit der generierten Artefakte**

```bash
git add website/src/data/test-inventory.json docs/code-quality/repo-index.json docs/generated 2>/dev/null || true
git commit -m "chore(cockpit): regenerate inventory + freshness artifacts [T000950]" || true
```

---

## Self-Review (gegen die Spec)

**Spec-Coverage:**
- Container-Vollansicht conditional bei `project/feature` → Task 8. ✓
- 4 Komponenten (`ContainerRollupHeader`, `TicketPlanPanel`, `ContainerDorPanel`, `ContainerChildrenList`) → Tasks 5/6/7/4. ✓
- `getContainerRollup` (View per container uuid) → Task 1. ✓
- `getTicketPlan` (content gefiltert, neuester) → Task 2. ✓
- DoR-Felder (`value_prop/effort/areas/depends_on/readiness/requirements_list/dorScore`) → Task 3. ✓
- Status-Map-Fix via `cockpit-labels.ts` → Task 8. ✓
- Sidekick href-Eintrag + Badge + Endpoint → Tasks 9/10. ✓ (kein neuer View-Slug — bestätigt via `loslernen`-Muster.)
- Fail-soft + Brand-Scoping → in jedem Loader + `[id].astro` try/catch. ✓
- Vitest (`getTicketPlan`, `getContainerRollup`, Sidekick-Eintrag) → Tasks 1/2/10. ✓ (+ `getContainerDor` Task 3.)
- Playwright optional → Task 12. ✓

**Architektur-Korrekturen vs. Spec-Annahmen:**
- Spec ließ „extId vs uuid" offen → **uuid** verifiziert (`v_cockpit_rollup.container_id = tickets.id`); `getContainerRollup` nimmt uuid, kein Lookup.
- Spec bot „DoR in `getTicketDetail` ergänzen ODER separat" → **separat** (`admin.ts` Budget 0 zwingt dazu).

**Type-Konsistenz:** `ContainerRollup`/`TicketPlan`/`ContainerDor` werden in Tasks 1–3 definiert und in Tasks 5/6/7/8 unter identischen Namen/Feldern konsumiert. `getContainerRollup(brand, containerId)`, `getTicketPlan(brand, ticketId)`, `getContainerDor(brand, containerId)` — Signaturen konsistent über alle Tasks.

**Placeholder-Scan:** keine offenen Lückenfüller, keine „handle edge cases"-Phrasen; jeder Code-Step zeigt vollständigen Code.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-19-projekttickets-cockpit.md`.

Empfohlen: **Subagent-Driven** (frischer Subagent je Task, Review zwischen Tasks). Alternativ Inline-Execution via `dev-flow-execute`.

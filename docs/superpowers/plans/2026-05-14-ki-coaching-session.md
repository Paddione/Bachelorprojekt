---
title: KI-Coaching Session-Wizard Implementation Plan
domains: []
status: active
pr_number: null
---

# KI-Coaching Session-Wizard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Einen geführten 10-Schritt-Wizard für "Triadisches KI-Coaching" im Admin-Bereich bauen, der pro Schritt KI-Vorschläge via Anthropic generiert und ein vollständiges Sitzungsprotokoll speichert.

**Architecture:** Linearer Stepper (SessionWizard.svelte, client:load) auf `/admin/coaching/sessions/[id]`. Zwei neue DB-Tabellen (`coaching.sessions`, `coaching.session_steps`) in `k3d/website-schema.yaml`. 5 API-Routen unter `/api/admin/coaching/sessions/`. KI-Aufrufe serverseitig via Anthropic SDK (Haiku 4.5).

**Tech Stack:** Astro 5, Svelte 5 (Runes), PostgreSQL (`pg-mem` für Tests), Anthropic SDK (`@anthropic-ai/sdk`), Vitest.

---

## Datei-Übersicht

| Datei | Aktion | Zweck |
|---|---|---|
| `k3d/website-schema.yaml` | Modify | +2 CREATE TABLE für coaching.sessions + session_steps |
| `website/src/lib/coaching-session-db.ts` | Create | DB-Funktionen für Sessions + Steps |
| `website/src/lib/coaching-session-db.test.ts` | Create | Unit-Tests mit pg-mem |
| `website/src/lib/coaching-session-prompts.ts` | Create | 10 Schritt-Definitionen + System-Prompts |
| `website/src/pages/api/admin/coaching/sessions/index.ts` | Create | GET (Liste) + POST (anlegen) |
| `website/src/pages/api/admin/coaching/sessions/[id]/index.ts` | Create | GET (Session + Schritte) |
| `website/src/pages/api/admin/coaching/sessions/[id]/steps/[n]/index.ts` | Create | PATCH (Eingaben/Notiz speichern) |
| `website/src/pages/api/admin/coaching/sessions/[id]/steps/[n]/generate.ts` | Create | POST (KI aufrufen) |
| `website/src/pages/api/admin/coaching/sessions/[id]/complete.ts` | Create | POST (abschließen + Bericht) |
| `website/src/components/admin/coaching/SessionWizard.svelte` | Create | Haupt-Wizard-Komponente |
| `website/src/pages/admin/coaching/sessions/index.astro` | Create | Sessions-Liste |
| `website/src/pages/admin/coaching/sessions/new.astro` | Create | Neue Session anlegen |
| `website/src/pages/admin/coaching/sessions/[id].astro` | Create | Wizard-Seite |
| `website/src/layouts/AdminLayout.astro` | Modify | +Coaching-Navigationsgruppe |

---

## Task 1: DB-Schema — neue Tabellen in website-schema.yaml

**Files:**
- Modify: `k3d/website-schema.yaml`

- [ ] **Schritt 1.1: Tabellen nach dem letzten coaching-Block einfügen**

Öffne `k3d/website-schema.yaml`. Suche nach der Zeile:
```
      CREATE INDEX IF NOT EXISTS idx_drafts_chunk ON coaching.drafts(knowledge_chunk_id);
```
Direkt dahinter (vor der nächsten Leerzeile oder vor `GRANT USAGE`) folgende SQL-Blöcke einfügen:

```yaml
      CREATE TABLE IF NOT EXISTS coaching.sessions (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        brand         TEXT NOT NULL DEFAULT 'mentolder',
        client_id     UUID REFERENCES public.customers(id) ON DELETE SET NULL,
        mode          TEXT NOT NULL DEFAULT 'live' CHECK (mode IN ('live','prep')),
        title         TEXT NOT NULL,
        status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','abandoned')),
        created_by    TEXT NOT NULL,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        completed_at  TIMESTAMPTZ
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_brand ON coaching.sessions(brand);
      CREATE INDEX IF NOT EXISTS idx_sessions_client ON coaching.sessions(client_id);

      CREATE TABLE IF NOT EXISTS coaching.session_steps (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id    UUID NOT NULL REFERENCES coaching.sessions(id) ON DELETE CASCADE,
        step_number   INT NOT NULL,
        step_name     TEXT NOT NULL,
        phase         TEXT NOT NULL CHECK (phase IN ('problem_ziel','analyse','loesung','umsetzung')),
        coach_inputs  JSONB NOT NULL DEFAULT '{}',
        ai_prompt     TEXT,
        ai_response   TEXT,
        coach_notes   TEXT,
        status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','generated','accepted','skipped')),
        generated_at  TIMESTAMPTZ,
        UNIQUE (session_id, step_number)
      );
      CREATE INDEX IF NOT EXISTS idx_session_steps_session ON coaching.session_steps(session_id);
```

- [ ] **Schritt 1.2: Schema auf Produktionsdatenbank anwenden**

```bash
PGPOD=$(kubectl get pod -n workspace --context mentolder -l app=shared-db -o name | head -1)

kubectl exec "$PGPOD" -n workspace --context mentolder -- psql -U website -d website -c "
CREATE TABLE IF NOT EXISTS coaching.sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand TEXT NOT NULL DEFAULT 'mentolder',
  client_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  mode TEXT NOT NULL DEFAULT 'live' CHECK (mode IN ('live','prep')),
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','abandoned')),
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS coaching.session_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES coaching.sessions(id) ON DELETE CASCADE,
  step_number INT NOT NULL,
  step_name TEXT NOT NULL,
  phase TEXT NOT NULL CHECK (phase IN ('problem_ziel','analyse','loesung','umsetzung')),
  coach_inputs JSONB NOT NULL DEFAULT '{}',
  ai_prompt TEXT,
  ai_response TEXT,
  coach_notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','generated','accepted','skipped')),
  generated_at TIMESTAMPTZ,
  UNIQUE (session_id, step_number)
);
"
```

Erwartet: `CREATE TABLE` zweimal — keine Fehler.

- [ ] **Schritt 1.3: Gleiches für korczewski**

```bash
PGPOD=$(kubectl get pod -n workspace-korczewski --context korczewski-ha -l app=shared-db -o name | head -1)
# Selbes SQL wie oben — beide Cluster müssen synchron sein
kubectl exec "$PGPOD" -n workspace-korczewski --context korczewski-ha -- psql -U website -d website -c "... (selbes SQL)"
```

- [ ] **Schritt 1.4: Commit**

```bash
cd /home/gekko/Bachelorprojekt/.claude/worktrees/feature+ki-coaching-session
git add k3d/website-schema.yaml
git commit -m "feat(db): add coaching.sessions + session_steps tables"
```

---

## Task 2: coaching-session-prompts.ts — 10 Schritt-Definitionen

**Files:**
- Create: `website/src/lib/coaching-session-prompts.ts`

- [ ] **Schritt 2.1: Datei erstellen**

```typescript
// website/src/lib/coaching-session-prompts.ts

export type Phase = 'problem_ziel' | 'analyse' | 'loesung' | 'umsetzung';

export interface StepInput {
  key: string;
  label: string;
  required: boolean;
  multiline?: boolean;
}

export interface StepDefinition {
  stepNumber: number;
  stepName: string;
  phase: Phase;
  phaseLabel: string;
  inputs: StepInput[];
  systemPrompt: string;
  userTemplate: string;
}

const BASE_SYSTEM = `Du bist ein erfahrener Coaching-Assistent (Triadisches KI-Coaching nach Geißler).
Deine Aufgabe: basierend auf den Coach-Eingaben eine präzise, handlungsorientierte Gesprächsintervention vorschlagen.
Sprache: Deutsch. Maximal 250 Wörter. Kein wörtliches Buchzitat. Keine allgemeinen Ratschläge — konkret zur Situation.`;

export const STEP_DEFINITIONS: StepDefinition[] = [
  {
    stepNumber: 1,
    stepName: 'Erstanamnese',
    phase: 'problem_ziel',
    phaseLabel: 'Phase 1: Problem & Ziel',
    inputs: [
      { key: 'anlass', label: 'Anlass der Session', required: true, multiline: true },
      { key: 'vorerfahrung', label: 'Vorerfahrung mit Coaching', required: false },
      { key: 'situation', label: 'Aktuelle Situation (in Worten des Klienten)', required: true, multiline: true },
    ],
    systemPrompt: BASE_SYSTEM,
    userTemplate: `Erstanamnese:
Anlass: {anlass}
Vorerfahrung: {vorerfahrung}
Aktuelle Situation: {situation}

Schlage eine einfühlsame Eröffnungsintervention vor, die die Situation würdigt und den Klienten einlädt, tiefer zu gehen.`,
  },
  {
    stepNumber: 2,
    stepName: 'Schlüsselaffekt',
    phase: 'problem_ziel',
    phaseLabel: 'Phase 1: Problem & Ziel',
    inputs: [
      { key: 'hauptgefuehl', label: 'Hauptgefühl des Klienten', required: true },
      { key: 'koerperreaktion', label: 'Körperliche Reaktion / wo spürbar', required: false },
      { key: 'ausloeser', label: 'Auslöser / Trigger', required: true },
    ],
    systemPrompt: BASE_SYSTEM,
    userTemplate: `Schlüsselaffekt-Arbeit:
Hauptgefühl: {hauptgefuehl}
Körperreaktion: {koerperreaktion}
Auslöser: {ausloeser}

Schlage eine Intervention vor, die den Klienten mit dem Schlüsselaffekt in Kontakt bringt, ohne ihn zu überwältigen.`,
  },
  {
    stepNumber: 3,
    stepName: 'Zielformulierung',
    phase: 'problem_ziel',
    phaseLabel: 'Phase 1: Problem & Ziel',
    inputs: [
      { key: 'wunschzustand', label: 'Wunschzustand des Klienten', required: true, multiline: true },
      { key: 'ressourcen', label: 'Bereits vorhandene Ressourcen', required: false },
      { key: 'erste_schritte', label: 'Erste Ideen für Schritte', required: false },
    ],
    systemPrompt: BASE_SYSTEM,
    userTemplate: `Zielformulierung:
Wunschzustand: {wunschzustand}
Ressourcen: {ressourcen}
Erste Ideen: {erste_schritte}

Hilf dabei, ein SMART-Ziel zu formulieren und die Brücke zwischen aktuellem Zustand und Wunschzustand zu bauen.`,
  },
  {
    stepNumber: 4,
    stepName: 'Teufelskreislauf',
    phase: 'analyse',
    phaseLabel: 'Phase 2: Analyse',
    inputs: [
      { key: 'ausloeser', label: 'Auslöser des Musters', required: true },
      { key: 'reaktion', label: 'Automatische Reaktion des Klienten', required: true, multiline: true },
      { key: 'konsequenz', label: 'Konsequenz / was sich dadurch verschlimmert', required: true },
    ],
    systemPrompt: BASE_SYSTEM,
    userTemplate: `Teufelskreislauf-Analyse:
Auslöser: {ausloeser}
Automatische Reaktion: {reaktion}
Konsequenz: {konsequenz}

Beschreibe den Teufelskreislauf und schlage einen Interventionspunkt vor, an dem der Klient aussteigen könnte.`,
  },
  {
    stepNumber: 5,
    stepName: 'Ressourcenanalyse',
    phase: 'analyse',
    phaseLabel: 'Phase 2: Analyse',
    inputs: [
      { key: 'staerken', label: 'Stärken und Fähigkeiten des Klienten', required: true, multiline: true },
      { key: 'bisherige_versuche', label: 'Was hat der Klient bisher versucht?', required: false },
      { key: 'externe_unterstuetzung', label: 'Externe Unterstützung / Netzwerk', required: false },
    ],
    systemPrompt: BASE_SYSTEM,
    userTemplate: `Ressourcenanalyse:
Stärken: {staerken}
Bisherige Versuche: {bisherige_versuche}
Externes Netzwerk: {externe_unterstuetzung}

Schlage vor, wie der Klient seine Ressourcen gezielt für das Ziel aktivieren kann.`,
  },
  {
    stepNumber: 6,
    stepName: 'Komplementärkräfte',
    phase: 'analyse',
    phaseLabel: 'Phase 2: Analyse',
    inputs: [
      { key: 'gegensatz', label: 'Gegensatz zum Problem / was fehlt', required: true },
      { key: 'polaritaet', label: 'Polarität (z.B. Kontrolle ↔ Loslassen)', required: false },
      { key: 'verborgene_staerke', label: 'Verborgene Stärke im Problem', required: false },
    ],
    systemPrompt: BASE_SYSTEM,
    userTemplate: `Komplementärkräfte:
Gegensatz: {gegensatz}
Polarität: {polaritaet}
Verborgene Stärke: {verborgene_staerke}

Zeige auf, wie die Komplementärkräfte zur Lösungsentwicklung genutzt werden können.`,
  },
  {
    stepNumber: 7,
    stepName: 'Lösungsentwicklung / Bildarbeit',
    phase: 'loesung',
    phaseLabel: 'Phase 3: Lösung',
    inputs: [
      { key: 'bild_metapher', label: 'Bild oder Metapher des Klienten für die Lösung', required: true, multiline: true },
      { key: 'koerperliche_empfindung', label: 'Körperliche Empfindung beim Bild', required: false },
      { key: 'verknuepfung', label: 'Verknüpfung zur aktuellen Situation', required: false },
    ],
    systemPrompt: BASE_SYSTEM,
    userTemplate: `Immersive Bildarbeit:
Bild/Metapher: {bild_metapher}
Körperliche Empfindung: {koerperliche_empfindung}
Verknüpfung: {verknuepfung}

Begleite den Klienten tiefer in das Lösungsbild hinein. Schlage Fragen vor, die das Bild lebendig machen.`,
  },
  {
    stepNumber: 8,
    stepName: 'Erfolgsimagination',
    phase: 'loesung',
    phaseLabel: 'Phase 3: Lösung',
    inputs: [
      { key: 'erfolgsbild', label: 'Wie sieht Erfolg aus (konkret)?', required: true, multiline: true },
      { key: 'gefuehl_bei_erfolg', label: 'Wie fühlt sich das an?', required: false },
      { key: 'veraenderung', label: 'Was hat sich verändert (Verhalten, Beziehungen)?', required: false },
    ],
    systemPrompt: BASE_SYSTEM,
    userTemplate: `Erfolgsimagination:
Erfolgsbild: {erfolgsbild}
Gefühl: {gefuehl_bei_erfolg}
Veränderung: {veraenderung}

Verankere die Erfolgsimagination und leite über zur konkreten Umsetzungsplanung.`,
  },
  {
    stepNumber: 9,
    stepName: 'Goldstücks-Aktivität',
    phase: 'umsetzung',
    phaseLabel: 'Phase 4: Umsetzung',
    inputs: [
      { key: 'konkrete_schritte', label: 'Konkrete nächste Schritte', required: true, multiline: true },
      { key: 'ressourcen_dafuer', label: 'Benötigte Ressourcen', required: false },
      { key: 'zeitplan', label: 'Zeitplan / bis wann', required: false },
    ],
    systemPrompt: BASE_SYSTEM,
    userTemplate: `Goldstücks-Aktivität (Umsetzungsplanung):
Konkrete Schritte: {konkrete_schritte}
Ressourcen: {ressourcen_dafuer}
Zeitplan: {zeitplan}

Identifiziere die eine "Goldstücks-Aktivität" — den einzelnen Schritt mit dem größten Hebel — und formuliere ihn als konkreten Auftrag.`,
  },
  {
    stepNumber: 10,
    stepName: 'Transfersicherung',
    phase: 'umsetzung',
    phaseLabel: 'Phase 4: Umsetzung',
    inputs: [
      { key: 'hindernisse', label: 'Mögliche Hindernisse', required: true, multiline: true },
      { key: 'unterstuetzung', label: 'Wer/was unterstützt?', required: false },
      { key: 'naechster_termin', label: 'Nächster Termin / Nachverfolgung', required: false },
    ],
    systemPrompt: BASE_SYSTEM,
    userTemplate: `Transfersicherung:
Hindernisse: {hindernisse}
Unterstützung: {unterstuetzung}
Nächster Termin: {naechster_termin}

Erstelle einen Sicherungsplan: wie überwindet der Klient die Hindernisse? Welche Notfallstrategie gibt es?`,
  },
];

export function getStepDef(stepNumber: number): StepDefinition {
  const def = STEP_DEFINITIONS.find(s => s.stepNumber === stepNumber);
  if (!def) throw new Error(`Step ${stepNumber} not found`);
  return def;
}

export function buildUserPrompt(def: StepDefinition, inputs: Record<string, string>): string {
  return def.userTemplate.replace(/\{(\w+)\}/g, (_, key) => inputs[key] ?? '—');
}
```

- [ ] **Schritt 2.2: Commit**

```bash
cd /home/gekko/Bachelorprojekt/.claude/worktrees/feature+ki-coaching-session
git add website/src/lib/coaching-session-prompts.ts
git commit -m "feat(coaching): add 10-step session prompt definitions"
```

---

## Task 3: coaching-session-db.ts + Tests

**Files:**
- Create: `website/src/lib/coaching-session-db.ts`
- Create: `website/src/lib/coaching-session-db.test.ts`

- [ ] **Schritt 3.1: Failing Test schreiben**

```typescript
// website/src/lib/coaching-session-db.test.ts
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { newDb } from 'pg-mem';
import type { Pool } from 'pg';
import {
  createSession,
  getSession,
  listSessions,
  upsertStep,
  getStep,
  completeSession,
} from './coaching-session-db';

let pool: Pool;

beforeAll(async () => {
  const db = newDb();
  db.public.registerFunction({
    name: 'gen_random_uuid',
    returns: 'uuid',
    impure: true,
    implementation: () =>
      'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      }),
  });
  db.public.none(`
    CREATE SCHEMA coaching;
    CREATE TABLE coaching.sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      brand TEXT NOT NULL DEFAULT 'mentolder',
      client_id UUID,
      mode TEXT NOT NULL DEFAULT 'live',
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_by TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      completed_at TIMESTAMPTZ
    );
    CREATE TABLE coaching.session_steps (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      session_id UUID NOT NULL REFERENCES coaching.sessions(id) ON DELETE CASCADE,
      step_number INT NOT NULL,
      step_name TEXT NOT NULL,
      phase TEXT NOT NULL,
      coach_inputs JSONB NOT NULL DEFAULT '{}',
      ai_prompt TEXT,
      ai_response TEXT,
      coach_notes TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      generated_at TIMESTAMPTZ,
      UNIQUE (session_id, step_number)
    );
  `);
  pool = db.adapters.createPg().Pool() as unknown as Pool;
});

describe('createSession', () => {
  it('creates a session and returns it', async () => {
    const s = await createSession(pool, {
      brand: 'mentolder', title: 'Test-Session', createdBy: 'coach1', mode: 'live',
    });
    expect(s.id).toBeTruthy();
    expect(s.title).toBe('Test-Session');
    expect(s.status).toBe('active');
    expect(s.clientId).toBeNull();
  });
});

describe('getSession', () => {
  it('returns session with steps', async () => {
    const s = await createSession(pool, {
      brand: 'mentolder', title: 'Mit Steps', createdBy: 'coach1', mode: 'prep',
    });
    await upsertStep(pool, {
      sessionId: s.id, stepNumber: 1, stepName: 'Erstanamnese', phase: 'problem_ziel',
      coachInputs: { anlass: 'Stress' },
    });
    const result = await getSession(pool, s.id);
    expect(result).not.toBeNull();
    expect(result!.steps).toHaveLength(1);
    expect(result!.steps[0].coachInputs).toEqual({ anlass: 'Stress' });
  });
});

describe('upsertStep', () => {
  it('updates an existing step on second call', async () => {
    const s = await createSession(pool, {
      brand: 'mentolder', title: 'Upsert-Test', createdBy: 'coach1', mode: 'live',
    });
    await upsertStep(pool, {
      sessionId: s.id, stepNumber: 1, stepName: 'Erstanamnese', phase: 'problem_ziel',
      coachInputs: { anlass: 'alt' },
    });
    await upsertStep(pool, {
      sessionId: s.id, stepNumber: 1, stepName: 'Erstanamnese', phase: 'problem_ziel',
      coachInputs: { anlass: 'neu' }, aiResponse: 'KI sagt...', status: 'generated',
    });
    const step = await getStep(pool, s.id, 1);
    expect(step!.coachInputs).toEqual({ anlass: 'neu' });
    expect(step!.aiResponse).toBe('KI sagt...');
    expect(step!.status).toBe('generated');
  });
});

describe('completeSession', () => {
  it('sets status to completed and stores report', async () => {
    const s = await createSession(pool, {
      brand: 'mentolder', title: 'Abschluss-Test', createdBy: 'coach1', mode: 'live',
    });
    await completeSession(pool, s.id, '# Bericht\nZusammenfassung...');
    const result = await getSession(pool, s.id);
    expect(result!.status).toBe('completed');
    expect(result!.completedAt).not.toBeNull();
    const report = result!.steps.find(s => s.stepNumber === 0);
    expect(report!.aiResponse).toContain('Zusammenfassung');
  });
});
```

- [ ] **Schritt 3.2: Test laufen lassen — erwartet FAIL**

```bash
cd /home/gekko/Bachelorprojekt/website
npx vitest run src/lib/coaching-session-db.test.ts 2>&1 | tail -20
```

Erwartet: `Cannot find module './coaching-session-db'`

- [ ] **Schritt 3.3: coaching-session-db.ts implementieren**

```typescript
// website/src/lib/coaching-session-db.ts
import type { Pool } from 'pg';

export interface Session {
  id: string;
  brand: string;
  clientId: string | null;
  mode: 'live' | 'prep';
  title: string;
  status: 'active' | 'completed' | 'abandoned';
  createdBy: string;
  createdAt: Date;
  completedAt: Date | null;
  steps: SessionStep[];
}

export interface SessionStep {
  id: string;
  sessionId: string;
  stepNumber: number;
  stepName: string;
  phase: string;
  coachInputs: Record<string, string>;
  aiPrompt: string | null;
  aiResponse: string | null;
  coachNotes: string | null;
  status: 'pending' | 'generated' | 'accepted' | 'skipped';
  generatedAt: Date | null;
}

export interface CreateSessionArgs {
  brand: string;
  clientId?: string | null;
  mode: 'live' | 'prep';
  title: string;
  createdBy: string;
}

export interface UpsertStepArgs {
  sessionId: string;
  stepNumber: number;
  stepName: string;
  phase: string;
  coachInputs?: Record<string, string>;
  aiPrompt?: string | null;
  aiResponse?: string | null;
  coachNotes?: string | null;
  status?: 'pending' | 'generated' | 'accepted' | 'skipped';
}

function rowToSession(row: Record<string, unknown>, steps: SessionStep[] = []): Session {
  return {
    id: row.id as string,
    brand: row.brand as string,
    clientId: (row.client_id as string | null) ?? null,
    mode: row.mode as 'live' | 'prep',
    title: row.title as string,
    status: row.status as Session['status'],
    createdBy: row.created_by as string,
    createdAt: row.created_at as Date,
    completedAt: (row.completed_at as Date | null) ?? null,
    steps,
  };
}

function rowToStep(row: Record<string, unknown>): SessionStep {
  return {
    id: row.id as string,
    sessionId: row.session_id as string,
    stepNumber: row.step_number as number,
    stepName: row.step_name as string,
    phase: row.phase as string,
    coachInputs: (row.coach_inputs as Record<string, string>) ?? {},
    aiPrompt: (row.ai_prompt as string | null) ?? null,
    aiResponse: (row.ai_response as string | null) ?? null,
    coachNotes: (row.coach_notes as string | null) ?? null,
    status: row.status as SessionStep['status'],
    generatedAt: (row.generated_at as Date | null) ?? null,
  };
}

export async function createSession(pool: Pool, args: CreateSessionArgs): Promise<Session> {
  const r = await pool.query(
    `INSERT INTO coaching.sessions (brand, client_id, mode, title, created_by)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [args.brand, args.clientId ?? null, args.mode, args.title, args.createdBy],
  );
  return rowToSession(r.rows[0]);
}

export async function getSession(pool: Pool, id: string): Promise<Session | null> {
  const [sessionRes, stepsRes] = await Promise.all([
    pool.query(`SELECT * FROM coaching.sessions WHERE id = $1`, [id]),
    pool.query(`SELECT * FROM coaching.session_steps WHERE session_id = $1 ORDER BY step_number`, [id]),
  ]);
  if (!sessionRes.rows[0]) return null;
  return rowToSession(sessionRes.rows[0], stepsRes.rows.map(rowToStep));
}

export async function listSessions(pool: Pool, brand: string): Promise<Session[]> {
  const r = await pool.query(
    `SELECT s.*, c.name AS client_name
     FROM coaching.sessions s
     LEFT JOIN public.customers c ON c.id = s.client_id
     WHERE s.brand = $1
     ORDER BY s.created_at DESC`,
    [brand],
  );
  return r.rows.map(row => rowToSession(row));
}

export async function upsertStep(pool: Pool, args: UpsertStepArgs): Promise<SessionStep> {
  const r = await pool.query(
    `INSERT INTO coaching.session_steps
       (session_id, step_number, step_name, phase, coach_inputs, ai_prompt, ai_response, coach_notes, status, generated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (session_id, step_number) DO UPDATE SET
       coach_inputs  = COALESCE(EXCLUDED.coach_inputs, coaching.session_steps.coach_inputs),
       ai_prompt     = COALESCE(EXCLUDED.ai_prompt,    coaching.session_steps.ai_prompt),
       ai_response   = COALESCE(EXCLUDED.ai_response,  coaching.session_steps.ai_response),
       coach_notes   = COALESCE(EXCLUDED.coach_notes,  coaching.session_steps.coach_notes),
       status        = EXCLUDED.status,
       generated_at  = COALESCE(EXCLUDED.generated_at, coaching.session_steps.generated_at)
     RETURNING *`,
    [
      args.sessionId, args.stepNumber, args.stepName, args.phase,
      JSON.stringify(args.coachInputs ?? {}),
      args.aiPrompt ?? null, args.aiResponse ?? null, args.coachNotes ?? null,
      args.status ?? 'pending',
      args.aiResponse ? new Date() : null,
    ],
  );
  return rowToStep(r.rows[0]);
}

export async function getStep(pool: Pool, sessionId: string, stepNumber: number): Promise<SessionStep | null> {
  const r = await pool.query(
    `SELECT * FROM coaching.session_steps WHERE session_id = $1 AND step_number = $2`,
    [sessionId, stepNumber],
  );
  return r.rows[0] ? rowToStep(r.rows[0]) : null;
}

export async function completeSession(pool: Pool, sessionId: string, reportMarkdown: string): Promise<void> {
  await pool.query(
    `UPDATE coaching.sessions SET status = 'completed', completed_at = now() WHERE id = $1`,
    [sessionId],
  );
  await upsertStep(pool, {
    sessionId,
    stepNumber: 0,
    stepName: 'Abschlussbericht',
    phase: 'umsetzung',
    coachInputs: {},
    aiResponse: reportMarkdown,
    status: 'accepted',
  });
}
```

- [ ] **Schritt 3.4: Tests laufen lassen — erwartet PASS**

```bash
cd /home/gekko/Bachelorprojekt/website
npx vitest run src/lib/coaching-session-db.test.ts 2>&1 | tail -20
```

Erwartet: alle Tests grün, keine Fehler.

- [ ] **Schritt 3.5: Commit**

```bash
cd /home/gekko/Bachelorprojekt/.claude/worktrees/feature+ki-coaching-session
git add website/src/lib/coaching-session-db.ts website/src/lib/coaching-session-db.test.ts
git commit -m "feat(coaching): coaching-session-db with unit tests"
```

---

## Task 4: API-Routen

**Files:**
- Create: `website/src/pages/api/admin/coaching/sessions/index.ts`
- Create: `website/src/pages/api/admin/coaching/sessions/[id]/index.ts`
- Create: `website/src/pages/api/admin/coaching/sessions/[id]/steps/[n]/index.ts`
- Create: `website/src/pages/api/admin/coaching/sessions/[id]/steps/[n]/generate.ts`
- Create: `website/src/pages/api/admin/coaching/sessions/[id]/complete.ts`

- [ ] **Schritt 4.1: sessions/index.ts (GET Liste + POST Anlegen)**

```typescript
// website/src/pages/api/admin/coaching/sessions/index.ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { createSession, listSessions } from '../../../../../lib/coaching-session-db';
import { pool } from '../../../../../lib/website-db';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });
  const brand = process.env.BRAND || 'mentolder';
  const sessions = await listSessions(pool, brand);
  return new Response(JSON.stringify({ sessions }), { headers: { 'content-type': 'application/json' } });
};

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });
  const brand = process.env.BRAND || 'mentolder';
  let body: { title: string; clientId?: string | null; mode?: 'live' | 'prep' };
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: { 'content-type': 'application/json' } });
  }
  if (!body.title?.trim()) {
    return new Response(JSON.stringify({ error: 'title required' }), { status: 400, headers: { 'content-type': 'application/json' } });
  }
  const created = await createSession(pool, {
    brand, title: body.title, createdBy: session.username,
    clientId: body.clientId ?? null, mode: body.mode ?? 'live',
  });
  return new Response(JSON.stringify({ session: created }), { status: 201, headers: { 'content-type': 'application/json' } });
};
```

- [ ] **Schritt 4.2: sessions/[id]/index.ts (GET Session + Steps)**

```typescript
// website/src/pages/api/admin/coaching/sessions/[id]/index.ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../../lib/auth';
import { getSession as getCoachingSession } from '../../../../../../lib/coaching-session-db';
import { pool } from '../../../../../../lib/website-db';

export const prerender = false;

export const GET: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });
  const coachingSession = await getCoachingSession(pool, params.id as string);
  if (!coachingSession) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { 'content-type': 'application/json' } });
  return new Response(JSON.stringify({ session: coachingSession }), { headers: { 'content-type': 'application/json' } });
};
```

- [ ] **Schritt 4.3: steps/[n]/index.ts (PATCH Eingaben/Notiz)**

```typescript
// website/src/pages/api/admin/coaching/sessions/[id]/steps/[n]/index.ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../../../lib/auth';
import { upsertStep } from '../../../../../../../lib/coaching-session-db';
import { getStepDef } from '../../../../../../../lib/coaching-session-prompts';
import { pool } from '../../../../../../../lib/website-db';

export const prerender = false;

export const PATCH: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });
  const sessionId = params.id as string;
  const stepNumber = parseInt(params.n as string, 10);
  if (isNaN(stepNumber) || stepNumber < 1 || stepNumber > 10) {
    return new Response(JSON.stringify({ error: 'Invalid step number' }), { status: 400, headers: { 'content-type': 'application/json' } });
  }
  let body: { coachInputs?: Record<string, string>; coachNotes?: string; status?: 'pending' | 'generated' | 'accepted' | 'skipped' };
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: { 'content-type': 'application/json' } });
  }
  const def = getStepDef(stepNumber);
  const step = await upsertStep(pool, {
    sessionId, stepNumber, stepName: def.stepName, phase: def.phase,
    coachInputs: body.coachInputs, coachNotes: body.coachNotes, status: body.status,
  });
  return new Response(JSON.stringify({ step }), { headers: { 'content-type': 'application/json' } });
};
```

- [ ] **Schritt 4.4: steps/[n]/generate.ts (POST KI aufrufen)**

```typescript
// website/src/pages/api/admin/coaching/sessions/[id]/steps/[n]/generate.ts
import type { APIRoute } from 'astro';
import Anthropic from '@anthropic-ai/sdk';
import { getSession, isAdmin } from '../../../../../../../lib/auth';
import { upsertStep } from '../../../../../../../lib/coaching-session-db';
import { getStepDef, buildUserPrompt } from '../../../../../../../lib/coaching-session-prompts';
import { pool } from '../../../../../../../lib/website-db';

export const prerender = false;

export const POST: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return new Response(JSON.stringify({ error: 'KI nicht konfiguriert (ANTHROPIC_API_KEY fehlt)' }), { status: 503, headers: { 'content-type': 'application/json' } });

  const sessionId = params.id as string;
  const stepNumber = parseInt(params.n as string, 10);
  if (isNaN(stepNumber) || stepNumber < 1 || stepNumber > 10) {
    return new Response(JSON.stringify({ error: 'Invalid step number' }), { status: 400, headers: { 'content-type': 'application/json' } });
  }

  let body: { coachInputs: Record<string, string> };
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: { 'content-type': 'application/json' } });
  }

  const def = getStepDef(stepNumber);
  const userPrompt = buildUserPrompt(def, body.coachInputs);
  const model = process.env.COACHING_SESSION_MODEL || 'claude-haiku-4-5-20251001';

  let aiResponse: string;
  try {
    const client = new Anthropic({ apiKey });
    const msg = await client.messages.create({
      model,
      max_tokens: 600,
      system: def.systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });
    aiResponse = msg.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map(b => b.text).join('');
  } catch (err) {
    console.error('[coaching/generate] Anthropic error:', err);
    return new Response(JSON.stringify({ error: 'KI-Anfrage fehlgeschlagen' }), { status: 502, headers: { 'content-type': 'application/json' } });
  }

  const step = await upsertStep(pool, {
    sessionId, stepNumber, stepName: def.stepName, phase: def.phase,
    coachInputs: body.coachInputs, aiPrompt: userPrompt, aiResponse, status: 'generated',
  });

  return new Response(JSON.stringify({ step }), { headers: { 'content-type': 'application/json' } });
};
```

- [ ] **Schritt 4.5: sessions/[id]/complete.ts (POST Abschließen + Bericht)**

```typescript
// website/src/pages/api/admin/coaching/sessions/[id]/complete.ts
import type { APIRoute } from 'astro';
import Anthropic from '@anthropic-ai/sdk';
import { getSession, isAdmin } from '../../../../../../lib/auth';
import { getSession as getCoachingSession, completeSession } from '../../../../../../lib/coaching-session-db';
import { pool } from '../../../../../../lib/website-db';

export const prerender = false;

export const POST: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });

  const sessionId = params.id as string;
  const coachingSession = await getCoachingSession(pool, sessionId);
  if (!coachingSession) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { 'content-type': 'application/json' } });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  let report = '# Abschlussbericht\n\n*(KI nicht verfügbar — bitte manuell ergänzen)*';

  if (apiKey) {
    const stepsText = coachingSession.steps
      .filter(s => s.stepNumber > 0)
      .map(s => `## Schritt ${s.stepNumber}: ${s.stepName}\n**Eingaben:** ${JSON.stringify(s.coachInputs)}\n**KI:** ${s.aiResponse ?? '—'}\n**Coach-Notiz:** ${s.coachNotes ?? '—'}`)
      .join('\n\n');

    try {
      const client = new Anthropic({ apiKey });
      const msg = await client.messages.create({
        model: process.env.COACHING_SESSION_MODEL || 'claude-haiku-4-5-20251001',
        max_tokens: 1200,
        system: `Du bist ein Coaching-Protokollant. Erstelle aus den 10 Schritten einer Coaching-Session eine strukturierte Zusammenfassung auf Deutsch.
Abschnitte: ## Ausgangslage, ## Analyse, ## Lösungsansatz, ## Vereinbarte Schritte, ## Bewertung.
Maximal 600 Wörter. Konkret und handlungsorientiert.`,
        messages: [{ role: 'user', content: stepsText }],
      });
      report = msg.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map(b => b.text).join('');
    } catch (err) {
      console.error('[coaching/complete] Report generation failed:', err);
    }
  }

  await completeSession(pool, sessionId, report);
  return new Response(JSON.stringify({ ok: true, sessionId }), { headers: { 'content-type': 'application/json' } });
};
```

- [ ] **Schritt 4.6: Commit**

```bash
cd /home/gekko/Bachelorprojekt/.claude/worktrees/feature+ki-coaching-session
git add website/src/pages/api/admin/coaching/sessions/
git commit -m "feat(coaching): add 5 API routes for session wizard"
```

---

## Task 5: SessionWizard.svelte

**Files:**
- Create: `website/src/components/admin/coaching/SessionWizard.svelte`

- [ ] **Schritt 5.1: Komponente erstellen**

```svelte
<!-- website/src/components/admin/coaching/SessionWizard.svelte -->
<script lang="ts">
  import { STEP_DEFINITIONS } from '../../../lib/coaching-session-prompts';
  import type { Session, SessionStep } from '../../../lib/coaching-session-db';

  let { sessionId, initialSession }: { sessionId: string; initialSession: Session } = $props();

  const PHASE_COLORS: Record<string, string> = {
    problem_ziel: 'bg-blue-500',
    analyse:      'bg-orange-500',
    loesung:      'bg-green-500',
    umsetzung:    'bg-purple-500',
  };
  const PHASE_TEXT: Record<string, string> = {
    problem_ziel: 'text-blue-400',
    analyse:      'text-orange-400',
    loesung:      'text-green-400',
    umsetzung:    'text-purple-400',
  };

  let session = $state<Session>(initialSession);
  let currentStep = $state(getInitialStep());
  let inputs = $state<Record<string, string>>({});
  let coachNotes = $state('');
  let loading = $state(false);
  let error = $state('');

  function getInitialStep(): number {
    const firstPending = session.steps.find(s => s.status === 'pending' || s.status === 'generated');
    return firstPending?.stepNumber ?? 1;
  }

  function getStepData(n: number): SessionStep | undefined {
    return session.steps.find(s => s.stepNumber === n);
  }

  $effect(() => {
    const existing = getStepData(currentStep);
    inputs = existing?.coachInputs ? { ...existing.coachInputs } : {};
    coachNotes = existing?.coachNotes ?? '';
  });

  const def = $derived(STEP_DEFINITIONS.find(s => s.stepNumber === currentStep)!);
  const stepData = $derived(getStepData(currentStep));
  const canGenerate = $derived(
    def?.inputs.filter(i => i.required).every(i => (inputs[i.key] ?? '').trim().length > 0) ?? false
  );
  const isCompleted = $derived(session.status === 'completed');

  async function saveInputs() {
    await fetch(`/api/admin/coaching/sessions/${sessionId}/steps/${currentStep}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ coachInputs: inputs, coachNotes }),
    });
  }

  async function generate() {
    loading = true; error = '';
    try {
      await saveInputs();
      const res = await fetch(`/api/admin/coaching/sessions/${sessionId}/steps/${currentStep}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coachInputs: inputs }),
      });
      const json = await res.json();
      if (!res.ok) { error = json.error ?? 'Fehler bei KI-Anfrage'; return; }
      session = {
        ...session,
        steps: session.steps.find(s => s.stepNumber === currentStep)
          ? session.steps.map(s => s.stepNumber === currentStep ? json.step : s)
          : [...session.steps, json.step],
      };
    } catch { error = 'Verbindungsfehler'; }
    finally { loading = false; }
  }

  async function accept() {
    loading = true; error = '';
    try {
      await fetch(`/api/admin/coaching/sessions/${sessionId}/steps/${currentStep}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coachInputs: inputs, coachNotes, status: 'accepted' }),
      });
      session = {
        ...session,
        steps: session.steps.map(s => s.stepNumber === currentStep ? { ...s, status: 'accepted', coachNotes } : s),
      };
      if (currentStep < 10) { currentStep++; }
    } catch { error = 'Fehler beim Speichern'; }
    finally { loading = false; }
  }

  async function reject() {
    session = {
      ...session,
      steps: session.steps.map(s => s.stepNumber === currentStep ? { ...s, status: 'pending', aiResponse: null } : s),
    };
    await fetch(`/api/admin/coaching/sessions/${sessionId}/steps/${currentStep}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ coachInputs: inputs, status: 'pending' }),
    });
  }

  async function skip() {
    loading = true;
    try {
      await fetch(`/api/admin/coaching/sessions/${sessionId}/steps/${currentStep}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coachInputs: inputs, coachNotes, status: 'skipped' }),
      });
      session = {
        ...session,
        steps: session.steps.map(s => s.stepNumber === currentStep ? { ...s, status: 'skipped' } : s),
      };
      if (currentStep < 10) { currentStep++; }
    } catch { error = 'Fehler'; }
    finally { loading = false; }
  }

  async function completeSession() {
    loading = true; error = '';
    try {
      const res = await fetch(`/api/admin/coaching/sessions/${sessionId}/complete`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok) { error = json.error ?? 'Fehler beim Abschließen'; return; }
      window.location.href = `/admin/coaching/sessions/${sessionId}`;
    } catch { error = 'Verbindungsfehler'; }
    finally { loading = false; }
  }

  function stepStatus(n: number): 'done' | 'current' | 'pending' {
    if (n === currentStep) return 'current';
    const s = getStepData(n);
    if (s?.status === 'accepted' || s?.status === 'skipped') return 'done';
    return 'pending';
  }
</script>

<div class="wizard">
  <!-- Fortschrittsbalken -->
  <div class="progress-bar" aria-label="Fortschritt">
    {#each STEP_DEFINITIONS as s}
      {@const status = stepStatus(s.stepNumber)}
      <button
        class="progress-step {PHASE_COLORS[s.phase]} {status === 'current' ? 'ring-2 ring-white scale-110' : ''} {status === 'done' ? 'opacity-100' : 'opacity-40'}"
        onclick={() => { currentStep = s.stepNumber; }}
        title="Schritt {s.stepNumber}: {s.stepName}"
        aria-current={status === 'current' ? 'step' : undefined}
      >
        {#if status === 'done'}✓{:else}{s.stepNumber}{/if}
      </button>
    {/each}
  </div>

  <!-- Schritt-Header -->
  <div class="step-header">
    <span class="phase-label {PHASE_TEXT[def.phase]}">{def.phaseLabel}</span>
    <h2 class="step-title">Schritt {currentStep}/10 — {def.stepName}</h2>
  </div>

  {#if error}
    <div class="error-box">{error}</div>
  {/if}

  <!-- Eingabefelder -->
  <div class="inputs-section">
    {#each def.inputs as input}
      <div class="input-group">
        <label class="input-label" for={input.key}>
          {input.label}{#if input.required}<span class="required">*</span>{/if}
        </label>
        {#if input.multiline}
          <textarea
            id={input.key}
            bind:value={inputs[input.key]}
            rows={3}
            class="input-field"
            placeholder={input.required ? 'Pflichtfeld' : 'Optional'}
            disabled={isCompleted}
          ></textarea>
        {:else}
          <input
            id={input.key}
            type="text"
            bind:value={inputs[input.key]}
            class="input-field"
            placeholder={input.required ? 'Pflichtfeld' : 'Optional'}
            disabled={isCompleted}
          />
        {/if}
      </div>
    {/each}
  </div>

  <!-- KI befragen Button -->
  {#if !isCompleted && stepData?.status !== 'accepted'}
    <button
      class="btn-primary"
      onclick={generate}
      disabled={!canGenerate || loading}
    >
      {loading ? 'KI antwortet…' : 'KI befragen →'}
    </button>
  {/if}

  <!-- KI-Antwort -->
  {#if stepData?.aiResponse}
    <div class="ai-response-box">
      <p class="ai-label">KI-Vorschlag</p>
      <p class="ai-text">{stepData.aiResponse}</p>
    </div>

    <!-- Notizfeld -->
    <div class="input-group">
      <label class="input-label" for="coach-notes">Meine Notiz (optional)</label>
      <textarea
        id="coach-notes"
        bind:value={coachNotes}
        rows={2}
        class="input-field"
        placeholder="Eigene Gedanken, Ergänzungen, Korrekturen…"
        disabled={isCompleted}
      ></textarea>
    </div>

    <!-- Aktions-Buttons -->
    {#if !isCompleted && stepData.status !== 'accepted'}
      <div class="action-buttons">
        {#if currentStep > 1}
          <button class="btn-secondary" onclick={() => { currentStep--; }}>← Zurück</button>
        {/if}
        <button class="btn-ghost" onclick={reject} disabled={loading}>Verwerfen & neu</button>
        <button class="btn-ghost" onclick={skip} disabled={loading}>Überspringen</button>
        <button class="btn-primary" onclick={accept} disabled={loading}>Akzeptieren →</button>
      </div>
    {/if}
  {:else if stepData?.status !== 'accepted'}
    <div class="action-buttons">
      {#if currentStep > 1}
        <button class="btn-secondary" onclick={() => { currentStep--; }}>← Zurück</button>
      {/if}
      <button class="btn-ghost" onclick={skip} disabled={loading || isCompleted}>Schritt überspringen</button>
    </div>
  {:else}
    <!-- Schritt abgeschlossen -->
    <div class="accepted-badge">✓ Abgeschlossen</div>
    <div class="action-buttons">
      {#if currentStep > 1}
        <button class="btn-secondary" onclick={() => { currentStep--; }}>← Zurück</button>
      {/if}
      {#if currentStep < 10}
        <button class="btn-primary" onclick={() => { currentStep++; }}>Weiter →</button>
      {:else if !isCompleted}
        <button class="btn-complete" onclick={completeSession} disabled={loading}>
          {loading ? 'Bericht wird erstellt…' : 'Session abschließen & Bericht generieren'}
        </button>
      {/if}
    </div>
  {/if}
</div>

<style>
  .wizard { max-width: 760px; margin: 0 auto; display: flex; flex-direction: column; gap: 1.5rem; }
  .progress-bar { display: flex; gap: 0.4rem; flex-wrap: wrap; padding: 1rem 0; }
  .progress-step { width: 2rem; height: 2rem; border-radius: 50%; font-size: 0.75rem; font-weight: 700; color: white; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.15s; }
  .step-header { border-bottom: 1px solid var(--line, #333); padding-bottom: 0.75rem; }
  .phase-label { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 600; }
  .step-title { font-size: 1.4rem; font-weight: 700; color: var(--text-light, #f0f0f0); margin: 0.25rem 0 0; }
  .inputs-section { display: flex; flex-direction: column; gap: 1rem; }
  .input-group { display: flex; flex-direction: column; gap: 0.3rem; }
  .input-label { font-size: 0.8rem; color: var(--text-muted, #888); }
  .required { color: #f87171; margin-left: 0.2rem; }
  .input-field { background: var(--bg-2, #1a1a1a); border: 1px solid var(--line, #333); border-radius: 6px; padding: 0.6rem 0.75rem; color: var(--text-light, #f0f0f0); font-size: 0.9rem; width: 100%; resize: vertical; }
  .input-field:focus { outline: none; border-color: var(--gold, #c9a55c); }
  .ai-response-box { background: var(--bg-2, #1a1a1a); border: 1px solid var(--gold, #c9a55c); border-radius: 8px; padding: 1rem; }
  .ai-label { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.1em; color: var(--gold, #c9a55c); margin: 0 0 0.5rem; }
  .ai-text { color: var(--text-light, #f0f0f0); font-size: 0.9rem; line-height: 1.6; white-space: pre-wrap; margin: 0; }
  .action-buttons { display: flex; gap: 0.75rem; flex-wrap: wrap; align-items: center; }
  .btn-primary { padding: 0.6rem 1.4rem; background: var(--gold, #c9a55c); color: #111; font-weight: 700; border: none; border-radius: 6px; cursor: pointer; font-size: 0.9rem; }
  .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn-secondary { padding: 0.5rem 1rem; background: transparent; color: var(--text-muted, #888); border: 1px solid var(--line, #444); border-radius: 6px; cursor: pointer; font-size: 0.85rem; }
  .btn-ghost { padding: 0.5rem 1rem; background: transparent; color: var(--text-muted, #888); border: none; cursor: pointer; font-size: 0.85rem; text-decoration: underline; }
  .btn-complete { padding: 0.7rem 1.6rem; background: #22c55e; color: #111; font-weight: 700; border: none; border-radius: 6px; cursor: pointer; }
  .btn-complete:disabled { opacity: 0.5; cursor: not-allowed; }
  .accepted-badge { display: inline-block; background: #22c55e20; color: #22c55e; border: 1px solid #22c55e40; border-radius: 4px; padding: 0.3rem 0.75rem; font-size: 0.8rem; font-weight: 600; }
  .error-box { background: #ef444420; border: 1px solid #ef444440; border-radius: 6px; padding: 0.75rem; color: #f87171; font-size: 0.85rem; }
</style>
```

- [ ] **Schritt 5.2: Commit**

```bash
cd /home/gekko/Bachelorprojekt/.claude/worktrees/feature+ki-coaching-session
git add website/src/components/admin/coaching/SessionWizard.svelte
git commit -m "feat(coaching): SessionWizard Svelte 5 component"
```

---

## Task 6: Astro-Seiten

**Files:**
- Create: `website/src/pages/admin/coaching/sessions/index.astro`
- Create: `website/src/pages/admin/coaching/sessions/new.astro`
- Create: `website/src/pages/admin/coaching/sessions/[id].astro`

- [ ] **Schritt 6.1: Sessions-Liste**

```astro
---
// website/src/pages/admin/coaching/sessions/index.astro
import AdminLayout from '../../../../layouts/AdminLayout.astro';
import { getSession, getLoginUrl, isAdmin } from '../../../../lib/auth';
import { listSessions } from '../../../../lib/coaching-session-db';
import { pool } from '../../../../lib/website-db';

const session = await getSession(Astro.request.headers.get('cookie'));
if (!session) return Astro.redirect(getLoginUrl(Astro.url.pathname));
if (!isAdmin(session)) return Astro.redirect('/admin');

const brand = process.env.BRAND || 'mentolder';
let sessions: Awaited<ReturnType<typeof listSessions>> = [];
try { sessions = await listSessions(pool, brand); } catch { /* coaching schema may not exist yet */ }

function fmtDate(d: Date | string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
const statusLabel: Record<string, string> = { active: 'Läuft', completed: 'Abgeschlossen', abandoned: 'Abgebrochen' };
---

<AdminLayout title="Coaching-Sessions">
  <div class="page">
    <header class="page-head">
      <nav class="crumbs">
        <a href="/admin">Admin</a><span class="sep">›</span>
        <a href="/admin/coaching/sessions">Coaching</a><span class="sep">›</span>Sessions
      </nav>
      <div class="head-row">
        <h1>Coaching-Sessions</h1>
        <a href="/admin/coaching/sessions/new" class="btn-primary">+ Neue Session</a>
      </div>
    </header>

    {sessions.length === 0 ? (
      <div class="empty">
        <p>Noch keine Sessions. Starte deine erste triadische KI-Coaching-Session.</p>
        <a href="/admin/coaching/sessions/new" class="btn-primary">Erste Session starten →</a>
      </div>
    ) : (
      <table class="table">
        <thead><tr><th>Titel</th><th>Klient</th><th>Datum</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {sessions.map(s => (
            <tr>
              <td><a href={`/admin/coaching/sessions/${s.id}`}>{s.title}</a></td>
              <td>{s.clientId ? '–' : 'Vorbereitung'}</td>
              <td>{fmtDate(s.createdAt)}</td>
              <td><span class={`badge ${s.status}`}>{statusLabel[s.status] ?? s.status}</span></td>
              <td><a href={`/admin/coaching/sessions/${s.id}`} class="btn-sm">Öffnen</a></td>
            </tr>
          ))}
        </tbody>
      </table>
    )}
  </div>
</AdminLayout>

<style>
  .page { max-width: 1000px; margin: 0 auto; padding: 1rem 1.5rem 3rem; }
  .page-head { margin-bottom: 1.5rem; }
  .crumbs { font-size: 0.78rem; color: var(--text-muted,#888); margin-bottom: 0.4rem; }
  .crumbs a { color: var(--text-muted,#888); text-decoration: none; }
  .crumbs .sep { margin: 0 0.4rem; }
  .head-row { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
  h1 { font-size: 1.8rem; font-weight: 700; color: var(--text-light,#f0f0f0); margin: 0; }
  .btn-primary { padding: 0.55rem 1.2rem; background: var(--gold,#c9a55c); color: #111; font-weight: 700; border-radius: 6px; text-decoration: none; font-size: 0.85rem; }
  .btn-sm { padding: 0.3rem 0.7rem; border: 1px solid var(--line,#444); border-radius: 4px; font-size: 0.82rem; color: var(--text-muted,#888); text-decoration: none; }
  .empty { background: var(--bg-2,#1a1a1a); border: 1px solid var(--line,#333); border-radius: 8px; padding: 2rem; text-align: center; color: var(--text-muted,#888); display: flex; flex-direction: column; gap: 1rem; align-items: center; }
  .table { width: 100%; border-collapse: collapse; }
  .table th { text-align: left; padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--line,#333); font-size: 0.82rem; color: var(--text-muted,#888); }
  .table td { padding: 0.6rem 0.75rem; border-bottom: 1px solid var(--line,#222); }
  .table a { color: var(--gold,#c9a55c); text-decoration: none; }
  .badge { font-size: 0.72rem; padding: 0.2rem 0.5rem; border-radius: 4px; font-weight: 600; }
  .badge.active { background: #3b82f620; color: #60a5fa; }
  .badge.completed { background: #22c55e20; color: #4ade80; }
  .badge.abandoned { background: #64748b20; color: #94a3b8; }
</style>
```

- [ ] **Schritt 6.2: Neue Session anlegen**

```astro
---
// website/src/pages/admin/coaching/sessions/new.astro
import AdminLayout from '../../../../layouts/AdminLayout.astro';
import { getSession, getLoginUrl, isAdmin } from '../../../../lib/auth';
import { listCustomers } from '../../../../lib/website-db';

const session = await getSession(Astro.request.headers.get('cookie'));
if (!session) return Astro.redirect(getLoginUrl(Astro.url.pathname));
if (!isAdmin(session)) return Astro.redirect('/admin');

let customers: { id: string; name: string }[] = [];
try {
  const all = await listCustomers({ brand: process.env.BRAND || 'mentolder' });
  customers = all.map(c => ({ id: c.id, name: c.name }));
} catch { /* ignore */ }

const today = new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
---

<AdminLayout title="Neue Coaching-Session">
  <div class="page">
    <nav class="crumbs">
      <a href="/admin">Admin</a><span class="sep">›</span>
      <a href="/admin/coaching/sessions">Sessions</a><span class="sep">›</span>Neu
    </nav>
    <h1>Neue Session</h1>

    <form class="form" id="new-session-form">
      <div class="field">
        <label for="title">Titel der Session</label>
        <input id="title" name="title" type="text" value={`Session ${today}`} required class="input" />
      </div>
      <div class="field">
        <label for="clientId">Klient (optional)</label>
        <select id="clientId" name="clientId" class="input">
          <option value="">— Vorbereitungsrunde (kein Klient) —</option>
          {customers.map(c => <option value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div class="field">
        <label>Modus</label>
        <div class="radio-group">
          <label><input type="radio" name="mode" value="live" checked /> Live-Session (mit Klient)</label>
          <label><input type="radio" name="mode" value="prep" /> Vorbereitung</label>
        </div>
      </div>
      <div id="form-error" class="error" style="display:none"></div>
      <button type="submit" class="btn-primary" id="submit-btn">Session starten →</button>
    </form>
  </div>
</AdminLayout>

<script>
  document.getElementById('new-session-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('submit-btn') as HTMLButtonElement;
    const errEl = document.getElementById('form-error') as HTMLElement;
    btn.disabled = true; btn.textContent = 'Erstelle…';
    errEl.style.display = 'none';
    const form = e.target as HTMLFormElement;
    const data = Object.fromEntries(new FormData(form));
    const res = await fetch('/api/admin/coaching/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: data.title, clientId: data.clientId || null, mode: data.mode }),
    });
    const json = await res.json();
    if (res.ok) {
      window.location.href = `/admin/coaching/sessions/${json.session.id}`;
    } else {
      errEl.textContent = json.error ?? 'Fehler'; errEl.style.display = 'block';
      btn.disabled = false; btn.textContent = 'Session starten →';
    }
  });
</script>

<style>
  .page { max-width: 560px; margin: 0 auto; padding: 1rem 1.5rem 3rem; }
  .crumbs { font-size: 0.78rem; color: var(--text-muted,#888); margin-bottom: 0.4rem; }
  .crumbs a { color: var(--text-muted,#888); text-decoration: none; }
  .crumbs .sep { margin: 0 0.4rem; }
  h1 { font-size: 1.8rem; font-weight: 700; color: var(--text-light,#f0f0f0); margin: 0 0 2rem; }
  .form { display: flex; flex-direction: column; gap: 1.25rem; }
  .field { display: flex; flex-direction: column; gap: 0.4rem; }
  label { font-size: 0.82rem; color: var(--text-muted,#888); }
  .input { background: var(--bg-2,#1a1a1a); border: 1px solid var(--line,#333); border-radius: 6px; padding: 0.6rem 0.75rem; color: var(--text-light,#f0f0f0); font-size: 0.9rem; }
  .radio-group { display: flex; gap: 1.5rem; color: var(--text-light,#f0f0f0); font-size: 0.9rem; }
  .btn-primary { align-self: flex-start; padding: 0.65rem 1.5rem; background: var(--gold,#c9a55c); color: #111; font-weight: 700; border: none; border-radius: 6px; cursor: pointer; font-size: 0.9rem; }
  .btn-primary:disabled { opacity: 0.5; }
  .error { color: #f87171; font-size: 0.85rem; padding: 0.5rem 0.75rem; background: #ef444415; border-radius: 4px; }
</style>
```

- [ ] **Schritt 6.3: Wizard-Seite [id].astro**

```astro
---
// website/src/pages/admin/coaching/sessions/[id].astro
import AdminLayout from '../../../../layouts/AdminLayout.astro';
import SessionWizard from '../../../../components/admin/coaching/SessionWizard.svelte';
import { getSession as getAuthSession, getLoginUrl, isAdmin } from '../../../../lib/auth';
import { getSession as getCoachingSession } from '../../../../lib/coaching-session-db';
import { pool } from '../../../../lib/website-db';

const authSession = await getAuthSession(Astro.request.headers.get('cookie'));
if (!authSession) return Astro.redirect(getLoginUrl(Astro.url.pathname));
if (!isAdmin(authSession)) return Astro.redirect('/admin');

const sessionId = Astro.params.id as string;
let coachingSession = null;
try { coachingSession = await getCoachingSession(pool, sessionId); } catch { /* ignore */ }

if (!coachingSession) return Astro.redirect('/admin/coaching/sessions');

// Abgeschlossene Session: Bericht anzeigen
const report = coachingSession.status === 'completed'
  ? coachingSession.steps.find(s => s.stepNumber === 0)
  : null;
---

<AdminLayout title={`Session: ${coachingSession.title}`}>
  <div class="page">
    <nav class="crumbs">
      <a href="/admin">Admin</a><span class="sep">›</span>
      <a href="/admin/coaching/sessions">Sessions</a><span class="sep">›</span>
      {coachingSession.title}
    </nav>

    {report ? (
      <div class="report">
        <div class="report-head">
          <h1>Abgeschlossen: {coachingSession.title}</h1>
          <a href="#report-text" id="download-btn" class="btn-secondary">Bericht herunterladen</a>
        </div>
        <div id="report-text" class="report-body prose">
          <div set:html={report.aiResponse?.replace(/\n/g, '<br>') ?? ''} />
        </div>
        <a href="/admin/coaching/sessions" class="btn-ghost">← Zur Übersicht</a>
      </div>
    ) : (
      <SessionWizard sessionId={sessionId} initialSession={coachingSession} client:load />
    )}
  </div>
</AdminLayout>

<script>
  document.getElementById('download-btn')?.addEventListener('click', (e) => {
    e.preventDefault();
    const text = document.getElementById('report-text')?.innerText ?? '';
    const blob = new Blob([text], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'coaching-bericht.md'; a.click();
    URL.revokeObjectURL(url);
  });
</script>

<style>
  .page { max-width: 800px; margin: 0 auto; padding: 1rem 1.5rem 3rem; }
  .crumbs { font-size: 0.78rem; color: var(--text-muted,#888); margin-bottom: 1rem; }
  .crumbs a { color: var(--text-muted,#888); text-decoration: none; }
  .crumbs .sep { margin: 0 0.4rem; }
  .report { display: flex; flex-direction: column; gap: 1.5rem; }
  .report-head { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
  h1 { font-size: 1.5rem; font-weight: 700; color: var(--text-light,#f0f0f0); margin: 0; }
  .report-body { background: var(--bg-2,#1a1a1a); border: 1px solid var(--line,#333); border-radius: 8px; padding: 1.5rem; color: var(--text-light,#f0f0f0); line-height: 1.7; }
  .btn-secondary { padding: 0.5rem 1rem; border: 1px solid var(--line,#444); border-radius: 6px; color: var(--text-muted,#888); text-decoration: none; font-size: 0.85rem; }
  .btn-ghost { color: var(--text-muted,#888); text-decoration: underline; font-size: 0.85rem; }
</style>
```

- [ ] **Schritt 6.4: Commit**

```bash
cd /home/gekko/Bachelorprojekt/.claude/worktrees/feature+ki-coaching-session
git add website/src/pages/admin/coaching/
git commit -m "feat(coaching): add 3 Astro pages for session wizard"
```

---

## Task 7: AdminLayout Navigation

**Files:**
- Modify: `website/src/layouts/AdminLayout.astro`

- [ ] **Schritt 7.1: Neue Navigationsgruppe einfügen**

In `AdminLayout.astro` nach der `Wissen`-Gruppe (suche nach `label: 'Wissen'`):

```typescript
// VORHER (Ende der Wissen-Gruppe):
    },
  },
  {
    label: 'System',

// NACHHER:
    },
  },
  {
    label: 'Coaching',
    items: [
      { href: '/admin/coaching/sessions',     label: 'Sessions',     icon: 'clipboard',
        matches: ['/admin/coaching/sessions'] },
      { href: '/admin/coaching/sessions/new', label: 'Neue Session', icon: 'plus' },
    ],
  },
  {
    label: 'System',
```

- [ ] **Schritt 7.2: Commit**

```bash
cd /home/gekko/Bachelorprojekt/.claude/worktrees/feature+ki-coaching-session
git add website/src/layouts/AdminLayout.astro
git commit -m "feat(coaching): add Coaching navigation group to AdminLayout"
```

---

## Task 8: Smoke Test + listCustomers prüfen

**Files:**
- Check: `website/src/lib/website-db.ts` (listCustomers export)

- [ ] **Schritt 8.1: listCustomers prüfen**

```bash
grep -n "listCustomers\|export.*function.*listCustomers\|export.*listCustomers" \
  /home/gekko/Bachelorprojekt/.claude/worktrees/feature+ki-coaching-session/website/src/lib/website-db.ts
```

Falls `listCustomers` nicht exportiert: Import in `new.astro` anpassen. Alternativer Query:

```typescript
// Falls listCustomers fehlt — direkt ersetzen in new.astro Frontmatter:
const customersRes = await pool.query(
  `SELECT id, name FROM public.customers WHERE brand = $1 AND enrollment_declined = false ORDER BY name`,
  [process.env.BRAND || 'mentolder']
);
customers = customersRes.rows;
```

- [ ] **Schritt 8.2: Offline Tests laufen lassen**

```bash
cd /home/gekko/Bachelorprojekt/.claude/worktrees/feature+ki-coaching-session
task test:all 2>&1 | tail -30
```

Erwartet: alle Tests grün.

- [ ] **Schritt 8.3: Dev-Server starten und manuell testen**

```bash
cd /home/gekko/Bachelorprojekt/.claude/worktrees/feature+ki-coaching-session/website
task website:dev
```

Prüfen:
1. `/admin/coaching/sessions` — leere Tabelle mit „Erste Session starten"-CTA
2. `/admin/coaching/sessions/new` — Formular mit Titel + Klient-Dropdown
3. Nach Submit: Redirect auf `/admin/coaching/sessions/[id]` mit Wizard
4. Schritt 1 Eingaben ausfüllen → „KI befragen" → Antwort erscheint
5. „Akzeptieren" → nächster Schritt

- [ ] **Schritt 8.4: Final Commit + Push**

```bash
cd /home/gekko/Bachelorprojekt/.claude/worktrees/feature+ki-coaching-session
git add -A
git status  # Überprüfen: nur erwartete Dateien
git commit -m "feat(coaching): triadisches KI-Coaching session wizard complete"
git push -u origin feature/ki-coaching-session
```

---

## Self-Review Ergebnis

**Spec-Abdeckung:**
- [x] coaching.sessions + session_steps DB — Task 1
- [x] coaching-session-db.ts + Tests — Task 3
- [x] 10 Schritt-Definitionen mit Prompts — Task 2
- [x] 5 API-Routen — Task 4
- [x] SessionWizard.svelte (Stepper, Fortschrittsbalken, Human-in-the-loop) — Task 5
- [x] Sessions-Liste, Neu-Formular, Wizard-Seite — Task 6
- [x] AdminLayout Navigation — Task 7
- [x] Abschlussbericht + Markdown-Export — Tasks 4.5 + 6.3
- [x] `mode: 'prep'` für Vorbereitungsrunde — Tasks 1, 4.1, 6.2
- [x] Fehlerbehandlung KI fehlt → 503 — Task 4.4

**Typ-Konsistenz:** `Session`, `SessionStep`, `CreateSessionArgs`, `UpsertStepArgs` in `coaching-session-db.ts` definiert und konsistent in API-Routen und Svelte-Komponente verwendet.

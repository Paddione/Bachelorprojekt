---
ticket_id: T000614
slug: t000614-kundenprofil-upgrade
branch: feature/T000614-kundenprofil-upgrade
spec: docs/superpowers/specs/2026-06-11-t000614-kundenprofil-upgrade-design.md
domains: [website]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# T000614 — Kundenprofil-Seiten Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Erweitert die Kundenprofil-Seiten (Portal `KontoSection` + Admin `[clientId]`) um CRM-Felder, Self-Service-Profilbearbeitung und eine Admin-Kontakthistorie im Industrial/Loft-Designsystem.

**Architecture:** Dual-Identity bleibt erhalten — Keycloak ist Source of Truth für Identität (Name/E-Mail/Passwort), die `customers`-Tabelle hält alle neuen CRM-Felder. Eine neue Tabelle `customer_contact_history` speichert die Kontakthistorie. Drei neue API-Endpoints folgen dem bestehenden `getSession() → Guard → Parse → Validate → DB → { ok: true }`-Muster. Self-Service-Endpoints lesen die `keycloak_user_id` **serverseitig aus der Session**, nie vom Client. UI wird in fokussierte Svelte-5-Komponenten zerlegt.

**Tech Stack:** Astro 5 (SSR), Svelte 5 (Runes), PostgreSQL (`pg` Pool), Keycloak Admin API, Tailwind + factory-tokens.css, Playwright, BATS.

---

## Hintergrund & gefundene Codebase-Fakten

Diese Fakten wurden vor dem Schreiben des Plans verifiziert — der ausführende Entwickler kann sie als gesichert annehmen:

- **`customers`-DDL ist nicht in `website-db.ts`.** Die Tabelle wird extern (DB-Init/Migration außerhalb des Repos) erstellt. Es gibt **keinen** `CREATE TABLE customers`-Block in `website-db.ts` — nur `INSERT`/`UPDATE`/`SELECT`. Neue Spalten müssen daher über eine **eigene idempotente `ensureSchemaOnce('customer_crm', …)`-Migration** mit `ALTER TABLE … ADD COLUMN IF NOT EXISTS` + `CREATE TABLE IF NOT EXISTS customer_contact_history` eingespielt werden.
- **Schema-Init-Pattern:** `ensureSchemaOnce(key, init)` (website-db.ts:49) memoisiert die Init-Promise pro Key und cached Rejections raus (Retry möglich). **Niemals** DDL auf dem Hot-Path ohne diesen Wrapper (Race „tuple concurrently updated", T000304). Jede DB-Funktion, die neue Spalten/Tabellen liest oder schreibt, muss zuerst `await ensureCustomerCrmSchema()` aufrufen.
- **Session-Shape (`UserSession`, auth.ts:21):** `sub` (= keycloak_user_id), `email`, `name`, `preferred_username`, `realmRoles`. `isAdmin(session)` (auth.ts:200) und `getSession(cookieHeader)` (auth.ts:204) existieren.
- **Admin-API-Muster** (z. B. `set-customer-number.ts`): `getSession(request.headers.get('cookie'))` → `if (!session || !isAdmin(session)) → 401` → `request.json()` → Validate → DB → `{ success: true }`. Fehler: `{ error }` mit 400/401/500.
- **Customer-Lookup:** `getCustomerByKeycloakId(sub)` (website-db.ts:235) gibt `{ id, email, name }` für den eingeloggten Kunden; `getCustomerByEmail(email)` und `getUserById(clientId)` (keycloak.ts:136) für den Admin-Pfad.
- **Keycloak-Helper** (`keycloak.ts`): `kcApi(method, path, body)` (privat) führt authentifizierte Admin-API-Calls aus. `updateUser()` (Zeile 148) zeigt das `PUT /users/{id}`-Muster. Attribut-Update braucht **GET-merge-PUT** (Keycloak ersetzt `attributes` komplett), darum erst Rohdaten via `kcApi('GET', …)` holen und mergen.
- **`KontoSection.astro`** wird in `portal.astro` mit Props `{ session, keycloakBase, realm }` gerendert. Es gibt aktuell **keinen** Customer-Record als Prop — der Plan reicht ihn durch.
- **Industrial/Loft-Tokens** (`factory-tokens.css`, importiert via `global.css`): `--factory-bg:#0d1117`, `--factory-surface:#161b22`, `--factory-surface-elevated:#21262d`, `--factory-border:#30363d`, `--factory-accent:#f59e0b`, `--factory-accent-hover:#d97706`, `--factory-text-primary:#e5e5e5`, `--factory-text-secondary:#a3a3a3`, `--factory-text-muted:#737373`, `--factory-success:#22c55e`, `--factory-error:#ef4444`, `--factory-font-mono:'JetBrains Mono'`. Bestehende Portal-Komponenten nutzen Tailwind-Aliase (`bg-dark-light`, `text-light`); die **neuen** Komponenten nutzen die factory-Farbwerte explizit als arbitrary Tailwind-Klassen (z. B. `bg-[#161b22]`, `border-[#30363d]`, `text-[#f59e0b]`) — Industrial/Loft-Vorgabe der Spec.
- **DSGVO heute:** `meine-daten.astro` → `DataManagement.svelte` → `POST /api/dsgvo-request` (sendet Auskunfts-/Löschanfrage per E-Mail an Admin, kein Live-Download). Phase E ergänzt eine `collectCustomerDsgvoData(keycloakUserId)`-Aggregatfunktion + ein read-only Self-Service-Export-Endpoint, das die neuen Felder + Kontakthistorie als JSON-Download liefert.
- **`pg`-Array-Binding:** `tags TEXT[]` per `$n::text[]` mit JS-Array binden.

---

## File Structure

**Neue Dateien:**
- `website/src/lib/customer-crm-db.ts` — Schema-Migration + alle CRM-DB-Funktionen (eigene Datei, hält `website-db.ts` fokussiert).
- `website/src/pages/api/portal/profile/update.ts` — Self-Service-Profil-Update (Session-Customer).
- `website/src/pages/api/portal/profile/export.ts` — Self-Service-Datenexport (read-only JSON, DSGVO Art. 15).
- `website/src/pages/api/admin/clients/contact-history/create.ts` — Admin: Kontakthistorie-Eintrag.
- `website/src/pages/api/admin/clients/update-crm.ts` — Admin: Status/Tags/Akquisition.
- `website/src/components/portal/ProfileCard.astro` — Read-only Profil-Karte (Industrial/Loft).
- `website/src/components/portal/ProfileEditor.svelte` — Inline Self-Service-Edit-Formular.
- `website/src/components/admin/CrmStatusPanel.svelte` — Status + Tags + Akquisition.
- `website/src/components/admin/ContactHistoryTimeline.svelte` — Timeline + Schnell-Hinzufügen.
- `tests/unit/portal-profile-update.bats` — API-Validierungs-Unit-Tests.
- `website/tests/e2e/kundenprofil-portal.spec.ts` — Playwright (mentolder-authenticated).
- `website/tests/e2e/kundenprofil-admin.spec.ts` — Playwright (admin).

**Modifizierte Dateien:**
- `website/src/lib/keycloak.ts` — `updateUserAttribute()` für Phone-Sync.
- `website/src/components/portal/KontoSection.astro` — überarbeitet, nutzt ProfileCard + ProfileEditor.
- `website/src/pages/portal.astro` — reicht Customer-CRM-Record an `KontoSection` durch.
- `website/src/pages/admin/[clientId].astro` — neuer „Profil"-Tab.
- `website/src/components/DataManagement.svelte` — DSGVO-Download-Button.

---

## Phase A — DB-Migration & DB-Funktionen

### Task A1: Schema-Migration anlegen

**Files:**
- Create: `website/src/lib/customer-crm-db.ts`
- Test: `website/src/lib/customer-crm-db.ensure.test.ts`

- [ ] **Step 1: Failing test schreiben** (`website/src/lib/customer-crm-db.ensure.test.ts`)

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const queries: string[] = [];
vi.mock('./website-db', async () => {
  const actual = await vi.importActual<typeof import('./website-db')>('./website-db');
  return {
    ...actual,
    pool: { query: vi.fn(async (sql: string) => { queries.push(sql); return { rows: [] }; }) },
  };
});

beforeEach(() => { queries.length = 0; });

describe('ensureCustomerCrmSchema', () => {
  it('issues idempotent ALTER/CREATE DDL', async () => {
    const mod = await import('./customer-crm-db');
    await mod.ensureCustomerCrmSchema();
    const all = queries.join('\n');
    expect(all).toContain('ADD COLUMN IF NOT EXISTS address');
    expect(all).toContain('ADD COLUMN IF NOT EXISTS customer_status');
    expect(all).toContain('ADD COLUMN IF NOT EXISTS tags TEXT[]');
    expect(all).toContain('CREATE TABLE IF NOT EXISTS customer_contact_history');
    expect(all).toContain('idx_customer_contact_history_user');
  });
});
```

- [ ] **Step 2: Test ausführen, Fehlschlag bestätigen**

Run: `cd website && npx vitest run src/lib/customer-crm-db.ensure.test.ts`
Expected: FAIL — `Cannot find module './customer-crm-db'`.

- [ ] **Step 3: Migration implementieren** (`website/src/lib/customer-crm-db.ts`)

```ts
import { pool, ensureSchemaOnce } from './website-db';

export function ensureCustomerCrmSchema(): Promise<void> {
  return ensureSchemaOnce('customer_crm', async () => {
    await pool.query(`
      ALTER TABLE customers ADD COLUMN IF NOT EXISTS address TEXT;
      ALTER TABLE customers ADD COLUMN IF NOT EXISTS city TEXT;
      ALTER TABLE customers ADD COLUMN IF NOT EXISTS postal_code TEXT;
      ALTER TABLE customers ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'DE';
      ALTER TABLE customers ADD COLUMN IF NOT EXISTS preferred_contact_channel TEXT DEFAULT 'email';
      ALTER TABLE customers ADD COLUMN IF NOT EXISTS communication_frequency TEXT DEFAULT 'monatlich';
      ALTER TABLE customers ADD COLUMN IF NOT EXISTS bio TEXT;
      ALTER TABLE customers ADD COLUMN IF NOT EXISTS profile_updated_at TIMESTAMPTZ;
      ALTER TABLE customers ADD COLUMN IF NOT EXISTS customer_status TEXT DEFAULT 'aktiv';
      ALTER TABLE customers ADD COLUMN IF NOT EXISTS acquisition_source TEXT;
      ALTER TABLE customers ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS customer_contact_history (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        keycloak_user_id TEXT NOT NULL,
        contact_type TEXT NOT NULL,
        subject TEXT,
        content TEXT,
        direction TEXT DEFAULT 'outbound',
        admin_id TEXT,
        created_at TIMESTAMPTZ DEFAULT now(),
        metadata JSONB DEFAULT '{}'
      );
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_customer_contact_history_user
        ON customer_contact_history(keycloak_user_id, created_at DESC);
    `);
  });
}
```

- [ ] **Step 4: Test ausführen, Erfolg bestätigen**

Run: `cd website && npx vitest run src/lib/customer-crm-db.ensure.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add website/src/lib/customer-crm-db.ts website/src/lib/customer-crm-db.ensure.test.ts
git commit -m "feat(db): add customer CRM schema migration (T000614)"
```

### Task A2: Validierungs-Konstanten & Typen

**Files:**
- Modify: `website/src/lib/customer-crm-db.ts`
- Test: `website/src/lib/customer-crm-db.test.ts`

- [ ] **Step 1: Failing test** (`website/src/lib/customer-crm-db.test.ts`)

```ts
import { describe, it, expect } from 'vitest';
import {
  CONTACT_CHANNELS, COMM_FREQUENCIES, CUSTOMER_STATUSES, CONTACT_TYPES,
  validateProfileInput,
} from './customer-crm-db';

describe('CRM enums', () => {
  it('expose the allowed value sets', () => {
    expect(CONTACT_CHANNELS).toEqual(['email', 'phone', 'portal']);
    expect(COMM_FREQUENCIES).toEqual(['wöchentlich', 'zweiwöchentlich', 'monatlich', 'bei_bedarf']);
    expect(CUSTOMER_STATUSES).toEqual(['aktiv', 'inaktiv', 'potentiell', 'pausiert', 'abgeschlossen']);
    expect(CONTACT_TYPES).toEqual(['email', 'phone', 'meeting', 'note']);
  });
});

describe('validateProfileInput', () => {
  it('rejects an over-long phone', () => {
    expect(validateProfileInput({ phone: 'x'.repeat(31) }).ok).toBe(false);
  });
  it('rejects an invalid contact channel', () => {
    expect(validateProfileInput({ preferred_contact_channel: 'fax' }).ok).toBe(false);
  });
  it('accepts a valid partial payload', () => {
    expect(validateProfileInput({ phone: '+49 30 123', communication_frequency: 'monatlich' }).ok).toBe(true);
  });
  it('accepts an empty payload (no-op update)', () => {
    expect(validateProfileInput({}).ok).toBe(true);
  });
});
```

- [ ] **Step 2: Test ausführen, Fehlschlag bestätigen**

Run: `cd website && npx vitest run src/lib/customer-crm-db.test.ts`
Expected: FAIL — Exporte fehlen.

- [ ] **Step 3: Implementieren** (an `customer-crm-db.ts` anhängen)

```ts
export const CONTACT_CHANNELS = ['email', 'phone', 'portal'] as const;
export const COMM_FREQUENCIES = ['wöchentlich', 'zweiwöchentlich', 'monatlich', 'bei_bedarf'] as const;
export const CUSTOMER_STATUSES = ['aktiv', 'inaktiv', 'potentiell', 'pausiert', 'abgeschlossen'] as const;
export const CONTACT_TYPES = ['email', 'phone', 'meeting', 'note'] as const;

export type ContactChannel = typeof CONTACT_CHANNELS[number];
export type CommFrequency = typeof COMM_FREQUENCIES[number];
export type CustomerStatus = typeof CUSTOMER_STATUSES[number];
export type ContactType = typeof CONTACT_TYPES[number];

export interface ProfileInput {
  phone?: string;
  company?: string;
  address?: string;
  city?: string;
  postal_code?: string;
  country?: string;
  preferred_contact_channel?: string;
  communication_frequency?: string;
  bio?: string;
}

const MAXLEN: Record<keyof ProfileInput, number> = {
  phone: 30, company: 100, address: 200, city: 100, postal_code: 10,
  country: 2, preferred_contact_channel: 20, communication_frequency: 20, bio: 500,
};

export function validateProfileInput(input: ProfileInput): { ok: true } | { ok: false; error: string } {
  for (const [k, v] of Object.entries(input)) {
    if (v === undefined || v === null) continue;
    if (typeof v !== 'string') return { ok: false, error: `${k}: ungültiger Typ` };
    const max = MAXLEN[k as keyof ProfileInput];
    if (max && v.length > max) return { ok: false, error: `${k}: zu lang (max. ${max} Zeichen)` };
  }
  if (input.preferred_contact_channel && !CONTACT_CHANNELS.includes(input.preferred_contact_channel as ContactChannel))
    return { ok: false, error: 'Ungültiger Kontaktkanal.' };
  if (input.communication_frequency && !COMM_FREQUENCIES.includes(input.communication_frequency as CommFrequency))
    return { ok: false, error: 'Ungültige Kommunikationsfrequenz.' };
  return { ok: true };
}
```

- [ ] **Step 4: Test ausführen, Erfolg bestätigen**

Run: `cd website && npx vitest run src/lib/customer-crm-db.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add website/src/lib/customer-crm-db.ts website/src/lib/customer-crm-db.test.ts
git commit -m "feat(db): add CRM enums + profile input validation (T000614)"
```

### Task A3: DB-Funktionen (getProfile, updateProfile, contact history, CRM, DSGVO-Aggregat)

**Files:**
- Modify: `website/src/lib/customer-crm-db.ts`
- Test: `website/src/lib/customer-crm-db.test.ts`

- [ ] **Step 1: Failing test anhängen** (`customer-crm-db.test.ts`)

```ts
import { vi } from 'vitest';
const q = vi.fn();
vi.mock('./website-db', async () => {
  const actual = await vi.importActual<typeof import('./website-db')>('./website-db');
  return { ...actual, pool: { query: q }, ensureSchemaOnce: actual.ensureSchemaOnce };
});

describe('updateCustomerProfile', () => {
  it('writes only provided fields + profile_updated_at by keycloak_user_id', async () => {
    q.mockResolvedValue({ rows: [{ profile_updated_at: '2026-06-11T00:00:00Z' }] });
    const { updateCustomerProfile } = await import('./customer-crm-db');
    await updateCustomerProfile('kc-1', { phone: '+49 30 1' });
    const ddl = q.mock.calls.map(c => String(c[0])).join('\n');
    expect(ddl).toContain('UPDATE customers SET');
    expect(ddl).toContain('phone = ');
    expect(ddl).toContain('profile_updated_at = now()');
    expect(ddl).toContain('WHERE keycloak_user_id = ');
  });
});

describe('addContactHistoryEntry', () => {
  it('inserts a row', async () => {
    q.mockResolvedValue({ rows: [{ id: 'h1' }] });
    const { addContactHistoryEntry } = await import('./customer-crm-db');
    await addContactHistoryEntry({ keycloakUserId: 'kc-1', contactType: 'email', subject: 'X', adminId: 'a1' });
    const ddl = q.mock.calls.map(c => String(c[0])).join('\n');
    expect(ddl).toContain('INSERT INTO customer_contact_history');
  });
});
```

(Hinweis: Diese Mock-Tests prüfen Query-Shape; echte DB-Logik wird in BATS/Playwright/dev-Cluster verifiziert.)

- [ ] **Step 2: Test ausführen, Fehlschlag bestätigen**

Run: `cd website && npx vitest run src/lib/customer-crm-db.test.ts`
Expected: FAIL — Funktionen fehlen.

- [ ] **Step 3: Implementieren** (an `customer-crm-db.ts` anhängen)

```ts
export interface CustomerProfile {
  id: string; name: string; email: string;
  phone?: string; company?: string;
  address?: string; city?: string; postal_code?: string; country?: string;
  preferred_contact_channel?: string; communication_frequency?: string;
  bio?: string; profile_updated_at?: string;
  customer_status?: string; acquisition_source?: string; tags?: string[];
  customer_number?: string;
}

const PROFILE_COLS = `id, name, email, phone, company, address, city, postal_code, country,
  preferred_contact_channel, communication_frequency, bio, profile_updated_at,
  customer_status, acquisition_source, tags, customer_number`;

export async function getCustomerProfile(keycloakUserId: string): Promise<CustomerProfile | null> {
  await ensureCustomerCrmSchema();
  const { rows } = await pool.query(
    `SELECT ${PROFILE_COLS} FROM customers WHERE keycloak_user_id = $1 LIMIT 1`,
    [keycloakUserId],
  );
  return rows[0] ?? null;
}

const UPDATABLE: (keyof ProfileInput)[] = [
  'phone', 'company', 'address', 'city', 'postal_code', 'country',
  'preferred_contact_channel', 'communication_frequency', 'bio',
];

export async function updateCustomerProfile(
  keycloakUserId: string, input: ProfileInput,
): Promise<{ updatedAt: string } | null> {
  await ensureCustomerCrmSchema();
  const sets: string[] = [];
  const params: unknown[] = [];
  for (const col of UPDATABLE) {
    if (input[col] !== undefined) { params.push(input[col]); sets.push(`${col} = $${params.length}`); }
  }
  sets.push('profile_updated_at = now()');
  params.push(keycloakUserId);
  const { rows } = await pool.query(
    `UPDATE customers SET ${sets.join(', ')} WHERE keycloak_user_id = $${params.length}
     RETURNING profile_updated_at`,
    params,
  );
  if (!rows[0]) return null;
  return { updatedAt: rows[0].profile_updated_at };
}

export interface ContactHistoryEntry {
  id: string; keycloak_user_id: string; contact_type: string;
  subject?: string; content?: string; direction?: string;
  admin_id?: string; created_at: string;
}

export async function addContactHistoryEntry(params: {
  keycloakUserId: string; contactType: string; subject?: string;
  content?: string; direction?: string; adminId?: string;
}): Promise<ContactHistoryEntry> {
  await ensureCustomerCrmSchema();
  const { rows } = await pool.query(
    `INSERT INTO customer_contact_history
       (keycloak_user_id, contact_type, subject, content, direction, admin_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, keycloak_user_id, contact_type, subject, content, direction, admin_id, created_at`,
    [params.keycloakUserId, params.contactType, params.subject ?? null,
     params.content ?? null, params.direction ?? 'outbound', params.adminId ?? null],
  );
  return rows[0];
}

export async function getContactHistory(
  keycloakUserId: string, limit = 100,
): Promise<ContactHistoryEntry[]> {
  await ensureCustomerCrmSchema();
  const { rows } = await pool.query(
    `SELECT id, keycloak_user_id, contact_type, subject, content, direction, admin_id, created_at
       FROM customer_contact_history
      WHERE keycloak_user_id = $1
      ORDER BY created_at DESC
      LIMIT $2`,
    [keycloakUserId, Math.min(limit, 100)],
  );
  return rows;
}

export async function updateCustomerCrm(keycloakUserId: string, input: {
  customer_status?: string; acquisition_source?: string; tags?: string[];
}): Promise<boolean> {
  await ensureCustomerCrmSchema();
  if (input.customer_status && !CUSTOMER_STATUSES.includes(input.customer_status as CustomerStatus))
    throw new Error('Ungültiger Status.');
  const sets: string[] = [];
  const params: unknown[] = [];
  if (input.customer_status !== undefined) { params.push(input.customer_status); sets.push(`customer_status = $${params.length}`); }
  if (input.acquisition_source !== undefined) { params.push(input.acquisition_source); sets.push(`acquisition_source = $${params.length}`); }
  if (input.tags !== undefined) { params.push(input.tags); sets.push(`tags = $${params.length}::text[]`); }
  if (sets.length === 0) return true;
  params.push(keycloakUserId);
  const res = await pool.query(
    `UPDATE customers SET ${sets.join(', ')} WHERE keycloak_user_id = $${params.length}`, params);
  return (res.rowCount ?? 0) > 0;
}

export async function collectCustomerDsgvoData(keycloakUserId: string): Promise<{
  profile: CustomerProfile | null; contactHistory: ContactHistoryEntry[];
}> {
  const [profile, contactHistory] = await Promise.all([
    getCustomerProfile(keycloakUserId),
    getContactHistory(keycloakUserId, 100),
  ]);
  return { profile, contactHistory };
}
```

- [ ] **Step 4: Test ausführen, Erfolg bestätigen**

Run: `cd website && npx vitest run src/lib/customer-crm-db.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add website/src/lib/customer-crm-db.ts website/src/lib/customer-crm-db.test.ts
git commit -m "feat(db): add CRM profile + contact-history + dsgvo aggregate functions (T000614)"
```

### Task A4: Keycloak `updateUserAttribute()`

**Files:**
- Modify: `website/src/lib/keycloak.ts`
- Test: `website/src/lib/keycloak.attribute.test.ts`

- [ ] **Step 1: Failing test** (`website/src/lib/keycloak.attribute.test.ts`)

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

describe('updateUserAttribute', () => {
  it('GET-merges existing attributes then PUTs', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 't' }) }); // token (GET)
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ id: 'u1', attributes: { existing: ['v'] } }) }); // GET user
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 't' }) }); // token (PUT)
    fetchMock.mockResolvedValueOnce({ ok: true, status: 204, text: async () => '' }); // PUT

    const { updateUserAttribute } = await import('./keycloak');
    const ok = await updateUserAttribute('u1', 'phoneNumber', '+49 30 1');
    expect(ok).toBe(true);
    const putCall = fetchMock.mock.calls.find(c => c[1]?.method === 'PUT');
    const body = JSON.parse(putCall![1].body);
    expect(body.attributes.existing).toEqual(['v']);
    expect(body.attributes.phoneNumber).toEqual(['+49 30 1']);
  });
});
```

- [ ] **Step 2: Test ausführen, Fehlschlag bestätigen**

Run: `cd website && npx vitest run src/lib/keycloak.attribute.test.ts`
Expected: FAIL — `updateUserAttribute` nicht exportiert.

- [ ] **Step 3: Implementieren** (an `keycloak.ts` anhängen — nutzt das vorhandene private `kcApi`)

```ts
/**
 * Set a single Keycloak user attribute without clobbering the others.
 * Keycloak's PUT /users/{id} replaces the whole `attributes` map, so we
 * GET-merge-PUT. Best-effort: returns false on any failure. T000614.
 */
export async function updateUserAttribute(
  userId: string, key: string, value: string,
): Promise<boolean> {
  const getRes = await kcApi('GET', `/users/${encodeURIComponent(userId)}`);
  if (!getRes.ok) {
    console.error(`updateUserAttribute GET failed: ${getRes.status}`);
    return false;
  }
  const user = await getRes.json() as { attributes?: Record<string, string[]> };
  const attributes = { ...(user.attributes ?? {}), [key]: [value] };
  const putRes = await kcApi('PUT', `/users/${encodeURIComponent(userId)}`, { attributes });
  if (!putRes.ok) {
    const body = await putRes.text().catch(() => '');
    console.error(`updateUserAttribute PUT failed: ${putRes.status} ${body}`);
  }
  return putRes.ok;
}
```

- [ ] **Step 4: Test ausführen, Erfolg bestätigen**

Run: `cd website && npx vitest run src/lib/keycloak.attribute.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add website/src/lib/keycloak.ts website/src/lib/keycloak.attribute.test.ts
git commit -m "feat(keycloak): add updateUserAttribute GET-merge-PUT helper (T000614)"
```

---

## Phase B — API-Layer

### Task B1: `POST /api/portal/profile/update`

**Files:**
- Create: `website/src/pages/api/portal/profile/update.ts`

- [ ] **Step 1: Implementieren**

```ts
import type { APIRoute } from 'astro';
import { getSession } from '../../../../lib/auth';
import { getCustomerByKeycloakId } from '../../../../lib/website-db';
import {
  validateProfileInput, updateCustomerProfile, addContactHistoryEntry, type ProfileInput,
} from '../../../../lib/customer-crm-db';
import { updateUserAttribute } from '../../../../lib/keycloak';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session) return json({ error: 'Unauthorized' }, 401);

  // SECURITY: keycloak_user_id ALWAYS from session, never from the client.
  const customer = await getCustomerByKeycloakId(session.sub);
  if (!customer) return json({ error: 'Kein Kundenprofil gefunden.' }, 404);

  let input: ProfileInput;
  try { input = (await request.json()) as ProfileInput; }
  catch { return json({ error: 'Ungültiger Request-Body.' }, 400); }

  const valid = validateProfileInput(input);
  if (!valid.ok) return json({ error: valid.error }, 400);

  const result = await updateCustomerProfile(session.sub, input).catch((e) => {
    console.error('[profile/update] db error', e); return null;
  });
  if (!result) return json({ error: 'Speichern fehlgeschlagen.' }, 500);

  // Best-effort Keycloak phone sync (does not affect the response contract).
  if (input.phone) {
    await updateUserAttribute(session.sub, 'phoneNumber', input.phone)
      .catch((e) => console.error('[profile/update] kc sync failed', e));
  }

  // Audit trail in contact history (contact_type 'note' + subject marker —
  // keeps the DB contact_type enum to email|phone|meeting|note).
  await addContactHistoryEntry({
    keycloakUserId: session.sub, contactType: 'note',
    subject: 'profile_update', direction: 'inbound',
  }).catch((e) => console.error('[profile/update] history log failed', e));

  return json({ ok: true, updatedAt: result.updatedAt });
};
```

- [ ] **Step 2: Typecheck**

Run: `cd website && npx astro check --minimumSeverity error 2>&1 | grep -i "profile/update" || echo "no errors in file"`
Expected: keine Fehler in `update.ts`.

- [ ] **Step 3: Commit**

```bash
git add website/src/pages/api/portal/profile/update.ts
git commit -m "feat(api): add portal self-service profile update endpoint (T000614)"
```

### Task B2: `POST /api/admin/clients/contact-history/create`

**Files:**
- Create: `website/src/pages/api/admin/clients/contact-history/create.ts`

- [ ] **Step 1: Implementieren** (Pfadtiefe = 5 → `../../../../../lib/...`)

```ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { addContactHistoryEntry, CONTACT_TYPES, type ContactType } from '../../../../../lib/customer-crm-db';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return json({ error: 'Unauthorized' }, 401);

  let body: {
    keycloak_user_id?: string; contact_type?: string;
    subject?: string; content?: string; direction?: string;
  };
  try { body = await request.json(); }
  catch { return json({ error: 'Ungültiger Request-Body.' }, 400); }

  if (!body.keycloak_user_id) return json({ error: 'keycloak_user_id erforderlich' }, 400);
  if (!body.contact_type || !CONTACT_TYPES.includes(body.contact_type as ContactType))
    return json({ error: 'Ungültiger contact_type' }, 400);
  if (!body.subject?.trim() || body.subject.length > 200)
    return json({ error: 'Betreff erforderlich (max. 200 Zeichen)' }, 400);
  if (body.content && body.content.length > 5000)
    return json({ error: 'Inhalt zu lang (max. 5000 Zeichen)' }, 400);
  if (body.direction && !['inbound', 'outbound'].includes(body.direction))
    return json({ error: 'Ungültige Richtung' }, 400);

  const entry = await addContactHistoryEntry({
    keycloakUserId: body.keycloak_user_id,
    contactType: body.contact_type,
    subject: body.subject.trim(),
    content: body.content?.trim(),
    direction: body.direction,
    adminId: session.sub,
  }).catch((e) => { console.error('[contact-history/create] db error', e); return null; });
  if (!entry) return json({ error: 'Speichern fehlgeschlagen.' }, 500);

  return json({ ok: true, entry });
};
```

- [ ] **Step 2: Typecheck**

Run: `cd website && npx astro check --minimumSeverity error 2>&1 | grep -i "contact-history" || echo "no errors in file"`
Expected: keine Fehler.

- [ ] **Step 3: Commit**

```bash
git add website/src/pages/api/admin/clients/contact-history/create.ts
git commit -m "feat(api): add admin contact-history create endpoint (T000614)"
```

### Task B3: `POST /api/admin/clients/update-crm`

**Files:**
- Create: `website/src/pages/api/admin/clients/update-crm.ts`

- [ ] **Step 1: Implementieren** (Pfadtiefe = 4 → `../../../../lib/...`)

```ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { updateCustomerCrm, CUSTOMER_STATUSES, type CustomerStatus } from '../../../../lib/customer-crm-db';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return json({ error: 'Unauthorized' }, 401);

  let body: {
    keycloak_user_id?: string; customer_status?: string;
    acquisition_source?: string; tags?: string[];
  };
  try { body = await request.json(); }
  catch { return json({ error: 'Ungültiger Request-Body.' }, 400); }

  if (!body.keycloak_user_id) return json({ error: 'keycloak_user_id erforderlich' }, 400);
  if (body.customer_status && !CUSTOMER_STATUSES.includes(body.customer_status as CustomerStatus))
    return json({ error: 'Ungültiger Status' }, 400);
  if (body.acquisition_source && body.acquisition_source.length > 100)
    return json({ error: 'Akquisitionskanal zu lang' }, 400);
  if (body.tags) {
    if (!Array.isArray(body.tags) || body.tags.some(t => typeof t !== 'string' || t.length > 40))
      return json({ error: 'Ungültige Tags (max. 40 Zeichen pro Tag)' }, 400);
    if (body.tags.length > 20) return json({ error: 'Zu viele Tags (max. 20)' }, 400);
  }

  const ok = await updateCustomerCrm(body.keycloak_user_id, {
    customer_status: body.customer_status,
    acquisition_source: body.acquisition_source,
    tags: body.tags,
  }).catch((e) => { console.error('[update-crm] db error', e); return false; });
  if (!ok) return json({ error: 'Kein Kundenprofil gefunden oder Speichern fehlgeschlagen.' }, 404);

  return json({ ok: true });
};
```

- [ ] **Step 2: Typecheck**

Run: `cd website && npx astro check --minimumSeverity error 2>&1 | grep -i "update-crm" || echo "no errors in file"`
Expected: keine Fehler.

- [ ] **Step 3: Commit**

```bash
git add website/src/pages/api/admin/clients/update-crm.ts
git commit -m "feat(api): add admin update-crm endpoint (T000614)"
```

---

## Phase C — Admin-UI (Profil-Tab)

### Task C1: `CrmStatusPanel.svelte`

**Files:**
- Create: `website/src/components/admin/CrmStatusPanel.svelte`

- [ ] **Step 1: Implementieren**

```svelte
<script lang="ts">
  interface Props {
    keycloakUserId: string;
    status: string;
    acquisitionSource: string;
    tags: string[];
  }
  let { keycloakUserId, status: initialStatus, acquisitionSource: initialSrc, tags: initialTags }: Props = $props();

  const STATUSES = ['aktiv', 'inaktiv', 'potentiell', 'pausiert', 'abgeschlossen'];
  let status = $state(initialStatus || 'aktiv');
  let acquisitionSource = $state(initialSrc || '');
  let tags = $state<string[]>([...initialTags]);
  let newTag = $state('');
  let saving = $state(false);
  let message = $state('');
  let error = $state('');

  function addTag() {
    const t = newTag.trim();
    if (t && !tags.includes(t) && tags.length < 20) { tags = [...tags, t]; newTag = ''; }
  }
  function removeTag(t: string) { tags = tags.filter(x => x !== t); }

  async function save() {
    saving = true; message = ''; error = '';
    try {
      const res = await fetch('/api/admin/clients/update-crm', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keycloak_user_id: keycloakUserId, customer_status: status, acquisition_source: acquisitionSource, tags }),
      });
      if (res.ok) message = 'Gespeichert.';
      else { const j = await res.json().catch(() => ({})); error = j.error || 'Fehler.'; }
    } catch { error = 'Netzwerkfehler.'; }
    finally { saving = false; }
  }

  const STATUS_COLOR: Record<string, string> = {
    aktiv: 'text-[#22c55e] border-[#22c55e]/40',
    inaktiv: 'text-[#737373] border-[#30363d]',
    potentiell: 'text-[#f59e0b] border-[#f59e0b]/40',
    pausiert: 'text-[#eab308] border-[#eab308]/40',
    abgeschlossen: 'text-[#a3a3a3] border-[#30363d]',
  };
</script>

<div class="rounded-lg border border-[#30363d] bg-[#161b22] p-5">
  <h3 class="text-xs font-mono uppercase tracking-widest text-[#a3a3a3] mb-4">CRM-Status</h3>
  <div class="flex flex-wrap items-center gap-4 mb-4">
    <label class="flex items-center gap-2 text-sm text-[#e5e5e5]">
      Status
      <select bind:value={status} class="bg-[#0d1117] border {STATUS_COLOR[status] ?? 'border-[#30363d]'} rounded px-2 py-1 text-sm">
        {#each STATUSES as s}<option value={s}>{s}</option>{/each}
      </select>
    </label>
    <label class="flex items-center gap-2 text-sm text-[#e5e5e5]">
      Akquisition
      <input bind:value={acquisitionSource} maxlength="100" placeholder="z. B. Weiterempfehlung"
        class="bg-[#0d1117] border border-[#30363d] rounded px-2 py-1 text-sm text-[#e5e5e5]" />
    </label>
  </div>
  <div class="mb-4">
    <div class="flex flex-wrap gap-2 mb-2">
      {#each tags as t}
        <span class="inline-flex items-center gap-1 text-xs font-mono px-2 py-0.5 rounded bg-[#21262d] text-[#e5e5e5] border border-[#30363d]">
          {t}<button type="button" onclick={() => removeTag(t)} class="text-[#737373] hover:text-[#ef4444]" aria-label="Tag entfernen">×</button>
        </span>
      {/each}
    </div>
    <div class="flex items-center gap-2">
      <input bind:value={newTag} maxlength="40" onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
        placeholder="+ Tag" class="bg-[#0d1117] border border-[#30363d] rounded px-2 py-1 text-xs text-[#e5e5e5] w-40" />
      <button type="button" onclick={addTag} class="text-xs px-2 py-1 border border-[#30363d] rounded text-[#a3a3a3] hover:border-[#f59e0b]/40">Hinzufügen</button>
    </div>
  </div>
  <div class="flex items-center gap-3">
    <button onclick={save} disabled={saving}
      class="px-4 py-1.5 bg-[#f59e0b] text-[#0d1117] rounded text-sm font-semibold hover:bg-[#d97706] disabled:opacity-50">
      {saving ? '...' : 'Speichern'}
    </button>
    {#if message}<span class="text-xs text-[#22c55e]">{message}</span>{/if}
    {#if error}<span class="text-xs text-[#ef4444]">{error}</span>{/if}
  </div>
</div>
```

- [ ] **Step 2: Commit**

```bash
git add website/src/components/admin/CrmStatusPanel.svelte
git commit -m "feat(admin-ui): add CrmStatusPanel component (T000614)"
```

### Task C2: `ContactHistoryTimeline.svelte`

**Files:**
- Create: `website/src/components/admin/ContactHistoryTimeline.svelte`

- [ ] **Step 1: Implementieren**

```svelte
<script lang="ts">
  interface Entry {
    id: string; contact_type: string; subject?: string; content?: string;
    direction?: string; created_at: string;
  }
  interface Props { keycloakUserId: string; entries: Entry[]; }
  let { keycloakUserId, entries: initial }: Props = $props();

  let entries = $state<Entry[]>([...initial]);
  let contactType = $state('note');
  let subject = $state('');
  let content = $state('');
  let saving = $state(false);
  let error = $state('');

  const TYPES = [
    { v: 'email', label: 'E-Mail', icon: '📧' },
    { v: 'phone', label: 'Telefon', icon: '📞' },
    { v: 'meeting', label: 'Termin', icon: '🤝' },
    { v: 'note', label: 'Notiz', icon: '📝' },
  ];
  const icon = (t: string) => TYPES.find(x => x.v === t)?.icon ?? '•';
  const fmt = (iso: string) => new Date(iso).toLocaleDateString('de-DE', { year: 'numeric', month: '2-digit', day: '2-digit' });

  async function add() {
    if (!subject.trim()) { error = 'Betreff erforderlich.'; return; }
    saving = true; error = '';
    try {
      const res = await fetch('/api/admin/clients/contact-history/create', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keycloak_user_id: keycloakUserId, contact_type: contactType, subject, content }),
      });
      if (res.ok) {
        const j = await res.json();
        entries = [j.entry, ...entries];
        subject = ''; content = '';
      } else { const j = await res.json().catch(() => ({})); error = j.error || 'Fehler.'; }
    } catch { error = 'Netzwerkfehler.'; }
    finally { saving = false; }
  }
</script>

<div class="rounded-lg border border-[#30363d] bg-[#161b22] p-5 mt-4">
  <div class="flex items-center justify-between mb-4">
    <h3 class="text-xs font-mono uppercase tracking-widest text-[#a3a3a3]">Kontakthistorie</h3>
  </div>

  <div class="rounded-md border border-[#30363d] bg-[#0d1117] p-3 mb-5">
    <div class="flex flex-wrap gap-2 mb-2">
      <select bind:value={contactType} class="bg-[#161b22] border border-[#30363d] rounded px-2 py-1 text-sm text-[#e5e5e5]">
        {#each TYPES as t}<option value={t.v}>{t.icon} {t.label}</option>{/each}
      </select>
      <input bind:value={subject} maxlength="200" placeholder="Betreff"
        class="flex-1 min-w-40 bg-[#161b22] border border-[#30363d] rounded px-2 py-1 text-sm text-[#e5e5e5]" />
    </div>
    <textarea bind:value={content} maxlength="5000" rows="2" placeholder="Notiz (optional)"
      class="w-full bg-[#161b22] border border-[#30363d] rounded px-2 py-1 text-sm text-[#e5e5e5] mb-2"></textarea>
    <div class="flex items-center gap-3">
      <button onclick={add} disabled={saving}
        class="px-3 py-1 bg-[#f59e0b] text-[#0d1117] rounded text-sm font-semibold hover:bg-[#d97706] disabled:opacity-50">
        {saving ? '...' : '+ Eintrag'}
      </button>
      {#if error}<span class="text-xs text-[#ef4444]">{error}</span>{/if}
    </div>
  </div>

  {#if entries.length === 0}
    <p class="text-sm text-[#737373]">Noch keine Einträge.</p>
  {:else}
    <ul class="flex flex-col gap-3">
      {#each entries as e}
        <li class="flex gap-3 border-l-2 border-[#30363d] pl-3">
          <div class="flex-1">
            <div class="flex items-center gap-2 text-sm">
              <span>{icon(e.contact_type)}</span>
              <span class="font-mono text-xs text-[#a3a3a3]">{fmt(e.created_at)}</span>
              <span class="text-[#e5e5e5] font-medium">{e.subject ?? '—'}</span>
            </div>
            {#if e.content}<p class="text-xs text-[#a3a3a3] mt-0.5 whitespace-pre-wrap">{e.content}</p>{/if}
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</div>
```

- [ ] **Step 2: Commit**

```bash
git add website/src/components/admin/ContactHistoryTimeline.svelte
git commit -m "feat(admin-ui): add ContactHistoryTimeline component (T000614)"
```

### Task C3: „Profil"-Tab in `[clientId].astro` verdrahten

**Files:**
- Modify: `website/src/pages/admin/[clientId].astro`

- [ ] **Step 1: Imports ergänzen** (bei den bestehenden Imports oben)

```ts
import CrmStatusPanel from '../../components/admin/CrmStatusPanel.svelte';
import ContactHistoryTimeline from '../../components/admin/ContactHistoryTimeline.svelte';
import { getCustomerProfile, getContactHistory } from '../../lib/customer-crm-db';
```

- [ ] **Step 2: Daten laden** (im Frontmatter, nach dem `customerRecord`-Block ≈ Zeile 62)

```ts
let crmProfile: Awaited<ReturnType<typeof getCustomerProfile>> = null;
let contactHistory: Awaited<ReturnType<typeof getContactHistory>> = [];
try {
  crmProfile = await getCustomerProfile(clientId);
  contactHistory = await getContactHistory(clientId, 100);
} catch {
  // CRM-Tab bleibt leer, falls DB nicht erreichbar
}
```

- [ ] **Step 3: Tab in die Navigation aufnehmen** (im `[...].map`-Array, nach `{ id: 'onboarding', label: 'Onboarding' }`)

```ts
          { id: 'profil', label: 'Profil' },
```

- [ ] **Step 4: Tab-Content rendern** (im Tab-Content-Block, z. B. nach dem `onboarding`-Block)

```astro
        {tab === 'profil' && (
          <div class="flex flex-col gap-4" data-testid="admin-client-profil">
            <CrmStatusPanel
              client:load
              keycloakUserId={clientId}
              status={crmProfile?.customer_status ?? 'aktiv'}
              acquisitionSource={crmProfile?.acquisition_source ?? ''}
              tags={crmProfile?.tags ?? []}
            />
            <ContactHistoryTimeline
              client:load
              keycloakUserId={clientId}
              entries={contactHistory}
            />
          </div>
        )}
```

- [ ] **Step 5: Typecheck**

Run: `cd website && npx astro check --minimumSeverity error 2>&1 | grep -i "clientId" || echo "no errors"`
Expected: keine Fehler.

- [ ] **Step 6: Commit**

```bash
git add "website/src/pages/admin/[clientId].astro"
git commit -m "feat(admin-ui): wire Profil tab with CRM panel + contact history (T000614)"
```

---

## Phase D — Portal-UI (KontoSection)

### Task D1: `ProfileCard.astro` (read-only, Industrial/Loft)

**Files:**
- Create: `website/src/components/portal/ProfileCard.astro`

- [ ] **Step 1: Implementieren**

```astro
---
import type { CustomerProfile } from '../../lib/customer-crm-db';
interface Props {
  name: string;
  email: string;
  profile: CustomerProfile | null;
}
const { name, email, profile } = Astro.props;
const initial = (name?.trim()?.[0] ?? '?').toUpperCase();
const addressLine = [profile?.address, [profile?.postal_code, profile?.city].filter(Boolean).join(' ')]
  .filter(Boolean).join(', ');
const CHANNEL_LABEL: Record<string, string> = { email: 'E-Mail', phone: 'Telefon', portal: 'Portal-Nachricht' };
---

<div class="rounded-lg border border-[#30363d] bg-[#161b22] overflow-hidden">
  <!-- Kopf -->
  <div class="flex items-center gap-4 p-5 border-b border-[#30363d]">
    <div class="w-12 h-12 rounded-lg bg-[#21262d] border border-[#30363d] flex items-center justify-center text-xl font-bold text-[#f59e0b] font-mono">
      {initial}
    </div>
    <div class="min-w-0">
      <div class="text-base font-semibold text-[#e5e5e5] truncate">{name}</div>
      <div class="text-xs text-[#a3a3a3] font-mono truncate">{email}</div>
      {profile?.customer_number && (
        <div class="text-xs text-[#737373] font-mono mt-0.5">Kundennummer: {profile.customer_number}</div>
      )}
    </div>
  </div>

  <!-- Kontaktdaten -->
  <div class="p-5 border-b border-[#30363d]">
    <h3 class="text-xs font-mono uppercase tracking-widest text-[#a3a3a3] mb-3">Meine Kontaktdaten</h3>
    <dl class="grid grid-cols-1 gap-2 text-sm">
      <div class="flex gap-2"><dt class="text-[#737373] w-24">Telefon</dt><dd class="text-[#e5e5e5]">{profile?.phone || '—'}</dd></div>
      <div class="flex gap-2"><dt class="text-[#737373] w-24">Firma</dt><dd class="text-[#e5e5e5]">{profile?.company || '—'}</dd></div>
      <div class="flex gap-2"><dt class="text-[#737373] w-24">Adresse</dt><dd class="text-[#e5e5e5]">{addressLine || '—'}</dd></div>
    </dl>
  </div>

  <!-- Präferenzen -->
  <div class="p-5">
    <h3 class="text-xs font-mono uppercase tracking-widest text-[#a3a3a3] mb-3">Präferenzen</h3>
    <dl class="grid grid-cols-1 gap-2 text-sm">
      <div class="flex gap-2"><dt class="text-[#737373] w-32">Kontaktkanal</dt><dd class="text-[#e5e5e5]">{CHANNEL_LABEL[profile?.preferred_contact_channel ?? 'email'] ?? 'E-Mail'}</dd></div>
      <div class="flex gap-2"><dt class="text-[#737373] w-32">Frequenz</dt><dd class="text-[#e5e5e5] capitalize">{profile?.communication_frequency ?? 'monatlich'}</dd></div>
    </dl>
  </div>
</div>
```

- [ ] **Step 2: Commit**

```bash
git add website/src/components/portal/ProfileCard.astro
git commit -m "feat(portal-ui): add read-only ProfileCard component (T000614)"
```

### Task D2: `ProfileEditor.svelte` (inline Self-Service-Edit)

**Files:**
- Create: `website/src/components/portal/ProfileEditor.svelte`

- [ ] **Step 1: Implementieren**

```svelte
<script lang="ts">
  interface ProfileData {
    phone?: string; company?: string; address?: string; city?: string;
    postal_code?: string; country?: string;
    preferred_contact_channel?: string; communication_frequency?: string;
  }
  interface Props { profile: ProfileData | null; }
  let { profile }: Props = $props();

  let open = $state(false);
  let saving = $state(false);
  let message = $state('');
  let error = $state('');

  let form = $state<ProfileData>({
    phone: profile?.phone ?? '',
    company: profile?.company ?? '',
    address: profile?.address ?? '',
    city: profile?.city ?? '',
    postal_code: profile?.postal_code ?? '',
    country: profile?.country ?? 'DE',
    preferred_contact_channel: profile?.preferred_contact_channel ?? 'email',
    communication_frequency: profile?.communication_frequency ?? 'monatlich',
  });

  const CHANNELS = [
    { v: 'email', label: 'E-Mail' }, { v: 'phone', label: 'Telefon' }, { v: 'portal', label: 'Portal-Nachricht' },
  ];
  const FREQS = ['wöchentlich', 'zweiwöchentlich', 'monatlich', 'bei_bedarf'];

  async function save() {
    saving = true; message = ''; error = '';
    try {
      const res = await fetch('/api/portal/profile/update', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok) { message = 'Profil gespeichert.'; setTimeout(() => window.location.reload(), 800); }
      else error = j.error || 'Fehler beim Speichern.';
    } catch { error = 'Netzwerkfehler.'; }
    finally { saving = false; }
  }
</script>

{#if !open}
  <button onclick={() => (open = true)}
    class="px-4 py-2 bg-[#21262d] border border-[#30363d] text-[#e5e5e5] rounded text-sm hover:border-[#f59e0b]/40 transition-colors">
    Profil bearbeiten
  </button>
{:else}
  <div class="rounded-lg border border-[#f59e0b]/30 bg-[#161b22] p-5" data-testid="profile-editor">
    <h3 class="text-xs font-mono uppercase tracking-widest text-[#a3a3a3] mb-4">Profil bearbeiten</h3>
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
      <label class="text-sm text-[#a3a3a3]">Telefon
        <input bind:value={form.phone} maxlength="30" class="mt-1 w-full bg-[#0d1117] border border-[#30363d] rounded px-2 py-1.5 text-sm text-[#e5e5e5]" /></label>
      <label class="text-sm text-[#a3a3a3]">Firma
        <input bind:value={form.company} maxlength="100" class="mt-1 w-full bg-[#0d1117] border border-[#30363d] rounded px-2 py-1.5 text-sm text-[#e5e5e5]" /></label>
      <label class="text-sm text-[#a3a3a3] sm:col-span-2">Straße
        <input bind:value={form.address} maxlength="200" class="mt-1 w-full bg-[#0d1117] border border-[#30363d] rounded px-2 py-1.5 text-sm text-[#e5e5e5]" /></label>
      <label class="text-sm text-[#a3a3a3]">PLZ
        <input bind:value={form.postal_code} maxlength="10" class="mt-1 w-full bg-[#0d1117] border border-[#30363d] rounded px-2 py-1.5 text-sm text-[#e5e5e5]" /></label>
      <label class="text-sm text-[#a3a3a3]">Ort
        <input bind:value={form.city} maxlength="100" class="mt-1 w-full bg-[#0d1117] border border-[#30363d] rounded px-2 py-1.5 text-sm text-[#e5e5e5]" /></label>
      <label class="text-sm text-[#a3a3a3]">Kontaktkanal
        <select bind:value={form.preferred_contact_channel} class="mt-1 w-full bg-[#0d1117] border border-[#30363d] rounded px-2 py-1.5 text-sm text-[#e5e5e5]">
          {#each CHANNELS as c}<option value={c.v}>{c.label}</option>{/each}
        </select></label>
      <label class="text-sm text-[#a3a3a3]">Frequenz
        <select bind:value={form.communication_frequency} class="mt-1 w-full bg-[#0d1117] border border-[#30363d] rounded px-2 py-1.5 text-sm text-[#e5e5e5] capitalize">
          {#each FREQS as f}<option value={f}>{f}</option>{/each}
        </select></label>
    </div>
    <div class="flex items-center gap-3">
      <button onclick={save} disabled={saving}
        class="px-4 py-2 bg-[#f59e0b] text-[#0d1117] rounded text-sm font-semibold hover:bg-[#d97706] disabled:opacity-50">
        {saving ? '...' : 'Speichern'}
      </button>
      <button onclick={() => (open = false)} class="px-3 py-2 text-sm text-[#a3a3a3] hover:text-[#e5e5e5]">Abbrechen</button>
      {#if message}<span class="text-xs text-[#22c55e]">{message}</span>{/if}
      {#if error}<span class="text-xs text-[#ef4444]">{error}</span>{/if}
    </div>
  </div>
{/if}
```

- [ ] **Step 2: Commit**

```bash
git add website/src/components/portal/ProfileEditor.svelte
git commit -m "feat(portal-ui): add inline ProfileEditor component (T000614)"
```

### Task D3: `KontoSection.astro` überarbeiten + `portal.astro` Props

**Files:**
- Modify: `website/src/components/portal/KontoSection.astro`
- Modify: `website/src/pages/portal.astro`

- [ ] **Step 1: `portal.astro` — Profil laden und durchreichen**

Import ergänzen (bei den anderen Imports):

```ts
import { getCustomerProfile } from '../lib/customer-crm-db';
```

Nach dem bestehenden `getCustomerByEmail`-Block (≈ Zeile 56):

```ts
const crmProfile = await getCustomerProfile(session.sub).catch(() => null);
```

`KontoSection`-Aufruf um die neue Prop erweitern:

```astro
<KontoSection session={session} keycloakBase={keycloakBase} realm={realm} profile={crmProfile} />
```

- [ ] **Step 2: `KontoSection.astro` neu schreiben** (komplette Datei ersetzen)

```astro
---
import type { UserSession } from '../../lib/auth';
import type { CustomerProfile } from '../../lib/customer-crm-db';
import ProfileCard from './ProfileCard.astro';
import ProfileEditor from './ProfileEditor.svelte';

interface Props {
  session: UserSession;
  keycloakBase: string;
  realm: string;
  profile: CustomerProfile | null;
}
const { session, keycloakBase, realm, profile } = Astro.props;
const kcAccountUrl = `${keycloakBase}/realms/${realm}/account/`;
---

<div class="pt-10 pb-20 px-8 max-w-2xl">
  <h2 class="text-xl font-bold text-[#e5e5e5] mb-6">Konto</h2>

  <div class="flex flex-col gap-4">
    <ProfileCard name={session.name} email={session.email} profile={profile} />

    <div data-testid="konto-editor">
      <ProfileEditor client:load profile={profile} />
    </div>

    <!-- Sicherheit & Konto -->
    <div class="rounded-lg border border-[#30363d] bg-[#161b22] p-5">
      <h3 class="text-xs font-mono uppercase tracking-widest text-[#a3a3a3] mb-4">Sicherheit &amp; Konto</h3>
      <div class="flex flex-col gap-3">
        <a href={kcAccountUrl} target="_blank" rel="noopener noreferrer"
           class="flex items-center gap-3 p-3 bg-[#0d1117] rounded-md border border-[#30363d] hover:border-[#f59e0b]/40 transition-colors">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4 text-[#a3a3a3] flex-shrink-0" aria-hidden="true">
            <circle cx="8" cy="5" r="3"/><path d="M2.5 14.5a5.5 5.5 0 0 1 11 0"/>
          </svg>
          <div>
            <div class="text-sm font-medium text-[#e5e5e5]">Konto verwalten</div>
            <div class="text-xs text-[#a3a3a3]">Passwort, E-Mail, Zwei-Faktor-Auth</div>
          </div>
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" class="w-3.5 h-3.5 text-[#a3a3a3] ml-auto" aria-hidden="true"><path d="M6 3l5 5-5 5"/></svg>
        </a>

        <a href="/meine-daten"
           class="flex items-center gap-3 p-3 bg-[#0d1117] rounded-md border border-[#30363d] hover:border-[#f59e0b]/40 transition-colors">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4 text-[#a3a3a3] flex-shrink-0" aria-hidden="true">
            <rect x="2" y="3.5" width="12" height="10" rx="1"/><path d="M2 10h3.5l1.5 2 1.5-2H12"/>
          </svg>
          <div>
            <div class="text-sm font-medium text-[#e5e5e5]">Meine Daten (DSGVO)</div>
            <div class="text-xs text-[#a3a3a3]">Datenschutz, Datenauskunft, Löschung</div>
          </div>
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" class="w-3.5 h-3.5 text-[#a3a3a3] ml-auto" aria-hidden="true"><path d="M6 3l5 5-5 5"/></svg>
        </a>
      </div>
    </div>
  </div>
</div>
```

- [ ] **Step 3: Typecheck**

Run: `cd website && npx astro check --minimumSeverity error 2>&1 | grep -iE "KontoSection|portal.astro" || echo "no errors"`
Expected: keine Fehler.

- [ ] **Step 4: Commit**

```bash
git add website/src/components/portal/KontoSection.astro website/src/pages/portal.astro
git commit -m "feat(portal-ui): rebuild KontoSection with ProfileCard + ProfileEditor (T000614)"
```

---

## Phase E — DSGVO-Erweiterung

### Task E1: Self-Service-Datenexport-Endpoint

**Files:**
- Create: `website/src/pages/api/portal/profile/export.ts`

- [ ] **Step 1: Implementieren**

```ts
import type { APIRoute } from 'astro';
import { getSession } from '../../../../lib/auth';
import { collectCustomerDsgvoData } from '../../../../lib/customer-crm-db';

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  // SECURITY: only the caller's own data, keyed by session.sub.
  const data = await collectCustomerDsgvoData(session.sub).catch((e) => {
    console.error('[profile/export] db error', e); return null;
  });
  if (!data) {
    return new Response(JSON.stringify({ error: 'Export fehlgeschlagen.' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }

  const payload = {
    exportedAt: new Date().toISOString(),
    identity: { name: session.name, email: session.email },
    ...data,
  };
  return new Response(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': 'attachment; filename="meine-daten.json"',
    },
  });
};
```

- [ ] **Step 2: Typecheck**

Run: `cd website && npx astro check --minimumSeverity error 2>&1 | grep -i "profile/export" || echo "no errors"`
Expected: keine Fehler.

- [ ] **Step 3: Commit**

```bash
git add website/src/pages/api/portal/profile/export.ts
git commit -m "feat(api): add DSGVO self-service data export endpoint (T000614)"
```

### Task E2: „Meine Daten herunterladen"-Button in `DataManagement.svelte`

**Files:**
- Modify: `website/src/components/DataManagement.svelte`

- [ ] **Step 1: Bestehende Komponente lesen** und die State-Variable identifizieren, die den Login-Status aus `/api/auth/me` hält (im `fetch('/api/auth/me')`-Block, ≈ Zeile 25–35).

Run: `cd website && sed -n '20,40p' src/components/DataManagement.svelte`
Expected: Variable für das `me`-Ergebnis bestimmen (Name notieren).

- [ ] **Step 2: Download-Button ergänzen** — im DSGVO-Bereich (neben „Auskunft anfordern", ≈ Zeile 138). Konditional rendern, wenn eingeloggt:

```svelte
{#if me}
  <a href="/api/portal/profile/export"
     class="px-4 py-2 border border-dark-lighter text-muted hover:text-light hover:border-light rounded text-sm transition-colors inline-block">
    Meine Daten herunterladen (JSON)
  </a>
{/if}
```

> Falls die State-Variable nicht `me` heißt: an die tatsächliche Variable anpassen. Reicht das Login-Signal nicht aus, den Button unkonditional rendern — das Endpoint gibt für nicht eingeloggte Nutzer ohnehin 401 zurück.

- [ ] **Step 3: Typecheck**

Run: `cd website && npx astro check --minimumSeverity error 2>&1 | grep -i "DataManagement" || echo "no errors"`
Expected: keine Fehler.

- [ ] **Step 4: Commit**

```bash
git add website/src/components/DataManagement.svelte
git commit -m "feat(dsgvo): add self-service data download button (T000614)"
```

---

## Phase F — Tests

### Task F1: BATS-Validierungs-Tests

**Files:**
- Create: `tests/unit/portal-profile-update.bats`

Diese Tests verifizieren die Validierungslogik (`validateProfileInput` + Enums) direkt aus der TS-Quelle via `tsx`.

- [ ] **Step 1: `tsx`-Verfügbarkeit prüfen**

Run: `ls /tmp/wt-T000614-kundenprofil-upgrade/website/node_modules/.bin/tsx 2>/dev/null && echo "tsx present" || echo "MISSING — cd website && npm i -D tsx"`
Expected: `tsx present` (sonst installieren).

- [ ] **Step 2: BATS-Test schreiben** (`tests/unit/portal-profile-update.bats`)

```bash
#!/usr/bin/env bats
# T000614 — Validierung der Self-Service-Profil-API (Feldlängen + Enums).

setup() {
  cd "${BATS_TEST_DIRNAME}/../../website" || exit 1
}

@test "validateProfileInput rejects an over-long phone" {
  run npx tsx -e "import {validateProfileInput} from './src/lib/customer-crm-db.ts'; const r=validateProfileInput({phone:'x'.repeat(31)}); process.exit(r.ok?1:0)"
  [ "$status" -eq 0 ]
}

@test "validateProfileInput rejects an invalid contact channel" {
  run npx tsx -e "import {validateProfileInput} from './src/lib/customer-crm-db.ts'; const r=validateProfileInput({preferred_contact_channel:'fax'}); process.exit(r.ok?1:0)"
  [ "$status" -eq 0 ]
}

@test "validateProfileInput accepts a valid payload" {
  run npx tsx -e "import {validateProfileInput} from './src/lib/customer-crm-db.ts'; const r=validateProfileInput({phone:'+49 30 1',communication_frequency:'monatlich'}); process.exit(r.ok?0:1)"
  [ "$status" -eq 0 ]
}

@test "CONTACT_TYPES enum excludes profile_update" {
  run npx tsx -e "import {CONTACT_TYPES} from './src/lib/customer-crm-db.ts'; process.exit(CONTACT_TYPES.includes('profile_update')?1:0)"
  [ "$status" -eq 0 ]
}
```

- [ ] **Step 3: Test ausführen**

Run: `cd /tmp/wt-T000614-kundenprofil-upgrade && bats tests/unit/portal-profile-update.bats`
Expected: 4 Tests PASS.

- [ ] **Step 4: Inventory aktualisieren** (CI verlangt das bei Test-Additionen)

Run: `cd /tmp/wt-T000614-kundenprofil-upgrade && task test:inventory`
Expected: `website/src/data/test-inventory.json` regeneriert.

- [ ] **Step 5: Commit**

```bash
git add tests/unit/portal-profile-update.bats website/src/data/test-inventory.json
git commit -m "test: add BATS validation tests for profile update (T000614)"
```

### Task F2: Playwright — Portal (mentolder-authenticated)

**Files:**
- Create: `website/tests/e2e/kundenprofil-portal.spec.ts`

> Vorab prüfen, wie bestehende authenticated-Specs Login/Storage handhaben: `grep -rl "mentolder-authenticated\|storageState" website/tests/e2e | head` und ein Beispiel als Vorlage nehmen.

- [ ] **Step 1: Spec schreiben** (`website/tests/e2e/kundenprofil-portal.spec.ts`)

```ts
import { test, expect } from '@playwright/test';

test.describe('Kundenprofil — Portal Self-Service', () => {
  test('Kunde sieht Profil-Karte und Bearbeiten-Button', async ({ page }) => {
    await page.goto('/portal?tab=konto');
    await expect(page.getByText('Meine Kontaktdaten')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Profil bearbeiten' })).toBeVisible();
  });

  test('Kunde kann Telefon + Firma editieren und speichern', async ({ page }) => {
    await page.goto('/portal?tab=konto');
    await page.getByRole('button', { name: 'Profil bearbeiten' }).click();
    const editor = page.getByTestId('profile-editor');
    await editor.getByLabel('Telefon').fill('+49 30 9999999');
    await editor.getByLabel('Firma').fill('Testfirma GmbH');
    await editor.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.getByText('Profil gespeichert.')).toBeVisible();
  });
});
```

- [ ] **Step 2: Lokal/nightly ausführen**

Run: `cd website && npx playwright test tests/e2e/kundenprofil-portal.spec.ts --project=mentolder-authenticated`
Expected: PASS (oder dokumentiert übersprungen, falls kein Auth-State lokal — dann verlässt sich der Plan auf den nightly e2e-Lauf).

- [ ] **Step 3: Commit**

```bash
git add website/tests/e2e/kundenprofil-portal.spec.ts
git commit -m "test(e2e): add portal Kundenprofil Playwright spec (T000614)"
```

### Task F3: Playwright — Admin

**Files:**
- Create: `website/tests/e2e/kundenprofil-admin.spec.ts`

- [ ] **Step 1: Spec schreiben** (`website/tests/e2e/kundenprofil-admin.spec.ts`)

```ts
import { test, expect } from '@playwright/test';

// Eine bekannte Test-Kunden-keycloak-ID; aus dem Seed-/Fixture-Setup beziehen.
// Vorab prüfen, wie andere admin-Specs an eine clientId kommen und denselben
// Mechanismus nutzen.
const CLIENT_ID = process.env.E2E_TEST_CLIENT_ID ?? '';

test.describe('Kundenprofil — Admin CRM', () => {
  test.skip(!CLIENT_ID, 'E2E_TEST_CLIENT_ID nicht gesetzt');

  test('Admin sieht den Profil-Tab', async ({ page }) => {
    await page.goto(`/admin/${CLIENT_ID}?tab=profil`);
    await expect(page.getByTestId('admin-client-profil')).toBeVisible();
    await expect(page.getByText('CRM-Status')).toBeVisible();
  });

  test('Admin kann einen Kontakthistorie-Eintrag hinzufügen', async ({ page }) => {
    await page.goto(`/admin/${CLIENT_ID}?tab=profil`);
    await page.getByPlaceholder('Betreff').fill('E2E Erstkontakt');
    await page.getByRole('button', { name: '+ Eintrag' }).click();
    await expect(page.getByText('E2E Erstkontakt')).toBeVisible();
  });

  test('Admin kann den CRM-Status ändern', async ({ page }) => {
    await page.goto(`/admin/${CLIENT_ID}?tab=profil`);
    const panel = page.getByText('CRM-Status').locator('..');
    await panel.getByRole('combobox').first().selectOption('pausiert');
    await panel.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.getByText('Gespeichert.')).toBeVisible();
  });
});
```

- [ ] **Step 2: Lokal ausführen**

Run: `cd website && npx playwright test tests/e2e/kundenprofil-admin.spec.ts --project=admin`
Expected: PASS oder dokumentiert übersprungen (keine `E2E_TEST_CLIENT_ID`).

- [ ] **Step 3: Commit**

```bash
git add website/tests/e2e/kundenprofil-admin.spec.ts
git commit -m "test(e2e): add admin Kundenprofil CRM Playwright spec (T000614)"
```

### Task F4: Voller Offline-CI-Lauf lokal

- [ ] **Step 1: Vitest gesamt**

Run: `cd website && npx vitest run src/lib/customer-crm-db.test.ts src/lib/customer-crm-db.ensure.test.ts src/lib/keycloak.attribute.test.ts`
Expected: alle PASS.

- [ ] **Step 2: Astro typecheck gesamt**

Run: `cd website && npx astro check --minimumSeverity error`
Expected: 0 errors.

- [ ] **Step 3: Offline-Test-Suite + Freshness (wie CI)**

Run: `cd /tmp/wt-T000614-kundenprofil-upgrade && task test:all && task freshness:check`
Expected: grün. Falls `test:inventory`-Diff: regenerieren + committen.

- [ ] **Step 4: Commit (falls Artefakte regeneriert)**

```bash
git add -A
git commit -m "test: regenerate inventory + verify offline CI green (T000614)" || echo "nothing to commit"
```

---

## Abschluss-Checkliste (vor PR)

- [ ] Alle Vitest/BATS grün, `astro check` 0 errors, `task test:all` grün.
- [ ] Phase A–F vollständig committet.
- [ ] Manueller Smoke gegen dev-k3d: Profil bearbeiten → speichern → Reload zeigt neue Werte; Admin-Tab → Kontakthistorie-Eintrag erscheint; CRM-Status persistiert.
- [ ] Self-Service-Endpoints (`update.ts`, `export.ts`) lesen `keycloak_user_id` ausschließlich aus der Session — kein Client-Override.
- [ ] DSGVO-Export enthält neue Felder + Kontakthistorie.
- [ ] PR öffnen und **sofort** `gh pr merge <n> --squash --auto` setzen (Auto-Merge-Konvention).
- [ ] Nach Merge: Website-Deploy läuft automatisch über `build-website*.yml` (digest-pin beachten — ggf. `set image …:latest` falls Rollout stale).

---

## Spec-Coverage-Nachweis (Self-Review)

| Spec-Anforderung | Task |
|---|---|
| 11 neue `customers`-Spalten | A1 |
| `customer_contact_history`-Tabelle + Index | A1 |
| DB-Funktionen `getCustomerProfile`/`updateCustomerProfile`/`addContactHistoryEntry`/`getContactHistory` | A3 |
| `updateCustomerCrm` (Status/Tags/Akquisition) | A3 |
| Keycloak `updateUserAttribute` (Phone-Sync) | A4 |
| `POST /api/portal/profile/update` (+ KC-Sync + Audit-Eintrag) | B1 |
| `POST /api/admin/clients/contact-history/create` | B2 |
| `POST /api/admin/clients/update-crm` | B3 |
| `CrmStatusPanel.svelte` (Status-Badge, Tags, Akquisition) | C1 |
| `ContactHistoryTimeline.svelte` (Timeline + Schnell-Hinzufügen) | C2 |
| Admin „Profil"-Tab in `[clientId].astro` | C3 |
| `ProfileCard.astro` (read-only, Industrial/Loft) | D1 |
| `ProfileEditor.svelte` (inline Self-Service, optimistic, Fehlerbehandlung) | D2 |
| `KontoSection.astro` Überarbeitung + Props-Durchreichung | D3 |
| DSGVO: neue Felder + Kontakthistorie exportierbar | E1 (`collectCustomerDsgvoData` + export-Endpoint) |
| DSGVO Self-Service-Download-Button | E2 |
| BATS-Validierung (Feldlängen, Enums) | F1 |
| Playwright portal/admin | F2/F3 |
| Sicherheit: keycloak_user_id aus Session | B1, E1 |
| Bio-Feld in DB, nicht in UI (offene Frage 1) | A1 (Spalte da), D2 (kein UI-Input) |
| Tags nur Badges, kein Filter (offene Frage 2) | C1 |
| Kontakthistorie nur Admin (offene Frage 3) | C2 (Admin); Portal zeigt keine Historie |

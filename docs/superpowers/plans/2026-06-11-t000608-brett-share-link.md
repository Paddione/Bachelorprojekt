---
title: Brett: Board als Link teilen (öffentlich, View-only) — Implementation Plan
ticket_id: T000608
domains: [website, infra, db, ops, test, security]
status: active
pr_number: null
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Brett: Board als Link teilen (öffentlich, View-only) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein Systembrett-Board per öffentlichem `/share/:token`-Link teilen, sodass Dritte ohne Keycloak-Account das Board live (read-only) per WebSocket beobachten; der Leiter erstellt/deaktiviert den Link.

**Architecture:** Eine neue PostgreSQL-Tabelle `brett_share_tokens` speichert URL-Tokens. Eine eigenständige, unauthentifizierte Express-Route `/share/:token` + eine separate Vite-Seite (`public/share.html` / `src/client/share.ts`) rendern das Board ohne den OIDC-Flow. Eine neue WS-Rolle `gast` (read-only, unterhalb `beobachter`) wird vom Server gesetzt, wenn ein gültiges `share_token` im `/sync`-Query-String ankommt; `canMutate('gast', …)` lehnt jede Mutation außer `request_state_snapshot` ab. Ein Teilen-Button im Topbar (nur für `leiter`/Admin) ruft die neuen `/api/rooms/:roomToken/share`-Endpunkte.

**Tech Stack:** Node.js + TypeScript, Express, `ws` (WebSocketServer), PostgreSQL (`pg`), Three.js (Client), Vite (multi-entry build), `node:test` via `tsx --test` mit `MOCK_DB=true` (Brett-Tests laufen NICHT mit vitest und NICHT mit BATS).

---

## Wichtige Codebase-Realitäten (vor Beginn lesen)

Diese weichen von der Design-Spec ab — der Plan folgt der echten Codebase:

1. **Brett-Tests** liegen in `brett/test/*.test.ts` und laufen via `npm test` (= `MOCK_DB=true tsx --test test/*.test.ts …`) mit `node:test` (`import { test } from 'node:test'`, `import assert from 'node:assert/strict'`). Es gibt **kein vitest** und **keine BATS-Tests** für Brett. Die in der Spec genannten `FA-BRT-41..45` (BATS) und `board-share.test.ts` (vitest) werden als `node:test`-Dateien umgesetzt.
2. **Rollen** liegen **nicht** in `rooms.ts`/`getRoles`, sondern im `__roles__`-Eintrag der figure-map, abrufbar über `phases.buildStateFromMutations(room).roles` (ein `Record<userId, Role>`). `resolveRole(ws, roles)` keyt strikt auf `ws._session.userId`.
3. **Vite-Entry** ist `public/index.html`. Statisch ausgeliefert wird `dist/client` (nach `vite build`) bzw. `public/` (dev) via `express.static`. Es gibt **keinen** SPA-Catch-all — explizite Routen vor `express.static` reichen NICHT (static läuft zuerst); die `/share/:token`-Route greift, weil `:token` kein existierendes statisches File ist.
4. **`crypto`** ist bereits in Node verfügbar; `db.ts` importiert `randomBytes` aus `'crypto'`. Kein neues Dependency.
5. **MockPool** (`db.ts`, aktiv unter `MOCK_DB=true`) gibt `{ rows: [] }` für **jede** Query zurück. Um die neuen DB-Funktionen testbar zu machen, wird MockPool um einen optionalen, injizierbaren Query-Handler erweitert (Task 2).
6. **Migrationen** laufen beim Start via `db.runMigrations()` (liest `src/server/migrations/*.sql` sortiert, übersprungen unter `MOCK_DB`). Bestehend: `001_session_events.sql`, `002_coaching_templates.sql`.

---

## File Structure

**Neu erstellt:**
- `brett/src/server/migrations/003_share_tokens.sql` — Tabelle `brett_share_tokens`.
- `brett/public/share.html` — eigenständige View-only-Seite (kein Auth-Redirect, kein Admin-Panel).
- `brett/src/client/share.ts` — Client-Bootstrap der Share-Seite (Token validieren → Szene → read-only WS).
- `brett/test/share-token-db.test.ts` — Unit-Tests für die DB-Funktionen.
- `brett/test/share-permissions.test.ts` — Unit-Tests für `gast`-Rolle in `canMutate`/`resolveRole`.
- `brett/test/share-auth.test.ts` — Unit-Tests für `requireLeiterOrAdmin`.
- `brett/test/share-routes.test.ts` — Integrationstest der HTTP-Routen (supertest-frei, via direkter Handler-Aufrufe / Express-App-Import).
- `brett/test/share-ws-guest.test.ts` — Test, dass ein WS-Gast read-only ist.

**Geändert:**
- `brett/src/types/state.ts` — `'gast'` zur `Role`-Union.
- `brett/src/server/permissions.ts` — `gast`-Zweig in `canMutate`; `_isGuest`-Pfad in `resolveRole`.
- `brett/src/server/db.ts` — MockPool injizierbar + 4 neue Funktionen (`createShareToken`, `resolveShareToken`, `disableShareToken`, `listShareTokens`).
- `brett/src/server/auth.ts` — neue Middleware `requireLeiterOrAdmin`.
- `brett/src/server/index.ts` — 5 neue HTTP-Routen + `share_token`-Erkennung im WS-`verifyClient`/`connection`-Pfad.
- `brett/src/server/ws-handler.ts` — `share_token` aus WS-URL lesen → `ws._isGuest`/`ws._shareRoom` setzen.
- `brett/vite.config.ts` — zweiter Entry-Point `share`.
- `brett/src/client/board-boot.ts` (oder `app-shell.ts`) — Teilen-Button im Topbar (nur `leiter`/Admin).
- `brett/src/client/ui/topbar-share.ts` — **neu**: Mount-Helper für den Teilen-Button (analog `topbar-invite.ts`).

---

## Task 1: Migration `003_share_tokens.sql`

**Files:**
- Create: `brett/src/server/migrations/003_share_tokens.sql`

- [ ] **Step 1: Migration-SQL schreiben**

Datei `brett/src/server/migrations/003_share_tokens.sql`:

```sql
-- brett/src/server/migrations/003_share_tokens.sql
-- Migration: Share-Token-Tabelle für öffentliche View-only-Links (T000608).
-- Idempotent (IF NOT EXISTS) — runMigrations() führt jede Datei bei jedem Start aus.

CREATE TABLE IF NOT EXISTS brett_share_tokens (
  token        TEXT         PRIMARY KEY,
  room_token   TEXT         NOT NULL,
  created_by   TEXT,                          -- userId des Erstellers (NULL = admin-tool)
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  disabled_at  TIMESTAMPTZ,                   -- NULL = aktiv; gesetzt = deaktiviert
  expires_at   TIMESTAMPTZ                    -- NULL = kein Ablauf (Phase 1 ungenutzt, Hook für später)
);

CREATE INDEX IF NOT EXISTS idx_share_tokens_room
  ON brett_share_tokens (room_token)
  WHERE disabled_at IS NULL;
```

- [ ] **Step 2: Verifizieren, dass `runMigrations` die Datei aufgreift**

Run: `cd brett && ls src/server/migrations/`
Expected: `001_session_events.sql  002_coaching_templates.sql  003_share_tokens.sql` (sortierte Reihenfolge — `003_` läuft zuletzt).

- [ ] **Step 3: Commit**

```bash
cd brett && git add src/server/migrations/003_share_tokens.sql
git commit -m "feat(brett): add brett_share_tokens migration (T000608)"
```

---

## Task 2: MockPool injizierbar machen (Test-Infrastruktur)

Die DB-Funktionen aus Task 3 brauchen testbare Query-Ergebnisse. Der aktuelle `MockPool.query()` gibt immer `{ rows: [] }` zurück. Wir erlauben das Injizieren eines Handlers, ohne bestehendes Verhalten zu brechen (Default bleibt `{ rows: [] }`).

**Files:**
- Modify: `brett/src/server/db.ts`
- Test: `brett/test/share-token-db.test.ts`

- [ ] **Step 1: Failing-Test schreiben (Mock-Query-Injection)**

Neue Datei `brett/test/share-token-db.test.ts`:

```ts
// Unit-Tests für die Share-Token-DB-Funktionen. Läuft unter MOCK_DB=true.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initDb, setMockQueryHandler, createShareToken, resolveShareToken, disableShareToken, listShareTokens } from '../src/server/db';

function setup() {
  process.env.MOCK_DB = 'true';
  initDb({ buildStateFromMutations: () => ({ figures: [] }) });
}

test('setMockQueryHandler lets a test control the MockPool result', async () => {
  setup();
  const calls: Array<{ text: string; params: unknown[] }> = [];
  setMockQueryHandler((text, params) => {
    calls.push({ text, params: params ?? [] });
    return { rows: [{ room_token: 'room-xyz' }] };
  });
  const room = await resolveShareToken('tok-1');
  assert.equal(room, 'room-xyz');
  assert.match(calls[0].text, /FROM brett_share_tokens/);
  assert.deepEqual(calls[0].params, ['tok-1']);
  setMockQueryHandler(null); // reset, damit andere Tests den No-op-Mock sehen
});
```

- [ ] **Step 2: Test ausführen → FAIL**

Run: `cd brett && MOCK_DB=true npx tsx --test test/share-token-db.test.ts`
Expected: FAIL — `setMockQueryHandler`/`resolveShareToken` sind nicht exportiert (Import-Error / `is not a function`).

- [ ] **Step 3: MockPool erweitern (`db.ts`)**

In `brett/src/server/db.ts` die `MockPool`-Klasse und einen Setter ändern. Ersetze die bestehende `MockPool`-Klasse (`async query() { return { rows: [] }; }`) durch:

```ts
type MockQueryHandler = (text: string, params?: unknown[]) => { rows: any[] };
let mockQueryHandler: MockQueryHandler | null = null;

/**
 * Test-Hook: setzt einen Handler, den der MockPool statt des Default-`{ rows: [] }`
 * verwendet. `null` setzt auf den No-op-Mock zurück. Nur unter MOCK_DB relevant.
 */
export function setMockQueryHandler(fn: MockQueryHandler | null): void {
  mockQueryHandler = fn;
}

class MockPool implements MockPoolLike {
  async query(text?: any, params?: any) {
    if (mockQueryHandler) return mockQueryHandler(String(text ?? ''), params);
    return { rows: [] };
  }
  async connect() { return { query: this.query, release: () => {} }; }
  async end() { /* no-op */ }
  on() { return this; }
}
```

- [ ] **Step 4: Test ausführen → noch FAIL (DB-Funktionen fehlen)**

Run: `cd brett && MOCK_DB=true npx tsx --test test/share-token-db.test.ts`
Expected: FAIL — `resolveShareToken is not a function` (kommt in Task 3). `setMockQueryHandler` ist jetzt aufgelöst.

- [ ] **Step 5: Commit (Infrastruktur)**

```bash
cd brett && git add src/server/db.ts
git commit -m "test(brett): make MockPool query injectable for share-token tests (T000608)"
```

---

## Task 3: DB-Funktionen für Share-Tokens

**Files:**
- Modify: `brett/src/server/db.ts`
- Test: `brett/test/share-token-db.test.ts`

- [ ] **Step 1: Failing-Tests vervollständigen**

In `brett/test/share-token-db.test.ts` weitere Tests anhängen:

```ts
test('createShareToken returns a URL-safe token and inserts with room+createdBy', async () => {
  setup();
  let captured: { text: string; params: unknown[] } | null = null;
  setMockQueryHandler((text, params) => { captured = { text, params: params ?? [] }; return { rows: [] }; });
  const token = await createShareToken('room-a', 'user-42');
  assert.match(token, /^[A-Za-z0-9_-]+$/);      // base64url
  assert.ok(token.length >= 20);                 // 18 bytes → 24 chars base64url
  assert.match(captured!.text, /INSERT INTO brett_share_tokens/);
  assert.deepEqual(captured!.params, [token, 'room-a', 'user-42']);
  setMockQueryHandler(null);
});

test('createShareToken stores NULL created_by when omitted', async () => {
  setup();
  let params: unknown[] = [];
  setMockQueryHandler((_t, p) => { params = p ?? []; return { rows: [] }; });
  await createShareToken('room-b');
  assert.equal(params[2], null);
  setMockQueryHandler(null);
});

test('resolveShareToken returns null when no active row', async () => {
  setup();
  setMockQueryHandler(() => ({ rows: [] }));
  assert.equal(await resolveShareToken('missing'), null);
  setMockQueryHandler(null);
});

test('disableShareToken returns true when a row was updated', async () => {
  setup();
  setMockQueryHandler((text) => {
    assert.match(text, /UPDATE brett_share_tokens SET disabled_at/);
    return { rows: [], rowCount: 1 } as any;
  });
  assert.equal(await disableShareToken('tok', 'room-a'), true);
  setMockQueryHandler(null);
});

test('disableShareToken returns false when nothing matched', async () => {
  setup();
  setMockQueryHandler(() => ({ rows: [], rowCount: 0 } as any));
  assert.equal(await disableShareToken('tok', 'room-a'), false);
  setMockQueryHandler(null);
});

test('listShareTokens returns the rows from the query', async () => {
  setup();
  const now = new Date();
  setMockQueryHandler((text) => {
    assert.match(text, /SELECT token, created_at, created_by FROM brett_share_tokens/);
    return { rows: [{ token: 't1', created_at: now, created_by: 'u1' }] };
  });
  const rows = await listShareTokens('room-a');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].token, 't1');
  setMockQueryHandler(null);
});
```

- [ ] **Step 2: Tests ausführen → FAIL**

Run: `cd brett && MOCK_DB=true npx tsx --test test/share-token-db.test.ts`
Expected: FAIL — Funktionen nicht definiert.

- [ ] **Step 3: DB-Funktionen implementieren (`db.ts`)**

Oben in `brett/src/server/db.ts` den Import erweitern:

```ts
import { Pool } from 'pg';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { randomBytes } from 'crypto';
```

Am Dateiende (nach den bestehenden Exporten) anhängen:

```ts
// ── Share-Tokens (T000608) ────────────────────────────────────────
// Öffentliche View-only-Links. Tabelle: brett_share_tokens (Migration 003).

/** Erzeugt einen kryptografisch sicheren URL-Token (144 Bit) und persistiert ihn. */
export async function createShareToken(roomToken: string, createdBy?: string): Promise<string> {
  const token = randomBytes(18).toString('base64url');
  await pool.query(
    `INSERT INTO brett_share_tokens (token, room_token, created_by) VALUES ($1, $2, $3)`,
    [token, roomToken, createdBy ?? null],
  );
  return token;
}

/** Validiert einen Token → roomToken oder null (deaktiviert/abgelaufen/unbekannt). */
export async function resolveShareToken(token: string): Promise<string | null> {
  const { rows } = await pool.query(
    `SELECT room_token FROM brett_share_tokens
     WHERE token = $1 AND disabled_at IS NULL AND (expires_at IS NULL OR expires_at > now())`,
    [token],
  );
  return rows[0]?.room_token ?? null;
}

/** Deaktiviert einen Token (setzt disabled_at). true, wenn ein aktiver Token getroffen wurde. */
export async function disableShareToken(token: string, roomToken: string): Promise<boolean> {
  const res: any = await pool.query(
    `UPDATE brett_share_tokens SET disabled_at = now()
     WHERE token = $1 AND room_token = $2 AND disabled_at IS NULL`,
    [token, roomToken],
  );
  return (res?.rowCount ?? 0) > 0;
}

/** Listet aktive Tokens eines Boards (neueste zuerst). */
export async function listShareTokens(
  roomToken: string,
): Promise<Array<{ token: string; created_at: Date; created_by: string | null }>> {
  const { rows } = await pool.query(
    `SELECT token, created_at, created_by FROM brett_share_tokens
     WHERE room_token = $1 AND disabled_at IS NULL ORDER BY created_at DESC`,
    [roomToken],
  );
  return rows as Array<{ token: string; created_at: Date; created_by: string | null }>;
}
```

> Hinweis: `MockPoolLike.query` deklariert nur `{ rows: any[] }`. Da `disableShareToken` `rowCount` liest, casten wir das Ergebnis (`res: any`) — der echte `pg.Pool` liefert `rowCount`, der MockPool kann es im Test mitliefern.

- [ ] **Step 4: Tests ausführen → PASS**

Run: `cd brett && MOCK_DB=true npx tsx --test test/share-token-db.test.ts`
Expected: PASS (alle 7 Tests grün).

- [ ] **Step 5: Commit**

```bash
cd brett && git add src/server/db.ts test/share-token-db.test.ts
git commit -m "feat(brett): share-token CRUD db functions (T000608)"
```

---

## Task 4: `gast`-Rolle (Types + Permissions)

**Files:**
- Modify: `brett/src/types/state.ts`
- Modify: `brett/src/server/permissions.ts`
- Test: `brett/test/share-permissions.test.ts`

- [ ] **Step 1: Failing-Tests schreiben**

Neue Datei `brett/test/share-permissions.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canMutate, resolveRole } from '../src/server/permissions';

test('gast: request_state_snapshot is allowed (read-only handshake)', () => {
  assert.equal(canMutate({ msgType: 'request_state_snapshot', role: 'gast', playerId: 'anon', figureOwnerId: null }), true);
});

test('gast: every mutating message is denied', () => {
  for (const t of ['move', 'update', 'add', 'delete', 'figure_possess', 'figure_release', 'clear'] as const) {
    assert.equal(
      canMutate({ msgType: t as any, role: 'gast', playerId: 'anon', figureOwnerId: null }),
      false,
      `expected gast denied for ${t}`,
    );
  }
});

test('resolveRole: ws._isGuest forces role "gast" regardless of session', () => {
  assert.equal(resolveRole({ _isGuest: true, _session: { userId: 'u1' } }, { u1: 'leiter' }), 'gast');
});

test('resolveRole: non-guest path unchanged (session userId → role)', () => {
  assert.equal(resolveRole({ _session: { userId: 'u1' } }, { u1: 'leiter' }), 'leiter');
  assert.equal(resolveRole({ _session: { userId: 'u2' } }, { u1: 'leiter' }), 'beobachter');
  assert.equal(resolveRole({}, {}), 'beobachter');
});
```

- [ ] **Step 2: Tests ausführen → FAIL**

Run: `cd brett && MOCK_DB=true npx tsx --test test/share-permissions.test.ts`
Expected: FAIL — `'gast'` ist kein gültiger `Role` (TS-Fehler) bzw. `resolveRole` ignoriert `_isGuest`.

- [ ] **Step 3: `Role`-Union erweitern (`state.ts`)**

In `brett/src/types/state.ts` Zeile 7 ändern:

```ts
// vorher: export type Role = 'leiter' | 'stellvertreter' | 'beobachter';
export type Role = 'leiter' | 'stellvertreter' | 'beobachter' | 'gast';
```

- [ ] **Step 4: `canMutate` + `resolveRole` anpassen (`permissions.ts`)**

In `brett/src/server/permissions.ts`, **vor** dem bestehenden `beobachter`-Block (der `request_state_snapshot` wird bereits ganz oben in `canMutate` mit `if (ctx.msgType === 'request_state_snapshot') return true;` behandelt), den `gast`-Zweig einfügen. Konkret direkt nach dem `request_state_snapshot`-Early-Return und vor der `beobachter`-Possess-Logik:

```ts
  // Gäste (öffentliche Share-Link-Beobachter, T000608) sind vollständig read-only.
  // request_state_snapshot ist oben bereits für ALLE Rollen erlaubt; alles andere → false.
  if (ctx.role === 'gast') {
    return false;
  }
```

In `resolveRole` die erste Zeile ergänzen (Guest-Pfad vor der userId-Auflösung):

```ts
export function resolveRole(ws: any, roles: Record<string, Role>): Role {
  if (ws?._isGuest) return 'gast';            // T000608: Share-Link-Gast, immer read-only
  const uid = ws?._session?.userId;
  if (!uid) return 'beobachter';
  return roles?.[uid] ?? 'beobachter';
}
```

- [ ] **Step 5: Tests ausführen → PASS**

Run: `cd brett && MOCK_DB=true npx tsx --test test/share-permissions.test.ts`
Expected: PASS.

- [ ] **Step 6: Bestehende Permissions-Tests grün halten**

Run: `cd brett && MOCK_DB=true npx tsx --test test/permissions.test.ts`
Expected: PASS (keine Regression bei `beobachter`/`leiter`).

- [ ] **Step 7: Commit**

```bash
cd brett && git add src/types/state.ts src/server/permissions.ts test/share-permissions.test.ts
git commit -m "feat(brett): add read-only 'gast' role for share links (T000608)"
```

---

## Task 5: `requireLeiterOrAdmin`-Middleware

Liest Rollen aus dem `__roles__`-State (nicht aus `rooms.ts`). Die Middleware braucht `buildStateFromMutations` als Abhängigkeit; um sie pur/testbar zu halten, erzeugen wir eine **Factory** `makeRequireLeiterOrAdmin(deps)`.

**Files:**
- Modify: `brett/src/server/auth.ts`
- Test: `brett/test/share-auth.test.ts`

- [ ] **Step 1: Failing-Tests schreiben**

Neue Datei `brett/test/share-auth.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRequireLeiterOrAdmin } from '../src/server/auth';

function res() {
  return {
    statusCode: 0, body: null as any,
    status(c: number) { this.statusCode = c; return this; },
    json(b: any) { this.body = b; return this; },
  };
}
function run(mw: any, req: any) {
  const r = res(); let nexted = false;
  mw(req, r, () => { nexted = true; });
  return { r, nexted };
}

const buildState = (room: string) =>
  room === 'room-led' ? { roles: { 'user-1': 'leiter' } } : { roles: {} };
const mw = makeRequireLeiterOrAdmin({ buildStateFromMutations: buildState });

test('admin session passes', () => {
  const { nexted } = run(mw, { session: { isAdmin: true }, params: { roomToken: 'whatever' }, header: () => undefined });
  assert.equal(nexted, true);
});

test('leiter of the room passes', () => {
  const { nexted } = run(mw, { session: { userId: 'user-1' }, params: { roomToken: 'room-led' }, header: () => undefined });
  assert.equal(nexted, true);
});

test('non-leiter is forbidden', () => {
  const { r, nexted } = run(mw, { session: { userId: 'user-9' }, params: { roomToken: 'room-led' }, header: () => undefined });
  assert.equal(nexted, false);
  assert.equal(r.statusCode, 403);
  assert.deepEqual(r.body, { error: 'forbidden' });
});

test('e2e secret header bypasses', () => {
  process.env.BRETT_OIDC_SECRET = 'e2e-secret';
  const { nexted } = run(mw, { session: {}, params: { roomToken: 'room-x' }, header: (h: string) => h === 'x-e2e-secret' ? 'e2e-secret' : undefined });
  assert.equal(nexted, true);
  delete process.env.BRETT_OIDC_SECRET;
});
```

- [ ] **Step 2: Tests ausführen → FAIL**

Run: `cd brett && MOCK_DB=true npx tsx --test test/share-auth.test.ts`
Expected: FAIL — `makeRequireLeiterOrAdmin` nicht exportiert.

- [ ] **Step 3: Middleware-Factory implementieren (`auth.ts`)**

In `brett/src/server/auth.ts` (nach `requireAdmin`) anhängen. Achte auf vorhandene Imports von `Request, Response, NextFunction` (bereits in der Datei für `requireAdmin` genutzt):

```ts
/**
 * Factory für eine Middleware, die nur den Board-Leiter (laut __roles__) oder
 * einen Keycloak-Admin durchlässt. Rollen kommen aus buildStateFromMutations(room).roles
 * — NICHT aus rooms.ts. roomToken wird aus req.params.roomToken gelesen. (T000608)
 */
export function makeRequireLeiterOrAdmin(
  deps: { buildStateFromMutations: (room: string) => any },
) {
  return function requireLeiterOrAdmin(req: Request, res: Response, next: NextFunction): void {
    const session = (req as any).session;
    if (session?.isAdmin) return next();
    const roomToken = (req as any).params?.roomToken;
    if (roomToken && session?.userId) {
      const roles = deps.buildStateFromMutations(roomToken)?.roles ?? {};
      if (roles[session.userId] === 'leiter') return next();
    }
    // E2E-Bypass (gleiches Schema wie requireAdmin)
    const e2eSecret = process.env.BRETT_OIDC_SECRET;
    if (e2eSecret && typeof req.header === 'function' && req.header('x-e2e-secret') === e2eSecret) {
      return next();
    }
    res.status(403).json({ error: 'forbidden' });
  };
}
```

- [ ] **Step 4: Tests ausführen → PASS**

Run: `cd brett && MOCK_DB=true npx tsx --test test/share-auth.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd brett && git add src/server/auth.ts test/share-auth.test.ts
git commit -m "feat(brett): requireLeiterOrAdmin middleware factory (T000608)"
```

---

## Task 6: HTTP-Routen (Share-Seite + API)

**Files:**
- Modify: `brett/src/server/index.ts`
- Test: `brett/test/share-routes.test.ts`

Die Routen müssen **vor** dem globalen Error-Handler und nutzbar mit der bestehenden App registriert werden. `index.ts` exportiert die App nicht direkt; für den Test extrahieren wir die Validierungs-/Resolve-Logik als pure Helfer wo möglich und testen die DB-gebundenen Routen über die DB-Funktionen (bereits in Task 3 abgedeckt). Hier testen wir die **Routen-Verdrahtung** über einen schlanken Express-App-Aufbau im Test.

- [ ] **Step 1: Failing-Test schreiben**

Neue Datei `brett/test/share-routes.test.ts`:

```ts
// Testet die Share-HTTP-Routen, indem ein Mini-Express-App mit derselben
// Routen-Registrierungsfunktion gebaut wird. registerShareRoutes wird aus index.ts
// exportiert, damit der Test sie ohne den vollen Server-Bootstrap mounten kann.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'http';
import { registerShareRoutes } from '../src/server/index';
import { initDb, setMockQueryHandler } from '../src/server/db';

function listen(app: express.Express): Promise<{ port: number; close: () => void }> {
  return new Promise((resolve) => {
    const srv = http.createServer(app);
    srv.listen(0, () => {
      const port = (srv.address() as any).port;
      resolve({ port, close: () => srv.close() });
    });
  });
}
async function get(port: number, path: string) {
  const res = await fetch(`http://127.0.0.1:${port}${path}`);
  return { status: res.status, text: await res.text() };
}

function buildApp() {
  process.env.MOCK_DB = 'true';
  initDb({ buildStateFromMutations: () => ({ roles: {} }) });
  const app = express();
  app.use(express.json());
  registerShareRoutes(app, { buildStateFromMutations: () => ({ roles: {} }), publicDir: process.cwd() + '/public' });
  return app;
}

test('GET /api/share/:token → 404 for invalid token', async () => {
  const app = buildApp();
  setMockQueryHandler(() => ({ rows: [] })); // resolveShareToken → null
  const { port, close } = await listen(app);
  const r = await get(port, '/api/share/bad');
  assert.equal(r.status, 404);
  setMockQueryHandler(null); close();
});

test('GET /api/share/:token → 200 + roomToken for valid token', async () => {
  const app = buildApp();
  setMockQueryHandler(() => ({ rows: [{ room_token: 'room-9' }] }));
  const { port, close } = await listen(app);
  const r = await get(port, '/api/share/good');
  assert.equal(r.status, 200);
  assert.match(r.text, /room-9/);
  setMockQueryHandler(null); close();
});

test('GET /share/:token → 404 for invalid token (no share.html leak)', async () => {
  const app = buildApp();
  setMockQueryHandler(() => ({ rows: [] }));
  const { port, close } = await listen(app);
  const r = await get(port, '/share/bad');
  assert.equal(r.status, 404);
  setMockQueryHandler(null); close();
});

test('POST /api/rooms/:roomToken/share without auth → 403', async () => {
  const app = buildApp();
  const { port, close } = await listen(app);
  const res = await fetch(`http://127.0.0.1:${port}/api/rooms/room-9/share`, { method: 'POST' });
  assert.equal(res.status, 403);
  close();
});
```

- [ ] **Step 2: Test ausführen → FAIL**

Run: `cd brett && MOCK_DB=true npx tsx --test test/share-routes.test.ts`
Expected: FAIL — `registerShareRoutes` nicht exportiert.

- [ ] **Step 3: Routen-Registrierung implementieren (`index.ts`)**

In `brett/src/server/index.ts`:

(a) Imports/Verfügbarkeit sicherstellen — `path` und `db` sind bereits importiert; `makeRequireLeiterOrAdmin` aus `auth` ist über `auth.makeRequireLeiterOrAdmin` erreichbar (Wildcard-Import `* as auth`).

(b) Eine exportierte Funktion `registerShareRoutes` definieren (vor dem Aufruf, der sie an die echte App bindet):

```ts
/**
 * Registriert die Share-Link-Routen auf einer Express-App. Als eigene Funktion
 * exportiert, damit Tests sie ohne den vollen Server-Bootstrap mounten können. (T000608)
 */
export function registerShareRoutes(
  appInstance: express.Express,
  deps: { buildStateFromMutations: (room: string) => any; publicDir: string },
): void {
  const requireLeiterOrAdmin = auth.makeRequireLeiterOrAdmin(deps);

  // Öffentliche Share-Seite (KEIN boardAuthRedirect, KEIN Keycloak-Login).
  appInstance.get('/share/:token', asyncHandler(async (req: any, res: any) => {
    const roomToken = await db.resolveShareToken(req.params.token);
    if (!roomToken) return res.status(404).send('Link ungültig oder deaktiviert.');
    res.sendFile(path.join(deps.publicDir, 'share.html'));
  }));

  // API: Token validieren (Client-Bootstrap der Share-Seite).
  appInstance.get('/api/share/:token', asyncHandler(async (req: any, res: any) => {
    const roomToken = await db.resolveShareToken(req.params.token);
    if (!roomToken) return res.status(404).json({ error: 'invalid_token' });
    res.json({ valid: true, roomToken });
  }));

  // API: Token erzeugen (Leiter/Admin only).
  appInstance.post('/api/rooms/:roomToken/share', requireLeiterOrAdmin, asyncHandler(async (req: any, res: any) => {
    const { roomToken } = req.params;
    const userId = req.session?.userId;
    const token = await db.createShareToken(roomToken, userId);
    const baseUrl = process.env.BRETT_PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
    res.json({ token, url: `${baseUrl}/share/${token}` });
  }));

  // API: aktive Tokens auflisten (Leiter/Admin only).
  appInstance.get('/api/rooms/:roomToken/shares', requireLeiterOrAdmin, asyncHandler(async (req: any, res: any) => {
    const tokens = await db.listShareTokens(req.params.roomToken);
    res.json({ tokens });
  }));

  // API: Token deaktivieren (Leiter/Admin only).
  appInstance.delete('/api/rooms/:roomToken/share/:token', requireLeiterOrAdmin, asyncHandler(async (req: any, res: any) => {
    const ok = await db.disableShareToken(req.params.token, req.params.roomToken);
    if (!ok) return res.status(404).json({ error: 'not_found' });
    res.json({ disabled: true });
  }));
}
```

(c) Direkt nach dem bestehenden `app.use(express.static(...))`-Block (damit `/share/:token` Vorrang vor einer evtl. existierenden `share.html` hat — beide funktionieren, aber die Route validiert den Token) die Registrierung aufrufen. `staticDir` ist die Variable, die bereits den `dist/client`- bzw. `public/`-Pfad hält:

```ts
registerShareRoutes(app, {
  buildStateFromMutations: (room: string) => phases.buildStateFromMutations(room),
  publicDir: staticDir,
});
```

> Wichtig: `BRETT_PUBLIC_URL` muss in `environments/schema.yaml` und in der Brett-Deployment-Env nicht zwingend gesetzt sein (Fallback `req.protocol://host` greift). Wenn gesetzt werden soll → siehe Task 11.

- [ ] **Step 4: Test ausführen → PASS**

Run: `cd brett && MOCK_DB=true npx tsx --test test/share-routes.test.ts`
Expected: PASS (404 für ungültige Tokens, 200+roomToken für gültige, 403 ohne Auth).

- [ ] **Step 5: Server-Typecheck**

Run: `cd brett && npx tsc --noEmit -p tsconfig.server.json`
Expected: keine Fehler.

- [ ] **Step 6: Commit**

```bash
cd brett && git add src/server/index.ts test/share-routes.test.ts
git commit -m "feat(brett): share-link HTTP routes (share page + create/list/disable API) (T000608)"
```

---

## Task 7: WS-Gast-Erkennung (`share_token` → `_isGuest`)

Im `verifyClient` darf ein `share_token`-Connect nicht durch den Reconnect-Guard fallen (es gibt keinen `playerId`). Im `connection`-Handler wird das `share_token` aufgelöst und `ws._isGuest`/`ws._shareRoom` gesetzt, **bevor** die erste Nachricht verarbeitet wird.

**Files:**
- Modify: `brett/src/server/ws-handler.ts`
- Modify: `brett/src/server/index.ts` (verifyClient lässt `share_token`-Connects durch — bereits der Fall, da nur `playerId`-Reconnects geprüft werden; wir ergänzen einen expliziten Pass)
- Test: `brett/test/share-ws-guest.test.ts`

- [ ] **Step 1: Failing-Test schreiben**

Neue Datei `brett/test/share-ws-guest.test.ts`. Wir testen die **pure Guest-Resolution-Logik**, die wir als Helfer `resolveGuestFromUrl` aus `ws-handler.ts` exportieren, plus die Integration mit `resolveRole`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveGuestFromUrl } from '../src/server/ws-handler';
import { resolveRole } from '../src/server/permissions';

test('resolveGuestFromUrl: extracts share_token from /sync URL', () => {
  assert.equal(resolveGuestFromUrl('/sync?room=r1&share_token=abc'), 'abc');
  assert.equal(resolveGuestFromUrl('/sync?room=r1'), null);
  assert.equal(resolveGuestFromUrl(undefined), null);
});

test('a guest ws (_isGuest) resolves to gast regardless of __roles__', () => {
  const ws: any = { _isGuest: true, _shareRoom: 'r1' };
  assert.equal(resolveRole(ws, { 'someone': 'leiter' }), 'gast');
});
```

- [ ] **Step 2: Test ausführen → FAIL**

Run: `cd brett && MOCK_DB=true npx tsx --test test/share-ws-guest.test.ts`
Expected: FAIL — `resolveGuestFromUrl` nicht exportiert.

- [ ] **Step 3: Helfer + Connection-Hook in `ws-handler.ts`**

(a) Pure Helfer-Funktion oben in `brett/src/server/ws-handler.ts` (nach den bestehenden Helfern wie `resolvePlayerId`) hinzufügen:

```ts
/** Pure: liest `share_token` aus der WS-Request-URL (oder null). (T000608) */
export function resolveGuestFromUrl(reqUrl: string | undefined): string | null {
  if (!reqUrl) return null;
  try {
    const u = new URL(reqUrl, 'http://x');
    return u.searchParams.get('share_token');
  } catch {
    return null;
  }
}
```

(b) `WsDeps` um eine optionale Abhängigkeit `resolveShareToken` erweitern (im `WsDeps`-Interface):

```ts
  /** T000608: validiert ein Share-Token → roomToken | null. */
  resolveShareToken?: (token: string) => Promise<string | null>;
```

(c) Im `attachWsServer`-`connection`-Handler, direkt nach der `sessionMiddleware`-Verdrahtung (nach dem `if (deps.sessionMiddleware && req) { … } else { … }`-Block, vor `ws.isAlive = true;`), die Gast-Auflösung einfügen:

```ts
    // T000608: Share-Link-Gast? share_token aus der /sync-URL auflösen.
    const shareToken = resolveGuestFromUrl(req?.url);
    if (shareToken && deps.resolveShareToken) {
      // async, aber wir blocken Nachrichten bis _sessionReady; Gast-Flag wird vor
      // der ersten verarbeiteten Message gesetzt (gateSessionReady hält bis dahin).
      ws._sessionReady = false;
      deps.resolveShareToken(shareToken).then((roomToken) => {
        if (!roomToken) { try { ws.close(4403, 'invalid_share_token'); } catch { /* noop */ } return; }
        ws._isGuest = true;
        ws._shareRoom = roomToken;
        ws._sessionReady = true;
      }).catch(() => { try { ws.close(4403, 'invalid_share_token'); } catch { /* noop */ } });
    }
```

> Hinweis: `ws._isGuest` reicht aus, damit `resolveRole` → `'gast'` liefert und `canMutate('gast', …)` jede Mutation außer `request_state_snapshot` ablehnt. Der Gast schickt nur `join` + `request_state_snapshot` und empfängt Broadcasts.

(d) In `brett/src/server/index.ts` im `wsDeps`-Objekt die Funktion verdrahten:

```ts
  resolveShareToken: db.resolveShareToken,
```

(e) In `brett/src/server/index.ts` im `verifyClient` einen expliziten Pass für Share-Connects ergänzen (vor dem `shouldRejectReconnect`-Check), damit ein Gast nie als Reconnect abgelehnt wird:

```ts
      if (url.searchParams.get('share_token')) return cb(true); // T000608: Gäste immer zulassen
```

- [ ] **Step 4: Test ausführen → PASS**

Run: `cd brett && MOCK_DB=true npx tsx --test test/share-ws-guest.test.ts`
Expected: PASS.

- [ ] **Step 5: WS-Handler-Regressionstests**

Run: `cd brett && MOCK_DB=true npx tsx --test test/possession.test.ts test/relay-gate.test.ts`
Expected: PASS (Gast-Pfad bricht bestehende Mutation-Gates nicht).

- [ ] **Step 6: Server-Typecheck + Commit**

Run: `cd brett && npx tsc --noEmit -p tsconfig.server.json`
Expected: keine Fehler.

```bash
cd brett && git add src/server/ws-handler.ts src/server/index.ts test/share-ws-guest.test.ts
git commit -m "feat(brett): WS guest detection via share_token → read-only gast role (T000608)"
```

---

## Task 8: Vite Multi-Entry + `public/share.html`

**Files:**
- Modify: `brett/vite.config.ts`
- Create: `brett/public/share.html`

- [ ] **Step 1: `vite.config.ts` lesen**

Run: `cd brett && cat vite.config.ts`
Erwartung: aktuelle Single-Entry-Konfiguration (`root`/`build`). Notiere `root` und `build.outDir` (typ. `dist/client`).

- [ ] **Step 2: Zweiten Entry-Point hinzufügen**

In `brett/vite.config.ts` den `build`-Block um `rollupOptions.input` erweitern (Pfade relativ zu `root` anpassen — wenn `root: 'public'`, sind die Inputs `index.html` und `share.html`; ohne `root` sind es `public/index.html`/`public/share.html`). Beispiel (root nicht gesetzt):

```ts
build: {
  // ... bestehende Felder beibehalten ...
  rollupOptions: {
    input: {
      main: 'public/index.html',
      share: 'public/share.html',
    },
  },
},
```

> Verifiziere den exakten `root`/Pfad gegen die existierende Config — `index.html` muss weiterhin als `main`-Entry gebaut werden (sonst bricht der bestehende Board-Build).

- [ ] **Step 3: `public/share.html` anlegen**

Neue Datei `brett/public/share.html`:

```html
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Brett – Board ansehen</title>
  <!-- Bewusst KEIN Auth-Redirect, KEIN Login-Button, KEIN Admin-Panel. -->
  <style>
    html, body { margin: 0; height: 100%; background: #0b111c; color: #e7ead0; font-family: sans-serif; }
    #share-canvas { position: fixed; inset: 0; }
    #view-only-badge {
      position: fixed; top: 12px; left: 12px; z-index: 50;
      background: rgba(200,169,110,0.9); color: #0b111c; font-weight: 600;
      padding: 6px 12px; border-radius: 8px; font-size: 13px;
    }
    #share-status {
      position: fixed; top: 50%; left: 50%; transform: translate(-50%,-50%);
      z-index: 60; text-align: center; max-width: 80vw;
    }
  </style>
</head>
<body>
  <div id="view-only-badge">Nur anzeigen</div>
  <div id="share-canvas"></div>
  <div id="share-status"></div>
  <script type="module" src="/src/client/share.ts"></script>
</body>
</html>
```

> Im Prod-Build ersetzt Vite den `src`-Pfad durch das gehashte Asset. In dev (`vite`) wird `/src/client/share.ts` direkt geladen. Prüfe gegen `public/index.html`, wie dort der Entry referenziert wird, und spiegle das Muster exakt.

- [ ] **Step 4: `public/index.html` als Referenz lesen**

Run: `cd brett && cat public/index.html | head -40`
Erwartung: Sieh, wie `main.ts` eingebunden ist; passe `share.html`'s Script-Tag an dasselbe Muster an (z. B. falls dort ein anderer Pfad/Asset-Convention genutzt wird).

- [ ] **Step 5: Commit**

```bash
cd brett && git add vite.config.ts public/share.html
git commit -m "feat(brett): vite second entry + share.html view-only page (T000608)"
```

---

## Task 9: Client `share.ts` — read-only Board-Viewer

Die Share-Seite muss eine Three.js-Szene rendern und eingehende Board-Updates anwenden — ohne Interaktions-UI. Statt den großen `board-boot.ts` zu importieren (zieht Editor-UI, Topbar, Upload etc.), bauen wir einen schlanken Viewer, der die bereits geteilten Render-Module nutzt: `initScene` aus `scene.ts` und die Nachrichten-Anwendung aus `ws-client.ts`'s `onWsMessage`-Pfad.

**Files:**
- Create: `brett/src/client/share.ts`
- Test: `brett/test/share-client-boot.test.ts`

- [ ] **Step 1: Verfügbare geteilte Module prüfen**

Run: `cd brett && grep -n "export function initScene\|export.*onWsMessage\|export.*applyServerState\|export.*handleServerMessage" src/client/scene.ts src/client/ws-client.ts`
Erwartung: bestätige die Export-Namen. Falls `onWsMessage` nicht exportiert ist, exportiere ihn minimal (`export function onWsMessage(ev: MessageEvent)`), ohne den `connectWS`-Pfad zu ändern. Notiere die echten Namen und verwende sie unten exakt (kein Erfinden von `handleServerMessage`/`initScene`, falls die Datei andere Namen nutzt).

- [ ] **Step 2: Failing-Test (pure URL-Parsing-Helfer)**

Neue Datei `brett/test/share-client-boot.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractShareToken, buildGuestWsUrl } from '../src/client/share';

test('extractShareToken: pulls token from /share/<token> path', () => {
  assert.equal(extractShareToken('/share/abc123'), 'abc123');
  assert.equal(extractShareToken('/share/abc123/'), 'abc123');
});

test('buildGuestWsUrl: builds ws url with room + share_token', () => {
  const url = buildGuestWsUrl('https://brett.example.de', 'room-9', 'tok-1');
  assert.equal(url, 'wss://brett.example.de/sync?room=room-9&share_token=tok-1');
  const httpUrl = buildGuestWsUrl('http://localhost:5173', 'r', 't');
  assert.equal(httpUrl, 'ws://localhost:5173/sync?room=r&share_token=t');
});
```

- [ ] **Step 3: Test ausführen → FAIL**

Run: `cd brett && MOCK_DB=true npx tsx --test test/share-client-boot.test.ts`
Expected: FAIL — `extractShareToken`/`buildGuestWsUrl` nicht definiert.

- [ ] **Step 4: `share.ts` implementieren**

Neue Datei `brett/src/client/share.ts`. Die Render-Imports an die in Step 1 verifizierten Namen anpassen:

```ts
// brett/src/client/share.ts
// Öffentlicher, read-only Board-Viewer für /share/<token>. KEIN Login, KEIN Editor-UI.
import { initScene } from './scene';
import { onWsMessage } from './ws-client';

/** Pure: Token aus dem /share/<token>-Pfad ziehen. */
export function extractShareToken(pathname: string): string {
  return pathname.replace(/\/+$/, '').split('/').at(-1) ?? '';
}

/** Pure: read-only WS-URL bauen (wss in prod, ws lokal). */
export function buildGuestWsUrl(origin: string, room: string, token: string): string {
  const wsOrigin = origin.replace(/^http/, 'ws');
  return `${wsOrigin}/sync?room=${encodeURIComponent(room)}&share_token=${encodeURIComponent(token)}`;
}

function setStatus(text: string): void {
  const el = document.getElementById('share-status');
  if (el) el.textContent = text;
}

export async function bootShareViewer(): Promise<void> {
  const token = extractShareToken(location.pathname);
  if (!token) { setStatus('Kein gültiger Link.'); return; }

  const resp = await fetch(`/api/share/${encodeURIComponent(token)}`);
  if (!resp.ok) { setStatus('Dieser Link ist nicht mehr gültig.'); return; }
  const { roomToken } = await resp.json();

  // Read-only Szene mounten (kein Editor-UI). initScene mountet in #share-canvas.
  initScene();

  const ws = new WebSocket(buildGuestWsUrl(location.origin, roomToken, token));
  ws.addEventListener('open', () => {
    ws.send(JSON.stringify({ type: 'join', room: roomToken }));
    ws.send(JSON.stringify({ type: 'request_state_snapshot' }));
  });
  ws.addEventListener('message', (ev) => onWsMessage(ev));
  ws.addEventListener('close', () => setStatus('Verbindung getrennt.'));
}

// Auto-Boot, wenn als Seiten-Entry geladen (nicht im Test).
if (typeof document !== 'undefined' && document.getElementById('share-canvas')) {
  void bootShareViewer();
}
```

> Falls `initScene` einen Container-Parameter erwartet oder einen anderen DOM-Anker als `#share-canvas` nutzt, passe `public/share.html` (Task 8) und den `initScene(...)`-Aufruf entsprechend an die in Step 1 ermittelte Signatur an. Falls `onWsMessage` State-Globals (z. B. `STATE`, `currentUser`) voraussetzt, die nur `board-boot` initialisiert, importiere/initialisiere das Minimum hier (kein Editor, nur Render-State) — verifiziere durch manuelles Laden in Task 10.

- [ ] **Step 5: Test ausführen → PASS**

Run: `cd brett && MOCK_DB=true npx tsx --test test/share-client-boot.test.ts`
Expected: PASS (pure Helfer grün; `bootShareViewer` wird im Test nicht ausgeführt, da kein `#share-canvas`).

- [ ] **Step 6: Client-Typecheck**

Run: `cd brett && npx tsc --noEmit -p tsconfig.client.json`
Expected: keine Fehler (ggf. fehlende Exporte in `scene.ts`/`ws-client.ts` aus Step 1 nachziehen).

- [ ] **Step 7: Commit**

```bash
cd brett && git add src/client/share.ts test/share-client-boot.test.ts src/client/scene.ts src/client/ws-client.ts
git commit -m "feat(brett): read-only share viewer client (share.ts) (T000608)"
```

---

## Task 10: Teilen-Button im Board-Topbar (nur Leiter/Admin)

Analog zu `topbar-invite.ts` ein eigenes Mount-Modul mit puren, testbaren Helfern + DOM-Mount. Sichtbar nur, wenn die eigene Rolle `leiter` ist oder der User Admin ist.

**Files:**
- Create: `brett/src/client/ui/topbar-share.ts`
- Modify: `brett/src/client/board-boot.ts` (Mount + Sichtbarkeits-Wiring)
- Test: `brett/test/topbar-share.test.ts`

- [ ] **Step 1: `topbar-invite.ts` als Muster lesen**

Run: `cd brett && sed -n '40,140p' src/client/ui/topbar-invite.ts`
Erwartung: verstehe `mountInviteButton(anchorEl, getSessionCode, opts)` inkl. `writeClipboard`/`getOrigin`-Injection und `refresh()/destroy()`-Rückgabe. Spiegle dieses Interface.

- [ ] **Step 2: Failing-Tests schreiben**

Neue Datei `brett/test/topbar-share.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shareButtonVisible } from '../src/client/ui/topbar-share';

test('shareButtonVisible: true only for leiter or admin', () => {
  assert.equal(shareButtonVisible('leiter', false), true);
  assert.equal(shareButtonVisible('beobachter', true), true);   // admin overrides
  assert.equal(shareButtonVisible('beobachter', false), false);
  assert.equal(shareButtonVisible('stellvertreter', false), false);
  assert.equal(shareButtonVisible(null, false), false);
});
```

- [ ] **Step 3: Test ausführen → FAIL**

Run: `cd brett && MOCK_DB=true npx tsx --test test/topbar-share.test.ts`
Expected: FAIL — `shareButtonVisible` nicht definiert.

- [ ] **Step 4: `topbar-share.ts` implementieren**

Neue Datei `brett/src/client/ui/topbar-share.ts`:

```ts
// brett/src/client/ui/topbar-share.ts
// "Teilen"-Button im Board-Topbar. Nur sichtbar für Leiter oder Admin.
// Klick erzeugt einen Share-Link (POST), kopiert ihn in die Zwischenablage und
// zeigt eine kurze Bestätigung. Pure shareButtonVisible ist node-testbar.

/** Pure: Button nur für Leiter oder Admin. */
export function shareButtonVisible(role: string | null | undefined, isAdmin: boolean): boolean {
  return isAdmin || role === 'leiter';
}

const SHARE_STYLE_ID = 'brett-topbar-share';

function injectStyles(doc: Document = document): void {
  if (doc.getElementById(SHARE_STYLE_ID)) return;
  const el = doc.createElement('style');
  el.id = SHARE_STYLE_ID;
  el.textContent = [
    '.brett-share-btn{font-family:var(--brett-font-sans,sans-serif);font-size:12px;',
    'background:var(--brett-brass,#c8a96e);color:var(--brett-ink-900,#0b111c);border:none;',
    'border-radius:var(--brett-radius-sm,8px);padding:6px 12px;cursor:pointer;font-weight:600;}',
    '.brett-share-toast{position:absolute;top:calc(100% + 6px);right:0;z-index:60;',
    'background:var(--brett-ink-850,#101824);border:1px solid var(--brett-line,rgba(255,255,255,0.12));',
    'border-radius:var(--brett-radius-sm,8px);padding:8px 10px;font-size:11px;color:var(--brett-fg,#e7ead0);}',
  ].join('');
  doc.head.appendChild(el);
}

export interface ShareMountOptions {
  getRoomToken: () => string | null;
  getRole: () => string | null;
  isAdmin: () => boolean;
  writeClipboard?: (text: string) => Promise<void> | void;
  postShare?: (roomToken: string) => Promise<{ url: string }>;
}

/**
 * Mountet den Teilen-Button in `anchorEl`. Returns refresh()/destroy().
 */
export function mountShareButton(anchorEl: HTMLElement, opts: ShareMountOptions): { refresh: () => void; destroy: () => void } {
  injectStyles();
  const writeClipboard = opts.writeClipboard ?? ((t: string) => navigator.clipboard?.writeText(t));
  const postShare = opts.postShare ?? (async (room: string) => {
    const r = await fetch(`/api/rooms/${encodeURIComponent(room)}/share`, { method: 'POST' });
    if (!r.ok) throw new Error('share-create-failed');
    return r.json();
  });

  const wrap = document.createElement('span');
  wrap.style.position = 'relative';
  const btn = document.createElement('button');
  btn.className = 'brett-share-btn';
  btn.type = 'button';
  btn.title = 'Board als Link teilen';
  btn.setAttribute('aria-label', 'Board-Link teilen');
  btn.textContent = '🔗 Teilen';
  wrap.appendChild(btn);
  anchorEl.appendChild(wrap);

  btn.addEventListener('click', async () => {
    const room = opts.getRoomToken();
    if (!room) return;
    try {
      const { url } = await postShare(room);
      await writeClipboard(url);
      const toast = document.createElement('div');
      toast.className = 'brett-share-toast';
      toast.textContent = 'Link kopiert ✓';
      wrap.appendChild(toast);
      setTimeout(() => toast.remove(), 2500);
    } catch {
      const toast = document.createElement('div');
      toast.className = 'brett-share-toast';
      toast.textContent = 'Fehler beim Erstellen des Links.';
      wrap.appendChild(toast);
      setTimeout(() => toast.remove(), 2500);
    }
  });

  function refresh(): void {
    wrap.style.display = shareButtonVisible(opts.getRole(), opts.isAdmin()) ? 'inline-block' : 'none';
  }
  refresh();
  return { refresh, destroy: () => wrap.remove() };
}
```

- [ ] **Step 5: Test ausführen → PASS**

Run: `cd brett && MOCK_DB=true npx tsx --test test/topbar-share.test.ts`
Expected: PASS.

- [ ] **Step 6: In `board-boot.ts` einbinden**

In `brett/src/client/board-boot.ts` analog zu `mountInviteButton`/`mountParticipantsButton` verdrahten. Lies zunächst, wie der Topbar-Anker und die Rolle/Admin-Flag dort verfügbar sind:

Run: `cd brett && grep -n "mountInviteButton\|mountParticipantsButton\|topbar\|currentUser\|isAdmin\|role" src/client/board-boot.ts`

Dann (am selben Anker wie der Invite-Button) ergänzen:

```ts
import { mountShareButton } from './ui/topbar-share';
// ... im Boot-Body, nahe mountInviteButton(...):
const shareCtl = mountShareButton(topbarAnchorEl /* gleicher Anker wie Invite */, {
  getRoomToken: () => new URLSearchParams(location.search).get('room'),
  getRole: () => currentUser.role ?? null,      // an die echte Rollenquelle in state.ts anpassen
  isAdmin: () => !!currentUser.isAdmin,           // an die echte Admin-Quelle anpassen
});
// shareCtl.refresh() dort aufrufen, wo auch der Invite-Button refresht wird
// (z. B. im lobbyChange/role-update-Handler), damit Sichtbarkeit aktuell bleibt.
```

> Verifiziere die exakten Property-Namen (`currentUser.role`, `currentUser.isAdmin`) gegen `src/client/state.ts`. Falls die Rolle dort nicht liegt, nutze die gleiche Quelle, die der Editor zur Rechte-Prüfung verwendet. Rufe `shareCtl.refresh()` an denselben Stellen wie den Invite-Refresh auf.

- [ ] **Step 7: Client-Typecheck**

Run: `cd brett && npx tsc --noEmit -p tsconfig.client.json`
Expected: keine Fehler.

- [ ] **Step 8: Commit**

```bash
cd brett && git add src/client/ui/topbar-share.ts src/client/board-boot.ts test/topbar-share.test.ts
git commit -m "feat(brett): leiter/admin share button in board topbar (T000608)"
```

---

## Task 11: Env-Var `BRETT_PUBLIC_URL` (optional) + Full-Build-Verifikation

`BRETT_PUBLIC_URL` ist optional (Fallback `req.protocol://host`). Wenn gewünscht, im Brett-Deployment-Manifest setzen.

**Files:**
- (Optional) Modify: `k3d/brett.yaml` — `BRETT_PUBLIC_URL` env, falls ein fester Public-Origin erzwungen werden soll.

- [ ] **Step 1: Entscheiden, ob `BRETT_PUBLIC_URL` gesetzt werden muss**

Run: `cd /tmp/wt-T000608-brett-share-link && grep -n "BRETT_PUBLIC_URL\|env:\|brett\." k3d/brett.yaml | head`
Wenn Brett hinter Traefik mit korrektem `X-Forwarded-Proto`/`Host` läuft, reicht der Fallback → kein Manifest-Change nötig. Andernfalls eine `BRETT_PUBLIC_URL`-env auf die öffentliche Board-Domain setzen (z. B. `https://brett.mentolder.de`). Da Brett pro Brand deployt wird, gilt das pro Brand.

- [ ] **Step 2: Voller Build (Vite Multi-Entry + tsc)**

Run: `cd brett && npm run build`
Expected: erfolgreicher Build; in `dist/client/` existieren sowohl ein `index.html`- als auch ein `share.html`-Artefakt mit je eigenem JS-Bundle.

Run: `cd brett && ls dist/client/*.html`
Expected: `dist/client/index.html` UND `dist/client/share.html`.

- [ ] **Step 3: Voller Typecheck**

Run: `cd brett && npm run typecheck`
Expected: keine Fehler (Client + Server).

- [ ] **Step 4: Gesamte Brett-Testsuite**

Run: `cd brett && npm test`
Expected: PASS — inkl. der neuen `share-*`-Tests und ohne Regression in bestehenden Tests.

- [ ] **Step 5: Commit (falls Manifest geändert)**

```bash
cd /tmp/wt-T000608-brett-share-link
git add k3d/brett.yaml 2>/dev/null || true
git commit -m "chore(brett): BRETT_PUBLIC_URL for share links (T000608)" 2>/dev/null || echo "no manifest change"
```

---

## Task 12: E2E-Test (Playwright, optional — repo-weite e2e-Suite)

Die repo-weite E2E-Suite liegt unter `tests/e2e/`. Ein Brett-Share-Flow-Test ist wertvoll, aber erfordert eine laufende Brett-Instanz. Dieser Task ist als Nice-to-have markiert; Kern-Akzeptanz wird durch Tasks 3–10 (node:test) abgedeckt.

**Files:**
- (Optional) Create: `tests/e2e/brett-share-link.spec.ts`

- [ ] **Step 1: Bestehendes Brett-E2E-Muster prüfen**

Run: `cd /tmp/wt-T000608-brett-share-link && ls tests/e2e/ | grep -i brett && sed -n '1,40p' tests/e2e/brett-globals.d.ts`
Erwartung: verstehe, wie Brett-E2E-Tests die Instanz erreichen (Base-URL, `x-e2e-secret`-Login).

- [ ] **Step 2: Spec schreiben (falls E2E im Scope)**

`tests/e2e/brett-share-link.spec.ts` — Skizze (an die echte E2E-Harness/Base-URL anpassen):

```ts
import { test, expect } from '@playwright/test';

test('leiter creates share link, guest views read-only board', async ({ page, context }) => {
  // 1. Als Leiter einloggen (x-e2e-secret), Board mit Session öffnen.
  // 2. Teilen-Button klicken → Toast "Link kopiert ✓" sichtbar.
  // 3. Share-URL aus der API holen (oder Clipboard lesen).
  // 4. In neuem, NICHT eingeloggtem Context öffnen → #view-only-badge sichtbar.
  // 5. Kein Editor-UI / kein Drag möglich.
  // 6. Link deaktivieren → erneuter Aufruf zeigt "nicht mehr gültig".
});
```

- [ ] **Step 3: Commit (falls erstellt)**

```bash
cd /tmp/wt-T000608-brett-share-link
git add tests/e2e/brett-share-link.spec.ts
git commit -m "test(brett): e2e share-link flow (T000608)"
```

---

## Akzeptanzkriterien (Mapping auf Tasks)

- **AK1** — Board per Link teilbar (Leiter erzeugt Token): Tasks 3, 6, 10.
- **AK2** — Empfänger ohne Keycloak-Account sieht das Board live: Tasks 6 (`/share/:token`), 7 (WS-Gast), 8/9 (Viewer).
- **AK3** — Empfänger kann NICHTS ändern (read-only): Tasks 4 (`gast` in `canMutate`/`resolveRole`), 7 (`_isGuest`).
- **AK4** — Link jederzeit deaktivierbar; deaktivierte Links → Fehlermeldung: Tasks 3 (`disableShareToken`/`disabled_at`), 6 (404), 9 (Status-Text).
- **AK5** — Token überlebt Server-Restart (DB-persistiert): Tasks 1, 3.
- **AK6** — Token brute-force-resistent (144 Bit): Task 3 (`randomBytes(18)`).

---

## Self-Review (vom Plan-Autor durchgeführt)

**Spec-Coverage:** E1 (dedizierte Route) → Task 6/8/9. E2 (`gast`-Rolle) → Task 4. E3 (PG-Tabelle) → Task 1. E4 (`crypto.randomBytes`) → Task 3. E5 (Teilen-Button nur Leiter) → Task 10. E6 (`disabled_at`) → Task 1/3/6. E7 (`expires_at` ungenutzt) → Task 1 (Spalte angelegt, in `resolveShareToken` berücksichtigt). Alle Risiken adressiert (Brute-Force=Task3, Gast-Mutation fail-closed=Task4/7, room_token serverseitig resolved=Task6/7, Vite-Multi-Entry=Task8/11).

**Abweichungen von der Spec (bewusst, korrekt):**
- Tests sind `node:test` (nicht vitest/BATS) — siehe „Codebase-Realitäten". Die Spec-IDs `FA-BRT-41..45` und `board-share.test.ts` (vitest) sind für Brett nicht zutreffend.
- `requireLeiterOrAdmin` liest Rollen aus `buildStateFromMutations(room).roles` (`__roles__`), nicht aus `rooms.ts`/`getRoles` (existiert nicht). Als Factory `makeRequireLeiterOrAdmin(deps)` für Testbarkeit.
- WS-Gast-Auflösung ist async (DB-Lookup); `_sessionReady` wird kurz auf `false` gesetzt und erst nach erfolgreicher Token-Auflösung wieder `true`, sodass `gateSessionReady` die erste Nachricht blockt, bis `_isGuest` gesetzt ist.

**Type-Konsistenz:** `Role` enthält `'gast'` (Task 4) und wird konsistent in `canMutate`/`resolveRole` (Task 4) und WS-Handler (Task 7) verwendet. DB-Funktionsnamen (`createShareToken`/`resolveShareToken`/`disableShareToken`/`listShareTokens`) sind in db.ts (Task 3), Routen (Task 6) und WS-Deps (Task 7) identisch. `registerShareRoutes`/`makeRequireLeiterOrAdmin`/`resolveGuestFromUrl`/`setMockQueryHandler` sind je einmal definiert und an den Aufrufstellen namensgleich.

**Verifikations-Hinweise für Executor:** Mehrere Client-seitige Integrationspunkte (`initScene`-Signatur, `onWsMessage`-Export, `currentUser.role`/`isAdmin`, Topbar-Anker in `board-boot.ts`, exakte `vite.config.ts`-`root`/Input-Pfade) sind als „gegen echte Datei verifizieren"-Schritte markiert, weil sie aus der Spec nicht 1:1 ableitbar waren. Nicht raten — die genannten `grep`/`cat`-Schritte zuerst ausführen.

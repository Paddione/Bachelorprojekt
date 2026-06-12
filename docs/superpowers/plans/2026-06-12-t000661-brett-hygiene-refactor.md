---
ticket_id: T000661
title: "Brett Code-Hygiene-Refactor (T000661)"
status: staged
domains: [brett]
created: 2026-06-12
depends_on_plans: [docs/superpowers/plans/2026-06-12-t000660-brett-security-leaks.md, docs/superpowers/plans/2026-06-12-t000662-brett-client-perf.md]
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
---

# Brett Code-Hygiene-Refactor (T000661) — Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fünf Server- und Client-Dateien an der ~600-Zeilen-Grenze auf klar abgegrenzte Module aufteilen, 20+ `Function`-Typings in `WsDeps` durch konkrete Signaturen ersetzen und Test-only-Exports explizit markieren — alles verhaltensneutral.

**Architecture:** Reine Datei-Splits entlang existierender Verantwortungsgrenzen (Connection-Lifecycle vs. Message-Dispatcher, Express-Routen vs. App-Wiring, Connection-Management vs. State-Sync usw.); keine Logikänderungen. Jede neue Datei re-exportiert alle öffentlichen Symbole über die ursprüngliche Datei, sodass alle bestehenden Import-Pfade in Tests und anderen Modulen unverändert bleiben, bis der letzte `# Re-exports`-Block bereinigt werden kann. `WsDeps`-Typisierung kommt zuerst, da konkrete Signaturen die anschließenden Splits erheblich erleichtern.

**Tech Stack:** TypeScript, Node.js, Express, ws, Vitest (506 Tests), `npx tsc --noEmit`

---

## Vorab: Konfliktlage

> **CRITICAL:** Die Branches `fix/T000660-brett-security-leaks` (ändert `ws-handler.ts`, `sessions.ts`, `mannequin.ts`, `ws-client.ts`, `auth.ts`) und `fix/T000662-brett-client-perf` (`mannequin.ts`, `scene-lines.ts`, `ws-client.ts`) müssen **vor diesem Refactor gemergt** sein. Dieser Refactor baut auf dem sauberen Stand beider gemerter Tickets auf. Alle Zeilennummern in diesem Plan sind daher nur als **circa**-Angaben zu verstehen (verschieben sich durch T000660/T000662).

---

## Task 0: Vorbedingungen prüfen

**Files:**
- Modify: _(keine — nur Prüfung)_

- [ ] **Schritt 0.1: Rebase auf origin/main**

```bash
cd /tmp/wt-brett-hygiene
git rebase origin/main
```

Erwartetes Ergebnis: `Successfully rebased` (kein Rebase-Fehler).

- [ ] **Schritt 0.2: Beide Tickets merged prüfen**

```bash
gh pr list --state merged --search "T000660 OR T000662" --json number,title,mergedAt
```

Erwartetes Ergebnis: **Beide** PRs tauchen als `merged` auf. Wenn eines davon fehlt → **ABBRUCH**, Implementierung erst nach Merge beider Tickets fortführen.

- [ ] **Schritt 0.3: Baseline-Tests grün**

```bash
cd /tmp/wt-brett-hygiene/brett && npm test 2>&1 | tail -10
```

Erwartetes Ergebnis: `# pass 506`, `# fail 0`.

---

## Task 1: WsDeps-Typisierung — konkrete Signaturen für alle `Function`-Felder

**Hintergrund:** `brett/src/server/ws-handler.ts` Z. ~8–62 enthält ~20 Felder als `Function`. Das erschwert Refactoring und IDE-Unterstützung. Dieser Task ersetzt alle durch konkrete Signaturen, ohne die Implementierung zu verändern.

**Files:**
- Modify: `brett/src/server/ws-handler.ts` (Z. ~8–62, `WsDeps`-Interface)
- Test: Kein neuer Test nötig — `npx tsc` ist der Verifikationstest.

- [x] **Schritt 1.1: Tsc-Baseline dokumentieren**

```bash
cd /tmp/wt-brett-hygiene/brett
npx tsc --noEmit -p tsconfig.server.json 2>&1 | head -30
```

Erwartetes Ergebnis: Null Fehler (sauberer Baseline).

- [x] **Schritt 1.2: Konkrete Signaturen einsetzen**

Ersetze in `brett/src/server/ws-handler.ts` den gesamten `WsDeps`-Block (ab `export interface WsDeps {` bis zur schließenden `}`, aktuell ca. Z. 8–63) durch folgende konkrete Typen. **Logik bleibt unverändert:**

```typescript
import type { UndoEntry } from './undo-stack';
import type { MutationType, MutateContext } from './permissions';
import type { Pool } from 'pg';

export interface WsDeps {
  // ── Room management ────────────────────────────────────────────────
  joinRoom: (ws: any, room: string) => void;
  leaveRoom: (ws: any) => string | undefined;
  broadcast: (room: string, msg: any, exclude?: any) => void;
  broadcastInfo: (room: string) => void;

  // ── Participant roster ─────────────────────────────────────────────
  addParticipant: (room: string, p: { userId: string; name: string }) => any | null;
  removeParticipant: (room: string, userId: string) => void;
  clearParticipants: (room: string) => void;
  listParticipants: (room: string) => any[];

  // ── Figure state ───────────────────────────────────────────────────
  figureMaps: Map<string, Map<string, any>>;
  rooms: Map<string, Set<any>>;
  ensureFigureMap: (room: string) => Map<string, any>;
  seedFigureMapFromState: (map: Map<string, any>, state: any) => void;
  applyMutation: (room: string, msg: any) => void;
  buildStateFromMutations: (room: string) => any;

  // ── Figure locks ───────────────────────────────────────────────────
  acquireFigureLock: (room: string, id: string, owner: { userId: string; name: string; color: string }) => boolean;
  releaseFigureLock: (room: string, id: string, userId: string) => boolean;
  releaseLocksForUser: (room: string, userId: string) => void;
  orphanFiguresForUser: (room: string, userId: string) => string[];
  listFigureLocks: (room: string) => any[];

  // ── Permissions ────────────────────────────────────────────────────
  canMutate: (ctx: MutateContext) => boolean;
  resolveRole: (ws: any, roles: Record<string, string>) => string;
  validateAppearance: (appearance: any) => string | null;

  // ── Persistence ────────────────────────────────────────────────────
  readState: (room: string) => Promise<any>;
  schedulePersist: (room: string) => void;
  flushImmediate: (room: string) => Promise<void>;

  // ── Event log (optional — backwards-compat) ────────────────────────
  /** Log a mutation event for replay recording. */
  logEvent?: (room: string, sessionCode: string | null, eventType: string, payload: any) => void;
  /** Flush the event buffer for a room immediately (called on session-end). */
  flushEventLog?: (room: string) => Promise<void>;

  // ── Admin / session commands ───────────────────────────────────────
  handleAdminSessionCreate: (ws: any, msg: any, room: string, deps: any) => Promise<void>;
  handleAdminHandoffMessage: (ws: any, msg: any, room: string, deps: any) => Promise<void>;
  handleAdminRoundStop: (ws: any, msg: any, room: string, deps: any) => Promise<void>;
  handleAdminRoundPause: (ws: any, msg: any, room: string, deps: any) => Promise<void>;
  handleAdminRoundStart: (ws: any, msg: any, room: string, deps: any) => Promise<void>;
  handleAdminSetOptik: (ws: any, msg: any, room: string, deps: any) => Promise<void>;
  handleAdminSetTemplate: (ws: any, msg: any, room: string, deps: any) => Promise<void>;

  // ── Snapshot & template ────────────────────────────────────────────
  loadSnapshotState?: (snapshotId: string) => Promise<any>;
  applyTemplateToRoom?: (room: string, templateState: any) => void;

  // ── Player tracking ────────────────────────────────────────────────
  trackPlayerInRoom: (room: string, playerId: string) => void;
  transitionPhase: (room: string, phase: string) => void;

  // ── Admin token ────────────────────────────────────────────────────
  isAdminFromClaims: (claims: any) => boolean;
  getAdminTokenHolder: (room: string) => string | null;
  beginTokenGrace: (room: string, playerId: string) => void;
  setRoomAdminPresence: (room: string, admins: string[]) => void;
  reclaimAdminToken: (room: string, playerId: string) => void;
  roomAdminPresence: Map<string, Set<string>>;

  // ── Session middleware ─────────────────────────────────────────────
  sessionMiddleware?: any;

  // ── Undo/Redo (optional — T000470) ────────────────────────────────
  captureBeforeSnapshot?: (room: string, msg: any) => Map<string, any | null>;
  captureAfterSnapshot?: (before: Map<string, any | null>, room: string, msg: any) => Map<string, any | null>;
  pushUndo?: (room: string, entry: UndoEntry) => void;
  performUndo?: (room: string) => { applied: true; entry: UndoEntry } | { applied: false };
  performRedo?: (room: string) => { applied: true; entry: UndoEntry } | { applied: false };
  getUndoStatus?: (room: string) => { canUndo: boolean; canRedo: boolean; undoCount: number; redoCount: number };
  clearUndoStacks?: (room: string) => void;
}
```

- [x] **Schritt 1.3: tsc-Check**

```bash
cd /tmp/wt-brett-hygiene/brett
npx tsc --noEmit -p tsconfig.server.json 2>&1
```

Erwartetes Ergebnis: Null Fehler. Bei Fehlern: `import type { UndoEntry }` prüfen; ggf. Import-Pfad anpassen.

- [x] **Schritt 1.4: Tests laufen lassen**

```bash
cd /tmp/wt-brett-hygiene/brett && npm test 2>&1 | tail -10
```

Erwartetes Ergebnis: `# pass 506`, `# fail 0`.

- [x] **Schritt 1.5: Commit**

```bash
cd /tmp/wt-brett-hygiene
git add brett/src/server/ws-handler.ts
git commit -m "refactor(brett): konkrete Signaturen für alle WsDeps-Function-Felder (T000661)"
```

---

## Task 2: ws-handler.ts aufteilen — Connection-Lifecycle vs. Message-Dispatcher

**Hintergrund:** `ws-handler.ts` hat zwei klar trennbare Verantwortlichkeiten:
1. **Connection-Lifecycle** (`attachWsServer`, `handleDisconnect`, `startHeartbeat`) — alles rund um den WebSocket-Lebenszyklus.
2. **Message-Dispatcher** (alle Message-Handler-Funktionen: `gateMutation`, `handleLobbySetReady`, `gateSessionReady`, `onLeaderDisconnect`, `resolvePlayerId`, `getSessionCode` plus die innere `onmessage`-Logik).

Die Trennung ist sauber, weil der Dispatcher keine direkten WSS-Lifecycle-Hooks braucht.

**Files:**
- Create: `brett/src/server/ws-connection.ts` ← Connection-Lifecycle
- Modify: `brett/src/server/ws-handler.ts` ← wird zum reinen Message-Dispatcher; re-exportiert alles aus `ws-connection.ts`

**Ziel-Struktur nach dem Split:**

`brett/src/server/ws-connection.ts` enthält:
- `attachWsServer(wss, deps)` — die vollständige Funktion aus ws-handler (ca. Z. 199–579)
- `handleDisconnect(ws, deps)` — ca. Z. 194–197
- `startHeartbeat(wss)` — ca. Z. 581–599

`brett/src/server/ws-handler.ts` behält:
- `WsDeps` Interface
- `RELAY_TYPES`, `ADMIN_TYPES` Sets
- `resolvePlayerId`, `getSessionCode`, `gateMutation`, `handleLobbySetReady`, `gateSessionReady`, `onLeaderDisconnect`
- Re-exports: `export { attachWsServer, handleDisconnect, startHeartbeat } from './ws-connection'`

- [x] **Schritt 2.1: Grep alle Importstellen**

```bash
grep -rn "from.*ws-handler\|require.*ws-handler" /tmp/wt-brett-hygiene/brett/src/ /tmp/wt-brett-hygiene/brett/test/ 2>/dev/null
```

Dokumentiere alle gefundenen Dateien — diese müssen nach dem Split **nicht** verändert werden, da `ws-handler.ts` alles re-exportiert.

- [x] **Schritt 2.2: `brett/src/server/ws-connection.ts` erstellen**

Erstelle die Datei mit folgendem Inhalt (die tatsächlichen Funktionen 1:1 aus ws-handler.ts übernehmen — kein Code verändern):

```typescript
// brett/src/server/ws-connection.ts
// WebSocket-Lebenszyklus: Verbindungsauf- und -abbau, Heartbeat.
// Reine Orchestrierung — Logik lebt in ws-handler (Message-Dispatcher).

import { WebSocketServer } from 'ws';
import type { WsDeps } from './ws-handler';
import {
  gateSessionReady,
  gateMutation,
  handleLobbySetReady,
  onLeaderDisconnect,
  resolvePlayerId,
  getSessionCode,
  RELAY_TYPES,
  ADMIN_TYPES,
} from './ws-handler';
import { handleAdminMessage } from './ws-admin-commands';
import * as undoStack from './undo-stack';

export function handleDisconnect(ws: any, deps: WsDeps): void {
  // 1:1 aus ws-handler.ts übernehmen
  const room = deps.leaveRoom(ws);
  if (room) deps.broadcastInfo(room);
}

export function attachWsServer(wss: WebSocketServer, deps: WsDeps): void {
  // 1:1 aus ws-handler.ts übernehmen (der gesamte wss.on('connection', ...) Block)
}

export function startHeartbeat(wss: WebSocketServer): NodeJS.Timeout {
  // 1:1 aus ws-handler.ts übernehmen
  const HEARTBEAT_INTERVAL_MS = 30_000;
  const heartbeatTimer = setInterval(() => {
    wss.clients.forEach((ws: any) => {
      if (ws.isAlive === false) {
        try { ws.terminate(); } catch {}
        return;
      }
      ws.isAlive = false;
      try { ws.send(JSON.stringify({ type: 'ping', t: Date.now() })); } catch {}
    });
  }, HEARTBEAT_INTERVAL_MS);
  if (heartbeatTimer.unref) heartbeatTimer.unref();
  return heartbeatTimer;
}
```

**WICHTIG:** Die Implementierung von `attachWsServer` und `handleDisconnect` sind die vollständigen Funktionskörper aus der aktuellen `ws-handler.ts` (ca. Z. 194–579). Wörtlich kopieren, nichts verändern.

- [x] **Schritt 2.3: `ws-handler.ts` bereinigen und Re-Exports ergänzen**

Entferne aus `ws-handler.ts`:
- die Funktion `handleDisconnect` (inkl. Body)
- die Funktion `attachWsServer` (inkl. Body)
- die Funktion `startHeartbeat` (inkl. Body)
- die Imports `import { WebSocketServer } from 'ws'` und `import { handleAdminMessage } from './ws-admin-commands'` sofern sie nur noch von den verschobenen Funktionen benötigt wurden

Füge am Ende von `ws-handler.ts` hinzu:

```typescript
// Re-exports für Rückwärtskompatibilität aller bestehenden Imports
export { attachWsServer, handleDisconnect, startHeartbeat } from './ws-connection';
```

- [x] **Schritt 2.4: tsc-Check**

```bash
cd /tmp/wt-brett-hygiene/brett
npx tsc --noEmit -p tsconfig.server.json 2>&1
```

Erwartetes Ergebnis: Null Fehler.

- [x] **Schritt 2.5: Tests laufen lassen**

```bash
cd /tmp/wt-brett-hygiene/brett && npm test 2>&1 | tail -10
```

Erwartetes Ergebnis: `# pass 506`, `# fail 0`.

- [x] **Schritt 2.6: Commit**

```bash
cd /tmp/wt-brett-hygiene
git add brett/src/server/ws-connection.ts brett/src/server/ws-handler.ts
git commit -m "refactor(brett): ws-handler.ts → ws-connection (Lifecycle) + ws-handler (Dispatcher) (T000661)"
```

---

## Task 3: index.ts aufteilen — Express-Routen in brett/src/server/routes/

**Hintergrund:** `server/index.ts` enthält App-Wiring (SessionMiddleware, WSS-Startup, Shutdown) **und** alle Route-Handler direkt. Die Routen lassen sich sauber nach Domäne in 4 Dateien auslagern.

**Geplante Aufteilung:**

| Datei | Enthält |
|---|---|
| `routes/snapshots.ts` | `GET /api/snapshots`, `GET /api/snapshots/:id`, `POST /api/snapshots`, `buildSnapshotListQuery`, `parseSnapshotInsert`, `canCreateTemplate` |
| `routes/auth.ts` | `GET /auth/login`, `GET /auth/callback`, `GET /auth/me`, `POST /auth/e2e-login`, `resolveE2eIdentity` |
| `routes/admin.ts` | `GET /api/admin/rooms`, `GET /api/sessions`, `GET /api/sessions/:room/events`, `GET /api/sessions/:room/snapshot`, `GET /api/state`, `GET /api/customers`, `GET /api/join`, `GET /api/config`, `GET /api/templates`, `GET /api/templates/:id` |
| `routes/presets.ts` | `GET /presets`, `POST /presets`, `DELETE /presets/:id` |

`index.ts` behält: App-Instanz, Session-Middleware, Static-Serving, Health-Endpoint, WsServer-Setup, Shutdown-Logik, `asyncHandler`, alle Re-Exports für die Test-Suite sowie Dependency-Wiring.

**Files:**
- Create: `brett/src/server/routes/snapshots.ts`
- Create: `brett/src/server/routes/auth.ts`
- Create: `brett/src/server/routes/admin.ts`
- Create: `brett/src/server/routes/presets.ts`
- Modify: `brett/src/server/index.ts` — Routen entfernen, Router-Dateien registrieren, Re-Exports für Test-Suite beibehalten

- [ ] **Schritt 3.1: Grep Importstellen für index.ts-Symbole**

```bash
grep -rn "from.*server/index\|from.*\.\.\/index\|require.*server/index" /tmp/wt-brett-hygiene/brett/test/ 2>/dev/null | grep -E "buildSnapshotListQuery|parseSnapshotInsert|canCreateTemplate|resolveE2eIdentity" | head -20
```

Dokumentiere: welche Tests importieren direkt aus `index.ts`. Diese Imports müssen nach dem Split über die Re-Exports in `index.ts` weiter funktionieren.

- [ ] **Schritt 3.2: `brett/src/server/routes/snapshots.ts` erstellen**

```typescript
// brett/src/server/routes/snapshots.ts
// Snapshot-CRUD + Curated-Template-Verwaltung (D8).

import { Router } from 'express';
import * as db from '../db';
import { asyncHandler } from '../index';

export const snapshotsRouter = Router();

// D8 — Pure: build the snapshot-list SELECT.
export function buildSnapshotListQuery(
  opts: { room?: string | null; customerId?: string | null; isTemplate?: boolean }
): { sql: string; args: any[]; valid: boolean } {
  // 1:1 aus index.ts übernehmen (ca. Z. 184–199)
}

// D8 — Pure: validate + normalize a snapshot-insert body.
export function parseSnapshotInsert(
  body: any
): { valid: boolean; values?: { room_token: string | null; customer_id: string | null; name: string; state: any; is_template: boolean } } {
  // 1:1 aus index.ts übernehmen (ca. Z. 203–219)
}

// D8 / SEC-2 — Pure: may this request create a curated TEMPLATE?
export function canCreateTemplate(req: { session?: { isAdmin?: boolean }; header: (n: string) => string | undefined }): boolean {
  // 1:1 aus index.ts übernehmen (ca. Z. 316–320)
}

// Routes wiring (called by index.ts: app.use(snapshotsRouter))
snapshotsRouter.get('/api/snapshots', asyncHandler(async (req: any, res: any) => {
  // 1:1 aus index.ts übernehmen (ca. Z. 222–232)
}));
snapshotsRouter.get('/api/snapshots/:id', asyncHandler(async (req: any, res: any) => {
  // 1:1 aus index.ts übernehmen (ca. Z. 235–243)
}));
snapshotsRouter.post('/api/snapshots', asyncHandler(async (req: any, res: any) => {
  // 1:1 aus index.ts übernehmen (ca. Z. 324–340)
}));
```

**Hinweis:** `asyncHandler` ist in `index.ts` definiert. Um den Zirkelimport zu vermeiden, entweder:
- Option A: `asyncHandler` in eine separate `brett/src/server/utils.ts` auslagern und aus beiden Dateien importieren.
- Option B: `asyncHandler` direkt in `routes/snapshots.ts` (und anderen Router-Dateien) inline definieren — 3 Zeilen.

Option B ist einfacher (YAGNI): Jede Route-Datei definiert `asyncHandler` lokal.

```typescript
// Jede routes/*.ts definiert dies lokal — 3 Zeilen:
function asyncHandler(fn: any) {
  return (req: any, res: any, next: any) => Promise.resolve(fn(req, res, next)).catch(next);
}
```

- [ ] **Schritt 3.3: `brett/src/server/routes/auth.ts` erstellen**

```typescript
// brett/src/server/routes/auth.ts
// OIDC/Keycloak-Auth-Routen.

import { Router } from 'express';
import { buildAuthorizationUrl, authorizationCodeGrant } from 'openid-client';
import * as auth from '../auth';

export const authRouter = Router();

function asyncHandler(fn: any) {
  return (req: any, res: any, next: any) => Promise.resolve(fn(req, res, next)).catch(next);
}

export function resolveE2eIdentity(body: any): { userId: string; name: string; isAdmin: boolean } {
  // 1:1 aus index.ts übernehmen (ca. Z. 138–145)
}

const BRETT_PUBLIC_URL = process.env.BRETT_PUBLIC_URL || 'http://brett.localhost';

authRouter.get('/auth/login', asyncHandler(async (req: any, res: any) => {
  // 1:1 aus index.ts übernehmen (ca. Z. 100–107)
}));
authRouter.get('/auth/callback', asyncHandler(async (req: any, res: any) => {
  // 1:1 aus index.ts übernehmen (ca. Z. 109–123)
}));
authRouter.get('/auth/me', (req: any, res: any) => {
  // 1:1 aus index.ts übernehmen (ca. Z. 125–128)
});
authRouter.post('/auth/e2e-login', (req: any, res: any) => {
  // 1:1 aus index.ts übernehmen (ca. Z. 147–160)
});
```

- [ ] **Schritt 3.4: `brett/src/server/routes/admin.ts` erstellen**

```typescript
// brett/src/server/routes/admin.ts
// Admin- und Session-API-Routen (requireAdmin-geschützt).

import { Router } from 'express';
import * as db from '../db';
import * as auth from '../auth';
import * as rooms from '../rooms';
import * as eventLog from '../event-log';
import * as sessions from '../sessions';
import { listCoachingTemplates, getCoachingTemplate } from '../coaching-templates';
import * as phases from '../phases';

export const adminRouter = Router();

function asyncHandler(fn: any) {
  return (req: any, res: any, next: any) => Promise.resolve(fn(req, res, next)).catch(next);
}

// Alle folgenden Routen 1:1 aus index.ts (ca. Z. 81–95 und Z. 162–285) übernehmen:
// GET /healthz
// GET /api/config
// GET /api/join
// GET /api/state
// GET /api/customers
// GET /api/templates
// GET /api/templates/:id
// GET /api/sessions/:room/events (auth.requireAdmin)
// GET /api/sessions/:room/snapshot (auth.requireAdmin)
// GET /api/sessions (auth.requireAdmin)
// GET /api/admin/rooms (auth.requireAdmin)
```

- [ ] **Schritt 3.5: `brett/src/server/routes/presets.ts` erstellen**

```typescript
// brett/src/server/routes/presets.ts
// Preset-CRUD (GET/POST/DELETE /presets).

import { Router } from 'express';
import { randomUUID } from 'crypto';
import * as presets from '../presets';

export const presetsRouter = Router();

function asyncHandler(fn: any) {
  return (req: any, res: any, next: any) => Promise.resolve(fn(req, res, next)).catch(next);
}

// Alle drei Routen 1:1 aus index.ts (ca. Z. 343–373) übernehmen:
// GET /presets
// POST /presets
// DELETE /presets/:id
```

- [ ] **Schritt 3.6: `index.ts` anpassen**

In `index.ts`:
1. Alle ausgelagerten Route-Handler **entfernen**.
2. Die vier Router **importieren und registrieren**:

```typescript
import { snapshotsRouter, buildSnapshotListQuery, parseSnapshotInsert, canCreateTemplate } from './routes/snapshots';
import { authRouter, resolveE2eIdentity } from './routes/auth';
import { adminRouter } from './routes/admin';
import { presetsRouter } from './routes/presets';

// Nach app.use(sessionMiddleware):
app.use(authRouter);
app.use(adminRouter);
app.use(snapshotsRouter);
app.use(presetsRouter);
```

3. Re-Exports für Test-Suite ergänzen (am Ende von `index.ts`, nach bestehenden Re-Exports):

```typescript
export { buildSnapshotListQuery, parseSnapshotInsert, canCreateTemplate } from './routes/snapshots';
export { resolveE2eIdentity } from './routes/auth';
```

**Hinweis:** `resolveE2eIdentity` und die drei Snapshot-Hilfsfunktionen werden von Tests direkt aus `../src/server/index` importiert — die Re-Exports sichern das ohne jede Teständerung.

- [ ] **Schritt 3.7: tsc-Check**

```bash
cd /tmp/wt-brett-hygiene/brett
npx tsc --noEmit -p tsconfig.server.json 2>&1
```

Erwartetes Ergebnis: Null Fehler.

- [ ] **Schritt 3.8: Tests laufen lassen**

```bash
cd /tmp/wt-brett-hygiene/brett && npm test 2>&1 | tail -10
```

Erwartetes Ergebnis: `# pass 506`, `# fail 0`.

- [ ] **Schritt 3.9: Commit**

```bash
cd /tmp/wt-brett-hygiene
git add brett/src/server/routes/ brett/src/server/index.ts
git commit -m "refactor(brett): index.ts → routes/snapshots+auth+admin+presets (T000661)"
```

---

## Task 4: ws-client.ts aufteilen — Connection-Management, State-Sync, Undo-Sync

**Hintergrund:** `ws-client.ts` hat drei trennbare Bereiche:
1. **Connection-Management** (`connectWS`, `send`, `sendMove`/`sendJump`/etc., `isWsOpen`, `setWsOpenHandler`) — alles rund um Verbindung und Outbound-Messages.
2. **State-Sync / Message-Handler** (`onWsMessage` und der gesamte `switch`-Block) — empfangene Server-Nachrichten → lokaler State.
3. **Undo-State** (`undoState`, `setUndoStateChangeHandler`, `applyUndoStateChange`) — verwaltet separaten Zustand.

**Files:**
- Create: `brett/src/client/ws-connection-client.ts` ← Connection-Management + Outbound
- Create: `brett/src/client/ws-undo-state.ts` ← Undo-State
- Modify: `brett/src/client/ws-client.ts` ← Message-Handler + Lobby/Moderation-State; re-exportiert alles aus den neuen Modulen

**Achtung lazy-chunk-Constraint:** Keine der neuen Client-Dateien darf `three` statisch importieren (nur `ws-client.ts` importiert `mannequin`, das wiederum Three.js importiert — und `ws-client.ts` selbst ist lazy). Die neue `ws-connection-client.ts` darf **kein** `mannequin`-Import haben. `board-boot.ts` importiert `ws-client` direkt und ist bereits ein lazy chunk — dieser Split verändert die Chunk-Grenzen nicht, solange neue Dateien über `ws-client.ts` importiert werden.

- [ ] **Schritt 4.1: Grep Importstellen**

```bash
grep -rn "from.*ws-client" /tmp/wt-brett-hygiene/brett/src/ /tmp/wt-brett-hygiene/brett/test/ 2>/dev/null | grep -v "\.d\.ts" | head -30
```

Dokumentiere alle Importstellen. Kein bestehender Import-Pfad muss sich ändern — `ws-client.ts` re-exportiert alles.

- [ ] **Schritt 4.2: `brett/src/client/ws-undo-state.ts` erstellen**

```typescript
// brett/src/client/ws-undo-state.ts
// Undo/Redo-Stack-Status auf Client-Seite (T000470).

export const undoState = {
  canUndo: false,
  canRedo: false,
  undoCount: 0,
  redoCount: 0,
};

let onUndoStateChange: ((state: typeof undoState) => void) | null = null;

export function setUndoStateChangeHandler(fn: typeof onUndoStateChange): void {
  onUndoStateChange = fn;
}

export function applyUndoStateChange(
  canUndo: boolean, canRedo: boolean, undoCount: number, redoCount: number,
): void {
  undoState.canUndo = canUndo;
  undoState.canRedo = canRedo;
  undoState.undoCount = undoCount;
  undoState.redoCount = redoCount;
  if (onUndoStateChange) onUndoStateChange({ ...undoState });
}
```

- [ ] **Schritt 4.3: `brett/src/client/ws-connection-client.ts` erstellen**

```typescript
// brett/src/client/ws-connection-client.ts
// WebSocket-Verbindungs-Management und Outbound-Send-Helfer (Client-Seite).
// Kein Three.js-Import hier — bleibt Three-free damit der Lazy-Chunk erhalten bleibt.

import { STATE, getWs, setWs, setWsReady, currentUser } from './state';
import type { ClientMessage } from '../types/messages';

// 1:1 aus ws-client.ts übernehmen:
// - send() (privat)
// - sendClient()
// - isWsOpen()
// - sendMove(), sendJump(), sendUpdate(), sendStiffness(), sendDelete(), sendUndo(), sendRedo(), sendAddFigure()
// - onWsOpen + setWsOpenHandler()
// - connectWS()
```

**WICHTIG:** `connectWS()` registriert `ws.addEventListener('message', onWsMessage)`. Da `onWsMessage` nach dem Split in `ws-client.ts` bleibt, muss `ws-connection-client.ts` es als Callback-Injection empfangen:

```typescript
let _onWsMessage: ((evt: MessageEvent) => void) = () => {};
export function setMessageHandler(fn: (evt: MessageEvent) => void): void {
  _onWsMessage = fn;
}

// In connectWS():
ws.addEventListener('message', (evt) => _onWsMessage(evt));
```

In `ws-client.ts` nach dem Import:
```typescript
import { setMessageHandler } from './ws-connection-client';
setMessageHandler(onWsMessage);
```

- [ ] **Schritt 4.4: `ws-client.ts` bereinigen und Re-Exports ergänzen**

Aus `ws-client.ts` entfernen:
- `undoState`, `setUndoStateChangeHandler`, `applyUndoStateChange` (jetzt in `ws-undo-state.ts`)
- `send()`, `sendClient()`, `isWsOpen()`, `sendMove()`, `sendJump()`, `sendUpdate()`, `sendStiffness()`, `sendDelete()`, `sendUndo()`, `sendRedo()`, `sendAddFigure()`, `onWsOpen`, `setWsOpenHandler()`, `connectWS()` (jetzt in `ws-connection-client.ts`)

Am Ende von `ws-client.ts` hinzufügen:

```typescript
// Re-exports für Rückwärtskompatibilität
export { undoState, setUndoStateChangeHandler, applyUndoStateChange } from './ws-undo-state';
export {
  sendClient, isWsOpen, sendMove, sendJump, sendUpdate, sendStiffness,
  sendDelete, sendUndo, sendRedo, sendAddFigure, setWsOpenHandler, connectWS,
} from './ws-connection-client';
```

- [ ] **Schritt 4.5: no-eager-three-Test läuft noch**

```bash
cd /tmp/wt-brett-hygiene/brett && npm test -- --grep "no-eager-three" 2>&1
```

Erwartetes Ergebnis: PASS. `ws-connection-client.ts` darf kein `three` importieren.

- [ ] **Schritt 4.6: tsc-Check (Client)**

```bash
cd /tmp/wt-brett-hygiene/brett
npx tsc --noEmit -p tsconfig.client.json 2>&1
```

Erwartetes Ergebnis: Null Fehler.

- [ ] **Schritt 4.7: Tests laufen lassen**

```bash
cd /tmp/wt-brett-hygiene/brett && npm test 2>&1 | tail -10
```

Erwartetes Ergebnis: `# pass 506`, `# fail 0`.

- [ ] **Schritt 4.8: Commit**

```bash
cd /tmp/wt-brett-hygiene
git add brett/src/client/ws-connection-client.ts brett/src/client/ws-undo-state.ts brett/src/client/ws-client.ts
git commit -m "refactor(brett): ws-client.ts → ws-connection-client + ws-undo-state (T000661)"
```

---

## Task 5: board-boot.ts aufteilen — Replay, UI-Wiring, Moderation

**Hintergrund:** `board-boot.ts` enthält drei unabhängige Bereiche:
1. **Replay-Modus** (`maybeStartReplayMode`, `applyReplayStateToScene`) — komplett isoliert hinter Feature-Flag.
2. **Moderation-UI-Wiring** (`observerHint`, `releaseBtn`, `freezeBanner` DOM-Erstellung + `currentModerationState` Logik) — rund um T000471.
3. **Hauptloop** (der `bootBoard`-Monolith mit Tick, Input-Events, Auth, UI-Init).

Da `bootBoard` die einzige exportierte Einstiegsfunktion ist und intern alle Subsysteme aufruft, ist eine vollständige Trennung ohne Signaturänderungen nicht praktisch — Replay und Moderation-DOM lassen sich aber extrahieren.

**Files:**
- Create: `brett/src/client/board-replay.ts` ← `maybeStartReplayMode`, `applyReplayStateToScene`
- Create: `brett/src/client/board-moderation-ui.ts` ← DOM-Erstellung für Observer-Hint, Release-Button, Freeze-Banner
- Modify: `brett/src/client/board-boot.ts` ← importiert + ruft die extrahierten Funktionen auf; bestehende Exporte bleiben

- [ ] **Schritt 5.1: Grep Importstellen**

```bash
grep -rn "from.*board-boot\|import.*board-boot" /tmp/wt-brett-hygiene/brett/src/ /tmp/wt-brett-hygiene/brett/test/ 2>/dev/null | head -20
```

Die meisten Tests importieren `maybeStartReplayMode` und `applyReplayStateToScene` aus `board-boot`. Diese Re-Exports müssen erhalten bleiben.

- [ ] **Schritt 5.2: `brett/src/client/board-replay.ts` erstellen**

```typescript
// brett/src/client/board-replay.ts
// Replay-Modus-Logik (Slice 5, T000472). Dark-Launch, gated by window.__brettFeatures['replay'].

import { STATE } from './state';
import { createReplayController, type ReplayBoardState } from './replay-engine';
import { renderTimeline } from './ui/timeline';

export async function maybeStartReplayMode(): Promise<boolean> {
  // 1:1 aus board-boot.ts übernehmen (ca. Z. 547–586)
}

export function applyReplayStateToScene(state: ReplayBoardState): void {
  // 1:1 aus board-boot.ts übernehmen (ca. Z. 595–601)
}
```

- [ ] **Schritt 5.3: `brett/src/client/board-moderation-ui.ts` erstellen**

```typescript
// brett/src/client/board-moderation-ui.ts
// DOM-Erstellung für Moderation-Overlays (Observer-Hint, Release-Button, Freeze-Banner).
// Gibt die DOM-Elemente zurück; board-boot.ts verwaltet den State und Tick-Aufruf.

export interface ModerationElements {
  observerHint: HTMLDivElement;
  releaseBtn: HTMLButtonElement;
  freezeBanner: HTMLDivElement;
}

export function createModerationElements(): ModerationElements {
  // Erstellt und returnt observerHint, releaseBtn, freezeBanner DOM-Elemente
  // 1:1 aus board-boot.ts übernehmen (ca. Z. 112–180), MIT document.body.appendChild.
  // releaseBtn.addEventListener('click', ...) bleibt in board-boot.ts — hier nur DOM-Erstellung.
}
```

**Hinweis:** Der `click`-Handler auf `releaseBtn` (`hud.releaseAllPossessions()`) bleibt in `board-boot.ts`, da er `hud` importiert. `board-moderation-ui.ts` erstellt nur das DOM-Element ohne Event-Handler und gibt es zurück.

- [ ] **Schritt 5.4: `board-boot.ts` anpassen**

```typescript
import { maybeStartReplayMode, applyReplayStateToScene } from './board-replay';
import { createModerationElements } from './board-moderation-ui';

// In bootBoard():
// Ersetze die inlined DOM-Erstellung durch:
const { observerHint, releaseBtn, freezeBanner } = createModerationElements();
releaseBtn.addEventListener('click', () => { hud.releaseAllPossessions(); });

// Ersetze die inlined maybeStartReplayMode / applyReplayStateToScene durch Imports.
```

Re-Exports am Ende von `board-boot.ts` ergänzen:

```typescript
// Re-exports für Rückwärtskompatibilität
export { maybeStartReplayMode, applyReplayStateToScene } from './board-replay';
```

- [ ] **Schritt 5.5: no-eager-three-Test läuft noch**

```bash
cd /tmp/wt-brett-hygiene/brett && npm test -- --grep "no-eager-three" 2>&1
```

Erwartetes Ergebnis: PASS.

- [ ] **Schritt 5.6: tsc-Check (Client)**

```bash
cd /tmp/wt-brett-hygiene/brett
npx tsc --noEmit -p tsconfig.client.json 2>&1
```

Erwartetes Ergebnis: Null Fehler.

- [ ] **Schritt 5.7: Tests laufen lassen**

```bash
cd /tmp/wt-brett-hygiene/brett && npm test 2>&1 | tail -10
```

Erwartetes Ergebnis: `# pass 506`, `# fail 0`.

- [ ] **Schritt 5.8: Commit**

```bash
cd /tmp/wt-brett-hygiene
git add brett/src/client/board-replay.ts brett/src/client/board-moderation-ui.ts brett/src/client/board-boot.ts
git commit -m "refactor(brett): board-boot.ts → board-replay + board-moderation-ui (T000661)"
```

---

## Task 6: mannequin.ts aufteilen — Skeleton/IK, Physik, Moderation-Visuals/Labels

**Hintergrund:** `mannequin.ts` enthält:
1. **Skeleton & IK** (`makeBone`, `makeMannequin`, `recolorFigure`, `ccdIK`, `pickContact`, `pickMannequinBody`, `pickFloor`, `setNdc`, `getTickRefs`) — Three.js-Konstruktion und Raycasting.
2. **Physik** (`tickSpring`, `startJump`, `resolveCollisions`) — Spring-Simulation und Kollisions-Auflösung.
3. **Moderation-Visuals & Labels** (`updatePossessionVisuals`, `updatePossessorLabel`, `clearPossessionVisuals`, `updateModerationVisuals`, `clearModerationVisuals`) — visuelle Effekte auf Figuren.

**Files:**
- Create: `brett/src/client/mannequin-physics.ts` ← `tickSpring`, `startJump`, `resolveCollisions`
- Create: `brett/src/client/mannequin-visuals.ts` ← `updatePossessionVisuals`, `updatePossessorLabel`, `clearPossessionVisuals`, `updateModerationVisuals`, `clearModerationVisuals`, `ModerationVisualState`
- Modify: `brett/src/client/mannequin.ts` ← behält Skeleton/IK + BONE_NAMES/Konstanten; re-exportiert alles

- [ ] **Schritt 6.1: Grep Importstellen**

```bash
grep -rn "from.*mannequin\|import.*mannequin" /tmp/wt-brett-hygiene/brett/src/ /tmp/wt-brett-hygiene/brett/test/ 2>/dev/null | grep -v "\.d\.ts" | head -30
```

Dokumentiere. Alle Imports aus `mannequin` bleiben über Re-Exports kompatibel.

- [ ] **Schritt 6.2: `brett/src/client/mannequin-physics.ts` erstellen**

```typescript
// brett/src/client/mannequin-physics.ts
// Physik-Simulation: Spring-Knochen, Sprung, Kollisions-Auflösung.

import { STATE } from './state';
import { BONE_NAMES, CONTACT_POINTS, GRAVITY, JUMP_V0, COLLISION_MAX_ITER, BOUNCE_K_LAND } from './mannequin';

// sendMove — injected via setSendMove (bleibt in mannequin.ts und wird hier re-verwendet)
let sendMove: (id: string, x: number, z: number, facingY: number) => void = () => {};
export function setPhysicsSendMove(fn: typeof sendMove): void { sendMove = fn; }

export function tickSpring(dt: number): void {
  // 1:1 aus mannequin.ts übernehmen (ca. Z. 275–325)
}

export function startJump(fig: any): void {
  // 1:1 aus mannequin.ts übernehmen (ca. Z. 327–331)
}

export function resolveCollisions(movedFig: any, impulseK: number): void {
  // 1:1 aus mannequin.ts übernehmen (ca. Z. 333–356)
}
```

**Hinweis zu `sendMove`:** `resolveCollisions` braucht `sendMove`. Da `setSendMove` in `mannequin.ts` bleibt (öffentliche API), importiert `mannequin-physics.ts` die Funktion entweder via:
- Option A: eigene `setPhysicsSendMove`-Injection (oben gezeigt) — `mannequin.ts` leitet `setSendMove` auf beide weiter.
- Option B: `mannequin-physics.ts` importiert `sendMove` direkt aus `mannequin.ts` über ein internes Modul-Singleton.

Option A ist sauberer (explizite Injection, keine Zirkularität).

In `mannequin.ts` erweitern:
```typescript
import { setPhysicsSendMove } from './mannequin-physics';

export function setSendMove(fn: typeof sendMove): void {
  sendMove = fn;
  setPhysicsSendMove(fn); // forward to physics module
}
```

- [ ] **Schritt 6.3: `brett/src/client/mannequin-visuals.ts` erstellen**

```typescript
// brett/src/client/mannequin-visuals.ts
// Possession- und Moderation-Visuals für Figuren.

import * as THREE from 'three';

export interface ModerationVisualState {
  spotlight: string | null;
  dim: string | null;
  freeze: boolean;
}

// 1:1 aus mannequin.ts übernehmen:
export function updatePossessionVisuals(figures: any[], currentUserId: string): void {
  // ca. Z. 448–476
}

// updatePossessorLabel bleibt privat (nicht exportiert — nur intern genutzt)
function updatePossessorLabel(fig: any, text: string, hexColor: string): void {
  // ca. Z. 478–489
}

export function clearPossessionVisuals(fig: any): void {
  // ca. Z. 491–494
}

export function updateModerationVisuals(figures: any[], state: ModerationVisualState): void {
  // ca. Z. 513–591
}

export function clearModerationVisuals(figures: any[]): void {
  // ca. Z. 593–595
}
```

- [ ] **Schritt 6.4: `mannequin.ts` bereinigen und Re-Exports ergänzen**

Aus `mannequin.ts` entfernen:
- `tickSpring`, `startJump`, `resolveCollisions` (→ `mannequin-physics.ts`)
- `updatePossessionVisuals`, `clearPossessionVisuals`, `updateModerationVisuals`, `clearModerationVisuals`, `ModerationVisualState` (→ `mannequin-visuals.ts`)
- Die interne `updatePossessorLabel` (bleibt privat in `mannequin-visuals.ts`)

Am Ende von `mannequin.ts` hinzufügen:

```typescript
// Re-exports für Rückwärtskompatibilität
export { tickSpring, startJump, resolveCollisions } from './mannequin-physics';
export {
  updatePossessionVisuals, clearPossessionVisuals,
  updateModerationVisuals, clearModerationVisuals,
  type ModerationVisualState,
} from './mannequin-visuals';
```

- [ ] **Schritt 6.5: tsc-Check (Client)**

```bash
cd /tmp/wt-brett-hygiene/brett
npx tsc --noEmit -p tsconfig.client.json 2>&1
```

Erwartetes Ergebnis: Null Fehler.

- [ ] **Schritt 6.6: Tests laufen lassen**

```bash
cd /tmp/wt-brett-hygiene/brett && npm test 2>&1 | tail -10
```

Erwartetes Ergebnis: `# pass 506`, `# fail 0`.

- [ ] **Schritt 6.7: Commit**

```bash
cd /tmp/wt-brett-hygiene
git add brett/src/client/mannequin-physics.ts brett/src/client/mannequin-visuals.ts brett/src/client/mannequin.ts
git commit -m "refactor(brett): mannequin.ts → mannequin-physics + mannequin-visuals (T000661)"
```

---

## Task 7: Test-only-Exports explizit markieren

**Hintergrund:**
- `free-fly-camera.ts` Z. ~220–234: `_setYaw`, `_setPitch`, `_setKeys`, `_resetState` sind Test-Helfer (bereits mit `/** @internal */` markiert). Grep hat bestätigt: Tests importieren diese direkt. Sie **müssen exportiert bleiben** — nur Dokumentation verbessern.
- `index.ts` (nach Task 3): `buildSnapshotListQuery`, `parseSnapshotInsert`, `canCreateTemplate` sind in `routes/snapshots.ts` verschoben und werden aus Tests direkt importiert. Durch Task 3 sind sie dort schon klar als eigenständige Pure-Funktionen sichtbar.

**Files:**
- Modify: `brett/src/client/free-fly-camera.ts` (Z. ~217–234)
- Modify: `brett/src/server/routes/snapshots.ts` (Kommentar ergänzen)

- [ ] **Schritt 7.1: free-fly-camera.ts Test-Helfer-Block dokumentieren**

Ersetze den vorhandenen Kommentar-Block (ca. Z. 217–219):

```
// ── Test helpers (exported for headless unit tests only) ─────────────────────
// These are not part of the production API; do not use outside of tests.
```

durch:

```typescript
// ── Test helpers (exported for headless unit tests only) ─────────────────────
// These exports exist solely to allow headless unit tests (brett/test/free-fly-camera.test.ts)
// to set internal state without DOM/WebGL. They are NOT part of the production API.
// Do NOT import these outside of test files.
// Removing or renaming them requires updating free-fly-camera.test.ts.
```

Kein Code ändert sich — nur der Kommentar.

- [ ] **Schritt 7.2: routes/snapshots.ts Test-Helfer-Block dokumentieren**

Ergänze über `buildSnapshotListQuery` in `brett/src/server/routes/snapshots.ts` folgenden Kommentar:

```typescript
// ── Test-exported pure helpers ────────────────────────────────────────────────
// buildSnapshotListQuery, parseSnapshotInsert, canCreateTemplate are exported
// primarily for unit tests (brett/test/snapshots-route.test.ts). They are also
// used by the route handlers below. If renaming, update snapshots-route.test.ts.
```

- [ ] **Schritt 7.3: Tests laufen lassen**

```bash
cd /tmp/wt-brett-hygiene/brett && npm test 2>&1 | tail -10
```

Erwartetes Ergebnis: `# pass 506`, `# fail 0`.

- [ ] **Schritt 7.4: tsc-Check (beide)**

```bash
cd /tmp/wt-brett-hygiene/brett
npx tsc --noEmit -p tsconfig.server.json 2>&1
npx tsc --noEmit -p tsconfig.client.json 2>&1
```

Erwartetes Ergebnis: Null Fehler in beiden.

- [ ] **Schritt 7.5: Commit**

```bash
cd /tmp/wt-brett-hygiene
git add brett/src/client/free-fly-camera.ts brett/src/server/routes/snapshots.ts
git commit -m "refactor(brett): Test-only-Exports explizit dokumentieren (T000661)"
```

---

## Task 8: Abschluss-Verifikation und PR

- [ ] **Schritt 8.1: Vollständiger Test-Lauf**

```bash
cd /tmp/wt-brett-hygiene/brett && npm test 2>&1 | grep -E "pass|fail|error"
```

Erwartetes Ergebnis: `# pass 506`, `# fail 0`.

- [ ] **Schritt 8.2: Beide tsc-Checks**

```bash
cd /tmp/wt-brett-hygiene/brett
npx tsc --noEmit -p tsconfig.server.json 2>&1
npx tsc --noEmit -p tsconfig.client.json 2>&1
```

Erwartetes Ergebnis: Null Fehler in beiden.

- [ ] **Schritt 8.3: no-eager-three läuft**

```bash
cd /tmp/wt-brett-hygiene/brett && npm test -- --grep "no-eager-three" 2>&1
```

Erwartetes Ergebnis: PASS.

- [ ] **Schritt 8.4: PR öffnen**

```bash
cd /tmp/wt-brett-hygiene
gh pr create \
  --title "refactor(brett): Code-Hygiene-Refactor — Datei-Splits + WsDeps-Typen (T000661)" \
  --body "$(cat <<'EOF'
## Summary

- WsDeps-Interface: 20+ `Function`-Felder durch konkrete Signaturen ersetzt
- ws-handler.ts → ws-connection.ts (Lifecycle) + ws-handler.ts (Message-Dispatcher)
- index.ts → routes/snapshots.ts + routes/auth.ts + routes/admin.ts + routes/presets.ts
- ws-client.ts → ws-connection-client.ts + ws-undo-state.ts + ws-client.ts (State-Sync)
- board-boot.ts → board-replay.ts + board-moderation-ui.ts + board-boot.ts
- mannequin.ts → mannequin-physics.ts + mannequin-visuals.ts + mannequin.ts
- Test-only-Exports explizit dokumentiert

Alle 506 Tests grün. Verhaltensneutral — kein Logik-Änderung.
Depends on: T000660 (security), T000662 (perf).

## Test plan
- [ ] `cd brett && npm test` → 506 pass, 0 fail
- [ ] `npx tsc --noEmit -p tsconfig.server.json` → 0 errors
- [ ] `npx tsc --noEmit -p tsconfig.client.json` → 0 errors
- [ ] `npm test -- --grep "no-eager-three"` → PASS

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"

gh pr merge --squash --auto
```

---

## Zusammenfassung der neuen Dateien

| Neue Datei | Verantwortung |
|---|---|
| `brett/src/server/ws-connection.ts` | WS-Connection-Lifecycle (attachWsServer, startHeartbeat) |
| `brett/src/server/routes/snapshots.ts` | Snapshot-CRUD + Pure-Helfer |
| `brett/src/server/routes/auth.ts` | OIDC-Auth-Routen |
| `brett/src/server/routes/admin.ts` | Admin- & Session-API |
| `brett/src/server/routes/presets.ts` | Preset-CRUD |
| `brett/src/client/ws-connection-client.ts` | WS-Verbindung + Outbound-Sends |
| `brett/src/client/ws-undo-state.ts` | Client-Undo-State |
| `brett/src/client/board-replay.ts` | Replay-Modus-Logik |
| `brett/src/client/board-moderation-ui.ts` | Moderation-DOM-Elemente |
| `brett/src/client/mannequin-physics.ts` | Spring-Physik + Kollision |
| `brett/src/client/mannequin-visuals.ts` | Possession- + Moderation-Visuals |

Alle ursprünglichen Dateien bleiben als Re-Export-Fassaden bestehen — kein bestehender Import-Pfad bricht.

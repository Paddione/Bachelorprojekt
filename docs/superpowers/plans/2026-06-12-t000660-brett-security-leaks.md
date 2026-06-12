---
ticket_id: T000660
domains: [brett, security]
status: staged
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Brett Security Leaks Fix (T000660) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Schließe vier verifizierte Sicherheitslücken im Brett-Server und -Client: Open Redirect, fehlende Session-Gates auf drei API-Routes, Server-Map-Leaks beim Room-Destroy und three.js GPU-Memory-Leaks beim Figure-Remove.

**Architecture:** Vier unabhängige, chirurgische Fixes: (1) `sanitizeReturnTo` + `requireSession` werden in `src/server/auth.ts` ergänzt und in `src/server/index.ts` verdrahtet; (2) `cleanupRoomTracking(room)` wird in `src/server/sessions.ts` exportiert und vom Last-Leave-Pfad in `src/server/ws-handler.ts` aufgerufen; (3) `disposeMannequin(fig)` wird in `src/client/mannequin.ts` exportiert und an beiden scene.remove()-Stellen in `src/client/ws-client.ts` aufgerufen. Alle vier Bugs haben bereits rote TDD-Tests; die Implementierung macht sie grün, ohne andere der 506 grünen Tests zu brechen.

**Tech Stack:** TypeScript, Node.js node:test, three.js (THREE.Group/Mesh/Sprite/BufferGeometry/Material/Texture), Express.js middleware pattern, `MOCK_DB=true tsx`

---

## Datei-Übersicht (was wird geändert)

| Datei | Änderung |
|---|---|
| `brett/src/server/auth.ts` | Neu: `sanitizeReturnTo(raw)`, `requireSession` Middleware |
| `brett/src/server/index.ts` | `returnTo` in `/auth/callback` sanitizen; `requireSession` vor `/api/state`, `/api/snapshots/:id`, `POST /api/snapshots` (non-template); `requireSession` re-exportieren |
| `brett/src/server/sessions.ts` | Neu: `cleanupRoomTracking(room)` exportieren |
| `brett/src/server/ws-handler.ts` | `cleanupRoomTracking` am Last-Leave-Cleanup-Pfad (~Z.569) aufrufen |
| `brett/src/client/mannequin.ts` | Neu: `disposeMannequin(fig)` exportieren |
| `brett/src/client/ws-client.ts` | `disposeMannequin` an beiden scene.remove()-Stellen aufrufen (~Z.227, ~Z.419) |

---

## Task 1: `sanitizeReturnTo` in auth.ts implementieren

**Files:**
- Modify: `brett/src/server/auth.ts` (Ende der Datei, nach `requireAdmin`)
- Test: `brett/test/auth.test.ts` (bereits vorhanden, Tests 64–66)

- [x] **Step 1.1: Failing-Tests bestätigen**

```bash
cd brett && npm test 2>&1 | grep -E "^not ok (64|65|66)"
```
Erwartete Ausgabe:
```
not ok 64 - sanitizeReturnTo: allows simple relative paths
not ok 65 - sanitizeReturnTo: rejects absolute / protocol-relative / scheme URLs → "/"
not ok 66 - sanitizeReturnTo: non-string / empty → "/"
```

- [x] **Step 1.2: Funktion in auth.ts ergänzen**

Füge am Ende von `brett/src/server/auth.ts` (nach der `requireAdmin`-Funktion, Zeile 77) hinzu:

```typescript
/**
 * SEC T000660 bug #1: Open-Redirect-Sanitizer für den OIDC `returnTo`-Parameter.
 * Erlaubt nur site-relative Pfade (beginnt mit genau einem `/`, kein `//`, kein `://`).
 * Alles andere (absolute URLs, protocol-relative, javascript:, Backslash-Tricks) → '/'.
 */
export function sanitizeReturnTo(raw: any): string {
  if (typeof raw !== 'string' || raw === '') return '/';
  // Muss mit genau einem Slash beginnen — nicht doppelt (protocol-relative)
  if (!raw.startsWith('/')) return '/';
  if (raw.startsWith('//')) return '/';
  // Backslash-Trick: /\foo wird von Browsern als //foo interpretiert
  if (raw.startsWith('/\\')) return '/';
  // Scheme-bearing (javascript:, data:, etc.) — darf nach dem / nie ein `:` kommen
  if (/^\/[^/].*:/.test(raw)) return '/';
  return raw;
}
```

- [x] **Step 1.3: Tests laufen lassen — nur diese drei**

```bash
cd brett && npm test 2>&1 | grep -E "(64|65|66) -"
```
Erwartete Ausgabe (alle drei grün):
```
ok 64 - sanitizeReturnTo: allows simple relative paths
ok 65 - sanitizeReturnTo: rejects absolute / protocol-relative / scheme URLs → "/"
ok 66 - sanitizeReturnTo: non-string / empty → "/"
```

- [x] **Step 1.4: Commit**

```bash
cd /tmp/wt-brett-security
git add brett/src/server/auth.ts
git commit -m "fix(brett): add sanitizeReturnTo to prevent open redirect (T000660 bug #1)"
```

---

## Task 2: `requireSession` in auth.ts implementieren

**Files:**
- Modify: `brett/src/server/auth.ts` (nach `sanitizeReturnTo`)
- Test: `brett/test/auth.test.ts` (Tests 67–68)

- [x] **Step 2.1: Failing-Tests bestätigen**

```bash
cd brett && npm test 2>&1 | grep -E "^not ok (67|68)"
```
Erwartete Ausgabe:
```
not ok 67 - requireSession: next() for an authenticated session
not ok 68 - requireSession: 401 for an unauthenticated request
```

- [x] **Step 2.2: `requireSession` in auth.ts ergänzen**

Füge direkt nach `sanitizeReturnTo` in `brett/src/server/auth.ts` hinzu:

```typescript
/**
 * SEC T000660 bug #2: Session-Guard für unauthentifizierte API-Requests.
 * 401 wenn keine Session-userId gesetzt; next() wenn authentifiziert.
 * Analog zu requireAdmin, aber ohne Admin-Prüfung.
 */
export function requireSession(req: Request, res: Response, next: NextFunction): void {
  if ((req as any).session?.userId) return next();
  const e2eSecret = process.env.BRETT_OIDC_SECRET;
  if (e2eSecret && req.header('x-e2e-secret') === e2eSecret) return next();
  res.status(401).json({ error: 'unauthenticated' });
}
```

- [x] **Step 2.3: Tests laufen lassen**

```bash
cd brett && npm test 2>&1 | grep -E "(67|68) -"
```
Erwartete Ausgabe:
```
ok 67 - requireSession: next() for an authenticated session
ok 68 - requireSession: 401 for an unauthenticated request
```

- [x] **Step 2.4: Commit**

```bash
cd /tmp/wt-brett-security
git add brett/src/server/auth.ts
git commit -m "fix(brett): add requireSession middleware (T000660 bug #2)"
```

---

## Task 3: `sanitizeReturnTo` in `/auth/callback` verdrahten + `requireSession` auf drei Routes + Re-Export

**Files:**
- Modify: `brett/src/server/index.ts`
- Test: `brett/test/snapshots-route.test.ts` (Tests 433–435); `brett/test/auth.test.ts` (Tests 67–68 bereits grün)

**Hinweis zu Aufrufer-Analyse (Share-Link-Branch T000608):**
`grep -rn "api/state\|api/snapshots" brett/src/` zeigt, dass `/api/state` und `/api/snapshots/:id` ausschließlich serverseitig definiert sind — kein Client-Code im `brett/src/client/`-Verzeichnis ruft diese Endpoints direkt auf (der WS-Sync-Pfad liefert State via WebSocket, nicht per REST). Falls Branch `feature/T000608-brett-share-link` einen anonymen Board-Viewer einführt, der `/api/state` per HTTP aufruft, wäre nach einem Merge ein `requireSession`-Konflikt möglich. **Vor dem Merge prüfen:** `git log --oneline feature/T000608-brett-share-link | head -5` und ggf. `requireSession` für den Share-Link-Pfad durch eine gesonderte Middleware ersetzen.

- [x] **Step 3.1: Failing-Tests bestätigen**

```bash
cd brett && npm test 2>&1 | grep -E "^not ok (433|434|435)"
```
Erwartete Ausgabe:
```
not ok 433 - SEC bug #2: requireSession is exported and is a function
not ok 434 - SEC bug #2: requireSession 401s an anonymous snapshot request
not ok 435 - SEC bug #2: requireSession admits an authenticated session
```

- [x] **Step 3.2: returnTo in /auth/callback sanitizen**

In `brett/src/server/index.ts`, Zeile 118, ändere:
```typescript
// ALT:
try { returnTo = JSON.parse(Buffer.from(currentUrl.searchParams.get('state') || '', 'base64url').toString()).returnTo || '/'; } catch {}
```
zu:
```typescript
// NEU:
try { returnTo = auth.sanitizeReturnTo(JSON.parse(Buffer.from(currentUrl.searchParams.get('state') || '', 'base64url').toString()).returnTo); } catch {}
```

(Die Zeile ist jetzt etwas länger, aber `sanitizeReturnTo` wurde in Task 1 eingeführt und ist über das `auth`-Objekt verfügbar.)

- [x] **Step 3.3: requireSession auf GET /api/state**

In `brett/src/server/index.ts`, Zeile 163:
```typescript
// ALT:
app.get('/api/state', asyncHandler(async (req: any, res: any) => {
```
```typescript
// NEU:
app.get('/api/state', auth.requireSession, asyncHandler(async (req: any, res: any) => {
```

- [x] **Step 3.4: requireSession auf GET /api/snapshots/:id**

In `brett/src/server/index.ts`, Zeile 235:
```typescript
// ALT:
app.get('/api/snapshots/:id', asyncHandler(async (req: any, res: any) => {
```
```typescript
// NEU:
app.get('/api/snapshots/:id', auth.requireSession, asyncHandler(async (req: any, res: any) => {
```

- [x] **Step 3.5: requireSession auf POST /api/snapshots (non-template)**

In `brett/src/server/index.ts`, Zeile 324:
```typescript
// ALT:
app.post('/api/snapshots', asyncHandler(async (req: any, res: any) => {
```
```typescript
// NEU:
app.post('/api/snapshots', auth.requireSession, asyncHandler(async (req: any, res: any) => {
```

*Hinweis: Das nachgelagerte `canCreateTemplate`-Gate (Zeile 330) bleibt unverändert — es läuft nach `requireSession` und prüft zusätzlich Admin-Rechte für `is_template=true`.*

- [x] **Step 3.6: requireSession aus index.ts re-exportieren**

Der Test `snapshots-route.test.ts` importiert `requireSession` aus `'../src/server/index'`, nicht aus `auth`. Füge am Ende der Exports in `brett/src/server/index.ts` (z.B. direkt nach `export function canCreateTemplate`) eine Re-Export-Zeile hinzu:

```typescript
// SEC T000660: re-export for direct unit-test access (snapshots-route.test.ts)
export { requireSession } from './auth';
```

*(Alternativ kann die bestehende `export … from './auth'` erweitert werden, falls es bereits eine solche Zeile gibt — prüfe mit `grep "export.*from.*auth" brett/src/server/index.ts`.)*

- [x] **Step 3.7: Tests laufen lassen**

```bash
cd brett && npm test 2>&1 | grep -E "(433|434|435) -"
```
Erwartete Ausgabe:
```
ok 433 - SEC bug #2: requireSession is exported and is a function
ok 434 - SEC bug #2: requireSession 401s an anonymous snapshot request
ok 435 - SEC bug #2: requireSession admits an authenticated session
```

- [x] **Step 3.8: TypeScript-Check (Server)**

```bash
cd brett && npx tsc --noEmit -p tsconfig.server.json
```
Erwartete Ausgabe: keine Fehler (leer).

- [x] **Step 3.9: Commit**

```bash
cd /tmp/wt-brett-security
git add brett/src/server/index.ts
git commit -m "fix(brett): wire sanitizeReturnTo + requireSession on 3 routes (T000660 bug #1+2)"
```

---

## Task 4: `cleanupRoomTracking` in sessions.ts implementieren

**Files:**
- Modify: `brett/src/server/sessions.ts` (neue Funktion am Ende, nach `checkAllSessions`)
- Test: `brett/test/leader-grace.test.ts` (Tests 184–186)

- [x] **Step 4.1: Failing-Tests bestätigen**

```bash
cd brett && npm test 2>&1 | grep -E "^not ok (184|185|186)"
```
Erwartete Ausgabe:
```
not ok 184 - cleanupRoomTracking: clears roomPreviousPlayers for the room
not ok 185 - cleanupRoomTracking: cancels and removes the pending grace timer
not ok 186 - cleanupRoomTracking: leaves other rooms untouched
```

- [x] **Step 4.2: cleanupRoomTracking in sessions.ts hinzufügen**

Füge am Ende von `brett/src/server/sessions.ts` (nach `checkAllSessions`, Zeile 266) hinzu:

```typescript
/**
 * SEC T000660 bug #3: Räumt beide Server-Maps für einen Room auf, wenn der
 * letzte Spieler den Room verlässt. Cancelt auch einen laufenden Grace-Timer,
 * falls vorhanden. Ohne diesen Aufruf wachsen roomPreviousPlayers und
 * tokenGraceTimers unbegrenzt über die gesamte Prozess-Laufzeit.
 */
export function cleanupRoomTracking(room: string): void {
  roomPreviousPlayers.delete(room);
  if (tokenGraceTimers.has(room)) {
    clearTimeout(tokenGraceTimers.get(room)!);
    tokenGraceTimers.delete(room);
  }
}
```

- [x] **Step 4.3: Tests laufen lassen**

```bash
cd brett && npm test 2>&1 | grep -E "(184|185|186) -"
```
Erwartete Ausgabe:
```
ok 184 - cleanupRoomTracking: clears roomPreviousPlayers for the room
ok 185 - cleanupRoomTracking: cancels and removes the pending grace timer
ok 186 - cleanupRoomTracking: leaves other rooms untouched
```

- [x] **Step 4.4: Commit**

```bash
cd /tmp/wt-brett-security
git add brett/src/server/sessions.ts
git commit -m "fix(brett): add cleanupRoomTracking to prevent server Map leaks (T000660 bug #3)"
```

---

## Task 5: `cleanupRoomTracking` im Last-Leave-Pfad von ws-handler.ts aufrufen

**Files:**
- Modify: `brett/src/server/ws-handler.ts` (~Zeile 569)
- Test: Keine neuen Tests; Task 4 macht die Tests grün. Dieser Schritt sorgt dafür, dass die Funktion auch zur Laufzeit ausgeführt wird.

*Hinweis: Die Tests für `cleanupRoomTracking` rufen die Funktion direkt auf — der ws-handler-Aufruf ist die Produktions-Verdrahtung, kein neuer Testpfad.*

- [x] **Step 5.1: Import in ws-handler.ts ergänzen**

Prüfe die bestehenden `sessions`-Imports in `brett/src/server/ws-handler.ts`:
```bash
grep -n "from.*sessions\|import.*sessions" brett/src/server/ws-handler.ts
```
Die Datei verwendet `deps.trackPlayerInRoom` (über das deps-Objekt). `cleanupRoomTracking` muss ebenfalls über deps injiziert werden — so ist ws-handler.ts testbar ohne sessions-Import. Prüfe, ob `WsDeps` in ws-handler.ts definiert wird:

```bash
grep -n "WsDeps\|type.*Deps\|interface.*Deps" brett/src/server/ws-handler.ts | head -5
```

- [x] **Step 5.2: cleanupRoomTracking zu den Deps hinzufügen**

In `brett/src/server/ws-handler.ts`, im `WsDeps`-Interface (oder dem äquivalenten Typ, der `trackPlayerInRoom` enthält), ergänze:

```typescript
cleanupRoomTracking?: (room: string) => void;
```

*(Optional, damit bestehende Tests ohne Änderung weiterlaufen)*

- [x] **Step 5.3: Aufruf im Last-Leave-Block**

In `brett/src/server/ws-handler.ts` im `close`-Handler (Zeile ~569), direkt nach dem `deps.clearUndoStacks?.(room)`-Aufruf:

```typescript
// T000660 bug #3: Server-Map-Leaks bereinigen (roomPreviousPlayers + tokenGraceTimers)
deps.cleanupRoomTracking?.(room);
```

Der Block sieht dann so aus:
```typescript
if (!deps.rooms.has(room)) {
  deps.figureMaps.delete(room);
  deps.clearUndoStacks?.(room);  // T000470: Stacks beim Last-Leave bereinigen
  deps.cleanupRoomTracking?.(room);  // T000660: Server-Map-Leaks bereinigen
}
```

- [x] **Step 5.4: Dependency-Injection in index.ts verdrahten**

In `brett/src/server/index.ts`, suche den `wsDeps`-Block (Zeile ~429) und ergänze `cleanupRoomTracking`:

```bash
grep -n "wsDeps\|clearUndoStacks\|trackPlayerInRoom" brett/src/server/index.ts | head -10
```

Dann ergänze in dem `wsDeps`-Objekt:
```typescript
cleanupRoomTracking: sessions.cleanupRoomTracking,
```

*(Direkt neben `trackPlayerInRoom` oder `clearUndoStacks` einfügen, damit die Struktur konsistent bleibt.)*

- [x] **Step 5.5: TypeScript-Check**

```bash
cd brett && npx tsc --noEmit -p tsconfig.server.json
```
Erwartete Ausgabe: keine Fehler.

- [x] **Step 5.6: Alle Tests laufen lassen (Smoke)**

```bash
cd brett && npm test 2>&1 | tail -10
```
Erwartete Ausgabe: `# fail 4` (nur noch die 4 mannequin-dispose-Tests offen).

- [x] **Step 5.7: Commit**

```bash
cd /tmp/wt-brett-security
git add brett/src/server/ws-handler.ts brett/src/server/index.ts
git commit -m "fix(brett): wire cleanupRoomTracking at last-leave in ws-handler (T000660 bug #3)"
```

---

## Task 6: `disposeMannequin` in mannequin.ts implementieren

**Files:**
- Modify: `brett/src/client/mannequin.ts` (neue Export-Funktion am Ende)
- Test: `brett/test/mannequin-dispose.test.ts` (Tests 238–239)

- [x] **Step 6.1: Failing-Tests bestätigen**

```bash
cd brett && npm test 2>&1 | grep -E "^not ok (238|239)"
```
Erwartete Ausgabe:
```
not ok 238 - disposeMannequin: is exported and is a function
not ok 239 - disposeMannequin: disposes geometries, materials and textures under fig.root
```

- [x] **Step 6.2: disposeMannequin in mannequin.ts ergänzen**

Füge am Ende von `brett/src/client/mannequin.ts` hinzu (kein neuer Import nötig — THREE ist bereits importiert):

```typescript
/**
 * SEC T000660 bug #4: three.js GPU-Memory-Leak beim Figure-Remove.
 * Traversiert fig.root (THREE.Group) und ruft dispose() auf jede
 * BufferGeometry, jedes Material und jede Textur (material.map) auf.
 * Muss an BEIDEN scene.remove()-Stellen in ws-client.ts aufgerufen werden:
 * - Snapshot-Reset (~Z.226): for (const f of STATE.figures) { disposeMannequin(f); ... }
 * - delete-Handler (~Z.419): disposeMannequin(STATE.figures[idx]); getScene().scene.remove(...)
 */
export function disposeMannequin(fig: { root: THREE.Object3D }): void {
  fig.root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.geometry) {
      mesh.geometry.dispose();
    }
    if (mesh.material) {
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mat of mats) {
        if ((mat as any).map) {
          (mat as any).map.dispose();
        }
        mat.dispose();
      }
    }
  });
}
```

*Erklärung: `traverse` besucht den Knoten selbst und alle Nachkommen (Meshes, Sprites, Groups). Sprites haben eine `material`-Property (SpriteMaterial), deren `.map`-Textur ebenfalls disposed werden muss. Groups haben keine Geometrie/Material, `traverse` überspringt sie implizit durch die `if`-Guards.*

- [x] **Step 6.3: Tests laufen lassen**

```bash
cd brett && npm test 2>&1 | grep -E "(238|239) -"
```
Erwartete Ausgabe:
```
ok 238 - disposeMannequin: is exported and is a function
ok 239 - disposeMannequin: disposes geometries, materials and textures under fig.root
```

- [x] **Step 6.4: TypeScript-Check (Client)**

```bash
cd brett && npx tsc --noEmit -p tsconfig.json 2>/dev/null || npx tsc --noEmit
```
*(Brett hat möglicherweise ein gemeinsames tsconfig.json — prüfe mit `ls brett/tsconfig*.json`)*

- [x] **Step 6.5: Commit**

```bash
cd /tmp/wt-brett-security
git add brett/src/client/mannequin.ts
git commit -m "fix(brett): add disposeMannequin to prevent three.js GPU leaks (T000660 bug #4)"
```

---

## Task 7: `disposeMannequin` in ws-client.ts an beiden Call-Sites verdrahten

**Files:**
- Modify: `brett/src/client/ws-client.ts` (~Zeile 227, ~Zeile 419)
- Test: Tests 238–239 bereits grün; dieser Schritt ist die Produktions-Verdrahtung.

- [x] **Step 7.1: Import prüfen**

```bash
grep -n "import.*mannequin\|from.*mannequin" brett/src/client/ws-client.ts
```
Erwartete Ausgabe:
```
6:import * as mannequin from './mannequin';
```
`mannequin.disposeMannequin` ist damit bereits erreichbar — kein neuer Import nötig.

- [x] **Step 7.2: Snapshot-Reset-Pfad (~Zeile 226)**

Suche den Block:
```typescript
for (const f of STATE.figures) {
  sceneForSnapshot?.scene.remove(f.root);
}
STATE.figures.length = 0;
```

Ändere zu:
```typescript
for (const f of STATE.figures) {
  mannequin.disposeMannequin(f);
  sceneForSnapshot?.scene.remove(f.root);
}
STATE.figures.length = 0;
```

- [x] **Step 7.3: delete-Handler (~Zeile 419)**

Suche den Block:
```typescript
try { getScene().scene.remove(STATE.figures[idx].root); } catch { /* pre-scene */ }
```

Ändere zu:
```typescript
try {
  mannequin.disposeMannequin(STATE.figures[idx]);
  getScene().scene.remove(STATE.figures[idx].root);
} catch { /* pre-scene */ }
```

- [x] **Step 7.4: TypeScript-Check (Client)**

```bash
cd brett && npx tsc --noEmit -p tsconfig.json 2>/dev/null || npx tsc --noEmit
```
Erwartete Ausgabe: keine Fehler.

- [x] **Step 7.5: Alle Tests — finales Grün**

```bash
cd brett && npm test 2>&1 | tail -10
```
Erwartete Ausgabe:
```
# tests 519
# suites 8
# pass 519
# fail 0
```

- [x] **Step 7.6: TypeScript-Checks beider Configs**

```bash
cd brett && npx tsc --noEmit -p tsconfig.server.json && echo "SERVER OK"
cd brett && npx tsc --noEmit && echo "CLIENT OK"
```
Erwartete Ausgabe: `SERVER OK` und `CLIENT OK` (keine Fehler).

- [x] **Step 7.7: Commit**

```bash
cd /tmp/wt-brett-security
git add brett/src/client/ws-client.ts
git commit -m "fix(brett): call disposeMannequin at both scene.remove sites in ws-client (T000660 bug #4)"
```

---

## Selbst-Review (Spec-Coverage-Check)

| Bug | Spec-Anforderung | Tasks |
|---|---|---|
| #1 Open Redirect: `returnTo` ungeprüft in `/auth/callback:118` | `sanitizeReturnTo` implementiert + verdrahtet in callback + login-Route | Task 1, Task 3.2 |
| #1 Optional: `/auth/login` ebenfalls sanitizen | `returnTo` in login (Z.102) ist nur Weiterleitung, nicht Callback — kein Risiko; Sanitizing im Callback ist der korrekte Fix | Kein weiterer Task nötig |
| #2 Fehlende Auth-Gates | `requireSession` auf GET /api/state, GET /api/snapshots/:id, POST /api/snapshots | Task 2, Task 3.3–3.6 |
| #3 Server-Map-Leaks | `cleanupRoomTracking` + Aufruf am Last-Leave-Pfad | Task 4, Task 5 |
| #4 three.js dispose-Leak | `disposeMannequin` + beide Call-Sites in ws-client.ts | Task 6, Task 7 |
| 13 rote Tests | Tests 64–68, 184–186, 238–239, 433–435 | Tasks 1–7 |
| TypeScript-Gate | `npx tsc --noEmit` Server + Client nach jeder Änderung | Tasks 3.8, 5.5, 6.4, 7.6 |
| Merge-Konflikt-Hinweis T000608 | Dokumentiert in Task 3, Hinweisblock | Task 3 |

**Placeholder-Scan:** Keine "TBD", "TODO" oder Code-losen Schritte vorhanden. Alle Code-Snippets sind vollständig.

**Typ-Konsistenz:**
- `sanitizeReturnTo(raw: any): string` → in Task 1 definiert, in Task 3.2 via `auth.sanitizeReturnTo(...)` aufgerufen ✓
- `requireSession(req, res, next)` → in Task 2 definiert, in Tasks 3.3–3.6 via `auth.requireSession` aufgerufen, in Task 3.6 re-exportiert ✓
- `cleanupRoomTracking(room: string): void` → in Task 4 definiert, in Task 5.3 via `deps.cleanupRoomTracking?.(room)` aufgerufen ✓
- `disposeMannequin(fig: { root: THREE.Object3D }): void` → in Task 6 definiert, in Task 7.2–7.3 via `mannequin.disposeMannequin(f)` aufgerufen ✓

# Brett: Board als Link teilen (öffentlich, View-only) — Design-Spec

**Ticket:** T000608  
**Branch:** feature/T000608-brett-share-link  
**Datum:** 2026-06-11  
**Status:** draft  

---

## Ziel

Ein Systembrett-Board soll per URL-Link mit Dritten geteilt werden können, ohne dass diese einen Keycloak-Account benötigen. Der Empfänger kann das Board live im Browser beobachten (Echtzeit-WebSocket-Stream), aber keinerlei Änderungen vornehmen. Der Link kann vom Ersteller jederzeit deaktiviert werden.

---

## Entscheidungen (autonom getroffen, mit Begründung)

### E1 — Dedizierte `/share/:token` Route statt `boardAuthRedirect`-Patch

**Entschieden:** Eigene Express-Route `/share/:token` und eigene `share.html` + `share.ts` als zweiter Vite-Einstiegspunkt.

**Begründung:** `boardAuthRedirect` ist eine synchrone Funktion, die den OIDC-Flow aktiviert. Dort einen async DB-Lookup einzubauen würde alle anderen Call-Sites mitziehen. Eine separate Route vermeidet jeden Kontakt mit dem Keycloak-Flow auf der Empfängerseite. Die separate HTML-Seite hat ein kleineres Bundle (kein Admin-Panel, kein Login-Button, kein Session-Management).

### E2 — Neue WS-Rolle: `gast` (unterhalb `beobachter`)

**Entschieden:** Neue Rolle `'gast'` in `Role`-Union und `canMutate()`. `gast` darf gar keine WS-Mutation senden — nicht einmal `figure_possess`/`figure_release`. Nur `request_state_snapshot` passiert durch.

**Begründung:** `beobachter` kann Figuren besitzen (§4.1 Matrix). Ein öffentlicher Beobachter ohne Account soll das Board nur *lesen*, nicht interagieren. Neues Kürzel `'gast'` statt Flag auf WS-Objekt, weil `canMutate` ein reines Rollenmodell hat — das sauberste Extension-Point.

### E3 — Token-Speicherung in PostgreSQL

**Entschieden:** Neue Tabelle `brett_share_tokens` via Migration `003_share_tokens.sql`.

**Begründung:** Share-Links müssen Server-Restarts überleben. In-Memory wie `sessions.ts`-State wäre hier falsch.

### E4 — Token-Generierung: `nanoid(24)` (URL-safe, kryptografisch sicher)

**Entschieden:** `nanoid` aus `nanoid/non-secure` wird NICHT verwendet — `crypto.randomBytes(18).toString('base64url')` (Node built-in, 144 Bit Entropie, kein neues Dependency).

**Begründung:** Brett hat kein `nanoid`-Dependency. `crypto` ist bereits Teil von Node. 144 Bit reicht für kollisionsfreie URL-Tokens.

### E5 — Share-Button im Board-UI: nur für `leiter` sichtbar

**Entschieden:** Im Board-TopBar (neben dem bestehenden Session-Code-Toast) erscheint ein "Teilen"-Icon-Button. Sichtbar nur wenn `role === 'leiter'` oder `isAdmin`.

**Begründung:** Nur der Board-Leiter soll Zugang zu Public-Links haben. Minimal-invasiv ins bestehende UI.

### E6 — Deaktivierung per `disabled_at`-Timestamp

**Entschieden:** Kein Löschen aus der DB — `disabled_at TIMESTAMPTZ` wird gesetzt. Deaktivierte Tokens liefern 404/403 auf der Share-Route. Neue Links können jederzeit neu erstellt werden.

**Begründung:** Audit-Spur bleibt erhalten. Einfache Implementierung.

### E7 — Kein Ablauf-Datum in Phase 1

**Entschieden:** `expires_at`-Spalte wird in der Migration angelegt (NULL = kein Ablauf), aber in Phase 1 nicht aktiv genutzt. Hook für spätere Erweiterung.

---

## Architektur-Übersicht

```
Browser (kein Account)
  → GET /share/<token>                (brett/server — neue unauthentifizierte Route)
  → Lookup brett_share_tokens         (DB, Token valid?)
  → serve share.html                  (eigenständige Seite, kein boardAuthRedirect)
  → share.ts                          (Client: fetch /api/share/<token>, dann WS /sync?room=<roomToken>&share_token=<token>)
  → WS-Server: verifyClient + connection handler
      - share_token im URL? → DB-Lookup → ws._guestToken = token, ws._shareRoom = roomToken
      - resolveRole → 'gast' (kein _session.userId)
      - canMutate('gast', *) → nur request_state_snapshot = true
  → Echtzeit-Broadcast empfangen (read-only)

Leiter (eingeloggt)
  → POST /api/rooms/:roomToken/share  (requireLeiterOrAdmin Middleware)
      → insert brett_share_tokens → return {token, url}
  → GET /api/rooms/:roomToken/shares  (requireLeiterOrAdmin) → list active tokens
  → DELETE /api/rooms/:roomToken/share/:token (requireLeiterOrAdmin) → set disabled_at
```

---

## Datenbank

### Migration `003_share_tokens.sql`

```sql
-- brett/src/server/migrations/003_share_tokens.sql
-- Migration: Share-Token-Tabelle für öffentliche View-only-Links (T000608).

CREATE TABLE IF NOT EXISTS brett_share_tokens (
  token        TEXT         PRIMARY KEY,
  room_token   TEXT         NOT NULL,
  created_by   TEXT,                          -- userId des Erstellers (NULL = admin-tool)
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  disabled_at  TIMESTAMPTZ,                   -- NULL = aktiv; gesetzt = deaktiviert
  expires_at   TIMESTAMPTZ                    -- NULL = kein Ablauf (Phase 1 ungenutzt)
);

CREATE INDEX IF NOT EXISTS idx_share_tokens_room
  ON brett_share_tokens (room_token)
  WHERE disabled_at IS NULL;
```

### Lookup-Query (Validity-Check)

```sql
SELECT token, room_token
FROM brett_share_tokens
WHERE token = $1
  AND disabled_at IS NULL
  AND (expires_at IS NULL OR expires_at > now());
```

---

## Server: Neue Dateien und Änderungen

### `src/server/db.ts` — zwei neue Funktionen

```ts
// Token erzeugen und speichern
export async function createShareToken(roomToken: string, createdBy?: string): Promise<string> {
  const token = crypto.randomBytes(18).toString('base64url');
  await pool.query(
    `INSERT INTO brett_share_tokens (token, room_token, created_by) VALUES ($1, $2, $3)`,
    [token, roomToken, createdBy ?? null]
  );
  return token;
}

// Token validieren → roomToken oder null
export async function resolveShareToken(token: string): Promise<string | null> {
  const { rows } = await pool.query<{ room_token: string }>(
    `SELECT room_token FROM brett_share_tokens
     WHERE token = $1 AND disabled_at IS NULL AND (expires_at IS NULL OR expires_at > now())`,
    [token]
  );
  return rows[0]?.room_token ?? null;
}

// Token deaktivieren
export async function disableShareToken(token: string, roomToken: string): Promise<boolean> {
  const { rowCount } = await pool.query(
    `UPDATE brett_share_tokens SET disabled_at = now()
     WHERE token = $1 AND room_token = $2 AND disabled_at IS NULL`,
    [token, roomToken]
  );
  return (rowCount ?? 0) > 0;
}

// Aktive Tokens für ein Board auflisten
export async function listShareTokens(roomToken: string): Promise<{ token: string; created_at: Date; created_by: string | null }[]> {
  const { rows } = await pool.query(
    `SELECT token, created_at, created_by FROM brett_share_tokens
     WHERE room_token = $1 AND disabled_at IS NULL ORDER BY created_at DESC`,
    [roomToken]
  );
  return rows;
}
```

### `src/server/index.ts` — neue HTTP-Routen

```ts
// Öffentliche Share-Seite (kein boardAuthRedirect)
app.get('/share/:token', async (req, res) => {
  const roomToken = await resolveShareToken(req.params.token);
  if (!roomToken) return res.status(404).send('Link ungültig oder deaktiviert.');
  res.sendFile(path.join(publicDir, 'share.html'));
});

// API: Share-Token validieren (für Client-Bootstrap)
app.get('/api/share/:token', async (req, res) => {
  const roomToken = await resolveShareToken(req.params.token);
  if (!roomToken) return res.status(404).json({ error: 'invalid_token' });
  res.json({ valid: true, roomToken });
});

// API: Share-Token erzeugen (Leiter/Admin only)
app.post('/api/rooms/:roomToken/share', requireLeiterOrAdmin, async (req, res) => {
  const { roomToken } = req.params;
  const userId = (req as any).session?.userId;
  const token = await createShareToken(roomToken, userId);
  const baseUrl = process.env.BRETT_PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
  res.json({ token, url: `${baseUrl}/share/${token}` });
});

// API: Tokens auflisten
app.get('/api/rooms/:roomToken/shares', requireLeiterOrAdmin, async (req, res) => {
  const tokens = await listShareTokens(req.params.roomToken);
  res.json({ tokens });
});

// API: Token deaktivieren
app.delete('/api/rooms/:roomToken/share/:token', requireLeiterOrAdmin, async (req, res) => {
  const ok = await disableShareToken(req.params.token, req.params.roomToken);
  if (!ok) return res.status(404).json({ error: 'not_found' });
  res.json({ disabled: true });
});
```

### `requireLeiterOrAdmin` — neue Middleware (`src/server/auth.ts`)

```ts
export function requireLeiterOrAdmin(req: Request, res: Response, next: NextFunction): void {
  const session = (req as any).session;
  if (session?.isAdmin) return next();
  // Für Leiter: check ob Session-User 'leiter'-Rolle im angegebenen Room hat.
  // Die Raum-Rollen liegen in rooms.ts (in-memory). roomToken aus Params.
  const roomToken = (req as any).params?.roomToken;
  if (roomToken && session?.userId) {
    const roles = getRoles(roomToken); // importiert aus rooms.ts
    if (roles?.[session.userId] === 'leiter') return next();
  }
  // E2E-Bypass
  const e2eSecret = process.env.BRETT_OIDC_SECRET;
  if (e2eSecret && req.header('x-e2e-secret') === e2eSecret) return next();
  res.status(403).json({ error: 'forbidden' });
}
```

### `src/types/state.ts` — `gast` zur Role-Union

```ts
// Vorher: export type Role = 'leiter' | 'stellvertreter' | 'beobachter';
export type Role = 'leiter' | 'stellvertreter' | 'beobachter' | 'gast';
```

### `src/server/permissions.ts` — `gast`-Zweig in `canMutate`

```ts
// Nach dem beobachter-Block:
if (ctx.role === 'gast') {
  // Gäste (public share-link viewers) sind vollständig read-only.
  // request_state_snapshot ist bereits oben handled (return true für alle).
  return false;
}
```

### `src/server/ws-handler.ts` — Share-Token-Erkennung

Im `connection`-Handler, direkt nach `sessionMiddleware`-Aufruf:

```ts
// Share-Token aus WS URL lesen
const wsUrl = new URL(req.url!, `http://${req.headers.host}`);
const shareToken = wsUrl.searchParams.get('share_token');
if (shareToken) {
  const roomToken = await resolveShareToken(shareToken);
  if (!roomToken) { ws.close(4403, 'invalid_share_token'); return; }
  ws._shareRoom = roomToken;
  ws._isGuest = true;
}
```

In `resolveRole` (Modifikation in `permissions.ts`):

```ts
export function resolveRole(ws: any, roles: Record<string, Role>): Role {
  if (ws?._isGuest) return 'gast';
  const uid = ws?._session?.userId;
  if (!uid) return 'beobachter';
  return roles?.[uid] ?? 'beobachter';
}
```

---

## Client: `share.html` + `src/client/share.ts`

### `public/share.html`

Minimales HTML-Skelett (kein Login-Button, kein Admin-Panel, kein Session-Code-Toast):

```html
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Brett – Board ansehen</title>
  <link rel="stylesheet" href="/assets/style.css">
  <!-- Kein Auth-Redirect: Diese Seite benötigt keinen Keycloak-Login -->
</head>
<body>
  <div id="view-only-badge">Nur anzeigen</div>
  <div id="canvas-container"></div>
  <div id="share-status"></div>
  <script type="module" src="/assets/share.js"></script>
</body>
</html>
```

### `src/client/share.ts` — Client-Bootstrap

```ts
// 1. Share-Token aus URL-Pfad extrahieren (/share/<token>)
const token = location.pathname.split('/').at(-1)!;

// 2. Token validieren und roomToken abholen
const resp = await fetch(`/api/share/${token}`);
if (!resp.ok) {
  document.getElementById('share-status')!.textContent = 'Dieser Link ist nicht mehr gültig.';
  throw new Error('invalid share token');
}
const { roomToken } = await resp.json();

// 3. Three.js-Szene initialisieren (read-only, kein UI-Chrome)
initScene(document.getElementById('canvas-container')!);

// 4. WebSocket verbinden mit share_token im Query-String
const ws = new WebSocket(`${location.origin.replace('http', 'ws')}/sync?room=${roomToken}&share_token=${token}`);
ws.onmessage = (e) => handleServerMessage(JSON.parse(e.data)); // existing scene handler
```

Die Funktionen `initScene` und `handleServerMessage` werden aus dem bestehenden Client-Code als gemeinsam genutzte Module (`src/client/scene.ts`, `src/client/state-handler.ts`) herausgezogen, damit sie sowohl von `main.ts` als auch von `share.ts` importiert werden können.

### `vite.config.ts` — zweiter Entry Point

```ts
build: {
  rollupOptions: {
    input: {
      main: 'index.html',
      share: 'public/share.html',
    },
  },
},
```

---

## UI: Teilen-Button im Board (für Leiter)

In der TopBar (`app-shell.ts` / entsprechendes HTML-Fragment):

```html
<!-- Nur wenn role === 'leiter' oder isAdmin -->
<button id="share-btn" title="Board teilen" aria-label="Board-Link teilen">
  🔗
</button>
```

Click-Handler:

```ts
shareBtn.addEventListener('click', async () => {
  const resp = await fetch(`/api/rooms/${roomToken}/share`, { method: 'POST' });
  const { url } = await resp.json();
  await navigator.clipboard.writeText(url);
  showToast('Link in Zwischenablage kopiert!');
});
```

Optional: Sekundäre UI zum Auflisten und Deaktivieren aktiver Links (im Admin-Dropdown oder als Modal). Für Phase 1 reicht der Copy-to-Clipboard-Flow.

---

## Tests

### Unit (brett/test/)

- `board-share.test.ts`:
  - `createShareToken` gibt 24-Zeichen URL-sicheren Token zurück
  - `resolveShareToken` gibt roomToken zurück für valides Token
  - `resolveShareToken` gibt null für disabled Token
  - `disableShareToken` setzt disabled_at korrekt

### BATS (tests/unit/)

- `FA-BRT-41`: `GET /share/<valid_token>` → 200 mit `share.html`-Body
- `FA-BRT-42`: `GET /share/<invalid_token>` → 404
- `FA-BRT-43`: `POST /api/rooms/:roomToken/share` ohne Auth → 403
- `FA-BRT-44`: WS-Connect mit gültigem share_token → Verbindung und `snapshot`-Message empfangen
- `FA-BRT-45`: WS-Connect mit gültigem share_token → Schreib-Mutation wird abgelehnt (403/close)

### E2E (Playwright, tests/e2e/)

- `brett-share-link.spec.ts`:
  - Als Leiter Share-Link erstellen → Toast erscheint
  - Link in neuem Tab (nicht eingeloggt) öffnen → Board rendert
  - View-only-Badge sichtbar, kein Edit-Panel
  - Deaktivierter Link → Error-Message

---

## Nicht in Scope (Phase 1)

- Token-Ablauf (`expires_at` in DB vorhanden, aber UI-less)
- Passwort-geschützte Links
- Mehrere aktive Links pro Board verwalten (nur Create+Disable in Phase 1)
- Analytics (wer hat den Link aufgerufen)
- Share-Link-Viewer in der Teilnehmerliste sichtbar machen

---

## Risiken & Mitigation

| Risiko | Mitigation |
|--------|------------|
| Share-Token brute-forceable | 144-Bit Entropie (`crypto.randomBytes(18)`); rate-limit auf `/api/share/:token` via bestehenden Express-Rate-Limiter |
| Gast kann over-the-wire trotzdem Mutationen senden | `canMutate('gast', *)` fail-closed; serverseitig keine Möglichkeit zu umgehen |
| WS connect ohne HTTP-Gate → Board-Token leakbar via share_token | share_token ist öffentlich (im Link); room_token wird serverseitig resolved, nie direkt im URL des Share-Links |
| Vite multi-entry-point bricht Prod-Build | Vite unterstützt mehrere `input`-Einträge nativ; testen via `brett build` vor PR |

---

## Offene Fragen (bereits entschieden — kein User-Input nötig)

Alle oben im E1–E7-Block abgehandelt.

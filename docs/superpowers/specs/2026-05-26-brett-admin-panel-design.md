# Brett Admin Panel — Design Spec

**Branch:** `feature/brett-admin-panel`
**Grilling-Ticket:** T000276 (https://web.mentolder.de/admin/bugs)
**Status:** Approved 2026-05-26 (7 architectural decisions A–G ratified by user)
**Target cluster:** Korczewski (`brett.korczewski.de` prod, `dev.korczewski.de` dev). Mentolder stays on coaching-mode default and is untouched.

---

## 1. Context & Problem

Brett ist Patricks 3D-Systembrett mit zwei Modi: Coaching (Therapie-Tool) und Mayhem (Wave-Survival-Combat). Serverseitig sind alle Admin-WS-Commands implementiert (`brett/server.js:986–1060`), geschützt durch die Keycloak-Realm-Rolle `admin`. **Es fehlt jegliche Client-UI** — Patrick hat noch nie ein Mayhem-Spiel starten können, der Knopf existiert nicht.

Der User hat das gesamte Admin-Panel als React/JSX-Mockup + komplettes Design-System + Screenshots fertig designt (in `assets/grilling-brett-admin-panel/`). Die Arbeit dieses Features ist:

1. Den vor-designten Mockup **1:1** als React+UMD+Babel-Standalone in `brett/public/admin/` droppen
2. Brett serverseitig um eine **Session-Lifecycle-State-Maschine** erweitern (heute fehlt das komplett)
3. 5 neue WS-Commands hinzufügen (`admin_round_stop`, `admin_round_pause`, `admin_session_create`, `admin_handoff_token`) + broadcast (`session_phase_change`)
4. Bestehende vanilla-JS `admin-panel.js` ersetzen
5. Dead-code-Bug an `index.html:1265` (info-case-online-counter) im selben PR fixen

---

## 2. Requirements (from grilling synthesis)

### Funktional

- Admin-Auth via Keycloak-Realm-Rolle `admin` (server-side `requireAdmin` existiert)
- Admin-Badge in allen Spieler-Listen sichtbar (z.B. `ADMIN · paddione`-Chip)
- 4-Phasen-Flow: `login → lobby → setup → live`
- Session = First-Class-Entity mit 6-char Code (Crockford-base32, z.B. `KRB-9A2`)
- Server-side Phasen: `warmup` (setup) → `active` (live) → `paused` → `ended`
- Idle-Timeout: keine aktiven Spieler ODER kein Admin > 2 min → Phase `ended`
- **Setup-Screen mit ausblendbarem Overlay über aktivem Warmup-Spielfeld** (User's Star-Feature)
- Live-Mode: floating Admin-Sidebar (Position: right/left/dock/mobile-BottomSheet), einklappbar, 4 Tabs (MATCH / BOTS / SPIELER / SYSTEM)
- ⌘K Command-Palette (Live-only) für Tastatur-Schnellzugriff
- Admin-Token != Keycloak-Rolle: dynamischer Token pro Session, manueller Handoff via Button
- Reconnect erlaubt während `warmup`, verboten während `active`
- Activity-Log mit Zeitstempel + Akteur
- WS-Wiring: bestehende `admin_mode_set`, `admin_mayhem_toggle`, `admin_bot_spawn`, `admin_bot_despawn`, `admin_round_reset`
- NEU: `admin_round_stop`, `admin_round_pause`, `admin_session_create`, `admin_handoff_token`, broadcast `session_phase_change`, `admin_token_changed`

### Nicht-funktional

- Mobile-Responsive (BottomSheet `<480px`)
- Admin-Aktion-Feedback `<200ms` im UI (Live-RTT-Anzeige im Header)
- Keyboard-navigable (⌘K, M/L/D/T/C/ESC/Tab), ARIA, WCAG-AA-Kontrast
- Brett-Theme: dark-only, Brass+Ink Tokens aus `colors_and_type.css`
- Auf `dev.korczewski.de` in `<5 min` iterierbar via `dev-flow-iterate`
- DE-only (kein i18n)
- DSGVO-konform durch Plattform-Default (keine zusätzliche Härtung)

### Explizit Out-of-Scope für MVP

Coaching-Mode auf Mentolder anfassen · Granulare Rollen (Moderator/SuperAdmin) · Replay/Recording · Spectator-Mode · Audit-Log · Auto-Host-Handoff · **Player-Kick im UI** (server-side bleibt, UI-Wiring später) · **Broadcast-Nachrichten** (später) · Player-/Time-/Score-Limits · Custom Karten-Layouts · i18n DE/EN

### Akzeptanzkriterien

1. paddione meldet sich auf `dev.korczewski.de` an, sieht `ADMIN · paddione`-Chip
2. paddione klickt „Mayhem-Session erstellen" → Setup-Screen mit aktivem Warmup-Spielfeld dahinter; Session-Code angezeigt
3. Setup-Overlay aus-/einblendbar; Spielfeld bedienbar im Hintergrund
4. paddione fügt 3 Bots hinzu, Mode auf LMS, „Spiel starten" → Phase `live`
5. Tina joint via Session-Code → erscheint mit Co-Admin-Badge (readonly)
6. Sidebar im Live-Mode einklappbar zu ⌘K-Pill / Icon
7. ⌘K öffnet Command-Palette
8. Während `active` Phase: Reconnect-Versuch erhält HTTP 409 mit Phase-Body
9. paddione klickt „Handoff" → Tina bekommt Admin-Token, paddione UI wird readonly
10. Session ohne aktive Spieler > 2 min → `ended`
11. Alle Admin-Aktionen-Feedback `<200ms`

---

## 3. Architecture Overview

```
┌──────────────────────────────────── Browser ─────────────────────────────────────┐
│                                                                                  │
│   <head>                                                                         │
│     React 18 UMD + ReactDOM UMD + @babel/standalone   (unpkg.com CDN)            │
│                                                                                  │
│   <body>                                                                         │
│     <canvas>  Three.js Brett Szene  (existing, untouched)                        │
│     <div id="admin-root"></div>     ← React mount point (admin only, isAdmin)    │
│     <div id="ap-tab">...</div>      ← legacy slide-in tab — REMOVED              │
│                                                                                  │
│     adminBootstrap() IIFE  → fetch('/auth/me') → if isAdmin →                    │
│       window.AdminPanel.mount({ sendFn, room, ... })  ← React app boots here     │
│                                                                                  │
│   WS: ws://.../sync?room=<token>                                                 │
│     ─→ session_phase_change, admin_token_changed, mode_change, hp_update, ...    │
└──────────────────────────────────────────────────────────────────────────────────┘
                                       ▲
                                       │  WebSocket
                                       ▼
┌────────────────────────────────── brett/server.js ──────────────────────────────┐
│                                                                                  │
│  rooms: Map<roomToken, Set<ws>>                                                  │
│  sessionCodeIndex: Map<sessionCode, roomToken>   (NEW)                           │
│                                                                                  │
│  figs (per room):                                                                │
│    'normal figure keys ...'                                                      │
│    __mayhem__               { id: '__mayhem__',  enabled: bool }                 │
│    __game_mode__            { id: '__game_mode__', mode: 'mayhem|lms|...' }      │
│    __session_phase__        { phase: 'warmup|active|paused|ended' }   (NEW)      │
│    __session_code__         { code: 'KRB-9A2' }                       (NEW)     │
│    __admin_token_holder__   { playerId: 'paddione' }                  (NEW)      │
│    __session_created_at__   { ts: ISO }                               (NEW)      │
│    __session_last_activity__ { ts: ISO }                              (NEW)      │
│                                                                                  │
│  Persisted: brett_rooms (room_token, state JSONB, last_modified_at)              │
│             — auto via existing schedulePersist + persistState                   │
│                                                                                  │
│  HTTP /sync upgrade handler:                                                     │
│    pre-handshake check __session_phase__ ── 409 if active+reconnect              │
│                                                                                  │
│  setInterval(60s): checkAllSessions() → idle-timeout backstop                    │
└──────────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Design Decisions

### A — Server-Side Session-State via Sentinel-Keys

State lebt im bestehenden `figs`-Map per Room, analog zu `__mayhem__` und `__game_mode__`. Fünf neue Sentinel-Keys: `__session_phase__`, `__session_code__`, `__admin_token_holder__`, `__session_created_at__`, `__session_last_activity__`. Die `SPECIAL`-Liste in `server.js:708` wird um die fünf Keys erweitert. `lmsAlive` bleibt orthogonal (Game-Mode-spezifisch).

**Rationale:** Null Schema-Migration. Auto-Persist via `schedulePersist`. Pod-Restart-survival kommt umsonst.

### B — Session-Code als parallel Index zu Room-Token

Bestehende `roomToken`-Logik bleibt. Neue in-memory-Map `sessionCodeIndex: Map<sessionCode, roomToken>` mit O(1)-Lookup. Code-Generator: Crockford-base32 ohne `I L O 0 1` → 5 Chars + Dash, z.B. `KRB-9A2`. Bei Kollision: max 3 Retries.

**Bootstrap:** Beim Server-Start lädt `loadAllRoomsFromDB()` die persistierten Rooms; aus `__session_code__` wird `sessionCodeIndex` rebuilt.

**Rationale:** Non-breaking. Bestehende `/brett?room=...` URLs funktionieren weiter.

### C — Admin-Token mit 30s-Grace-Period

`__admin_token_holder__` sentinel-key trägt aktuellen `playerId`. Erst-Joiner mit `isAdmin: true` wird automatisch holder. Manueller Handoff via WS-Message `admin_handoff_token { targetPlayerId }`. Bei Disconnect des Holders: 30s pending, dann released; nächster anwesender Admin wird auto-holder (Safety-Net). Wenn kein anderer Admin da → Session zählt Richtung idle-timeout.

**WS-Broadcast bei Handoff/Release:** `admin_token_changed { holderPlayerId: string|null, reason: 'handoff'|'disconnect-grace-expired'|'auto-claim' }`.

### D — Reconnect-Phase-Enforcement via HTTP 409

Pre-WS-handshake-check im `connectWS`-Handler: lookup `__session_phase__`. Wenn `phase === 'active'` UND der eingehende Client war vorher schon im Room: HTTP 409 mit JSON-Body `{ phase, message }`. Client zeigt Toast „Reconnect nicht möglich während aktiver Runde — warte auf Pause".

**Edge-Case:** Erst-Connect (kein vorheriger Join) während `active` ist auch verboten (Spec: nur warmup erlaubt). Server tracked das via in-memory `roomMeta.previousPlayers: Set<playerId>`. Bei Pod-Restart geht `previousPlayers` verloren → bei Restart während active wird Reconnect erlaubt (akzeptiertes Risiko, da Pod-Restarts selten und Spec dies nicht explizit verbietet).

### E — Hard Replace von admin-panel.js

`brett/public/assets/admin-panel.js` wird gelöscht. JSX-Komponenten aus `assets/grilling-brett-admin-panel/Brett Design System/admin/*.jsx` werden 1:1 nach `brett/public/admin/` kopiert. `brett/public/index.html` bekommt im `<head>`:

```html
<script src="https://unpkg.com/react@18.3.1/umd/react.production.min.js" crossorigin></script>
<script src="https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js" crossorigin></script>
<script src="https://unpkg.com/@babel/standalone@7.29.0/babel.min.js"></script>
```

Im `<body>`, NACH `adminBootstrap`-IIFE:

```html
<div id="admin-root"></div>
<script type="text/babel" src="admin/MayhemScene.jsx"></script>
<script type="text/babel" src="admin/tweaks-panel.jsx"></script>
<script type="text/babel" src="admin/screens-pregame.jsx"></script>
<script type="text/babel" src="admin/screens-setup.jsx"></script>
<script type="text/babel" src="admin/screens-live.jsx"></script>
<script type="text/babel" src="admin/screens-cmdk.jsx"></script>
<script type="text/babel" src="admin/App.jsx"></script>
```

`App.jsx` exportiert `window.AdminPanel = { mount, onMessage, toggle }` so dass die bestehende Bootstrap-Wiring (`index.html:1228`) unverändert weiter funktioniert. Mount-Signature: `mount({ sendFn, room, roomName, joinMode, isAdmin })`.

**MayhemScene.jsx im Prod-Build:** rendert `null`. Die reale Three.js-Scene läuft außerhalb des React-Trees auf dem bestehenden `<canvas>`-Element (z-index unter `admin-root`). React kümmert sich ausschließlich um die Admin-Overlay-Components. Der Mockup-Placeholder bleibt nur im dev-Modus (siehe Tweaks-Panel) zugänglich für visuelle Tests.

**Tweaks-Panel:** sichtbar wenn `?tweaks=1` als URL-Query gesetzt ist. Default in dev + prod: hidden. Implementiert via `const showTweaks = new URLSearchParams(location.search).has('tweaks');` in `App.jsx`.

**Babel-Standalone-Overhead:** ~150KB Download + Compile-on-load (~200-500ms beim ersten Aufruf). Akzeptabel für 2-3 Admin-User. Wenn das später nervt → esbuild-Build-Step als Folge-Chore.

**Dead-Code-Fix:** Im selben PR wird `index.html:1265` korrigiert — das `case 'info':` block muss `STATE.online` vor dem `break` setzen, nicht danach.

### F — Idle-Timeout: Lazy-Eval + 60s-Backstop

Bei jedem eingehenden WS-Message im Room: `__session_last_activity__ = Date.now()`. Direkt vor der Message-Verarbeitung wird geprüft: `if (Date.now() - lastActivity > 120_000) transitionPhase(room, 'ended')`.

Zusätzlich: `setInterval(checkAllSessions, 60_000)` als Backstop für vollständig inaktive Rooms (alle disconnected). Iteriert über alle Rooms und prüft `lastActivity` + `noAdminPresentSince`.

Phase-Transition `→ ended` broadcastet `session_ended { reason: 'idle-timeout' }` und gibt den Room aus dem `rooms`-Map frei (cleanup). DB-State bleibt persistiert für Forensik.

### G — Setup-Overlay-Visibility: Client-only

`setupHidden` lebt nur in React-State (`useState(false)` in `App.jsx`). Kein WS-Sync, kein Server-Change. Non-Admins haben das Overlay gar nicht — sie laufen auf der Three.js-Scene während Warmup wie immer. Co-Admins (readonly) sehen ihre eigene Sidebar-Visibility unabhängig von den anderen.

---

## 5. File-Level Impact

### Neue Dateien

```
brett/public/admin/
├── App.jsx                    ← 1:1 vom User-Mockup
├── MayhemScene.jsx            ← Passthrough zur existing Three.js scene
├── screens-pregame.jsx        ← Login + LobbyHome
├── screens-setup.jsx          ← Setup-Screen mit ausblendbarem Overlay
├── screens-live.jsx           ← Live-Mode Sidebar (MATCH/BOTS/SPIELER/SYSTEM Tabs)
├── screens-cmdk.jsx           ← ⌘K Command-Palette
├── tweaks-panel.jsx           ← Dev-Tweaks (URL-param-gated in prod)
├── admin.css                  ← Vom User-Mockup
└── mayhem.css                 ← Vom User-Mockup
```

### Modifizierte Dateien

- **`brett/public/index.html`**
  - `<head>`: React+ReactDOM+@babel/standalone UMD-Scripts
  - `<body>` Ende: `<div id="admin-root">` + 7 `<script type="text/babel">` für Admin-JSX-Files
  - Entferne `<script src="...admin-panel.js">`
  - Fix `case 'info'` Block (Line 1265): `STATE.online` Update VOR `break;`
- **`brett/server.js`**
  - Erweitere `SPECIAL` Array (L708) um 5 neue Sentinel-Keys
  - Neue Handler in WS-message-switch: `admin_round_stop`, `admin_round_pause`, `admin_session_create`, `admin_handoff_token`
  - `connectWS`/HTTP-upgrade-Handler: pre-handshake-check für `__session_phase__ === 'active'` → HTTP 409
  - Neue Helfer: `generateSessionCode()`, `transitionPhase(room, newPhase)`, `checkAllSessions()`
  - `setInterval(checkAllSessions, 60_000)` beim Server-Start
  - `loadAllRoomsFromDB()`-Hook: `sessionCodeIndex` rebuild aus `__session_code__`
  - In-memory `sessionCodeIndex: Map<string, string>` neben dem bestehenden `rooms`-Map
  - In-memory `roomMeta.previousPlayers: Set<playerId>` Erweiterung (für D)

### Gelöschte Dateien

- `brett/public/assets/admin-panel.js`

### Neue Tests (`brett/test/`)

- `session-state.test.js`: phase-transitions, code-generation-uniqueness, sentinel-key persist+load roundtrip
- `admin-token.test.js`: handoff, 30s-grace-period, auto-claim-by-coadmin
- `reconnect-guard.test.js`: HTTP-409 bei `active`-Phase, reconnect-allowed bei `warmup`
- `idle-timeout.test.js`: lazy-eval-trigger + 60s-backstop-interval

---

## 6. WebSocket Protocol (Neue Messages)

### Client → Server

```ts
| { type: 'admin_session_create' }
  // Returns broadcast 'session_phase_change' + 'admin_token_changed'

| { type: 'admin_handoff_token', targetPlayerId: string }
  // Returns broadcast 'admin_token_changed'

| { type: 'admin_round_stop' }
  // Phase warmup → ended  (or active → ended)

| { type: 'admin_round_pause' }
  // Phase active ↔ paused (toggle)
```

### Server → Client (Broadcasts)

```ts
| { type: 'session_phase_change', phase: 'warmup'|'active'|'paused'|'ended',
    transitionedAt: ISO, reason?: 'admin-start'|'admin-pause'|'admin-stop'|'idle-timeout' }

| { type: 'admin_token_changed', holderPlayerId: string|null,
    reason: 'handoff'|'disconnect-grace-expired'|'auto-claim' }

| { type: 'session_ended', reason: 'admin-stop'|'idle-timeout' }
```

### HTTP Pre-Upgrade Response (NEW)

```http
HTTP/1.1 409 Conflict
Content-Type: application/json

{ "phase": "active", "message": "Reconnect nicht möglich während aktiver Runde" }
```

---

## 7. Testing Strategy

### Unit (brett/test/)

- Sentinel-Key roundtrip: write → schedulePersist → reload from DB → assert state intact
- Code generator: 10k iterations, assert no collision, assert no ambiguous chars (`I/L/O/0/1`)
- Phase transitions: state machine matrix (warmup→active OK, ended→anything = no-op, etc.)
- Admin-token grace: mock setTimeout, fast-forward, assert release

### Integration (manuell via `dev-flow-iterate`)

Nach Deploy auf `dev.korczewski.de`:
1. paddione login, sieht Admin-Badge
2. Session-Create → Setup-Screen, Bot-Add, Mode-Switch, Start → Live-Mode
3. Gekko joint via Code → Co-Admin (readonly)
4. paddione Handoff → gekko bekommt Token
5. paddione disconnect ~31s → token released (mehr als 30s grace)
6. paddione reconnect während active → HTTP 409
7. 2 min Idle → Session ended

### Existing brett tests bleiben grün

`brett/test/server-admin.test.js`, `brett/test/server-mayhem.test.js`, `brett/test/mode-state.test.mjs` etc. — Spec führt KEINE Breaking Changes für die bestehenden Pfade ein (nur Erweiterungen).

---

## 8. Rollout & Deploy

```bash
# Branch: feature/brett-admin-panel
# Implementation: dev-flow-execute pickup
# Verify: tests grün, manueller smoke auf dev.korczewski.de
# Deploy: task feature:brett  (build, push, rollout auf beiden Clustern)
# Verify post-deploy:
#   - mentolder: keine Admin-UI sichtbar (coaching-mode default, kein mayhem)
#   - korczewski: paddione + gekko sehen Admin-UI, alle Akzeptanzkriterien grün
```

---

## 9. Known Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Babel-Standalone load-time auf langsamer Verbindung | medium | low (Admin-only) | Lokal-Cache via CDN-cache-headers; ggf. esbuild-build-step als Folge-Chore |
| Session-Code-Kollision | very low | low | 3-Retry-Logik im Generator |
| Stale `ws._session.isAdmin` bei mid-session Keycloak-Token-Revoke | low | medium | Out-of-MVP. Folge-Chore: periodisches `/auth/me`-Re-Check im Client |
| `previousPlayers`-Map geht bei Pod-Restart verloren → Reconnect während active erlaubt nach Restart | very low | low | Akzeptiert. Pod-Restarts während aktiver Session sind selten genug |
| React+Babel-Standalone CDN-Outage von unpkg.com | low | high (Admin-UI broken) | Folge-Chore: lokal pinen + Subresource-Integrity-Hashes |

---

## 10. Open Questions

Keine. Alle 7 Architektur-Entscheidungen ratified.

---

## 11. Follow-Up Work (NOT in this PR)

Track separat — vom User explizit als out-of-scope für MVP markiert:

1. **Player-Kick UI** (server-side `admin_kick` existiert, UI-Wiring im SPIELER-Tab nachrüsten)
2. **Broadcast-Nachrichten** UI im SYSTEM-Tab
3. **Player-Limit / Time-Limit / Score-Limit** Konfiguration im Setup-Screen
4. **Custom Karten-Layouts / Spawn-Punkte**
5. **Audit-Log** aller Admin-Aktionen (DSGVO)
6. **i18n DE/EN** parallel
7. **dev-flow-plan Skill update** — HTML-Form-Grilling als Default (Memory: `feedback_grilling_html_form.md`)
8. **Brett Design System** als `.claude/skills/brett-design/` integrieren (Mockup ist agent-skill-ready)
9. **esbuild-Build-Pipeline** für JSX statt Babel-Standalone-Runtime (Performance-Optimierung)
10. **CDN-Pin + SRI-Hashes** für React/ReactDOM/Babel-Standalone (Supply-Chain-Härtung)

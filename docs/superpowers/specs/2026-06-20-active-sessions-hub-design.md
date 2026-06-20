---
ticket_id: null
plan_ref: docs/superpowers/plans/2026-06-20-active-sessions-hub.md
status: active
date: 2026-06-20
---

# Spec: Active Sessions Hub — Mediaviewer Panel

## Überblick

Aktive Entwicklungs-Sessions (HTML-Formulare, Brainstorming-Boards, Visual Companion) werden im
Mediaviewer-Panel der Website als anklickbare Karten verlinkt. Externe Nutzer (Gekko) erreichen
Sessions über öffentliche sish-Tunnel mit Keycloak-Gate. Der Hub ersetzt die manuelle
URL-Weitergabe und macht alle laufenden Werkzeuge an einem Ort sichtbar.

## Session-Typen

| Typ | Beschreibung | Beispiel |
|-----|-------------|---------|
| `form` | HTML-Formular via Python HTTP-Server | Feature-Intake, Grilling |
| `brainstorm` | Visual Companion Board | Brainstorming-Session |
| `companion` | Andere visuelle Werkzeuge | Zukünftige Tools |

## Architektur

```
Skill/Script
    ↓
scripts/session-hub.sh register / start-form
    ├── Startet sish-Tunnel: session-<slug>.dev.mentolder.de
    ├── Optional: Python HTTP-Server für HTML-Dateien
    └── Schreibt ~/.local/share/bachelorprojekt/active-sessions.json

Website /api/admin/sessions (GET / POST / DELETE)
    └── Liest / schreibt JSON-Registry

MediaviewerPanel.svelte
    ├── Default (mode=idle): SessionsListView laden
    └── Klick → iframeSrc = public_url, mode='embed'

sish + Traefik HostRegexp + oauth2-proxy
    └── session-*.dev.mentolder.de → Keycloak session-hub-access Gate
```

## Registry-Format

Datei: `~/.local/share/bachelorprojekt/active-sessions.json`

```json
[
  {
    "slug": "feature-intake",
    "type": "form",
    "title": "Feature-Intake 2026-06-20",
    "port": 18099,
    "public_url": "https://session-feature-intake.dev.mentolder.de",
    "local_url": "http://localhost:18099/feature-intake-2026-06-20.html",
    "tunnel_pid": 12345,
    "server_pid": 12346,
    "started_at": "2026-06-20T07:00:00Z"
  }
]
```

## CLI-Interface: scripts/session-hub.sh

```bash
# Formular-Session starten (HTTP-Server + Tunnel + Registry)
session-hub.sh start-form \
  --file /tmp/feature-intake-2026-06-20.html \
  --name "feature-intake"

# Beliebige Session registrieren (Port muss bereits lauschen)
session-hub.sh register \
  --name "brainstorm" \
  --port 8080 \
  --type brainstorm \
  --title "Brainstorm: Active Sessions Hub"

# Liste aller aktiven Sessions
session-hub.sh list

# Session abmelden (Tunnel-PID + HTTP-Server-PID beenden)
session-hub.sh deregister --name "feature-intake"

# Stale PIDs bereinigen (SessionStart-Hook)
session-hub.sh reap
```

**sish-Tunnel intern:**
```bash
ssh -R "session-${SLUG}:80:localhost:${PORT}" \
  tunnel@dev.mentolder.de -p 32222 -N \
  -o StrictHostKeyChecking=no \
  -i ~/.ssh/id_ed25519 &
TUNNEL_PID=$!
```

## Website-Komponenten

### /api/admin/sessions/index.ts (neu)

- `GET /api/admin/sessions` — liest JSON-Registry, gibt Session-Liste zurück
- `POST /api/admin/sessions` — registriert neue Session (Fallback für nicht-Skill-Aufrufe)
- `DELETE /api/admin/sessions?slug=<slug>` — deregistriert Session

Auth-Guard: `isAdmin(session)` (identisch zu anderen Admin-API-Routes).

### SessionsListView.svelte (neu)

Rendert Session-Karten im Idle-State des Mediaviewers:

```
┌─ Aktive Sessions ──────────────────── [↺] ┐
│                                            │
│  📋 Feature-Intake 2026-06-20        [→]  │
│     form · session-feature-intake.de       │
│                                            │
│  🎯 Brainstorm: Active Sessions Hub  [→]  │
│     brainstorm · brainstorm.dev.me...      │
│                                            │
│  (Keine aktiven Sessions)                  │
└────────────────────────────────────────────┘
```

- Polling alle 10s via `setInterval` (kein WebSocket nötig)
- Klick auf `[→]`: dispatcht `mediaviewer:open-session` CustomEvent mit `{url, slug, type}`
- `[↺]` Button: manuelles Refresh

### MediaviewerPanel.svelte (modifiziert)

- Neuer Prop: `defaultView: 'sessions' | 'empty'` (default: `'sessions'`)
- Wenn `mode === 'idle'` und `defaultView === 'sessions'`: `SessionsListView` rendern statt leerem Panel
- Event-Listener auf `mediaviewer:open-session` → setzt `iframeSrc`, wechselt zu `mode: 'embed'`

## Keycloak & oauth2-proxy

### Keycloak-Realm-Änderungen (`k3d/realm-workspace-dev.json`)

- Neue Gruppe: `/session-hub-access`, Mitglieder: `paddione`, `gekko`
- Neuer Client: `session-hub` (confidential, analog zu `brainstorm`-Client)
  - `redirectUris`: `["https://session-hub.dev.mentolder.de/oauth2/callback"]`
  - `secret`: aus `SESSION_HUB_OIDC_SECRET` (via SealedSecret)

### oauth2-proxy-sessions.yaml (neu, k3d/dev-stack/)

Analog zu `oauth2-proxy-brainstorm.yaml`:
- Client-ID: `session-hub`
- Allowed-Group: `/session-hub-access`
- Cookie-Domain: `.dev.mentolder.de`
- Upstream: sish Service

### Traefik IngressRoute

```yaml
match: "HostRegexp(`^session-[a-z0-9-]+\\.dev\\.mentolder\\.de$`) && PathPrefix(`/`)"
middlewares:
  - oauth2-proxy-session-hub-forwardauth
```

`BRAINSTORM_OIDC_SECRET` → `SESSION_HUB_OIDC_SECRET` (neues SealedSecret-Feld,
`environments/.secrets/mentolder.yaml`).

## Skill-Integration (Hybrid-Registrierung)

### Automatisch (SessionStart-Hook)

`.claude/settings.json`:
```json
{
  "hooks": {
    "SessionStart": [{
      "hooks": [{
        "type": "command",
        "command": "bash scripts/session-hub.sh reap 2>/dev/null || true"
      }]
    }]
  }
}
```

### Skill-seitig (explizit)

`feature-intake` SKILL.md — nach HTTP-Server-Start:
```bash
bash scripts/session-hub.sh start-form \
  --file "$HTML_FILE" --name "feature-intake"
```

`brainstorm-tunnel-setup.md` — nach `task brainstorm:publish`:
```bash
bash scripts/session-hub.sh register \
  --name "brainstorm" --port "$PORT" --type brainstorm \
  --title "Brainstorm: $(date +%F)"
```

## Nicht im Scope dieser PR

- Prod-Deployment (fleet/mentolder) des oauth2-proxy für Sessions — separates Ticket
- WebSocket-Push-Notifications bei neuen Sessions (Polling reicht für MVP)
- Session-Sharing zwischen mehreren lokalen Rechnern
- `/admin/sessions` Vollseite (der Mediaviewer-Default-View reicht)

## Akzeptanzkriterien

1. `session-hub.sh start-form --file /tmp/foo.html --name test` startet HTTP-Server + sish-Tunnel, Session erscheint in `/api/admin/sessions`
2. Mediaviewer-Panel zeigt im Idle-State die Session-Liste (alle 10s aktualisiert)
3. Klick auf Session öffnet die URL im Mediaviewer-Iframe
4. `https://session-test.dev.mentolder.de` ist für Gekko erreichbar nach Keycloak-Login mit `/session-hub-access`-Gruppe
5. `session-hub.sh reap` bereinigt abgestorbene PIDs aus der Registry
6. `paddione` und `gekko` sind in der Keycloak-Gruppe `session-hub-access`
7. Brainstorming-Skill registriert sich automatisch nach Tunnel-Start

## Betroffene Dateien

**Neu:**
- `scripts/session-hub.sh`
- `website/src/pages/api/admin/sessions/index.ts`
- `website/src/components/SessionsListView.svelte`
- `k3d/dev-stack/oauth2-proxy-sessions.yaml`

**Modifiziert:**
- `website/src/components/MediaviewerPanel.svelte`
- `k3d/realm-workspace-dev.json` (Gruppe `session-hub-access` + Client `session-hub` + Mitglieder)
- `.claude/skills/feature-intake/SKILL.md`
- `.claude/skills/references/brainstorm-tunnel-setup.md`
- `Taskfile.yml` (session:register, session:list, session:deregister Tasks)
- `.claude/settings.json` (SessionStart-Hook)
- `environments/.secrets/mentolder.yaml` (SESSION_HUB_OIDC_SECRET)
- `environments/schema.yaml` (neues env var registrieren)

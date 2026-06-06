# Systembrett — Full-Stack TypeScript Refactor

**Datum:** 2026-06-06
**Ziel:** Vorbereitung des Systembrett-Codes für AI-getriebenen Dev-Flow via Factory — kleinere, fokussierte Module, typsichere WS-Verträge, messbarer Build-Gate

---

## Motivation

`server.js` (1308 Zeilen) und `public/index.html` (1778 Zeilen, inline JS) sind Monolithen. Factory-Agents können keine 1300-Zeilen-Datei in einem Context halten und sicher editieren. Das Refactor schafft:

- Dateien < 300 Zeilen mit einer klar definierten Verantwortlichkeit
- Explizite Import-Graphen statt impliziter globaler Zustand
- Discriminated-Union-Typen für alle WS-Messages → Agent liest `messages.ts`, kennt das Protokoll
- `tsc --noEmit` als CI-Gate: Typ-Fehler brechen den Build, kein manuelles Prüfen nötig

---

## Architektur

### Projektstruktur

```
brett/
├── src/
│   ├── client/
│   │   ├── main.ts           ← Entry point, bootstrappt alles
│   │   ├── scene.ts          ← Three.js Szene, Kamera, Orbit
│   │   ├── mannequin.ts      ← Mannequin-Fabrik, Physik (Verlet, IK, Kollision)
│   │   ├── presets.ts        ← Pose-Presets, applyPreset()
│   │   ├── ws-client.ts      ← WebSocket connect + onMessage-Router
│   │   └── ui/
│   │       ├── fig-panel.ts      ← Figur-Editor-Panel (Farbe, Label, Skala)
│   │       ├── appearance.ts     ← Appearance-Drawer (Skins, Faces, Accessories)
│   │       ├── hud.ts            ← Status-Pill, Topbar-Buttons
│   │       └── persons.ts        ← Named-Persons-Panel
│   ├── server/
│   │   ├── index.ts          ← Express-Setup, HTTP-Routes, WS-Server-Start
│   │   ├── auth.ts           ← OIDC/Keycloak, requireAdmin, boardAuthRedirect
│   │   ├── rooms.ts          ← Room-State, join/leave/broadcast, broadcastInfo
│   │   ├── ws-handler.ts     ← onMessage-Dispatcher (switch über ClientMessage.type)
│   │   ├── figures.ts        ← Figure-Map, Locks (acquire/release), Mutations, applyMutation
│   │   ├── phases.ts         ← Phase-Transitions, VALID_PHASES, TERMINAL_PHASES
│   │   ├── sessions.ts       ← Session-Codes, Admin-Token, Grace-Timeout, Idle-Timeout
│   │   ├── presets.ts        ← Preset CRUD, loadPresets/savePresets, validateAppearance
│   │   └── db.ts             ← PostgreSQL-Client (pg Pool), Queries
│   └── types/
│       ├── messages.ts       ← Alle WS-Message-Typen (Discriminated Union)
│       └── state.ts          ← RoomState, Figure, Participant, Phase
├── public/                   ← Static Assets (Three.js, Texturen, GLTFs, figure-pack)
├── test/                     ← Tests (auf .ts migriert)
├── index.html                ← Shell: nur <script type="module" src="/src/client/main.ts">
├── vite.config.ts
├── tsconfig.json             ← Project References Root
├── tsconfig.client.json
├── tsconfig.server.json
└── package.json
```

---

## Shared Types — das Herzstück

### `src/types/messages.ts`

```typescript
// Client → Server
export type ClientMessage =
  | { type: 'move';           id: string; x: number; z: number; facingY: number }
  | { type: 'jump';           id: string }
  | { type: 'lock';           id: string }
  | { type: 'release';        id: string }
  | { type: 'appearance';     id: string; appearance: FigureAppearance }
  | { type: 'phase';          phase: Phase }
  | { type: 'preset';         id: string; preset: string }
  | { type: 'admin_handoff';  toPlayerId: string }
  | { type: 'session_create' }
  | { type: 'session_join';   code: string };

// Server → Client
export type ServerMessage =
  | { type: 'init';                state: RoomState }
  | { type: 'move';                id: string; x: number; z: number; facingY: number }
  | { type: 'figure_added';        figure: Figure }
  | { type: 'figure_removed';      id: string }
  | { type: 'figure_lock_ok';      id: string; userId: string; name: string; color: string }
  | { type: 'figure_lock_denied';  id: string }
  | { type: 'figure_lock_release'; id: string }
  | { type: 'appearance';          id: string; appearance: FigureAppearance }
  | { type: 'phase_changed';       phase: Phase }
  | { type: 'presence';            participants: Participant[] }
  | { type: 'session_created';     code: string }
  | { type: 'admin_token';         holder: string | null }
  | { type: 'error';               reason: string };
```

### `src/types/state.ts`

```typescript
export type Phase = 'warmup' | 'active' | 'paused' | 'ended';

export interface FigureAppearance {
  color?: string;
  face?: string;
  body?: string;
  accessories?: Record<string, string>;
}

export interface Figure {
  id: string;
  x: number;
  z: number;
  facingY: number;
  label?: string;
  appearance: FigureAppearance;
}

export interface Participant {
  userId: string;
  name: string;
  color: string;
  isAdmin: boolean;
}

export interface RoomState {
  figures: Record<string, Figure>;
  participants: Participant[];
  phase: Phase;
  adminTokenHolder: string | null;
}
```

---

## Build-Konfiguration

### `vite.config.ts`
```typescript
import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  build: { outDir: 'dist/client' },
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
      '/ws':  { target: 'ws://localhost:3000', ws: true },
    },
  },
});
```

### TypeScript — Project References

**`tsconfig.json`** (Root):
```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.client.json" },
    { "path": "./tsconfig.server.json" }
  ]
}
```

**`tsconfig.server.json`**:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "moduleResolution": "node",
    "outDir": "dist/server",
    "rootDir": "src/server",
    "strict": true,
    "composite": true,
    "paths": { "@types/*": ["src/types/*"] }
  },
  "include": ["src/server/**/*", "src/types/**/*"]
}
```

**`tsconfig.client.json`**:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "composite": true,
    "paths": { "@types/*": ["src/types/*"] }
  },
  "include": ["src/client/**/*", "src/types/**/*"]
}
```

### `package.json` scripts
```json
{
  "dev:server": "tsx watch src/server/index.ts",
  "dev:client": "vite",
  "dev":        "concurrently \"npm run dev:server\" \"npm run dev:client\"",
  "build":      "vite build && tsc -p tsconfig.server.json",
  "typecheck":  "tsc --noEmit",
  "test":       "MOCK_DB=true tsx --test test/*.test.ts"
}
```

**Neue Dev-Dependencies:** `vite`, `tsx`, `typescript`, `concurrently`, `@types/node`, `@types/express`, `@types/ws`, `@types/express-session`

---

## Teststrategie

Bestehende ~15 Testdateien werden auf `.ts` migriert. Kein Framework-Wechsel — Node's built-in `--test` Runner läuft direkt mit `tsx`.

**Neue Kategorie: Type-Contract-Tests** (`test/messages.test.ts`):
- Compile-time Exhaustiveness-Checks stellen sicher dass jeder `ServerMessage.type` im Client-Router behandelt wird
- Verhindert dass neue Message-Typen serverseitig hinzugefügt werden ohne Client-Handler

**CI-Gate** (ergänzt in `.github/workflows/ci.yml`):
```yaml
- run: npm run typecheck   # tsc --noEmit
- run: npm test
- run: npm run build
```

Factory-Agents enden jeden Task mit messbarem Ergebnis: `typecheck` grün + Tests grün = Task done.

---

## Migrationsstrategie

Die Migration läuft in 4 sequentiellen Phasen — jede ist ein eigener PR, CI bleibt durchgehend grün.

### Phase 1 — Scaffolding (kein Behavior-Change)
- Dev-Dependencies + tsconfigs + `vite.config.ts` hinzufügen
- `src/types/messages.ts` + `src/types/state.ts` aus bestehendem Code ableiten
- `index.html` und `server.js` bleiben unverändert
- Gate: `tsc --noEmit` grün auf leeren Typen-Dateien

### Phase 2 — Server aufteilen
Extraktion Modul für Modul in dieser Reihenfolge (Abhängigkeiten zuerst):
1. `db.ts` — PostgreSQL-Client, keine Abhängigkeiten
2. `auth.ts` — OIDC, hängt nur an `db.ts`
3. `phases.ts` — reine Logik, keine Abhängigkeiten
4. `figures.ts` — Figure-Map, Locks, Mutations; hängt an `types/`
5. `sessions.ts` — Session-Codes, Admin-Token, Idle-Timeout
6. `rooms.ts` — join/leave/broadcast; hängt an `figures.ts`, `sessions.ts`
7. `ws-handler.ts` — onMessage-Dispatcher; hängt an allen obigen
8. `index.ts` — Express-Setup; importiert alles
9. `server.js` löschen

Gate nach jedem Modul: `tsc --noEmit` + `npm test` grün.

### Phase 3 — Client aufteilen
Extraktion aus `index.html` in dieser Reihenfolge:
1. `scene.ts` — Three.js Renderer, Kamera, Orbit
2. `mannequin.ts` — Mannequin-Fabrik, Physik, IK
3. `presets.ts` — PRESETS-Konstante, applyPreset()
4. `ws-client.ts` — WebSocket connect, onMessage-Router
5. `ui/hud.ts` — Status-Pill, Topbar
6. `ui/fig-panel.ts` — Figur-Editor
7. `ui/appearance.ts` — Appearance-Drawer
8. `ui/persons.ts` — Named-Persons-Panel
9. `main.ts` — bootstrappt alles, `import`et alle obigen
10. `index.html` schrumpft auf Shell

Gate: Vite Dev-Server + Browser Smoke-Test (Board lädt, Figuren bewegen sich).

### Phase 4 — Tests migrieren
- `test/*.test.js` + `*.test.mjs` → `*.test.ts`
- Typen aus `src/types/` einbinden
- Type-Contract-Tests hinzufügen
- `tsc --noEmit` deckt verbleibende Typ-Lücken auf

---

## Modul-Größenbudget

| Datei | Erwartete Zeilenzahl |
|---|---|
| `src/server/ws-handler.ts` | ~200 |
| `src/server/rooms.ts` | ~120 |
| `src/server/figures.ts` | ~150 |
| `src/server/sessions.ts` | ~180 |
| `src/server/auth.ts` | ~120 |
| `src/server/phases.ts` | ~60 |
| `src/server/db.ts` | ~40 |
| `src/client/mannequin.ts` | ~280 |
| `src/client/scene.ts` | ~120 |
| `src/client/ws-client.ts` | ~150 |
| `src/client/ui/*.ts` | je ~80–120 |
| `src/types/messages.ts` | ~50 |
| `src/types/state.ts` | ~40 |

Kein Modul soll 300 Zeilen überschreiten. Bei Überschreitung: weiter aufteilen.

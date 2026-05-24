# Brett Mode Separation Design

**Date:** 2026-05-24  
**Branch:** feature/brett-mode-separation  
**Scope:** Remove AI fill-bots from Mayhem mode; clearly separate Coaching (figure-only) from Mayhem (combat); configure default mode per cluster via env var.

---

## Problem

The Systembrett currently mixes two fundamentally different use cases in a single UI:

1. **Coaching / Systemische Aufstellung** — therapists and coaches place, drag, rotate, and click-to-move figures on a shared board. No combat, no weapons.
2. **Mayhem** — 3D multiplayer combat game (weapons, vehicles, physics). Currently overlaid on top of the coaching board via a toggle button.

Additional issue: Mayhem auto-fills empty player slots with AI bots, making multiplayer unintentional and noisy in single-player sessions.

**Per-cluster intent:**
- `mentolder` → Coaching only (no Mayhem accessible)
- `korczewski` → Both modes, Mayhem pre-selected

---

## Solution Overview

Three independent changes:

1. **Remove AI fill-bots** from Mayhem (co-op wave-bots stay)
2. **Mode-Select driven by server config** — `GET /api/config` returns `{ defaultMode, availableModes }`
3. **`BRETT_DEFAULT_MODE` env var** differentiates clusters at the K8s level

---

## Change 1: Remove AI Fill-Bots

### What changes

In `brett/public/assets/mayhem/mayhem.js`:

| Location | Action |
|---|---|
| Lines 218-220 | Remove fill-bot loop in `start()` |
| Lines 224-248 | Remove `spawnAIBot()` function entirely |
| Lines 538-545 | Remove bot-retire block in `player_join` handler |

### What stays

- `spawnWave()` (lines 251-284) and all co-op wave-bot logic — these are intentional enemies, not fill-bots
- `brett/public/assets/mayhem/ai-bot.js` — still required by `spawnWave()`

### Result

Mayhem starts with only the local player. Additional real players can join up to `MAX_PLAYERS`. No AI fills empty slots.

---

## Change 2: Config API + Bootstrap

### Server (`brett/server.js`)

New env var `BRETT_DEFAULT_MODE` (values: `'coaching'` | `'mayhem'`, default: `'coaching'`).

New endpoint added after `/healthz`:

```js
const BRETT_DEFAULT_MODE = process.env.BRETT_DEFAULT_MODE || 'coaching';
const BRETT_AVAILABLE_MODES = BRETT_DEFAULT_MODE === 'mayhem'
  ? ['coaching', 'mayhem']
  : ['coaching'];

app.get('/api/config', (_req, res) => res.json({
  defaultMode: BRETT_DEFAULT_MODE,
  availableModes: BRETT_AVAILABLE_MODES,
}));
```

No auth required — config is non-sensitive. Error-safe: returns 200 JSON always.

### Client bootstrap (`brett/public/assets/main.js`)

Config is fetched before mode-select is shown. Runs in parallel with existing `/auth/me` fetch (no extra blocking):

```js
const cfg = await fetch('/api/config').then(r => r.json())
  .catch(() => ({ defaultMode: 'coaching', availableModes: ['coaching'] }));
showModeSelect(modeState, cfg);
```

Fail-safe: network error falls back to `coaching`-only.

### `mode-state.mjs`

Add `'mayhem'` to the `VALID` set (currently only `'coaching'` and `'mode-select'`).

---

## Change 3: Mode-Select UI

### `mode-select.mjs`

Signature changes to accept config: `showModeSelect(modeState, cfg)`.

**Single-mode case** (`availableModes: ['coaching']` — mentolder):  
Skip the overlay entirely and auto-enter coaching immediately. No UI shown.

**Multi-mode case** (`availableModes: ['coaching', 'mayhem']` — korczewski):  
Show two cards:

```
┌─────────────────────────────────────────────┐
│        Wähle deinen Modus                   │
│                                             │
│  ┌──────────────────┐  ┌──────────────────┐ │
│  │  Coaching        │  │  🤸 Mayhem  ★   │ │
│  │  Systemische     │  │  3D Kampfmodus   │ │
│  │  Aufstellung     │  │  Waffen · Fahr-  │ │
│  │                  │  │  zeuge           │ │
│  └──────────────────┘  └──────────────────┘ │
│                          ↑ Standard          │
└─────────────────────────────────────────────┘
```

- Mayhem-Karte ist visuell hervorgehoben (farbiger Border, "Standard"-Badge)
- Klick → `modeState.setMode(mode)` → overlay entfernen → `resolve(mode)`
- Wenn `mode === 'mayhem'`: nach resolve wird `Mayhem.setEnabled(true)` in `main.js` aufgerufen

### Mayhem-Button in `index.html`

Der `#mayhem-btn` in der Toolbar wird nach dem Config-Fetch per JS versteckt wenn `availableModes` kein `'mayhem'` enthält:

```js
if (!cfg.availableModes.includes('mayhem')) {
  document.getElementById('mayhem-btn')?.remove();
}
```

Damit ist der Button auf mentolder komplett aus dem DOM entfernt — kein CSS-Hack, kein verstecktes Element.

---

## Change 4: Kubernetes Per-Cluster Config

### Base manifest (`k3d/brett.yaml`)

New env var added to container spec:

```yaml
- name: BRETT_DEFAULT_MODE
  value: "coaching"
```

### korczewski overlay (`prod-korczewski/kustomization.yaml`)

JSON Patch appended to existing brett patch block:

```yaml
- target:
    kind: Deployment
    name: brett
  patch: |-
    - op: add
      path: /spec/template/spec/containers/0/env/-
      value:
        name: BRETT_DEFAULT_MODE
        value: mayhem
```

### mentolder overlay

No change — base default `coaching` applies.

### Dev (k3d)

No change — base default `coaching` applies.

---

## Testing

### Unit tests (`brett/test/`)

New test file `server-config.test.js`:
- `GET /api/config` with `BRETT_DEFAULT_MODE=coaching` → `{ defaultMode: 'coaching', availableModes: ['coaching'] }`
- `GET /api/config` with `BRETT_DEFAULT_MODE=mayhem` → `{ defaultMode: 'mayhem', availableModes: ['coaching', 'mayhem'] }`
- `GET /api/config` with no env var → defaults to coaching

Existing `server-mayhem.test.js`:
- Verify no bots appear in room snapshot after `mayhem_mode` enable (no `bot-` prefixed avatars)

### Manual verification

- Dev: open `http://brett.localhost` → mode-select shows only Coaching → enter coaching → no Mayhem button visible
- Simulate korczewski: set `BRETT_DEFAULT_MODE=mayhem` locally → mode-select shows both cards, Mayhem highlighted → Mayhem auto-starts on select → no fill-bots appear

---

## File Change Summary

| File | Change |
|---|---|
| `brett/public/assets/mayhem/mayhem.js` | Remove fill-bot loop + `spawnAIBot()` + bot-retire |
| `brett/server.js` | Add `BRETT_DEFAULT_MODE` env var + `GET /api/config` |
| `brett/public/assets/main.js` | Fetch `/api/config` before `showModeSelect` |
| `brett/public/assets/mode-state.mjs` | Add `'mayhem'` to VALID set |
| `brett/public/assets/mode-select.mjs` | Accept config param, render conditionally, auto-skip if single mode |
| `brett/public/index.html` | Remove `#mayhem-btn` from DOM if mode not available |
| `k3d/brett.yaml` | Add `BRETT_DEFAULT_MODE: "coaching"` env var |
| `prod-korczewski/kustomization.yaml` | JSON Patch to set `BRETT_DEFAULT_MODE: mayhem` |
| `brett/test/server-config.test.js` | New: config endpoint tests |

---

## Non-Goals

- Restructuring the Mayhem scripts loading in `index.html` (all stay, just unused in coaching)
- Removing `ai-bot.js` (still needed for co-op wave enemies)
- Admin override mechanism for Mayhem on mentolder
- Persisting mode choice across sessions

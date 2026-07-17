---
title: "brett-vollausbau — Implementation Plan"
ticket_id: T001931
domains: [brett]
status: completed
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# brett-vollausbau — Implementation Plan

_Ticket: T001931 · SSOT: `openspec/specs/brett.md` · Design: `docs/superpowers/specs/2026-07-17-brett-vollausbau-design.md`_

Brings the Systembrett from 9 to 18 fully covered functions by implementing decisions E1–E9.
Order is **server-first**: shared types → server gates → server-side hidden filtering (E9,
security-critical) → client rendering/UI. New logic lives in fresh pure modules to protect the
tight `board-boot.ts` budget; wiring into existing files is kept minimal.

## File Structure

Budget notation: `Ist` = current `wc -l`, `Budget` = effective S1 residual (all brett `.ts`
files are non-baselined → limit 600; `.bats` → limit 300; new files start at their full limit;
`brett/public/index.html` is ungated).

### Changed files (existing)

| Path | Ist | Budget |
| ---- | --- | ------ |
| `brett/src/types/state.ts` | 156 | 444 |
| `brett/src/types/messages.ts` | 104 | 496 |
| `brett/src/server/permissions.ts` | 116 | 484 |
| `brett/src/server/ws-handler.ts` | 228 | 372 |
| `brett/src/server/figures.ts` | 445 | 155 |
| `brett/src/server/rooms.ts` | 75 | 525 |
| `brett/src/server/ws-connection.ts` | 400 | 200 |
| `brett/src/client/ws-message-ground.ts` | 48 | 552 |
| `brett/src/client/ground-objects.ts` | 342 | 258 |
| `brett/src/client/mannequin-visuals.ts` | 61 | 539 |
| `brett/src/client/scene.ts` | 218 | 382 |
| `brett/src/client/board-boot.ts` | 504 | 96 |
| `brett/src/client/pov-camera.ts` | 86 | 514 |
| `brett/src/client/ws-client.ts` | 445 | 155 |
| `brett/src/client/touch-handler.ts` | 211 | 389 |
| `brett/src/client/ui/fig-panel.ts` | 187 | 413 |
| `brett/src/client/ui/hud.ts` | 273 | 327 |

Also edited (ungated): `brett/public/index.html` (feature-flag bootstrap), `brett/README.md`
(flag table update).

### New files

```
tests/spec/brett.bats                       # structural gate (BATS, limit 300)
brett/src/server/hidden-filter.ts           # E9 pure per-recipient filter
brett/src/client/i18n.ts                    # E8 t()/setLang()/applyTranslations()
brett/src/client/locales/de.ts              # E8 German dictionary (reference)
brett/src/client/locales/en.ts              # E8 English dictionary
brett/src/client/locales/fr.ts              # E8 French dictionary
brett/src/client/locales/es.ts              # E8 Spanish dictionary
brett/src/client/camera-modes.ts            # E3 2D/3D camera toggle
brett/src/client/view-cone.ts               # E6 viewing-cone mesh
brett/src/client/snapping.ts                # E7 grid snap + alignment guides
brett/src/client/ui/pov-panel.ts            # E5 POV/dialog panel wiring switchPov
brett/src/client/ui/zone-editor.ts          # E1/E2 zone drag + edit popover
brett/test/zone-update.test.ts              # node:test — zone_update permissions
brett/test/hidden-filter.test.ts            # node:test — hidden filtering per role
brett/test/i18n.test.ts                     # node:test — i18n fallback logic
```

Each new module is a **pure module** (no back-import onto server DB/API layers) to keep the
`website`/`e2e` import graphs cycle-free (S2). No brand-domain literals are introduced (S3). No
change touches `website/src`, so the CQ02 `any` budget is unaffected.

---

## Task 1 — BATS structural gate (RED)

**Ziel:** Create the SSOT-slug BATS suite `tests/spec/brett.bats` that asserts the *structure*
this change introduces. Its assertions FAIL on the current branch and turn green as later tasks
land — the plan-lint STRUCT2 failing-test step.

**Dateien:** `tests/spec/brett.bats` (new, limit 300). Template: `tests/spec/software-factory.bats`.

**Schritte:**
1. Add grep/existence `@test` cases (deterministic, offline — no DB), e.g.:
   - `brett/src/server/ws-handler.ts` `ADMIN_TYPES` contains `zone_update` and `figure_hide_set`.
   - `brett/src/types/messages.ts` declares `zone_update` and `figure_hide_set` message variants.
   - `brett/src/types/state.ts` `Figure` interface contains `hidden` and `opacity`; `Zone` contains `variant`.
   - Each of `brett/src/client/locales/{de,en,fr,es}.ts` exists and exports a `default` dictionary; all four have an equal key count (`grep -c ':' `-style structural check on a shared sentinel export).
   - New modules exist and are non-empty: `i18n.ts`, `camera-modes.ts`, `view-cone.ts`, `snapping.ts`, `ui/pov-panel.ts`, `ui/zone-editor.ts`, `server/hidden-filter.ts`.
   - `brett/src/client/i18n.ts` matches `export function t\b` and `export function setLang\b`.
2. Anchor paths via `REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)"` in `setup()`.

**Test:**
```bash
tests/unit/lib/bats-core/bin/bats tests/spec/brett.bats
# expected: FAIL  (red — none of the new symbols/files exist yet)
```

**Akzeptanz:** Suite runs, every new assertion fails for the documented reason; no assertion is
skipped.

---

## Task 2 — Shared types & message union (E1/E2/E9 contracts)

**Ziel:** Land the type surface every later server/client task depends on.

**Dateien:** `brett/src/types/state.ts` (156/444), `brett/src/types/messages.ts` (104/496),
`brett/src/server/permissions.ts` (116/484).

**Schritte:**
1. `state.ts` `Figure`: add `hidden?: boolean` and `opacity?: number` (0.2–1.0). `Zone`: add `variant?: 'filled' | 'frame'`.
2. `messages.ts` `ClientMessage`: add
   `| { type: 'zone_update'; zoneId: string; x?: number; z?: number; width?: number; height?: number; radius?: number; label?: string; opacity?: number; variant?: 'filled' | 'frame' }`
   and `| { type: 'figure_hide_set'; figureId: string; hidden: boolean }`.
   `ServerMessage`: add `| { type: 'zone_updated'; zone: Zone }` and `| { type: 'figure_hidden_changed'; figureId: string; hidden: boolean }`.
3. `permissions.ts` `MutationType`: no change needed — `zone_update`/`figure_hide_set` travel the `ADMIN_TYPES` path (leiter-gated in `ws-connection.ts`), not the `canMutate` relay matrix. Add an inline doc note recording that decision so a later reader does not wire them into `canMutate`.

**Test:** Extend `brett/test/messages.test.ts` exhaustiveness assertions to include the two new
client tags and two new server tags.
```bash
cd brett && MOCK_DB=true npx tsx --test test/messages.test.ts
```

**Akzeptanz:** `tsc` clean; exhaustiveness test green; the `messages`/`state` BATS assertions
from Task 1 now pass.

---

## Task 3 — Server `zone_update` mutation + admin gate (E1)

**Ziel:** Zones become movable/resizable/re-styleable server-side.

**Dateien:** `brett/src/server/figures.ts` (445/155), `brett/src/server/ws-handler.ts` (228/372),
`brett/src/server/ws-connection.ts` (400/200).

**Schritte:**
1. `figures.ts` `applyMutation`: add a `case 'zone_update'` that reads `__zones__`, finds the zone by `msg.zoneId`, and shallow-merges only the defined geometry/`label`/`opacity`/`variant` fields (mirror the existing `zone_create`/`zone_delete` cases; ~14 lines — within budget 155).
2. `ws-handler.ts` `ADMIN_TYPES`: add `'zone_update'` next to `'zone_create', 'zone_delete'`.
3. `ws-connection.ts`: the generic `ADMIN_TYPES` branch already routes to `handleAdminMessage` after the `isKcAdmin || isLeiter` check, so wire `zone_update` into `handleAdminMessage` (in `ws-admin-commands`) to `applyMutation` + `broadcast({type:'zone_updated', zone})` + `schedulePersist`. Keep the connection-file edit to the dispatch line only (budget 200).

**Test (RED → GREEN):** new `brett/test/zone-update.test.ts` asserts: `ADMIN_TYPES` includes `zone_update`; `applyMutation('zone_update', …)` merges supplied fields and leaves others intact; an unknown `zoneId` is a no-op (no phantom zone).
```bash
cd brett && MOCK_DB=true npx tsx --test test/zone-update.test.ts
```

**Akzeptanz:** zone_update round-trips through `buildStateFromMutations`; non-leader path is
denied by the existing admin gate; Task-1 `ADMIN_TYPES` assertion green.

---

## Task 4 — Server hidden state & per-recipient filtering (E9, security-critical)

**Ziel:** `figure_hide_set` toggles `Figure.hidden`; hidden figures are filtered at the
broadcast/snapshot edge per recipient role — no hidden data ever reaches a non-leader.

**Dateien:** `brett/src/server/figures.ts` (445/155), `brett/src/server/ws-handler.ts` (228/372),
`brett/src/server/hidden-filter.ts` (new, 600), `brett/src/server/rooms.ts` (75/525),
`brett/src/server/ws-connection.ts` (400/200).

**Schritte:**
1. `figures.ts` `applyMutation`: add `case 'figure_hide_set'` setting `figure.hidden = !!msg.hidden` when the figure exists (no phantom figure). ~8 lines.
2. `ws-handler.ts` `ADMIN_TYPES`: add `'figure_hide_set'`.
3. New pure `hidden-filter.ts`, no DB import — exports:
   - `isFigureHidden(fig): boolean`.
   - `filterSnapshotFigures(figures, role): Figure[]` — strips `hidden` figures for any role other than `leiter`.
   - `translateBroadcastForRole(msg, role, figureLookup): ServerMessage | null` — for non-leader recipients: a hide-transition (`figure_hidden_changed hidden:true`) becomes `{type:'delete', id}`; a reveal (`hidden:false`) becomes `{type:'add', figure}`; `move`/`update`/`figure_*` targeting a currently-hidden figure returns `null` (suppress); everything else passes through. Leader always gets the raw message.
4. `rooms.ts`: add `broadcastRoleAware(room, msg, resolveRoleForWs, exclude?)` that iterates peers, resolves each peer's role, runs `translateBroadcastForRole`, and sends only non-null results. The plain `broadcast` stays for non-figure traffic. (budget 525 — comfortable.)
5. `ws-connection.ts`: (a) route the `figure_hide_set` admin action and figure mutations that can touch hidden figures through `broadcastRoleAware`; (b) in the join handler, run `filterSnapshotFigures(snaps, recipientRole)` before `ws.send` of the `snapshot`. Keep edits to those two call sites (budget 200).

**Test (RED → GREEN):** new `brett/test/hidden-filter.test.ts` — MOCK_DB, exercises **all five
roles** (`leiter`, `stellvertreter`, `beobachter`, `gast`, `zuschauer`):
- `filterSnapshotFigures` keeps hidden figures only for `leiter`.
- hide-transition → `delete` for each non-leader role; reveal-transition → `add`.
- `move`/`update` on a hidden figure → `null` for non-leaders, pass-through for `leiter`.
```bash
cd brett && MOCK_DB=true npx tsx --test test/hidden-filter.test.ts
```

**Akzeptanz:** every non-leader assertion confirms hidden figure data is absent from both
snapshot and broadcast; leader assertions confirm full visibility; module is import-cycle-free.

---

## Task 5 — i18n core & locale dictionaries (E8)

**Ziel:** Lightweight in-house i18n with real DE/EN/FR/ES dictionaries and deterministic fallback.

**Dateien:** `brett/src/client/i18n.ts` (new, 600), `brett/src/client/locales/de.ts`,
`en.ts`, `fr.ts`, `es.ts` (new, 600 each).

**Schritte:**
1. `de.ts` is the reference dictionary (a flat `Record<string,string>` default export) covering the scoped surface: Hauptmenü, Lobby, Topbar, Fig-Panel, Appearance, HUD badges, Export, POV panel, onboarding core texts. `en.ts`/`fr.ts`/`es.ts` mirror the **same key set** with real translations (correct orthography incl. accents, e.g. `fr` "Créer une session", `es` "Añadir figura").
2. `i18n.ts` exports `t(key: string): string`, `setLang(lang: 'de'|'en'|'fr'|'es'): void`, `applyTranslations(root?: HTMLElement): void` (walks `[data-i18n]` and sets `textContent`), and `initLang()` resolving `localStorage['brett_lang'] → navigator.language prefix → 'de'`, syncing `document.documentElement.lang`. `t` falls back active-lang → `de` → the key string itself.

**Test (RED → GREEN):** new `brett/test/i18n.test.ts` — asserts: all four dictionaries expose an
identical key set; `t('menu.create')` returns the active-lang value; a key missing in `fr` but
present in `de` returns the German value under `fr`; a key absent everywhere returns the key.
```bash
cd brett && MOCK_DB=true npx tsx --test test/i18n.test.ts
```

**Akzeptanz:** parity + fallback tests green; Task-1 locale-parity assertion green.

---

## Task 6 — Zones/frames client & feature-flag default-enable (E1)

**Ziel:** Zones become productive (drag-move, edit popover, frame variant) and the required
dark-launch flags default to on (kill-switch overridable).

**Dateien:** `brett/public/index.html` (ungated), `brett/README.md` (ungated),
`brett/src/client/ws-message-ground.ts` (48/552), `brett/src/client/ground-objects.ts` (342/258),
`brett/src/client/ui/zone-editor.ts` (new, 600).

**Schritte:**
1. `index.html`: add an inline bootstrap `<script>` before `main.ts` that seeds
   `window.__brettFeatures = Object.assign({ 't000468-ground-anchors': true, 'sf-t000465': true, 'sf-t000467': true, 'sf-t000469': true }, window.__brettFeatures || {})` — defaults enabled, any pre-set value (ConfigMap/URL override) wins. Update the `README.md` flag table to record the new defaults.
2. `ws-message-ground.ts`: add a `case 'zone_updated'` mirroring `zone_added` that calls `groundObjects.applyZoneUpdated(msg.zone)` and refreshes the export cache.
3. `ground-objects.ts`: add `applyZoneUpdated(zone)` (dispose + re-add the zone mesh by id) and honour `zone.variant === 'frame'` in `applyZoneAdded` by skipping the filled `Mesh` and drawing only the outline. Add zone drag-move (raycast on the zone group → emit `zone_update`). (budget 258.)
4. New `ui/zone-editor.ts`: an edit popover (size/label/opacity/variant) that sends `zone_update`; mount it from the existing zone toolbar entry point (`initGroundObjectsToolbar`). Keep the heavy popover logic here, not in `ground-objects.ts`.

**Test:** extend the Task-1 BATS with an assertion that `ws-message-ground.ts` handles
`zone_updated`; add a node:test to `brett/test/anchor-zone.test.ts` covering the render-side
`variant:'frame'` branch guard where feasible (DOM-free path). Browser coverage in Task 13.
```bash
tests/unit/lib/bats-core/bin/bats tests/spec/brett.bats
```

**Akzeptanz:** zones drag and re-style live; frame variant shows outline only; flags default on
with override precedence preserved.

---

## Task 7 — Element transparency (E2)

**Ziel:** User-controllable figure opacity and zone opacity.

**Dateien:** `brett/src/client/ui/fig-panel.ts` (187/413),
`brett/src/client/mannequin-visuals.ts` (61/539), `brett/src/client/ui/zone-editor.ts`
(from Task 6).

**Schritte:**
1. `fig-panel.ts`: add an opacity `<input type="range" min="0.2" max="1" step="0.05">` next to the colour swatches; on input, `sendUpdate({ opacity })` (mirror the existing colour/label `sendUpdate` pattern). Clamp to 0.2–1.0.
2. `mannequin-visuals.ts`: when applying a figure's appearance, traverse its materials setting `transparent = true` and `opacity = base × dimFactor`, where `base = fig.opacity ?? 1` and `dimFactor` comes from the existing selection/moderation dim so moderation stays dominant (multiplicative composition).
3. `zone-editor.ts`: the opacity control already emits `zone_update` (Task 6) — verify it drives the zone material opacity end-to-end.

**Test:** node:test in `brett/test/appearance.test.ts` (extend) — an `update` carrying `opacity`
persists onto the figure and clamps out-of-range values.
```bash
cd brett && MOCK_DB=true npx tsx --test test/appearance.test.ts
```

**Akzeptanz:** figure/zone opacity is user-adjustable and composes correctly with dimming.

---

## Task 8 — 2D/3D camera mode toggle (E3)

**Ziel:** Client-local switch between perspective/orbit and top-down orthographic 2D.

**Dateien:** `brett/src/client/camera-modes.ts` (new, 600),
`brett/src/client/scene.ts` (218/382), `brett/src/client/board-boot.ts` (504/96),
`brett/src/client/ui/hud.ts` (273/327).

**Schritte:**
1. New `camera-modes.ts`: owns an `OrthographicCamera` (top-down, rotation locked to Y, zoom via frustum), keeps the perspective camera as the other mode, and exports `getActiveCamera()`, `toggleMode()`, `is2D()`, `onResize(w,h)`. All new logic lives here to protect `board-boot.ts` (budget 96).
2. `scene.ts`: expose the active camera through the scene singleton — `setActiveCamera`/`getActiveCamera` (net-small; budget 382). The orbit writer keeps driving the perspective camera; in 2D the orbit delta is clamped to top-down.
3. `board-boot.ts`: change only the render call and the pick raycaster to source `getActiveCamera()` (token-level replacements of the captured `camera` const → near line-neutral, well inside budget 96). No new logic added here — this is the extraction discipline that keeps board-boot small.
4. `hud.ts`: add a topbar 2D/3D toggle button wired to `camera-modes.toggleMode()`; label via `data-i18n`.

**Test:** extend `brett/test/scene-orbit-api.test.ts` to assert `getActiveCamera()` returns the
orthographic camera after `toggleMode()` and the perspective camera after toggling back.
```bash
cd brett && MOCK_DB=true npx tsx --test test/scene-orbit-api.test.ts
```

**Akzeptanz:** toggling swaps projection; picking/dragging keep working in both modes (browser
proof in Task 13).

---

## Task 9 — Metaposition, POV panel & dialog mode (E4/E5)

**Ziel:** Wire the dormant `switchPov`, add a `meta` bird's-eye mode, and an A/B dialog switch.

**Dateien:** `brett/src/client/pov-camera.ts` (86/514),
`brett/src/client/ui/pov-panel.ts` (new, 600), `brett/src/client/ws-client.ts` (445/155).

**Schritte:**
1. `pov-camera.ts`: add a `PovMode = 'first-person' | 'meta'` and a `setPovMode(mode)`; in `meta`, position the camera ~6 units above and slightly offset from the possessed figure, looking down at it (reuse `_headWorld`/`startPov` plumbing). `switchPov` already exists — keep it as the atomic release+possess entry point.
2. New `ui/pov-panel.ts`: overlay shown while a possession is active — lists the other figures (name/colour), click calls `switchPov(figureId)`; a dialog sub-mode stores partners A/B and a button/hotkey alternates `switchPov(A)`/`switchPov(B)`; includes the inner-view ⇄ meta toggle and a "leave" action. All labels via `data-i18n`.
3. `ws-client.ts`: on the existing `figure_possessed` (own) handler, mount/refresh the POV panel — a one-line call (budget 155, keep minimal).

**Test:** node:test in `brett/test/possession.test.ts` (extend) — assert `switchPov` targets the
new figure id and `setPovMode('meta')` reports meta active. DOM/camera visuals verified in Task 13.
```bash
cd brett && MOCK_DB=true npx tsx --test test/possession.test.ts
```

**Akzeptanz:** clicking a figure in the panel switches the inner view; dialog mode alternates A/B;
meta shows the possessed figure from above.

---

## Task 10 — Viewing-cone indicator (E6)

**Ziel:** Visualise each figure's `facingY` as a flat sector at its base.

**Dateien:** `brett/src/client/view-cone.ts` (new, 600),
`brett/src/client/ws-client.ts` (445/155), `brett/src/client/ui/hud.ts` (273/327).

**Schritte:**
1. New `view-cone.ts`: builds a ~60° `CircleGeometry(thetaLength)` sector mesh (~1.5 radius, figure colour, opacity ~0.25) per figure, oriented to `facingY`; exports `updateCone(figure)`, `removeCone(id)`, `setEnabled(on)`. Client-local, no server state.
2. `ws-client.ts`: call `viewCone.updateCone` on `add`/`move`/`update` (fold into the existing figure-change handlers; keep to a couple of lines, budget 155).
3. `hud.ts`: topbar toggle (default on) wired to `setEnabled`; label via `data-i18n`.

**Test:** Task-1 BATS asserts `view-cone.ts` exists and exports `updateCone`; behavioural check
in Task 13.
```bash
tests/unit/lib/bats-core/bin/bats tests/spec/brett.bats
```

**Akzeptanz:** cones render at figure bases and re-orient on facing change; toggle hides/shows them.

---

## Task 11 — Snapping & alignment guides (E7)

**Ziel:** Magnet-mode grid snap plus temporary axis-alignment guides during drag.

**Dateien:** `brett/src/client/snapping.ts` (new, 600),
`brett/src/client/board-boot.ts` (504/96), `brett/src/client/touch-handler.ts` (211/389).

**Schritte:**
1. New `snapping.ts`: exports `setMagnet(on)`, `snap(pos, others)` returning a snapped `{x,z}` (0.5 grid) and, when `|Δx|` or `|Δz| < 0.2` to another figure, snapping onto that axis and returning guide-line endpoints; plus `showGuide`/`clearGuide` (`THREE.Line`). Pure helpers; all math lives here.
2. `board-boot.ts`: at the drag-apply site, pass the drag position through `snapping.snap(...)` before emitting `move` — a single call substitution (budget 96, no new logic block).
3. `touch-handler.ts`: route the touch drag through the same `snapping.snap` hook so mouse and touch share behaviour (budget 389).

**Test:** node:test in `brett/test/touch-handler.test.ts` (extend) or a new small unit — assert
`snap` rounds to the grid and snaps onto a near axis; guide endpoints are emitted only within
threshold.
```bash
cd brett && MOCK_DB=true npx tsx --test test/touch-handler.test.ts
```

**Akzeptanz:** dragging snaps to grid/axes with magnet on; guides appear/clear correctly; touch
and mouse behave identically.

---

## Task 12 — Hidden-figure client rendering (E9 client) & i18n rollout

**Ziel:** The leader renders hidden figures semi-transparently with a badge and can toggle hide;
apply i18n to the new UI surfaces.

**Dateien:** `brett/src/client/ui/fig-panel.ts` (187/413),
`brett/src/client/mannequin-visuals.ts` (61/539), `brett/src/client/ws-client.ts` (445/155).

**Schritte:**
1. `fig-panel.ts`: add a hide/reveal toggle (leader-only UI) sending `{type:'figure_hide_set', figureId, hidden}`; label via `data-i18n`.
2. `mannequin-visuals.ts`: when `fig.hidden`, render the leader's copy at reduced opacity and attach a distinguishing badge sprite (reuse the appearance-badge plumbing).
3. `ws-client.ts`: handle `figure_hidden_changed` for the leader (update local state + re-render); non-leaders receive translated `add`/`delete` from the server (Task 4), so no special client path is needed for them.
4. Call `i18n.applyTranslations()` after the new panels/menus mount so the E8 layer covers the added controls.

**Test:** Task-1 BATS asserts the `figure_hide_set` client message wiring; the full multi-client
hide/reveal flow is proven in Task 13 (needs two live browsers).
```bash
tests/unit/lib/bats-core/bin/bats tests/spec/brett.bats
```

**Akzeptanz:** leader sees hidden figures dimmed + badged and can hide/reveal; the earlier
server tests guarantee non-leaders never receive them.

---

## Task 13 — Browser verification (all 18 functions, tablet, multi-client)

**Ziel:** Prove the end-to-end behaviour no unit test can — real WebGL, touch, and multiple
concurrently connected clients.

**Dateien:** none (verification only).

**Schritte:**
1. `cd brett && npm run dev`; open the board as leader.
2. Walk **all 18 functions**, capturing that each works: unlimited figures, zones (drag/resize/label/opacity), frame variant, figure/zone transparency, 2D/3D toggle, orbit + first-person + meta, POV panel + dialog A/B, viewing cones, snapping + alignment guides, labels, lock/fix, live colour/shape, presence, undo/redo, export, and covert work.
3. Resize to a **tablet viewport** and confirm touch drag + snapping + 2D toggle behave.
4. Open a **second client** in a non-leader role and confirm: hidden figures are absent for the non-leader; hide→disappear, reveal→reappear; a dialog/presence flow updates both clients. Repeat the covert-work check with a `zuschauer`/share client to confirm read-only clients never receive hidden data.
5. Run three iteration passes, fixing any defect before proceeding.

**Akzeptanz:** every one of the 18 functions demonstrably works on desktop and tablet; the E9
multi-client isolation holds for all non-leader roles.

---

## Task 14 — Final verification & artefacts

**Ziel:** Green CI-equivalent gates and committed generated artefacts.

**Schritte:**
1. Regenerate the test inventory after the test additions and commit it:
```bash
task test:inventory   # updates website/src/data/test-inventory.json — commit it
```
2. Run the three mandatory gates and confirm each passes:
```bash
task test:changed
task freshness:regenerate
task freshness:check
```
3. Confirm the OpenSpec delta validates:
```bash
task test:openspec
```

**Akzeptanz:** `task test:changed` (brett node:test + `tests/spec/brett.bats` + quality) green;
`task freshness:check` green (S1–S4 ratchet, no baseline growth); `test-inventory.json` committed;
OpenSpec validation green.

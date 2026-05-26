---
title: "Brett — First Real Release (R1) — Design Spec"
date: 2026-05-26
status: draft
branch: feature/brett-first-real-release-r1
related_ticket: TBD
brand_targets: [mentolder, korczewski]
---

# Brett — First Real Release (R1)

Polish-pass on the Brett 3D multiplayer FPS arena to make it demo-ready
on both prod clusters within ≤7 days. Driven by Grilling Round 2 — answers
in `assets/new/Grillinganswers.pdf`, design mockups in `assets/new/*.html`.

## 1. Scope

### Confirmed IN
- **Blockers:** pointer-lock reliability, crosshair, gun range tuning.
- **Hit feedback:** hit-flash (red albedo tint), hit-marker SFX wiring,
  kill-confirmed SFX, muzzle flash sprite, projectile tracer.
- **Hero abilities VFX:** Patrick katana trail; Tina Frostnova/Fireball/
  Chainlightning sprite swap; Martina minion mesh+pose; Oskar vehicle
  visual placeholder (decision deferred — see §8).
- **Hero animations:** idle + walk + attack only (hard cut from full
  anim suite due to deadline; Mixamo source via FBX packs in `assets/new/`).
- **Art pass:** ACESFilmic tone-mapping + subtle bloom; PolyHaven HDRI
  skybox; ground retexture; **no shader work** (cut by deadline).
- **Mobile:** wire up the dormant `touch/joystick.mjs` + `touch/touch-hud.mjs`
  modules; haptic feedback; landscape-only smoke test on real device.
- **Modes:** solo / 1v1 duel / FFA reachable from a single build.
- **Deploy:** fan-out to mentolder + korczewski via `task feature:brett`.

### Confirmed OUT
- Anti-grief tooling / onboarding tutorials.
- Shader work in P4 (tone-map+bloom only).
- Full hero anim suite (run/cast/death — only idle/walk/attack ship in R1).

## 2. Release shape (from Grilling Round 2)

| Decision | Answer |
|---|---|
| Q4 Deadline | This week (≤7 days) — hard cuts |
| Q5 Venue | Both prods (mentolder + korczewski) |
| Q6 Match format | All three reachable (solo / 1v1 / FFA) |
| Q7 Hero priority | patrick → tina → oskar → martina |
| Q8 Art direction | Stylized toon |
| Q9 Mobile target | Feels good on mobile (haptic, no FPS dips) |
| Q10 Delivery | 3–4 phased PRs (single plan, multi-phase) |
| Q12 Done | TBD — defaulting to "you-test per hero + Playwright greens" |

## 3. Asset matrix

Legend: ✅ in repo · 🔧 placeholder (P3/P4 source) · 📦 sourced bundle in `assets/new/`

| ID | Asset | Target path | Status |
|---|---|---|---|
| A1 | Crosshair PNG | `brett/public/assets/hud/crosshair.png` | 🔧 ship inline SVG first per mockup, PNG can drop in P4 |
| A2 | Muzzle flash sprites (A·Stern recommended) | `brett/public/assets/sprites/muzzle-flash-{a-stern,b-bloom,c-kreuz}.png` | 🔧 generate procedurally first; CC0 search if recommended A doesn't read at 32px |
| A2 | Bullet tracer | code-only (`THREE.Line` + Additive) | 🔧 implement in P2 |
| A3 | hit-marker.ogg | `brett/public/assets/sfx/hit-marker.ogg` | ✅ exists — but `MayhemAudio.onHit()` dead code, wire in P1 |
| A3 | kill-confirmed.ogg | `brett/public/assets/sfx/kill-confirmed.ogg` | ✅ added in PR #1117 (chore) |
| A4 | Tina particles (vfx-frostnova/fireball/chainlightning.png) | `brett/public/assets/sprites/vfx-*.png` | 🔧 generate via canvas at runtime first; sprite drop in P3 if quality demands |
| A4 | Katana slash ribbon | code-only | 🔧 implement in P3 per `katana-slash-trail.html` recipe |
| A4 | Minion mesh (Martina) | `brett/public/assets/figure-pack/minion.glb` | 🔧 keep procedural mannequin at darker palette in R1; defer GLB |
| A4 | Vehicle (Oskar) | placeholder primitive | 🔧 **deferred** (P3) — keep current BoxGeometry, decide PNG vs GLB after demo |
| A5 | Hero anim source | Mixamo via `assets/new/Animated {Men,Women} Characters - Feb 2019/FBX/` | 📦 needs FBX → GLB conversion + skin upload to `brett/public/assets/skins/<hero>/skin.glb` |
| A6 | Skybox HDRI | `brett/public/assets/sky/arena.hdr` | 🔧 P4: propose 2-3 PolyHaven options, integrate winner |
| A6 | Ground texture | `brett/public/assets/textures/ground-{albedo,normal,rough}.png` | 🔧 P4: propose 2-3 CC0 PBR packs, integrate winner |
| A6 | Tone-map + bloom | code-only EffectComposer | 🔧 P4 |
| A7 | Touch HUD pack | `brett/public/assets/touch/*.png` (joystick base/knob, fire/reload buttons) | 🔧 ship pure CSS first per existing modules; PNG drop only if CSS doesn't read |

`brett/public/assets/sfx/` SFX library is complete after PR #1117 merges
(see CREDITS.md). No new SFX needed for R1 beyond what's there.

## 4. Codebase landmarks

Entry points and integration sites from code-exploration:

### 4.1 Combat
- **Main pipeline:** `brett/public/assets/mayhem/mayhem.js` (1827 lines) —
  central orchestrator. Constructs `WeaponSystem` + `ProjectileManager`
  in `start()` (~L247).
- **Projectiles:** `brett/public/assets/mayhem/projectiles.js`
  - `MAX_LIFETIME_MS=4000` (L8), `GRAVITY=-9.8` (L7) — the actual "range"
    knobs (no `range` parameter exists).
  - Hit detection at L129 → `_sendHit()` → server relay → `applyHitLocally`
    → `processLocalHit()` at `mayhem.js:1048`.
- **Weapons:** `brett/public/assets/mayhem/weapons.js`
  - `_fireSingle()` (L198) applies spread + `onFire` callback.
  - `onFire` registered at `mayhem.js:257` calls `projectileMgr.spawn()`.
- **Hit-marker (dead code today):** `MayhemAudio.onHit()` at
  `brett/public/assets/mayhem/audio.js:95` plays hit-marker + blood-splat
  but is **never invoked**. Wire it from `mayhem.js:1055` (right after
  `effectsMgr.spawnDamageNumber(...)` in `processLocalHit`).

### 4.2 Crosshair + HUD
- **Active crosshair:** `mayhem.js:269–277` — `THREE.RingGeometry` on
  ground plane (world-space, not screen-center). No overlay hiding.
- **Orphaned crosshair:** `combat/combat-hud.mjs:15` — DOM `<div>+</div>`,
  not wired up. Do **not** revive `combat/` modules; extend `mayhem.js`.
- **Aim-state tint hook:** `mayhem.js:1152–1158` (`_aimDir` update tick).

### 4.3 Pointer-lock (Q11 P1 blocker)
- **Two lock targets clashing:**
  - `chase-camera.js:16` — locks `canvas` on canvas click.
  - `mayhem.js:124` — locks `document.documentElement` for spectator fly-cam.
- **Lifecycle bug:** when exiting spectator (`mayhem.js:968`
  `document.exitPointerLock()`), the chase-cam's `_onLockChange` fires
  but `pointerLockElement !== canvas`, so `_locked` stays false →
  mouse-look silently broken until next canvas click.
- **Fix shape:** unify on `canvas` as lock target everywhere (spectator
  uses canvas too), or restore the canvas lock explicitly after exit.
- **Secondary blocker:** any UI overlay (mode select, hero select, duel
  result) that swallows canvas click prevents initial lock — needs
  explicit "click to re-engage" prompt or auto-relock when overlay closes.

### 4.4 Hero ability rendering
- **Per-ability dispatch:** `mayhem.js:447–530` — `onFire` switches on
  `projectileType`.
- **Tina:**
  - Frostnova: `effects.js:189` — `TorusGeometry` ring expand.
  - Fireball: `mkFireballMesh()` `projectiles.js:18` — sphere primitive.
  - Chainlightning: `mkChainMesh()` `projectiles.js:29` — CatmullRom tube.
  - **Sprite-swap pattern:** replace the primitive mesh with
    `THREE.Sprite({ map: tex, blending: THREE.AdditiveBlending, depthWrite: false })`.
    Animation timings from `assets/new/ability-vfx-tina.html`
    (frostnova 1400ms expand, fireball 1500ms travel, chain 1800ms stamp-flicker).
- **Patrick katana:**
  - Blade: `BoxGeometry` at `mannequin.bones.rWrist`, `player-avatar.js:429–437`.
  - Melee check: `projectiles.js:154` `_doMeleeCheck()`.
  - **Ribbon trail hook:** spawn `BufferGeometry` ring-buffer in
    `_doMeleeCheck()`; sample blade tip via `bones.rWrist.getWorldPosition()`.
    Full recipe in `assets/new/katana-slash-trail.html` (vertex-colored alpha,
    head→tail color lerp, ease-out fade pow 1.6).
- **Martina minion:**
  - Factory: `minionMeshFactory` lambda at `mayhem.js:535` calls
    `makeMannequin()` (procedural primitive).
  - **R1 approach:** keep procedural, recolor via
    `MeshLambertMaterial` darken pass — blood-deep body
    (`#5a1a14`), skin-deep head (`#8a6258`), brass-mute trim
    (`#695a3a`), joint factor 0.55 (per `minion-martina.html` recipe).
    Add subtle hunch via torso.rotation.x = 0.18, head.position.z = 0.10.
  - GLB swap deferred (would require async load + temp placeholder).
- **Oskar vehicle:**
  - Primitive BoxGeometry today, `vehicle.js`. Toggle moto/car at
    `mayhem.js:490–507`.
  - **R1:** leave primitive. Document decision in plan; revisit post-demo.

### 4.5 Skin/figure-pack
- `figure-pack/`: 2D paper-doll sprites for Coaching/Systembrett mode,
  not for FPS rendering.
- **`SkinController`** (`skin-controller.js`): supports Mixamo-rigged GLB
  with `mixamorigHips` validation (`server.js:47`). Bone mapping L5–20.
  AnimationMixer L37, clip lookup by name in `_play()` L116.
- **Hero skin upload:** `POST /api/skins/upload` (admin-only,
  `server.js:356`). Files served from `brett/public/assets/skins/`
  (currently empty — only `.gitkeep`).
- **R1 Mixamo flow:** convert FBX from `assets/new/Animated {Men,Women}
  Characters - Feb 2019/FBX/` → GLB via Blender (CLI script) or
  online converter → upload via admin API or drop directly into
  `brett/public/assets/skins/<hero>/skin.glb` (committed asset).
- **Required clip names** (skin-controller picks by clip.name): `idle`,
  `walk`, `attack` (we add this; current code uses `run` and `death`).

### 4.6 Mobile touch
- **`joystick.mjs`** + **`touch-hud.mjs`** in `brett/public/assets/touch/`:
  fully implemented, **never mounted**. Mount point: `main.js` after
  mode selection. Conditional: `'ontouchstart' in window`.
- **Existing partial:** `mayhem.js:214` `_onTouchMove()` aims via
  `touches[0]` → `_mouseNDC`. Movement + fire are stubs.
- **Wire-up shape:**
  ```js
  // in main.js after mode select
  if ('ontouchstart' in window) {
    mountJoystick({ side: 'left', onMove: (x, y) => {
      input.forward = y < -0.3; input.backward = y > 0.3;
      input.left = x < -0.3; input.right = x > 0.3;
    }});
    mountTouchHud({
      onFireStart: () => input.fire = true,
      onFireEnd:   () => input.fire = false,
    });
  }
  ```

### 4.7 Mode coordination
- **Top-level FSM:** `mode-state.mjs:2` — `coaching | mode-select | mayhem`.
- **In-mayhem sub-modes:** `mayhem.js:13` `MODES_CYCLE = [warmup,
  deathmatch, lms, coop, duel]` — toggled via `G` key.
- **Solo:** detected by room name prefix `room.startsWith('solo-')`
  at `mayhem.js:1632`. Not a first-class sub-mode.
- **R1 goal:** add a sub-mode picker to `mode-select.mjs` (or a
  secondary picker after entering mayhem) exposing solo/1v1/FFA. Pass
  chosen mode to server via `game_mode_change` on join.

### 4.8 Build + deploy
- Brett ships **raw JS** served by Express — no esbuild/bundler.
- `task feature:brett` → fan-out per cluster → `docker build` →
  `docker push ghcr.io/paddione/workspace-brett:latest` → `kubectl
  rollout restart deploy/brett -n <ns>` per cluster.
- `k3d/brett.yaml` uses `:latest` intentionally. Each release re-pulls.

## 5. Visual conventions (from mockups)

From `assets/new/*.html`, locked color palette:

```
--fire-tip      #fff5c8   (hot weapon highlights, head tint)
--brass-hi      #f0d28c   (UI accent, idle aim)
--brass-game    #c8a96e   (default crosshair, tracer mid)
--brass-mute    #695a3a   (corrupted/aged trim)
--stille-blau   #6fa8d8   (cool aim, frost VFX, fill light)
--blood-bright  #c4453a   (hot-aim crosshair tint, fireball)
--blood-deep    #5a1a14   (corrupted body)
--sage          #b8c0a8   (figure body / coaching neutral)
--ink-900       #0b111c   (scene background)
```

**Sprite sizing standards:**
- Muzzle flash: 256×256 PNG, mounted at 32–64px on-screen, additive blend.
- VFX particles (Tina): 256×256 PNG, mounted at 64–128px, additive,
  `depthWrite: false`.
- Vehicle sprites (if A6 chosen): 512×512 PNG, pivot at center, nose +Y,
  no baked shadow.

**Animation timings:**
- Muzzle flash: 2 frames, 110ms total (steps(2,end)).
- Bullet tracer: 90ms (Additive, opacity 0.9 → 0).
- Frostnova: 1400ms ease-out (scale 0.2→2.4 + 0°→70° rotate).
- Fireball travel: 1500ms cubic-bezier(.25,.5,.4,1), 200ms impact bloom.
- Chainlightning: 1800ms stamp-flicker (3–4 flickers per segment over
  180ms, 60–100ms inter-segment delay).
- Katana ribbon: 22 samples (tunable 6–48), ease-out fade `pow(1-age, 1.6)`.

## 6. Implementation phases

### Phase 1 — Blockers (P1)
1. Pointer-lock unification (canvas-only target, lifecycle fix).
2. Crosshair: hide on overlay via `[data-overlay]` body attr or
   `_crosshairMesh.visible = false`.
3. Aim-state tint (idle/hot/cool color swap on ring material).
4. Hit-marker SFX wiring (`MayhemAudio.onHit()` call in `processLocalHit`).
5. Kill-confirmed SFX (new playback path in `processLocalHit` when victim hp ≤ 0).
6. Hit-flash shader (red albedo multiplier on enemy material for 80ms).
7. Projectile range tuning (raise speeds, reduce gravity, or add explicit
   range cap — pick approach that keeps existing balance recognizable).

**Verify:** local Brett dev server, 2-browser duel test, confirm:
- Pointer-lock survives spectator→play transition.
- Crosshair hides when hero-select / duel-result modal opens.
- Each hit emits hit-marker; each kill emits kill-confirmed.
- Bullets reliably connect at advertised range.

### Phase 2 — Hit feedback (P2)
1. Muzzle flash sprite generation (procedural canvas-drawn A·Stern; PNG
   drop-in path retained for later).
2. Muzzle flash mount in `onFire` callback (per-class color via
   `SpriteMaterial.color` tint).
3. Bullet tracer (`THREE.Line` + `LineBasicMaterial`, Additive,
   90ms lifetime, per-class color from mockup palette).
4. Tracer hook in `ProjectileManager.spawn()` for non-melee projectile types.

**Verify:** Patrick rifle/handgun fire — visible muzzle flash + tracer;
Tina fireball — flash at cast hand; chainlightning — no muzzle (caster
is the source); test on both clusters' brett deploy.

### Phase 3 — Per-hero polish (P3)
**Order: patrick → tina → oskar → martina.**

3a. **Patrick** — katana ribbon trail:
- Implement ring-buffer + ShaderMaterial trail per
  `katana-slash-trail.html` recipe in `mayhem/effects.js` or new
  `mayhem/katana-trail.js`.
- Sample `mannequin.bones.rWrist` worldPosition each frame.
- Tint head=fire-tip, tail=brass.

3b. **Tina** — sprite VFX:
- Generate 3× canvas PNGs at startup (frostnova, fireball, chain),
  cache as `THREE.Texture`.
- Replace `mkFireballMesh()`, frostnova `TorusGeometry`, `mkChainMesh()`
  with `THREE.Sprite` using generated textures + animation timings
  from mockup.

3c. **Oskar** — vehicle placeholder:
- Keep primitive `BoxGeometry` from `vehicle.js`.
- Add brass-mute trim outline (EdgeGeometry overlay) to differentiate
  car vs motorcycle silhouette at distance.
- Document deferred PNG-vs-GLB decision in PR description.

3d. **Martina** — minion recolor + pose:
- Recolor `minionMeshFactory` mannequin to corrupted palette
  (blood-deep body, skin-deep head, brass-mute trim, joint factor 0.55).
- Add hunch: `torso.rotation.x = 0.18`, `head.position.z = 0.10`,
  `head.rotation.x = 0.25`.

3e. **Hero anims (light-touch)** — idle + walk + attack for top 2 heroes:
- Convert FBX → GLB (Blender script) from `assets/new/Animated Men
  Characters - Feb 2019/FBX/` (Patrick male rig) and `Animated Women
  Characters - Feb 2019/FBX/` (Tina female rig).
- Trim to 3 clips: idle, walk, attack. Rename in GLB exporter.
- Drop at `brett/public/assets/skins/patrick/skin.glb`,
  `.../tina/skin.glb`.
- Verify `SkinController.load()` picks up clips via name lookup.
- **Hard cut:** Oskar + Martina use existing procedural mannequin in R1.

**Verify:** all 4 heroes playable, abilities visually distinct, Patrick
+ Tina show new anims when moving and casting.

### Phase 4 — Art pass + mobile (P4)
1. **Tone-mapping + bloom:** EffectComposer setup, ACESFilmic tonemap,
   subtle UnrealBloomPass on emissive surfaces (`fireball`, `chain`,
   `frostnova-core`, `muzzle-flash`).
2. **Skybox:** integrate winning PolyHaven HDRI (propose 2-3 in PR
   description). `THREE.RGBELoader` + `scene.environment` + `scene.background`.
3. **Ground texture:** integrate winning CC0 PBR pack. `MeshStandardMaterial`
   on ground plane with albedo/normal/roughness maps.
4. **Mobile wire-up:**
   - Mount `joystick.mjs` + `touch-hud.mjs` from `main.js` when
     `'ontouchstart' in window`.
   - Haptic: `navigator.vibrate(30)` on fire button press.
   - Landscape detection + warning if portrait.
   - FPS counter overlay (toggle via `?fps=1` URL param) for the
     "no FPS dips" check during real-device test.
5. **Real-device smoke test:** iPhone Safari + Android Chrome — duel
   match start-to-finish without help.

## 7. Verification matrix

| What | How |
|---|---|
| Pointer-lock survives spectator | Manual: spectate → play → confirm mouse-look works |
| Crosshair hides on overlay | Manual: open hero-select modal, observe ring disappears |
| Hit-marker plays per hit | Manual 2-browser duel, listen for tick |
| Kill-confirmed plays per kill | Manual 2-browser duel, listen for distinct stinger |
| Muzzle flash + tracer visible | Manual: rifle burst at 5m, 20m, 50m |
| Tina sprite VFX renders | Manual: cast each ability, observe sprite billboard |
| Katana trail follows blade | Manual: swing katana, observe ribbon |
| Patrick + Tina anims play | Manual: walk + attack with each, observe limb motion |
| Tone-map + bloom active | Manual: emissive surfaces (muzzle flash) show visible glow |
| Touch controls work on real iPhone | Required: solo match start-to-end on iPhone Safari |
| Both clusters serve new build | `task workspace:verify:all-prods` |
| Playwright duel test passes | `task brett:e2e ENV=mentolder` |
| No regression in offline tests | `task test:all` |
| Test inventory current | `task test:inventory && git diff --exit-code website/src/data/test-inventory.json` |
| Brett unit tests green | `cd brett && npm ci && node --test brett/test/*.test.*` |

## 8. Open decisions / risk

| ID | Decision | Default | Trigger to revisit |
|---|---|---|---|
| OD-1 | Oskar vehicle visual (sprite vs GLB vs primitive) | Primitive (R1) | Post-demo retrospective |
| OD-2 | Martina minion model (procedural vs GLB) | Procedural recolor (R1) | If demo feedback says "looks identical to player" |
| OD-3 | Hero anim coverage (2 vs 4 heroes) | 2 (Patrick + Tina) due to deadline | If FBX→GLB conversion finishes ≥2d before deadline → extend to Oskar |
| OD-4 | Done criterion (Q12 empty in form) | You-test + Playwright greens | User overrules |
| OD-5 | Sub-mode picker location | After `mode-select`, before mayhem boot | If UX feels clumsy, move to in-mayhem mid-screen prompt |
| OD-6 | Mobile haptic vs no-haptic | Haptic on (vibrate 30ms) | If real-device test shows FPS dip when vibrating |

## 9. Asset bundle reference

All in `assets/new/`:

| File | Purpose |
|---|---|
| `Grillinganswers.pdf` | Source of truth for §2 + §3 decisions |
| `2026-05-26-brett-first-release-round2.html` | Original form (for re-prompts) |
| `crosshair.html` | A1 visual + interaction spec |
| `muzzle-flash-options.html` | A2 sprite variants + tracer code |
| `ability-vfx-tina.html` | A4 Tina particle anim timings + Three.js setup |
| `katana-slash-trail.html` | A4 Patrick ribbon trail full recipe |
| `minion-martina.html` | A4 Martina mannequin recipe (palette + pose) |
| `vehicles-oskar.html` | A4 Oskar sprite reference (deferred per OD-1) |
| `Animated Men Characters - Feb 2019/FBX/` | A5 Patrick anim source |
| `Animated Women Characters - Feb 2019/FBX/` | A5 Tina anim source |

## 10. Plan-execution handoff

This spec hands off to:
- `docs/superpowers/plans/2026-05-26-brett-first-real-release-r1.md` —
  4-phase task breakdown (one PR per phase via `dev-flow-execute`).
- Plan-execution will branch per-phase OR continue on this branch with
  4 squash-merged PRs (TBD with user at execute time).

---
title: Brett — First Real Release R1 — Implementation Plan
ticket_id: T000278
domains: [brett, frontend, game, infra, test]
status: active
pr_number: null
---

# Brett — First Real Release R1 — Implementation Plan

Spec: `docs/superpowers/specs/2026-05-26-brett-first-real-release-r1-design.md`
Branch: `feature/brett-first-real-release-r1`
Target: both prod clusters (mentolder + korczewski) via `task feature:brett`
Deadline: ≤7 days (≤2026-06-02)
Delivery: **4 phased PRs**, one per phase, each squash-merged before the
next begins. All deploy steps run twice (one per cluster) via the
`feature:brett` fan-out.

---

## Acceptance criteria (top-line)

A demo player on either prod cluster can:
1. Open `brett.mentolder.de` or `brett.korczewski.de`, click the canvas,
   and have a stable pointer-locked FPS view that survives a
   spectator → play transition without re-clicking.
2. See a crosshair that hides when overlays open and tints by aim state.
3. Hear hit-marker on every hit, kill-confirmed on every kill, and
   feel the red enemy-flash + see a muzzle flash + tracer per shot.
4. See distinct ability VFX for all 4 heroes (sprite-based for Tina,
   ribbon for Patrick, recolored-mannequin for Martina minions,
   placeholder-with-trim-outline for Oskar vehicle).
5. See Patrick + Tina performing actual `idle/walk/attack` Mixamo clips
   (Oskar + Martina stay procedural in R1).
6. See ACESFilmic tone-mapping, subtle bloom on emissive surfaces, a
   PolyHaven HDRI skybox, and a PBR-textured arena floor.
7. Play a complete solo / 1v1 / FFA match from a single build, picking
   the sub-mode from the mode-select overlay.
8. Open the URL on an iPhone (Safari, landscape) or Android Chrome,
   move with a left-stick joystick, fire with the right-side button,
   feel haptic feedback on fire, and finish a match without help.

---

## Phase 1 — Blockers PR (`feature/brett-first-real-release-r1` → `main`, PR #1)

**Branch handling:** stays on `feature/brett-first-real-release-r1`. PR #1
opens after P1 tasks land. Squash-merge to `main`. Then P2 continues
on a new branch `feature/brett-r1-p2-hitfeedback` rebased onto fresh main.
(If user prefers single branch with 4 PRs all off it, adjust at execute time.)

### P1.1 — Unify pointer-lock target on `canvas`

**Files:**
- `brett/public/assets/mayhem/mayhem.js:124` (spectator fly-cam lock)
- `brett/public/assets/mayhem/mayhem.js:968` (spectator exit, calls
  `document.exitPointerLock()`)
- `brett/public/assets/mayhem/chase-camera.js:16,22` (canvas lock +
  `_onLockChange` handler)

**Change:**
1. Replace `document.documentElement.requestPointerLock()` at
   `mayhem.js:124` with `canvas.requestPointerLock()`. The `canvas`
   handle is already in scope as `_canvas`.
2. After `document.exitPointerLock()` at `mayhem.js:968`, immediately
   re-request lock on `canvas` if `_isFirstPersonActive()`:
   ```js
   document.exitPointerLock();
   if (this._isFirstPersonActive() && this._canvas) {
     // Single rAF defer so the exit propagates first.
     requestAnimationFrame(() => this._canvas.requestPointerLock());
   }
   ```
3. In `chase-camera.js:22`, the `_onLockChange` logic
   (`pointerLockElement !== canvas`) remains correct since we now
   only ever lock the canvas.

**Verify:**
- Start dev brett, click canvas (FPS view), press `Tab` to enter
  spectator fly-cam, press `Tab` again to exit.
- Confirm: mouse-look immediately resumes, no second click needed.

### P1.2 — Auto re-engage pointer-lock after overlay close

**Files:**
- `brett/public/assets/mayhem/mayhem.js:421` (`_showHeroSelectModal`)
- `brett/public/assets/mayhem/mayhem.js` (search for `_showDuelMatchResult`
  and any other `appendChild(document.body, modal)` call)
- `brett/public/assets/loadout-modal.mjs` (loadout overlay close)

**Change:**
1. Introduce a single helper `_closeOverlay(node)` in `mayhem.js`:
   ```js
   _closeOverlay(node) {
     if (node?.parentNode) node.parentNode.removeChild(node);
     document.body.removeAttribute('data-overlay');
     if (this._isFirstPersonActive() && this._canvas) {
       requestAnimationFrame(() => this._canvas.requestPointerLock());
     }
   }
   ```
2. Route all overlay-removal call sites through `_closeOverlay`.
3. Set `document.body.setAttribute('data-overlay', '')` whenever an
   overlay opens (in `_showHeroSelectModal`, `_showDuelMatchResult`,
   loadout open path).

**Verify:**
- Open hero-select modal, pick hero, modal closes → pointer-lock
  restored without user click.
- Same for duel result modal and loadout overlay.

### P1.3 — Crosshair hide-on-overlay + aim-state tint

**Files:**
- `brett/public/assets/mayhem/mayhem.js:269–277` (crosshair ring
  construction)
- `brett/public/assets/mayhem/mayhem.js:1152–1158` (aim tick)

**Change:**
1. Add a tick-level visibility gate just before rendering the
   crosshair update:
   ```js
   const overlayOpen = document.body.hasAttribute('data-overlay');
   this._crosshairMesh.visible = !overlayOpen && this._isFirstPersonActive();
   if (!overlayOpen) {
     this._updateCrosshairTint();
   }
   ```
2. Add `_updateCrosshairTint()` method:
   ```js
   _updateCrosshairTint() {
     // Determine aim state: 'hot' if firing-recently (<150ms),
     // 'cool' if hero is Tina (spell-class), else 'idle'.
     const now = performance.now();
     const recentlyFired = (now - (this._lastFireMs || 0)) < 150;
     const heroIsCool = this._currentHero === 'tina';
     let target;
     if (recentlyFired) target = 0xc4453a;       // blood-bright
     else if (heroIsCool) target = 0x6fa8d8;     // stille-blau
     else target = 0xc8a96e;                     // brass-game (default)
     this._crosshairMesh.material.color.lerpHEX
       ? this._crosshairMesh.material.color.lerp(new THREE.Color(target), 0.18)
       : this._crosshairMesh.material.color.set(target);
   }
   ```
3. Track `this._lastFireMs = performance.now()` inside the `onFire`
   callback at `mayhem.js:257`.

**Verify:**
- Idle aim shows brass color. Fire → flicks red for 150ms. Switch to
  Tina → settles to stille-blau.
- Hero-select overlay → crosshair invisible. Close → reappears.

### P1.4 — Wire hit-marker SFX (`MayhemAudio.onHit()`)

**Files:**
- `brett/public/assets/mayhem/audio.js:95` (`onHit` definition —
  already exists, plays `hit-marker.ogg` + `blood-splat.ogg`)
- `brett/public/assets/mayhem/mayhem.js:1048` (`processLocalHit`)

**Change:**
At the very start of `processLocalHit(weaponKey, damage, victimId, ...)`
(after damage application but before damage-number spawn), call:
```js
this._audio.onHit(weaponKey);
```

**Verify:**
2-browser duel test, fire at opponent. Listening on the shooter side:
hear hit-marker tick + blood-splat per hit. No double-trigger.

### P1.5 — Kill-confirmed SFX

**Files:**
- `brett/public/assets/mayhem/audio.js` (add `onKill()`)
- `brett/public/assets/mayhem/mayhem.js:1048` (`processLocalHit` — check
  for victim hp ≤ 0)

**Change:**
1. In `audio.js`, add method:
   ```js
   onKill() {
     this._play('kill-confirmed', { volume: 0.85 });
   }
   ```
   The SFX file `brett/public/assets/sfx/kill-confirmed.ogg` is already
   present (PR #1117).
2. In `processLocalHit`, after `hp_update` broadcast, check if the
   victim's hp dropped to 0 in this hit (delta brought hp from >0 to
   ≤0):
   ```js
   if (hpBefore > 0 && hpAfter <= 0) {
     this._audio.onKill();
   }
   ```

**Verify:**
2-browser duel: shoot opponent to death. Shooter hears `kill-confirmed`
stinger exactly once per kill, distinct from hit-marker.

### P1.6 — Enemy hit-flash shader

**Files:**
- `brett/public/assets/mayhem/player-avatar.js` (avatar receives hit)
- `brett/public/assets/mayhem/mayhem.js:1048` (`processLocalHit`)

**Change:**
1. In `player-avatar.js`, expose `flashRed(durationMs = 80)`:
   ```js
   flashRed(durationMs = 80) {
     if (!this._origColors) {
       this._origColors = new Map();
       this._traverseColored((mat) => this._origColors.set(mat, mat.color.clone()));
     }
     this._traverseColored((mat) => mat.color.setRGB(1.0, 0.25, 0.25));
     clearTimeout(this._flashTO);
     this._flashTO = setTimeout(() => {
       this._traverseColored((mat) => {
         const orig = this._origColors.get(mat);
         if (orig) mat.color.copy(orig);
       });
     }, durationMs);
   }
   _traverseColored(fn) {
     this.group.traverse((obj) => {
       if (obj.isMesh && obj.material?.color) fn(obj.material);
     });
   }
   ```
2. In `processLocalHit`, after damage application, look up victim
   avatar from `_remoteAvatars[victimId]` (or local if victim === self)
   and call `avatar.flashRed()`.

**Verify:**
2-browser duel: hits make the opponent flash red briefly. No persistent
color drift after repeated hits.

### P1.7 — Projectile range tuning

**Files:**
- `brett/public/assets/mayhem/projectiles.js:7,8` (gravity, lifetime)
- `brett/public/assets/mayhem/weapons.js` (per-weapon `projectileSpeed`)

**Change:**
Diagnose first — measure current effective range per weapon, target
the perception gap. Likely changes:
1. Reduce `GRAVITY` from `-9.8` to `-4.5` (closer-to-flat trajectory
   for the playfield scale).
2. Bump rifle `projectileSpeed` from current value to ensure reliable
   25m connect (typical playfield diameter is ~28m per arena geometry).
3. Optionally add explicit horizontal range cap in `ProjectileManager.update`:
   ```js
   const distXZ = Math.hypot(proj.mesh.position.x - proj.origin.x,
                              proj.mesh.position.z - proj.origin.z);
   if (distXZ > proj.weaponDef.range) { this._despawn(proj); continue; }
   ```
   with `range: 30` on rifle, `range: 18` on handgun, `range: 6` on
   fireball (per-weapon balance).

**Verify:**
- Manual: stand at one edge of arena, fire rifle at opposite edge → bullets
  connect ≥80% of shots.
- No new disconnect issues from changed physics (sanity check duel mode).

### P1 deploy + PR

```bash
cd /tmp/wt-brett-r1
task test:all                                      # green
task workspace:validate                            # green
cd brett && pnpm install --frozen-lockfile && pnpm test  # if pnpm config
# (or: npm ci && node --test brett/test/*.test.* for raw node tests)
cd ..

# Open PR via commit-push-pr skill
# Title: feat(brett-r1-p1): pointer-lock + crosshair + hit feedback + range tuning
# Body: list P1.1–P1.7 with verification notes

gh pr merge --squash --delete-branch --auto
git checkout main && git pull --rebase origin main
task feature:brett                                 # fan-out deploy
task workspace:verify:all-prods
```

---

## Phase 2 — Hit feedback PR (PR #2)

**Branch:** `feature/brett-r1-p2-hitfeedback` from fresh main.

### P2.1 — Muzzle flash sprite (procedural canvas-drawn)

**Files (new):**
- `brett/public/assets/mayhem/muzzle-flash.js` (new)

**Change:**
```js
// Generates a 128x128 RGBA canvas with the A·Stern recipe.
// Center fire-tip (#fff5c8) core, 4 sharp radial rays, 3 tiny
// blood-core specks (Brett signature). Returns a THREE.CanvasTexture.
export function makeMuzzleFlashTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  // ... canvas drawing per mockup
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function spawnMuzzleFlash(scene, originVec, dirVec, weaponClass, tex) {
  const m = new THREE.SpriteMaterial({
    map: tex,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    color: WEAPON_TINTS[weaponClass] || 0xfff5c8,
  });
  const sprite = new THREE.Sprite(m);
  sprite.position.copy(originVec);
  sprite.scale.setScalar(0.45);
  scene.add(sprite);
  const start = performance.now();
  function tick() {
    const t = (performance.now() - start) / 110; // 110ms life
    if (t >= 1) { scene.remove(sprite); m.dispose(); return; }
    sprite.material.opacity = 1 - t;
    sprite.scale.setScalar(0.45 + t * 0.25);
    requestAnimationFrame(tick);
  }
  tick();
}
```

Cache the texture once in `mayhem.js start()`:
```js
this._muzzleFlashTex = makeMuzzleFlashTexture();
```

### P2.2 — Muzzle flash mount in `onFire`

**Files:**
- `brett/public/assets/mayhem/mayhem.js:447–530` (onFire dispatch)

**Change:**
In each branch of the onFire dispatch (for projectileTypes
`bullet`, `fireball`, `chain`) — except melee — after spawning the
projectile, spawn the muzzle flash at the player's hand position:
```js
const handPos = this._localAvatar?.bones.rWrist.getWorldPosition(new THREE.Vector3());
if (handPos) {
  spawnMuzzleFlash(this._scene, handPos, dirVec,
                   weaponDef.muzzleClass || 'rifle',
                   this._muzzleFlashTex);
}
```

Add `muzzleClass: 'rifle' | 'handgun' | 'fireball' | 'stille'` to weapon
definitions in `weapons.js` per-weapon (rifle=rifle, handgun=handgun,
fireball=fireball, chainlightning has no muzzle — skip).

### P2.3 — Bullet tracer (Three.js Line)

**Files (new):**
- `brett/public/assets/mayhem/tracer.js` (new)

**Change:**
```js
export function spawnTracer(scene, fromVec, toVec, weaponClass) {
  const colors = {
    rifle:    { head: 0xfff5c8, glow: 0xf0d28c },
    handgun:  { head: 0xfff5c8, glow: 0xc8a96e },
    fireball: { head: 0xfff5c8, glow: 0xc4453a },
    stille:   { head: 0xdce0ff, glow: 0x6fa8d8 },
  }[weaponClass] || { head: 0xfff5c8, glow: 0xf0d28c };

  const g = new THREE.BufferGeometry().setFromPoints([fromVec.clone(), toVec.clone()]);
  const m = new THREE.LineBasicMaterial({
    color: colors.head,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const line = new THREE.Line(g, m);
  scene.add(line);
  const start = performance.now();
  function tick() {
    const t = (performance.now() - start) / 90;
    if (t >= 1) { scene.remove(line); m.dispose(); g.dispose(); return; }
    m.opacity = 0.9 * (1 - t);
    requestAnimationFrame(tick);
  }
  tick();
}
```

### P2.4 — Tracer hook in `ProjectileManager.spawn`

**Files:**
- `brett/public/assets/mayhem/projectiles.js:59` (`spawn`)

**Change:**
At end of `spawn()` for non-melee weapons:
```js
import { spawnTracer } from './tracer.js';
// ...
if (weaponDef.projectileType !== 'melee') {
  const tipPos = originPos.clone().addScaledVector(dirVec, weaponDef.range || 25);
  spawnTracer(this._scene, originPos, tipPos, weaponDef.muzzleClass || 'rifle');
}
```

### P2 verify + deploy

- Local: visible muzzle flash + tracer for rifle / handgun / fireball.
  No flash on chainlightning / melee.
- 2-browser duel test: tracers visible to both players (the firing
  player sees their own).
- Deploy: same fan-out pattern as P1.

---

## Phase 3 — Per-hero polish PR (PR #3)

**Order:** Patrick → Tina → Oskar → Martina. Each sub-task is
independent enough to skip if deadline tightens (Q12 done-criterion).

### P3.1 — Patrick katana ribbon trail

**Files (new):**
- `brett/public/assets/mayhem/katana-trail.js` (new — full impl per
  `assets/new/katana-slash-trail.html` recipe)

**Files (modified):**
- `brett/public/assets/mayhem/player-avatar.js` (call into trail on swing)
- `brett/public/assets/mayhem/mayhem.js` (instantiate trail per Patrick avatar)

**Change:**
- Port the ring-buffer + `ShaderMaterial` + vertex-colored alpha
  implementation from `katana-slash-trail.html` lines 480–608. Convert
  React/CSS-driven swing to a method `trail.sampleFromBlade(rWristBone)`
  called each tick when Patrick has katana equipped.
- Trail params: `TRAIL_MAX = 48`, `ribbonWidth = 0.55`, `trailLen = 22`,
  head=fire-tip, tail=brass, ease-out fade `pow(1 - age, 1.6)`.

**Verify:**
Patrick swings katana → visible ribbon arc following blade tip,
fades over ~330ms (22 samples at 60fps).

### P3.2 — Tina sprite VFX

**Files (new):**
- `brett/public/assets/mayhem/tina-vfx.js` (new — texture generators
  + sprite spawn helpers)

**Files (modified):**
- `brett/public/assets/mayhem/effects.js:189` (replace Torus frostnova
  with sprite spawn)
- `brett/public/assets/mayhem/projectiles.js:18,29` (replace
  `mkFireballMesh()` and `mkChainMesh()` to return sprites)

**Change:**
1. `tina-vfx.js` exports `makeFrostnovaTexture()`, `makeFireballTexture()`,
   `makeChainSegmentTexture()` — each draws a 256×256 canvas per the
   mockup spec (frostnova=hexagonal crystal w/ stille-blau, fireball=
   asymmetric flame puff w/ blood-bright core, chain=zigzag arc w/
   white-hot core + stille-blau halo).
2. Cache textures in `mayhem.js start()`.
3. Replace primitive meshes with `THREE.Sprite` using these textures.
4. Animation timing from spec §5 — apply via per-frame opacity/scale
   updates in the existing `EffectsManager`/`ProjectileManager` tick.

**Verify:**
Cast Frostnova → expanding sprite ring (1400ms). Fireball flies + 200ms
impact bloom. Chainlightning shows segment flicker between targets.

### P3.3 — Oskar vehicle outline trim

**Files:**
- `brett/public/assets/mayhem/vehicle.js` (current vehicle mesh)
- `brett/public/assets/mayhem/player-avatar.js:240–248` (remote vehicle mesh)

**Change:**
Add a brass-mute (`#695a3a`) `EdgeGeometry` overlay to the BoxGeometry
mesh to improve silhouette readability at distance:
```js
const edges = new THREE.EdgesGeometry(boxGeo);
const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({
  color: 0x695a3a, linewidth: 2, transparent: true, opacity: 0.7,
}));
boxMesh.add(line);
```
Apply to both car + motorcycle variants. Keep mesh dimensions identical.

**Verify:**
Mount car / motorcycle, drive around — outline visible from any angle,
distinguishes vehicle type at 30m+ distance.

### P3.4 — Martina minion recolor + pose

**Files:**
- `brett/public/assets/mayhem/mayhem.js:535` (`minionMeshFactory`)

**Change:**
Modify the factory to return a recolored mannequin with the corrupted
pose per `assets/new/minion-martina.html`:
```js
this._minionMeshFactory = (id) => {
  const m = makeMannequin({
    bodyColor: 0x5a1a14,   // blood-deep
    skinColor: 0x8a6258,   // skin-deep (gaunt)
    trimColor: 0x695a3a,   // brass-mute
    jointFactor: 0.55,
  });
  m.scale.setScalar(0.6);
  // Apply corrupted pose
  const torso = m.getObjectByName('torso');
  const head = m.getObjectByName('head');
  if (torso) torso.rotation.x = 0.18;
  if (head) { head.position.z = 0.10; head.rotation.x = 0.25; }
  return m;
};
```

Adjust `makeMannequin()` in `scene.js` to accept `bodyColor / skinColor
/ trimColor / jointFactor` opts and name the bone groups (`torso`,
`head`) so the factory can pose them.

**Verify:**
Martina casts Summon → minion appears with dark-red body, hunched
silhouette, distinct from player figures at any distance.

### P3.5 — Patrick + Tina Mixamo anims (idle/walk/attack)

**Steps:**
1. Locally convert FBX → GLB:
   ```bash
   # Use Blender headless. Install: apt install blender (or download).
   # Pick clip from assets/new/Animated Men Characters - Feb 2019/FBX/
   # (recommend "Idle.fbx", "Walking.fbx", "Sword And Shield Attack.fbx"
   #  or similar — verify clip names after import)
   blender --background --python scripts/fbx-to-glb.py -- \
     --in 'assets/new/Animated Men Characters - Feb 2019/FBX/Idle.fbx' \
     --out brett/public/assets/skins/patrick/skin.glb \
     --rename idle
   # ... combine 3 anims into one GLB with named NLA strips
   ```
   - Write `scripts/fbx-to-glb.py` as a small Blender Python script
     (one-shot, won't ship in container).
   - Validate: each output GLB has `mixamorigHips` as root bone (per
     `server.js:47` validation).
   - Validate: clip names are exactly `idle`, `walk`, `attack`.
2. Repeat for Tina via Women pack.
3. Commit the GLBs into `brett/public/assets/skins/patrick/skin.glb`
   and `brett/public/assets/skins/tina/skin.glb`.
4. Update `SkinController._play()` at `skin-controller.js:116` if needed
   to ensure `attack` clip is wired (currently picks `idle/walk/run/death`
   — add `attack`).
5. In `player-avatar.js`, trigger `attack` clip when local fire input
   activates (with 400ms cooldown to prevent re-trigger spam).

**Verify:**
Patrick walking → walk clip plays. Patrick firing → attack clip plays
once. Tina same. Oskar + Martina still use procedural (no regression).

**Risk:** Mixamo clips may not align perfectly with Brett's bone-spring
system in `player-avatar.js`. Test early. Fallback: if alignment fails,
ship procedural-only for R1 and re-attempt anim integration post-demo.

### P3.6 — Sub-mode picker (solo / 1v1 / FFA reachable)

**Files:**
- `brett/public/assets/mode-select.mjs` (add sub-mode cards)
- `brett/server.js` (room-id prefix routing already supports
  `solo-*`; add `duel-*` and `ffa-*` prefixes)

**Change:**
After top-level pick of `mayhem`, show a secondary picker:
```
Choose match: [Solo] [1v1 Duel] [FFA Mayhem]
```
On pick, route room ID with prefix:
- Solo → `solo-<rand>` (already supported)
- 1v1 → `duel-<rand>` (server detects prefix, sets `game_mode = duel`)
- FFA → `ffa-<rand>` (server detects, sets `game_mode = deathmatch`,
  allows ≥2 players)

In server.js, add detection for `duel-` and `ffa-` prefixes in the
join handler, set `game_mode_change` accordingly on first player join.

**Verify:**
Refresh page → sub-mode picker visible. Pick Solo → enters mayhem
alone. Pick 1v1 → waits for second player, becomes duel. Pick FFA →
deathmatch-style with N players.

### P3 verify + deploy

- Each hero playable end-to-end with new VFX.
- Anim clips don't break the bone-spring system for Patrick + Tina.
- Sub-mode picker reachable from cold start on both clusters.
- Standard CI + deploy fan-out.

---

## Phase 4 — Art pass + mobile PR (PR #4)

### P4.1 — ACESFilmic tone-mapping + bloom (EffectComposer)

**Files:**
- `brett/public/assets/mayhem/scene.js` or wherever renderer is constructed
- (new) `brett/public/assets/mayhem/post-fx.js`

**Change:**
```js
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

export function makeComposer(renderer, scene, camera) {
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.42,  // strength
    0.85,  // radius
    0.82   // threshold — only super-bright (emissive) pixels bloom
  );
  composer.addPass(bloom);
  return composer;
}
```
Replace `renderer.render(scene, camera)` with `composer.render()` in
the main tick loop. Resize handler must also resize the composer.

**Verify:**
Muzzle flash, fireball, chainlightning visibly glow / bloom. Non-
emissive surfaces (figures, ground) not affected (threshold gates them).

### P4.2 — PolyHaven HDRI skybox

**Sourcing:**
Propose 3 PolyHaven CC0 HDRIs in PR description for user pick — e.g.:
1. `sunset_jhbcentral_1k.hdr` (warm urban dusk)
2. `kloofendal_43d_clear_puresky_1k.hdr` (clear blue)
3. `studio_garden_1k.hdr` (neutral overcast)

After user picks, drop `arena.hdr` (1k variant) at
`brett/public/assets/sky/arena.hdr`.

**Files:**
- `brett/public/assets/mayhem/scene.js` (or wherever scene is created)

**Change:**
```js
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
new RGBELoader().load('/assets/sky/arena.hdr', (tex) => {
  tex.mapping = THREE.EquirectangularReflectionMapping;
  scene.environment = tex;
  scene.background = tex;
});
```

**Verify:**
Visible skybox, environment lighting reflects on metallic katana blade.

### P4.3 — PBR ground texture

**Sourcing:**
Propose 3 PolyHaven / ambientCG CC0 PBR sets in PR description, e.g.:
1. `coast_sand_03` — beach
2. `rocky_terrain_02` — arena pit
3. `concrete_floor_painted_01` — industrial

After user pick, drop:
- `brett/public/assets/textures/ground-albedo.png`
- `brett/public/assets/textures/ground-normal.png`
- `brett/public/assets/textures/ground-rough.png`

**Files:**
- `brett/public/assets/mayhem/scene.js`

**Change:**
Replace ground `MeshBasicMaterial({ color: 0x0a0d12 })` with
`MeshStandardMaterial`:
```js
const tl = new THREE.TextureLoader();
const groundMat = new THREE.MeshStandardMaterial({
  map:          tl.load('/assets/textures/ground-albedo.png'),
  normalMap:    tl.load('/assets/textures/ground-normal.png'),
  roughnessMap: tl.load('/assets/textures/ground-rough.png'),
});
// Tile pattern over arena
[groundMat.map, groundMat.normalMap, groundMat.roughnessMap].forEach((t) => {
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(20, 20);  // tile per 1m^2
});
```

**Verify:**
Ground shows texture, reacts to lighting (visible specular variation).

### P4.4 — Mobile touch wire-up

**Files:**
- `brett/public/assets/main.js` (mount touch modules after mode select)
- `brett/public/assets/touch/joystick.mjs` (existing, may need
  small fixes if it imports unavailable globals)
- `brett/public/assets/touch/touch-hud.mjs` (existing)
- `brett/public/assets/mayhem/mayhem.js` (expose `setInput()` if needed
  for external joystick wiring)

**Change:**
```js
// main.js, after mayhem start
if ('ontouchstart' in window) {
  import('./touch/joystick.mjs').then(({ mountJoystick }) => {
    mountJoystick({ side: 'left', onMove: (x, y) => {
      const input = window.__brettMayhem?.getInput?.();
      if (!input) return;
      input.forward = y < -0.3; input.backward = y > 0.3;
      input.left = x < -0.3;    input.right = x > 0.3;
    }});
  });
  import('./touch/touch-hud.mjs').then(({ mountTouchHud }) => {
    mountTouchHud({
      onFireStart: () => {
        const input = window.__brettMayhem?.getInput?.();
        if (input) input.fire = true;
        if (navigator.vibrate) navigator.vibrate(30);  // haptic
      },
      onFireEnd: () => {
        const input = window.__brettMayhem?.getInput?.();
        if (input) input.fire = false;
      },
    });
  });
  // Landscape detection
  const orient = window.matchMedia('(orientation: portrait)');
  function checkOrient() {
    document.body.classList.toggle('portrait-warning', orient.matches);
  }
  orient.addEventListener('change', checkOrient);
  checkOrient();
}
```

CSS for portrait warning (`brett/public/assets/style.css`):
```css
body.portrait-warning::before {
  content: "Bitte drehe dein Gerät ins Querformat";
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.85); color: var(--brass-game);
  display: flex; align-items: center; justify-content: center;
  z-index: 1000; font-family: monospace; font-size: 18px;
  text-align: center; padding: 32px;
}
```

### P4.5 — Real-device smoke test

**Required:**
- Open `brett.mentolder.de` on iPhone Safari (landscape).
- Play 1 solo match start-to-end, fire ≥10 shots.
- Confirm: joystick responsive, fire button works, haptic felt,
  no FPS dips below 30, no orientation lock-up.
- Repeat on Android Chrome.

**If a test fails:** capture screen recording, file as a separate fix
ticket post-R1 — don't block the release.

### P4 verify + deploy

- Standard offline tests + manual flow.
- Deploy fan-out via `task feature:brett`.

---

## Cross-phase test plan

Per CLAUDE.md / dev-flow-plan §3.5 (Playwright projects):

| Spec file | Playwright project | Reason |
|---|---|---|
| `tests/e2e/specs/brett-r1-p1-pointerlock.spec.ts` | `services` | No auth; canvas + WS only |
| `tests/e2e/specs/brett-r1-p1-crosshair.spec.ts` | `services` | DOM observation |
| `tests/e2e/specs/brett-r1-p2-muzzle-tracer.spec.ts` | `services` | DOM observation of `THREE.Sprite` presence |
| `tests/e2e/specs/brett-r1-p3-submode-picker.spec.ts` | `services` | DOM click + URL prefix assertion |
| `tests/e2e/specs/brett-r1-p4-touch-mount.spec.ts` | `services` (with mobile UA emulation) | Touch event simulation |

Endpoints to verify before writing each spec:
```bash
# Confirm route paths from source, never assume:
grep -n "app\.\(get\|post\)\|router\.\(get\|post\)" brett/server.js
```

Add each new spec ID to `tests/inventory` and regenerate:
```bash
task test:inventory
git diff --exit-code website/src/data/test-inventory.json   # must be clean after add+commit
```

## Risk + rollback

**Per-phase rollback** is via `gh pr revert <pr-number>` followed by
`task feature:brett` to re-deploy the reverted main.

**Highest risks:**
1. **Mixamo bone alignment (P3.5)** — if clips don't drive the bone-spring
   system cleanly, demo ships with procedural anims only.
2. **Pointer-lock fix (P1.1)** breaks duel mode — duel uses a different
   camera mode that may interact. Test duel mode in P1 verify.
3. **Tracer/muzzle-flash perf hit on mobile (P2)** — if mobile FPS drops,
   gate sprite spawn behind `!('ontouchstart' in window)` for these
   effects. Acceptable demo compromise.
4. **PBR ground material on mobile (P4.3)** — `MeshStandardMaterial` is
   more expensive than `MeshBasic`. If mobile suffers, ship desktop
   only and revert to flat color for touch devices.

## Deploy summary (post-merge per phase)

```bash
task feature:brett                       # builds + pushes :latest, rollout restart on both clusters
task workspace:verify:all-prods          # health
# Quick smoke:
curl -sS https://brett.mentolder.de/healthz
curl -sS https://brett.korczewski.de/healthz
# Manual: open both URLs in browser, confirm new behavior.
```

---

## Notes for `dev-flow-execute`

- This plan is intentionally **dense on code stubs** in P1 + P2
  (concrete enough to type) and **lighter on P3 + P4** (where mockup
  recipes do the heavy lift — read the corresponding HTML in
  `assets/new/` before writing each task).
- Phases can be executed sequentially with separate branches OR all
  on `feature/brett-first-real-release-r1` as 4 distinct commits with
  one PR per phase. Decide at execution start.
- The Mixamo GLB conversion (P3.5) is the only step requiring
  out-of-Claude work (Blender). If user wants Claude to attempt it,
  it can be scripted via Blender's CLI Python API in a one-shot script
  — but the user may prefer to do that manually for control over
  clip naming.

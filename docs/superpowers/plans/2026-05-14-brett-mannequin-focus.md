---
title: Brett Mannequin Focus Implementation Plan
domains: [website]
status: active
pr_number: null
---

# Brett Mannequin Focus Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Strip Brett of all settings/panels and rebuild it as a pure 3D mannequin sandbox with pose presets, a Verlet-spring↔CCD-IK ragdoll, click/WASD walking, and WebSocket sync.

**Architecture:** Single-file rewrite of `brett/public/index.html` (~3900 → ~1200 lines). Three.js scene with a slim topbar (6 pose buttons + stiffness slider + add/online), full-canvas viewport, and a floating status pill. Per-bone `targetRot`/`currentRot`/`velocity` drive a Verlet spring; dragging a contact-point sphere runs CCD-IK on the affected chain and writes into `boneOverrides`. Walk system is a 4-state machine (IDLE/WALKING/DRAG_PAUSED) with click-to-walk + camera-relative WASD. WebSocket reuses existing `server.js` with two added fields (`stiffness`, `boneOverrides`) and one new top-level message (`stiffness` broadcast).

**Tech Stack:** Three.js (existing `three.min.js`), vanilla JS, Express + `ws` (existing `server.js`), no new dependencies.

**Conventions for this rewrite**
- Build the new file as `brett/public/index.html` from scratch; the old file is fully replaced (squash-commit at the end is fine — incremental commits per task below).
- Keep all code in `index.html` (one module `<script>` block), mirroring the existing project style.
- Use the bone names already produced by the existing mannequin builder so we can reuse `tickMannequinWalk` math: `head, hips, lShoulder, rShoulder, lElbow, rElbow, lWrist, rWrist, lHip, rHip, lKnee, rKnee, lAnkle, rAnkle`.
- No automated tests exist for Brett; "verify" means **load `http://localhost:3000` in a browser and exercise the listed behaviour**. Each task has a concrete manual-verify step.

---

## File Structure

| File | Action | Purpose |
|---|---|---|
| `brett/public/index.html` | Full rewrite | Entire client: scene, topbar, mannequin, spring, IK, walk, WS |
| `brett/server.js` | Modify (small) | Add `stiffness` message broadcast; drop `art-library` static mount |
| `brett/public/art-library/` | Delete | No longer referenced |
| `brett/package.json` | Unchanged | — |

---

## Task 1: Snapshot the existing client and start a clean scaffold

**Files:**
- Create: `brett/public/index.html.legacy` (backup of current ~3900-line file, kept for reference during the rewrite; deleted in the final task)
- Modify: `brett/public/index.html` → replace with scaffold below

- [ ] **Step 1: Back up the existing file**

```bash
cp brett/public/index.html brett/public/index.html.legacy
```

- [ ] **Step 2: Write the new scaffold**

Overwrite `brett/public/index.html` with:

```html
<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Brett · Mannequin</title>
  <style>
    *,*::before,*::after { box-sizing: border-box; }
    html, body { margin:0; height:100%; background:#0e1014; color:#e7ead0; font-family: ui-sans-serif, system-ui, sans-serif; overflow:hidden; }
    #topbar {
      position:fixed; top:0; left:0; right:0; height:36px; display:flex; align-items:center; gap:8px;
      padding:0 10px; background:rgba(14,16,20,0.85); backdrop-filter:blur(6px);
      border-bottom:1px solid rgba(231,234,208,0.08); z-index:10; font-size:13px;
    }
    #topbar .group { display:flex; align-items:center; gap:6px; }
    #topbar .sep { width:1px; height:20px; background:rgba(231,234,208,0.12); margin:0 6px; }
    .preset-btn { background:transparent; color:inherit; border:1px solid rgba(231,234,208,0.18);
      border-radius:4px; padding:4px 10px; font:inherit; cursor:pointer; }
    .preset-btn:hover { background:rgba(231,234,208,0.08); }
    .icon-btn { background:transparent; color:inherit; border:1px solid rgba(231,234,208,0.18);
      border-radius:4px; padding:4px 10px; font:inherit; cursor:pointer; }
    #stiffness { width:160px; accent-color:#c8a96e; }
    #status-pill {
      position:fixed; left:50%; bottom:24px; transform:translateX(-50%);
      padding:8px 14px; background:rgba(14,16,20,0.85); border:1px solid rgba(231,234,208,0.14);
      border-radius:20px; font-size:13px; pointer-events:none; z-index:10;
    }
    canvas { display:block; }
  </style>
</head>
<body>
  <div id="topbar">
    <div class="group" id="presets">
      <button class="preset-btn" data-preset="stand">Stand</button>
      <button class="preset-btn" data-preset="kneel">Kneel</button>
      <button class="preset-btn" data-preset="prone">Prone</button>
      <button class="preset-btn" data-preset="crawl">Crawl</button>
      <button class="preset-btn" data-preset="slump">Slump</button>
      <button class="preset-btn" data-preset="tpose">T-Pose</button>
    </div>
    <div class="sep"></div>
    <div class="group">
      <span title="Physik (schlaff)">🌡 PHYS</span>
      <input id="stiffness" type="range" min="0" max="1" step="0.01" value="0.65" />
      <span title="IK (steif)">IK 🎯</span>
    </div>
    <div class="sep"></div>
    <div class="group" style="margin-left:auto;">
      <button id="add-figure" class="icon-btn">+ Figur</button>
      <span id="online-indicator">● <span id="online-count">1</span> online</span>
    </div>
  </div>
  <div id="status-pill">Klick = Figur wählen · Doppelklick Boden = neue Figur</div>
  <script src="three.min.js"></script>
  <script>
    // ===== Brett Mannequin Focus =====
    // Tasks 2..10 fill this block.
    const STATE = { figures: [], selectedId: null, stiffness: 0.65, online: 1 };
    console.log('[brett] scaffold loaded');
  </script>
</body>
</html>
```

- [ ] **Step 3: Verify scaffold loads**

```bash
cd brett && node server.js &
SERVER=$!
sleep 1
curl -sf http://localhost:3000/ | head -5
kill $SERVER
```

Expected: HTML response starts with `<!doctype html>`.

- [ ] **Step 4: Commit**

```bash
git add brett/public/index.html brett/public/index.html.legacy
git commit -m "feat(brett): scaffold new mannequin-focus UI shell"
```

---

## Task 2: Scene bootstrap (Three.js renderer, camera, floor, lights)

**Files:**
- Modify: `brett/public/index.html` — replace the `<script>` block body with the scene bootstrap below.

- [ ] **Step 1: Add scene + camera + renderer + floor + orbit controls**

Replace the `<script>` block that contains `// ===== Brett Mannequin Focus =====` with:

```html
<script>
  // ===== Brett Mannequin Focus =====
  const STATE = { figures: [], selectedId: null, stiffness: 0.65, online: 1 };

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight - 36);
  renderer.domElement.style.position = 'absolute';
  renderer.domElement.style.top = '36px';
  renderer.domElement.style.left = '0';
  document.body.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0e1014);

  const camera = new THREE.PerspectiveCamera(
    50, window.innerWidth / (window.innerHeight - 36), 0.1, 200
  );
  camera.position.set(4, 4, 6);
  camera.lookAt(0, 1, 0);

  const ambient = new THREE.AmbientLight(0xffffff, 0.55);
  scene.add(ambient);
  const sun = new THREE.DirectionalLight(0xffffff, 0.85);
  sun.position.set(5, 10, 4);
  scene.add(sun);

  // Floor grid
  const grid = new THREE.GridHelper(40, 40, 0x445566, 0x2a3340);
  grid.position.y = 0;
  scene.add(grid);
  const floorGeo = new THREE.PlaneGeometry(40, 40);
  const floorMat = new THREE.MeshBasicMaterial({ color: 0x10131a, transparent: true, opacity: 0.6 });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0;
  scene.add(floor);

  // Minimal manual orbit (mouse drag with middle button + wheel)
  const cameraOrbit = { theta: Math.atan2(camera.position.x, camera.position.z), phi: 0.6, dist: Math.hypot(camera.position.x, camera.position.z, camera.position.y) };
  function updateCameraFromOrbit() {
    const r = cameraOrbit.dist;
    camera.position.set(
      Math.sin(cameraOrbit.theta) * Math.cos(cameraOrbit.phi) * r,
      Math.sin(cameraOrbit.phi) * r,
      Math.cos(cameraOrbit.theta) * Math.cos(cameraOrbit.phi) * r
    );
    camera.lookAt(0, 1, 0);
  }
  updateCameraFromOrbit();
  let dragMode = null, dragLast = null;
  renderer.domElement.addEventListener('mousedown', (e) => {
    if (e.button === 1 || (e.button === 0 && e.shiftKey)) { dragMode = 'orbit'; dragLast = { x: e.clientX, y: e.clientY }; }
  });
  window.addEventListener('mousemove', (e) => {
    if (dragMode === 'orbit' && dragLast) {
      const dx = e.clientX - dragLast.x, dy = e.clientY - dragLast.y;
      cameraOrbit.theta -= dx * 0.005;
      cameraOrbit.phi = Math.max(-1.2, Math.min(1.2, cameraOrbit.phi + dy * 0.005));
      updateCameraFromOrbit();
      dragLast = { x: e.clientX, y: e.clientY };
    }
  });
  window.addEventListener('mouseup', () => { dragMode = null; dragLast = null; });
  renderer.domElement.addEventListener('wheel', (e) => {
    e.preventDefault();
    cameraOrbit.dist = Math.max(2, Math.min(40, cameraOrbit.dist * (1 + e.deltaY * 0.001)));
    updateCameraFromOrbit();
  }, { passive: false });

  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight - 36);
    camera.aspect = window.innerWidth / (window.innerHeight - 36);
    camera.updateProjectionMatrix();
  });

  // Main render loop — figure ticks added in later tasks
  function tick() {
    requestAnimationFrame(tick);
    renderer.render(scene, camera);
  }
  tick();

  console.log('[brett] scene up');
</script>
```

- [ ] **Step 2: Manual verify**

```bash
cd brett && node server.js
```

Open `http://localhost:3000/`. Expected: dark background, visible grid at y=0, topbar at top, status pill at bottom. Shift+drag rotates camera, wheel zooms.

- [ ] **Step 3: Commit**

```bash
git add brett/public/index.html
git commit -m "feat(brett): bring up empty Three.js scene with floor + orbit"
```

---

## Task 3: Mannequin builder with named bones and contact-point spheres

**Files:**
- Modify: `brett/public/index.html` — append the mannequin builder before `function tick()`.

- [ ] **Step 1: Add mannequin builder**

Insert the following just **above** `function tick()`:

```js
  // ----- Mannequin model -----
  const BONE_NAMES = [
    'hips','head',
    'lShoulder','rShoulder','lElbow','rElbow','lWrist','rWrist',
    'lHip','rHip','lKnee','rKnee','lAnkle','rAnkle'
  ];
  const CONTACT_POINTS = [
    { bone:'lWrist', color:0xffd84a }, { bone:'rWrist', color:0xffd84a },
    { bone:'lAnkle', color:0x6be0a0 }, { bone:'rAnkle', color:0x6be0a0 },
    { bone:'lKnee',  color:0x4a9adf }, { bone:'rKnee',  color:0x4a9adf },
    { bone:'lElbow', color:0xc8a96e }, { bone:'rElbow', color:0xc8a96e },
    { bone:'head',   color:0xe09090 },
  ];

  function makeBone(parent, length, color = 0xb8c0a8) {
    const g = new THREE.Group();
    const geom = new THREE.CylinderGeometry(0.06, 0.06, length, 8);
    geom.translate(0, -length / 2, 0); // pivot at top
    const mat = new THREE.MeshLambertMaterial({ color });
    const mesh = new THREE.Mesh(geom, mat);
    g.add(mesh);
    g.userData.length = length;
    parent.add(g);
    return g;
  }

  function makeMannequin(id, position = { x: 0, z: 0 }) {
    const root = new THREE.Group();
    root.position.set(position.x, 0, position.z);

    // Hips at y≈1.0; spine up to head
    const hips = new THREE.Group(); hips.position.y = 1.0; root.add(hips);
    const torsoMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.7, 0.25),
      new THREE.MeshLambertMaterial({ color: 0xb8c0a8 })
    );
    torsoMesh.position.y = 0.35; hips.add(torsoMesh);

    const head = new THREE.Group(); head.position.y = 0.85; hips.add(head);
    const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12),
      new THREE.MeshLambertMaterial({ color: 0xd9c89b }));
    head.add(headMesh);

    // Arms
    const lShoulder = new THREE.Group(); lShoulder.position.set( 0.28, 0.65, 0); hips.add(lShoulder);
    const rShoulder = new THREE.Group(); rShoulder.position.set(-0.28, 0.65, 0); hips.add(rShoulder);
    const lUpper = makeBone(lShoulder, 0.32); const lElbow = new THREE.Group(); lElbow.position.y = -0.32; lShoulder.add(lElbow);
    const rUpper = makeBone(rShoulder, 0.32); const rElbow = new THREE.Group(); rElbow.position.y = -0.32; rShoulder.add(rElbow);
    const lFore  = makeBone(lElbow, 0.30);    const lWrist = new THREE.Group(); lWrist.position.y = -0.30; lElbow.add(lWrist);
    const rFore  = makeBone(rElbow, 0.30);    const rWrist = new THREE.Group(); rWrist.position.y = -0.30; rElbow.add(rWrist);

    // Legs
    const lHip = new THREE.Group(); lHip.position.set( 0.12, 0, 0); hips.add(lHip);
    const rHip = new THREE.Group(); rHip.position.set(-0.12, 0, 0); hips.add(rHip);
    makeBone(lHip, 0.42); const lKnee = new THREE.Group(); lKnee.position.y = -0.42; lHip.add(lKnee);
    makeBone(rHip, 0.42); const rKnee = new THREE.Group(); rKnee.position.y = -0.42; rHip.add(rKnee);
    makeBone(lKnee, 0.40); const lAnkle = new THREE.Group(); lAnkle.position.y = -0.40; lKnee.add(lAnkle);
    makeBone(rKnee, 0.40); const rAnkle = new THREE.Group(); rAnkle.position.y = -0.40; rKnee.add(rAnkle);

    const bones = { hips, head, lShoulder, rShoulder, lElbow, rElbow, lWrist, rWrist, lHip, rHip, lKnee, rKnee, lAnkle, rAnkle };

    // Contact-point spheres (raycaster-hittable)
    for (const cp of CONTACT_POINTS) {
      const sphere = new THREE.Mesh(
        new THREE.SphereGeometry(0.07, 12, 10),
        new THREE.MeshLambertMaterial({ color: cp.color })
      );
      sphere.userData.isContact = true;
      sphere.userData.boneName = cp.bone;
      sphere.userData.figureId = id;
      bones[cp.bone].add(sphere);
    }

    // Selection ellipse (hidden until selected)
    const ringGeo = new THREE.RingGeometry(0.55, 0.62, 32);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xc8a96e, side: THREE.DoubleSide, transparent: true, opacity: 0.85 });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.01; ring.visible = false;
    root.add(ring);

    scene.add(root);

    // Per-bone spring state (filled by preset/spring in later tasks)
    const bone = {};
    for (const name of BONE_NAMES) {
      bone[name] = {
        currentRot: { x: 0, z: 0 },
        targetRot:  { x: 0, z: 0 },
        velocity:   { x: 0, z: 0 },
      };
    }

    return {
      id,
      type: 'mannequin',
      root, hips, bones, ring,
      bone,
      walkTarget: null,
      walking: false,
      boneOverrides: {},
      label: 'Figur',
      facingY: 0,
    };
  }

  function addFigure(position) {
    const id = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : ('f-' + Math.random().toString(36).slice(2,10));
    const fig = makeMannequin(id, position);
    STATE.figures.push(fig);
    selectFigure(id);
    return fig;
  }

  function selectFigure(id) {
    STATE.selectedId = id;
    for (const f of STATE.figures) {
      f.ring.visible = (f.id === id);
      f.root.traverse(o => {
        if (o.isMesh && !o.userData.isContact && o !== f.ring) {
          if (o.material && 'opacity' in o.material) {
            o.material.transparent = true;
            o.material.opacity = (f.id === id) ? 1.0 : 0.55;
          }
        }
      });
    }
  }
```

- [ ] **Step 2: Wire `+ Figur` button to spawn at origin**

Append, still above `tick()`:

```js
  document.getElementById('add-figure').addEventListener('click', () => {
    addFigure({ x: (Math.random()-0.5)*2, z: (Math.random()-0.5)*2 });
  });
  // Seed one figure so the scene is not empty on first load
  addFigure({ x: 0, z: 0 });
```

- [ ] **Step 3: Manual verify**

Reload `http://localhost:3000/`. Expected: one mannequin at origin with a gold dashed-look selection ring; clicking `+ Figur` spawns more mannequins nearby and the new one is selected (ring moves to it, previous one dims).

- [ ] **Step 4: Commit**

```bash
git add brett/public/index.html
git commit -m "feat(brett): mannequin builder with named bones and contact spheres"
```

---

## Task 4: Pose preset tables and immediate-write target rotations

**Files:**
- Modify: `brett/public/index.html`

- [ ] **Step 1: Add preset tables and apply function**

Insert below the `addFigure` definition:

```js
  // ----- Pose presets (target rotations in radians; only x and z used) -----
  // Each value is { x: pitch, z: roll } applied via group.rotation.x / .z.
  const PRESETS = {
    stand: {
      hips:{x:0,z:0}, head:{x:0,z:0},
      lShoulder:{x:0,z: 0.05}, rShoulder:{x:0,z:-0.05},
      lElbow:{x:0,z:0}, rElbow:{x:0,z:0},
      lWrist:{x:0,z:0}, rWrist:{x:0,z:0},
      lHip:{x:0,z:0}, rHip:{x:0,z:0},
      lKnee:{x:0,z:0}, rKnee:{x:0,z:0},
      lAnkle:{x:0,z:0}, rAnkle:{x:0,z:0},
    },
    kneel: {
      hips:{x:0,z:0}, head:{x:-0.05,z:0},
      lShoulder:{x:0.1,z: 0.25}, rShoulder:{x:0.1,z:-0.25},
      lElbow:{x:0,z:0}, rElbow:{x:0,z:0},
      lWrist:{x:0,z:0}, rWrist:{x:0,z:0},
      lHip:{x:-1.3,z:0}, rHip:{x:-1.3,z:0},
      lKnee:{x: 1.7,z:0}, rKnee:{x: 1.7,z:0},
      lAnkle:{x:0,z:0}, rAnkle:{x:0,z:0},
    },
    prone: {
      hips:{x:-1.5,z:0}, head:{x:0.2,z:0},
      lShoulder:{x:-1.2,z: 0.1}, rShoulder:{x:-1.2,z:-0.1},
      lElbow:{x:0,z:0}, rElbow:{x:0,z:0},
      lWrist:{x:0,z:0}, rWrist:{x:0,z:0},
      lHip:{x:0,z:0}, rHip:{x:0,z:0},
      lKnee:{x:0,z:0}, rKnee:{x:0,z:0},
      lAnkle:{x:0,z:0}, rAnkle:{x:0,z:0},
    },
    crawl: {
      hips:{x:-1.4,z:0}, head:{x:0.15,z:0},
      lShoulder:{x:-1.3,z: 0.05}, rShoulder:{x:-1.3,z:-0.05},
      lElbow:{x:0.1,z:0}, rElbow:{x:0.1,z:0},
      lWrist:{x:0,z:0}, rWrist:{x:0,z:0},
      lHip:{x:-1.3,z:0}, rHip:{x:-1.3,z:0},
      lKnee:{x: 1.55,z:0}, rKnee:{x: 1.55,z:0},
      lAnkle:{x:0,z:0}, rAnkle:{x:0,z:0},
    },
    slump: {
      hips:{x:-0.7,z:0}, head:{x:0.5,z:0},
      lShoulder:{x:0.6,z: 0.35}, rShoulder:{x:0.6,z:-0.35},
      lElbow:{x:0.4,z:0}, rElbow:{x:0.4,z:0},
      lWrist:{x:0,z:0}, rWrist:{x:0,z:0},
      lHip:{x:-1.4,z:0}, rHip:{x:-1.4,z:0},
      lKnee:{x: 1.3,z:0}, rKnee:{x: 1.3,z:0},
      lAnkle:{x:0,z:0}, rAnkle:{x:0,z:0},
    },
    tpose: {
      hips:{x:0,z:0}, head:{x:0,z:0},
      lShoulder:{x:0,z: 1.5708}, rShoulder:{x:0,z:-1.5708},
      lElbow:{x:0,z:0}, rElbow:{x:0,z:0},
      lWrist:{x:0,z:0}, rWrist:{x:0,z:0},
      lHip:{x:0,z:0}, rHip:{x:0,z:0},
      lKnee:{x:0,z:0}, rKnee:{x:0,z:0},
      lAnkle:{x:0,z:0}, rAnkle:{x:0,z:0},
    },
  };

  function applyPreset(figId, presetKey) {
    const fig = STATE.figures.find(f => f.id === figId);
    if (!fig || !PRESETS[presetKey]) return;
    const p = PRESETS[presetKey];
    for (const name of BONE_NAMES) {
      fig.bone[name].targetRot.x = p[name].x;
      fig.bone[name].targetRot.z = p[name].z;
    }
    // Hard-write right now so the user sees something even before spring is wired up.
    for (const name of BONE_NAMES) {
      fig.bone[name].currentRot.x = p[name].x;
      fig.bone[name].currentRot.z = p[name].z;
      fig.bones[name].rotation.x = p[name].x;
      fig.bones[name].rotation.z = p[name].z;
    }
    sendUpdate(fig, { preset: presetKey });
  }

  function sendUpdate(/* fig, changes */) { /* placeholder until Task 10 */ }

  document.getElementById('presets').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-preset]');
    if (!btn || !STATE.selectedId) return;
    applyPreset(STATE.selectedId, btn.dataset.preset);
  });
```

- [ ] **Step 2: Manual verify**

Reload. Click each of the 6 preset buttons in turn; the selected mannequin should snap to: standing, kneeling, prone (face-down), crawl (on hands and knees), slumped, T-pose.

- [ ] **Step 3: Commit**

```bash
git add brett/public/index.html
git commit -m "feat(brett): six pose presets with immediate apply"
```

---

## Task 5: Verlet spring simulation

**Files:**
- Modify: `brett/public/index.html`

- [ ] **Step 1: Add spring tick and wire it into the render loop**

Insert above `function tick()`:

```js
  // ----- Verlet spring -----
  const K_SPRING = 80;
  const DAMPING  = 0.85;
  // Per-bone gravity offset (pitch x, roll z) when fully limp (stiffness=0)
  const GRAVITY_OFFSET = {
    hips:     { x: 0.2,  z: 0 },
    head:     { x: 0.4,  z: 0 },
    lShoulder:{ x: 0.6,  z: 0.3 }, rShoulder:{ x: 0.6, z: -0.3 },
    lElbow:   { x: 0.3,  z: 0 },   rElbow:   { x: 0.3, z: 0 },
    lWrist:   { x: 0,    z: 0 },   rWrist:   { x: 0,   z: 0 },
    lHip:     { x: -0.2, z: 0 },   rHip:     { x: -0.2, z: 0 },
    lKnee:    { x: 0.2,  z: 0 },   rKnee:    { x: 0.2, z: 0 },
    lAnkle:   { x: 0,    z: 0 },   rAnkle:   { x: 0,   z: 0 },
  };

  let lastTickMs = performance.now();

  function tickSpring(dt) {
    const stiff = STATE.stiffness;
    for (const fig of STATE.figures) {
      for (const name of BONE_NAMES) {
        const b = fig.bone[name];
        if (fig.boneOverrides[name]) {
          // IK has authoritative rotation for this bone; sync state and skip spring
          b.currentRot.x = fig.boneOverrides[name].x;
          b.currentRot.z = fig.boneOverrides[name].z;
          b.velocity.x = 0; b.velocity.z = 0;
        } else {
          const grav = GRAVITY_OFFSET[name];
          const tx = b.targetRot.x + grav.x * (1 - stiff);
          const tz = b.targetRot.z + grav.z * (1 - stiff);
          const ax = (tx - b.currentRot.x) * stiff * K_SPRING;
          const az = (tz - b.currentRot.z) * stiff * K_SPRING;
          b.velocity.x = b.velocity.x * DAMPING + ax * dt;
          b.velocity.z = b.velocity.z * DAMPING + az * dt;
          b.currentRot.x += b.velocity.x * dt;
          b.currentRot.z += b.velocity.z * dt;
        }
        fig.bones[name].rotation.x = b.currentRot.x;
        fig.bones[name].rotation.z = b.currentRot.z;
      }
      // Floor clamp: lift root if any ankle/knee contact sphere is below y=0
      let minY = 0;
      for (const cp of CONTACT_POINTS) {
        if (cp.bone === 'lAnkle' || cp.bone === 'rAnkle' || cp.bone === 'lKnee' || cp.bone === 'rKnee') {
          const s = fig.bones[cp.bone].children.find(c => c.userData && c.userData.isContact);
          if (s) {
            const world = new THREE.Vector3();
            s.getWorldPosition(world);
            if (world.y < minY) minY = world.y;
          }
        }
      }
      if (minY < 0) fig.root.position.y -= minY; // lift onto floor
    }
  }
```

- [ ] **Step 2: Drop the hard-write block from `applyPreset`**

In `applyPreset`, remove the lines that immediately overwrite `currentRot` and `bones[name].rotation` after writing `targetRot`. Keep only the `targetRot` assignment and `sendUpdate(...)` call. The spring now drives the visual rotation.

- [ ] **Step 3: Call `tickSpring` from the render loop**

Replace `function tick()` body with:

```js
  function tick() {
    requestAnimationFrame(tick);
    const now = performance.now();
    const dt = Math.min(0.05, (now - lastTickMs) / 1000);
    lastTickMs = now;
    tickSpring(dt);
    renderer.render(scene, camera);
  }
```

- [ ] **Step 4: Manual verify**

Reload. Set slider to ~0.65; click `Stand` then `Slump` — the body should swing smoothly between poses rather than snap. Drag the slider to ~0.05 — the body should sag forward over a second or two (head droops, shoulders fall). Crank to 1.0 — it snaps stiff and holds the current preset exactly.

- [ ] **Step 5: Commit**

```bash
git add brett/public/index.html
git commit -m "feat(brett): Verlet spring with gravity-blended stiffness"
```

---

## Task 6: Stiffness slider wiring (local-only for now)

**Files:**
- Modify: `brett/public/index.html`

- [ ] **Step 1: Bind the slider**

Append above `tick()`:

```js
  const stiffSlider = document.getElementById('stiffness');
  stiffSlider.addEventListener('input', () => {
    STATE.stiffness = parseFloat(stiffSlider.value);
    sendStiffness(STATE.stiffness);
  });
  function sendStiffness(/* value */) { /* placeholder until Task 10 */ }
```

- [ ] **Step 2: Manual verify**

Slider visibly updates `STATE.stiffness` in the console (`STATE.stiffness` after each input) and the spring response above already reflects it.

- [ ] **Step 3: Commit**

```bash
git add brett/public/index.html
git commit -m "feat(brett): wire stiffness slider to spring state"
```

---

## Task 7: CCD-IK with contact-point drag

**Files:**
- Modify: `brett/public/index.html`

- [ ] **Step 1: Add raycaster + chain definitions**

Insert above `tick()`:

```js
  // ----- CCD-IK -----
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  // Chains: end-effector first, root last. Only bones in the chain are rotated.
  const IK_CHAINS = {
    lWrist: ['lElbow', 'lShoulder'],
    rWrist: ['rElbow', 'rShoulder'],
    lAnkle: ['lKnee',  'lHip'],
    rAnkle: ['rKnee',  'rHip'],
    lKnee:  ['lHip'],
    rKnee:  ['rHip'],
    lElbow: ['lShoulder'],
    rElbow: ['rShoulder'],
    head:   ['hips'],
  };

  function setNdc(ev) {
    const rect = renderer.domElement.getBoundingClientRect();
    ndc.x =  ((ev.clientX - rect.left) / rect.width)  * 2 - 1;
    ndc.y = -((ev.clientY - rect.top)  / rect.height) * 2 + 1;
  }

  function pickContact(ev) {
    setNdc(ev);
    raycaster.setFromCamera(ndc, camera);
    const meshes = [];
    for (const fig of STATE.figures) {
      fig.root.traverse(o => { if (o.userData && o.userData.isContact) meshes.push(o); });
    }
    const hit = raycaster.intersectObjects(meshes, false)[0];
    return hit ? hit.object : null;
  }

  function pickMannequinBody(ev) {
    setNdc(ev);
    raycaster.setFromCamera(ndc, camera);
    for (const fig of STATE.figures) {
      const hits = raycaster.intersectObject(fig.root, true);
      const nonContact = hits.find(h => !(h.object.userData && h.object.userData.isContact));
      if (nonContact) return fig;
    }
    return null;
  }

  function pickFloor(ev) {
    setNdc(ev);
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObject(floor, false)[0];
    return hit ? hit.point : null;
  }

  // CCD: rotate chain bones so end-effector sphere world position approaches targetWorld.
  function ccdIK(fig, endBoneName, targetWorld, iterations = 8) {
    const chain = IK_CHAINS[endBoneName];
    if (!chain) return;
    const endSphere = fig.bones[endBoneName].children.find(c => c.userData && c.userData.isContact);
    if (!endSphere) return;
    const endWorld = new THREE.Vector3();
    const boneWorld = new THREE.Vector3();
    const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3();
    const qWorld = new THREE.Quaternion();
    for (let iter = 0; iter < iterations; iter++) {
      for (const boneName of chain) {
        const bone = fig.bones[boneName];
        bone.updateMatrixWorld(true);
        endSphere.getWorldPosition(endWorld);
        bone.getWorldPosition(boneWorld);
        tmpA.subVectors(endWorld, boneWorld).normalize();
        tmpB.subVectors(targetWorld, boneWorld).normalize();
        if (tmpA.lengthSq() < 1e-8 || tmpB.lengthSq() < 1e-8) continue;
        const dot = Math.max(-1, Math.min(1, tmpA.dot(tmpB)));
        const angle = Math.acos(dot);
        if (angle < 1e-3) continue;
        const axis = new THREE.Vector3().crossVectors(tmpA, tmpB).normalize();
        if (!isFinite(axis.x)) continue;
        qWorld.setFromAxisAngle(axis, angle);
        // Convert world rotation to local
        const parentQ = new THREE.Quaternion();
        bone.parent.getWorldQuaternion(parentQ).invert();
        const localDelta = new THREE.Quaternion().multiplyQuaternions(parentQ, qWorld).multiply(bone.parent.getWorldQuaternion(new THREE.Quaternion()));
        bone.quaternion.premultiply(localDelta);
        // Re-extract x/z Euler for the override store
        const e = new THREE.Euler().setFromQuaternion(bone.quaternion, 'XYZ');
        fig.boneOverrides[boneName] = { x: e.x, z: e.z };
        bone.rotation.x = e.x; bone.rotation.z = e.z; bone.rotation.y = 0;
      }
    }
  }

  // ----- Drag handling -----
  let dragging = null; // { figId, boneName, plane: Plane }

  renderer.domElement.addEventListener('mousedown', (e) => {
    if (e.button !== 0 || e.shiftKey) return;
    const sphere = pickContact(e);
    if (sphere) {
      const fig = STATE.figures.find(f => f.id === sphere.userData.figureId);
      if (!fig) return;
      selectFigure(fig.id);
      const worldPos = new THREE.Vector3();
      sphere.getWorldPosition(worldPos);
      // Drag plane parallel to camera, through the sphere
      const camDir = new THREE.Vector3();
      camera.getWorldDirection(camDir);
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(camDir, worldPos);
      dragging = { figId: fig.id, boneName: sphere.userData.boneName, plane };
      e.preventDefault();
    }
  });

  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    setNdc(e);
    raycaster.setFromCamera(ndc, camera);
    const target = new THREE.Vector3();
    raycaster.ray.intersectPlane(dragging.plane, target);
    if (!target) return;
    const fig = STATE.figures.find(f => f.id === dragging.figId);
    if (!fig) return;
    ccdIK(fig, dragging.boneName, target, 6);
    sendUpdate(fig, { boneOverrides: fig.boneOverrides });
  });

  window.addEventListener('mouseup', () => {
    if (!dragging) return;
    const fig = STATE.figures.find(f => f.id === dragging.figId);
    if (fig) {
      // Clear overrides for the dragged chain so spring resumes
      const chain = IK_CHAINS[dragging.boneName] || [];
      for (const b of chain) delete fig.boneOverrides[b];
      // Also clear the end-effector entry if any
      delete fig.boneOverrides[dragging.boneName];
      sendUpdate(fig, { boneOverrides: fig.boneOverrides });
    }
    dragging = null;
  });
```

- [ ] **Step 2: Manual verify**

Reload. Click `Stand`, set slider to 0.5. Drag the gold sphere on the left wrist around with the mouse — the left arm should follow the cursor; the rest of the body stays under spring control. Release: the arm springs back toward the preset target.

- [ ] **Step 3: Commit**

```bash
git add brett/public/index.html
git commit -m "feat(brett): CCD-IK on contact-sphere drag with override resume"
```

---

## Task 8: Click-to-select and double-click-to-add figure

**Files:**
- Modify: `brett/public/index.html`

- [ ] **Step 1: Add click handlers**

Insert above `tick()`:

```js
  renderer.domElement.addEventListener('click', (e) => {
    if (dragging) return;
    // Already handled by mousedown for contact spheres; this handles body / floor clicks
    if (e.shiftKey) return;
    const body = pickMannequinBody(e);
    if (body) { selectFigure(body.id); return; }
    const floorPt = pickFloor(e);
    if (floorPt && STATE.selectedId) {
      // Walk-to-click handled in Task 9; for now: deselect on empty floor click only via ESC
    }
  });

  renderer.domElement.addEventListener('dblclick', (e) => {
    const floorPt = pickFloor(e);
    if (floorPt) addFigure({ x: floorPt.x, z: floorPt.z });
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      STATE.selectedId = null;
      for (const f of STATE.figures) f.ring.visible = false;
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && STATE.selectedId) {
      const idx = STATE.figures.findIndex(f => f.id === STATE.selectedId);
      if (idx >= 0) {
        scene.remove(STATE.figures[idx].root);
        STATE.figures.splice(idx, 1);
        STATE.selectedId = STATE.figures[0]?.id ?? null;
        if (STATE.selectedId) selectFigure(STATE.selectedId);
        sendDelete(idx);
      }
    } else if (e.key === 'Tab' && STATE.figures.length > 1) {
      e.preventDefault();
      const idx = STATE.figures.findIndex(f => f.id === STATE.selectedId);
      const next = STATE.figures[(idx + 1) % STATE.figures.length];
      selectFigure(next.id);
    }
  });
  function sendDelete() { /* placeholder until Task 10 */ }
```

- [ ] **Step 2: Manual verify**

Reload. Double-click on the floor → new mannequin appears at that point and is selected. Click on another mannequin → selection moves. `Tab` → cycles. `Esc` → deselects. `Delete` → removes selected.

- [ ] **Step 3: Commit**

```bash
git add brett/public/index.html
git commit -m "feat(brett): figure click/dblclick/tab/delete management"
```

---

## Task 9: Walk system (click-to-walk + WASD + walk animation + state pill)

**Files:**
- Modify: `brett/public/index.html`

- [ ] **Step 1: Add walk tick, WASD state, click-to-walk, status pill updates**

Insert above `tick()`:

```js
  // ----- Walking -----
  const WALK_SPEED = 2.0;          // units/s
  const TURN_RATE  = 8.0;          // rad/s
  const ARRIVE_EPS = 0.3;          // distance threshold
  const wasdKeys = { w:false, a:false, s:false, d:false };

  window.addEventListener('keydown', (e) => {
    if (e.key.length === 1 && wasdKeys.hasOwnProperty(e.key.toLowerCase())) wasdKeys[e.key.toLowerCase()] = true;
  });
  window.addEventListener('keyup', (e) => {
    if (e.key.length === 1 && wasdKeys.hasOwnProperty(e.key.toLowerCase())) wasdKeys[e.key.toLowerCase()] = false;
  });

  // Click-to-walk: extend the existing click handler — replace the empty branch from Task 8.
  // (Search for the comment "Walk-to-click handled in Task 9" and replace that line with the body below.)
  function _walkBindings_marker() {}
  // Real handler:
  renderer.domElement.addEventListener('click', (e) => {
    if (dragging) return;
    if (e.shiftKey) return;
    if (pickMannequinBody(e)) return; // selection click already happened
    const floorPt = pickFloor(e);
    if (!floorPt || !STATE.selectedId) return;
    if (STATE.stiffness < 0.3) return; // body too limp
    const fig = STATE.figures.find(f => f.id === STATE.selectedId);
    if (fig) { fig.walkTarget = { x: floorPt.x, z: floorPt.z }; fig.walking = true; sendUpdate(fig, { walkTarget: fig.walkTarget, walking: true }); }
  });

  function tickWalkAnimation(fig, t) {
    if (!fig.walking) return;
    const phase = t * 4.0;
    // Override-respecting: spring already left these bones alone if not in boneOverrides
    if (!fig.boneOverrides.lHip)      fig.bone.lHip.targetRot.x      = Math.sin(phase) * 0.6;
    if (!fig.boneOverrides.rHip)      fig.bone.rHip.targetRot.x      = Math.sin(phase + Math.PI) * 0.6;
    if (!fig.boneOverrides.lKnee)     fig.bone.lKnee.targetRot.x     = Math.max(0, Math.sin(phase + Math.PI*0.5)) * 0.8;
    if (!fig.boneOverrides.rKnee)     fig.bone.rKnee.targetRot.x     = Math.max(0, Math.sin(phase + Math.PI*1.5)) * 0.8;
    if (!fig.boneOverrides.lShoulder) fig.bone.lShoulder.targetRot.x = Math.sin(phase + Math.PI) * 0.4;
    if (!fig.boneOverrides.rShoulder) fig.bone.rShoulder.targetRot.x = Math.sin(phase) * 0.4;
  }

  function tickWalk(dt, t) {
    const stiff = STATE.stiffness;
    for (const fig of STATE.figures) {
      // WASD only for selected figure
      let dx = 0, dz = 0;
      if (fig.id === STATE.selectedId && stiff >= 0.3) {
        if (wasdKeys.w) { dx += -Math.sin(cameraOrbit.theta); dz += -Math.cos(cameraOrbit.theta); }
        if (wasdKeys.s) { dx +=  Math.sin(cameraOrbit.theta); dz +=  Math.cos(cameraOrbit.theta); }
        if (wasdKeys.a) { dx += -Math.cos(cameraOrbit.theta); dz +=  Math.sin(cameraOrbit.theta); }
        if (wasdKeys.d) { dx +=  Math.cos(cameraOrbit.theta); dz += -Math.sin(cameraOrbit.theta); }
        const mag = Math.hypot(dx, dz);
        if (mag > 1e-3) {
          dx /= mag; dz /= mag;
          fig.walkTarget = null;
          fig.walking = true;
          fig.root.position.x += dx * WALK_SPEED * dt;
          fig.root.position.z += dz * WALK_SPEED * dt;
          const want = Math.atan2(dx, dz);
          const diff = ((want - fig.facingY + Math.PI*3) % (Math.PI*2)) - Math.PI;
          fig.facingY += Math.max(-TURN_RATE*dt, Math.min(TURN_RATE*dt, diff));
          fig.root.rotation.y = fig.facingY;
        }
      }
      // Click-to-walk target
      if (fig.walkTarget) {
        const tx = fig.walkTarget.x - fig.root.position.x;
        const tz = fig.walkTarget.z - fig.root.position.z;
        const dist = Math.hypot(tx, tz);
        if (dist < ARRIVE_EPS) {
          fig.walkTarget = null; fig.walking = false;
        } else if (stiff >= 0.3) {
          const ndx = tx / dist, ndz = tz / dist;
          fig.root.position.x += ndx * WALK_SPEED * dt;
          fig.root.position.z += ndz * WALK_SPEED * dt;
          const want = Math.atan2(ndx, ndz);
          const diff = ((want - fig.facingY + Math.PI*3) % (Math.PI*2)) - Math.PI;
          fig.facingY += Math.max(-TURN_RATE*dt, Math.min(TURN_RATE*dt, diff));
          fig.root.rotation.y = fig.facingY;
          fig.walking = true;
        } else {
          fig.walking = false;
        }
      } else if (Math.hypot(dx, dz) < 1e-3) {
        fig.walking = false;
      }
      tickWalkAnimation(fig, t);
    }
  }

  // ----- Status pill -----
  const pillEl = document.getElementById('status-pill');
  function updateStatusPill() {
    const fig = STATE.figures.find(f => f.id === STATE.selectedId);
    if (STATE.stiffness < 0.3) { pillEl.textContent = 'zu schlaff zum Laufen — Slider nach rechts'; return; }
    if (dragging) { pillEl.textContent = '● Drag … · Loslassen = resume'; return; }
    if (!fig) { pillEl.textContent = 'Klick = Figur wählen · Doppelklick Boden = neue Figur'; return; }
    if (fig.walking) { pillEl.textContent = '→ Ziel … · Klick = neues Ziel · ESC = stop'; return; }
    pillEl.textContent = '🚶 WALK · WASD / Klick Boden = Ziel · Tab = nächste';
  }

  // Replace tick() to integrate walk + pill
  function _replaced_tick() {}
```

- [ ] **Step 2: Replace the render loop again to call `tickWalk` and `updateStatusPill`**

Find `function tick()` and replace it with:

```js
  function tick() {
    requestAnimationFrame(tick);
    const now = performance.now();
    const dt = Math.min(0.05, (now - lastTickMs) / 1000);
    lastTickMs = now;
    tickWalk(dt, now / 1000);
    tickSpring(dt);
    updateStatusPill();
    renderer.render(scene, camera);
  }
```

Also: remove the placeholder click handler from Task 8 (the one with `// Walk-to-click handled in Task 9`) since the new handler above replaces it. Make sure only one floor-click handler attaches walk targets — keep the new one, delete the older empty branch.

- [ ] **Step 3: Manual verify**

Reload. Click the floor with stiffness ≥ 0.3 → selected mannequin walks toward the click with leg/arm swing; arrives within ~0.3 of the target. Click another floor point mid-walk → retargets. Press `W`/`A`/`S`/`D` → walks camera-relative; facing rotates smoothly. Drop slider below 0.3 → pill switches to "zu schlaff…", walking stops. While dragging a contact sphere → pill shows "Drag …".

- [ ] **Step 4: Commit**

```bash
git add brett/public/index.html
git commit -m "feat(brett): click + WASD walk system with leg/arm animation"
```

---

## Task 10: WebSocket sync — client side

**Files:**
- Modify: `brett/public/index.html`

- [ ] **Step 1: Connect to `/sync`, join a room, handle snapshot + per-message types**

Insert above `tick()`:

```js
  // ----- WebSocket sync -----
  const roomFromUrl = new URLSearchParams(location.search).get('room') || 'default';
  const wsProto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${wsProto}//${location.host}/sync`);
  let wsReady = false;

  ws.addEventListener('open', () => {
    wsReady = true;
    ws.send(JSON.stringify({ type: 'join', room: roomFromUrl }));
  });
  ws.addEventListener('close', () => { wsReady = false; });

  ws.addEventListener('message', (evt) => {
    let msg; try { msg = JSON.parse(evt.data); } catch { return; }
    switch (msg.type) {
      case 'snapshot':
        // Reset world from server state
        for (const f of STATE.figures) scene.remove(f.root);
        STATE.figures.length = 0; STATE.selectedId = null;
        for (const f of (msg.figures || [])) {
          const fig = makeMannequin(f.id, { x: f.x ?? 0, z: f.z ?? 0 });
          fig.facingY = f.facingY ?? 0; fig.root.rotation.y = fig.facingY;
          if (f.preset && PRESETS[f.preset]) {
            for (const name of BONE_NAMES) {
              fig.bone[name].targetRot.x = PRESETS[f.preset][name].x;
              fig.bone[name].targetRot.z = PRESETS[f.preset][name].z;
            }
          }
          if (f.boneOverrides) fig.boneOverrides = { ...f.boneOverrides };
          if (f.walkTarget) fig.walkTarget = f.walkTarget;
          STATE.figures.push(fig);
        }
        if (typeof msg.stiffness === 'number') {
          STATE.stiffness = msg.stiffness; stiffSlider.value = String(msg.stiffness);
        }
        if (STATE.figures[0]) selectFigure(STATE.figures[0].id);
        break;
      case 'stiffness':
        STATE.stiffness = msg.value; stiffSlider.value = String(msg.value);
        break;
      case 'add': {
        if (STATE.figures.find(f => f.id === msg.figure.id)) break;
        const fig = makeMannequin(msg.figure.id, { x: msg.figure.x, z: msg.figure.z });
        STATE.figures.push(fig);
        break;
      }
      case 'update': {
        const fig = STATE.figures.find(f => f.id === msg.id);
        if (!fig) break;
        const c = msg.changes || {};
        if (c.preset && PRESETS[c.preset]) {
          for (const name of BONE_NAMES) {
            fig.bone[name].targetRot.x = PRESETS[c.preset][name].x;
            fig.bone[name].targetRot.z = PRESETS[c.preset][name].z;
          }
        }
        if (c.boneOverrides !== undefined) fig.boneOverrides = { ...c.boneOverrides };
        if (c.walkTarget !== undefined) fig.walkTarget = c.walkTarget;
        if (c.walking !== undefined) fig.walking = !!c.walking;
        break;
      }
      case 'move': {
        const fig = STATE.figures.find(f => f.id === msg.id);
        if (!fig) break;
        fig.root.position.x = msg.x; fig.root.position.z = msg.z;
        if (typeof msg.facingY === 'number') { fig.facingY = msg.facingY; fig.root.rotation.y = msg.facingY; }
        break;
      }
      case 'delete': {
        const idx = STATE.figures.findIndex(f => f.id === msg.id);
        if (idx >= 0) { scene.remove(STATE.figures[idx].root); STATE.figures.splice(idx, 1); }
        break;
      }
      case 'info':
        STATE.online = msg.count || 1;
        document.getElementById('online-count').textContent = String(STATE.online);
        break;
    }
  });

  // Replace the placeholders defined earlier
  window.sendUpdate = function(fig, changes) {
    if (!wsReady) return;
    ws.send(JSON.stringify({ type: 'update', id: fig.id, changes }));
  };
  window.sendStiffness = function(value) {
    if (!wsReady) return;
    ws.send(JSON.stringify({ type: 'stiffness', value }));
  };
  window.sendDelete = function(/* idx */) {
    if (!wsReady || !STATE.selectedId) return;
    ws.send(JSON.stringify({ type: 'delete', id: STATE.selectedId }));
  };

  // When adding a figure locally, also broadcast it
  const _origAdd = addFigure;
  addFigure = function(position) {
    const fig = _origAdd(position);
    if (wsReady) ws.send(JSON.stringify({ type: 'add', figure: { id: fig.id, type: 'mannequin', x: position.x, z: position.z } }));
    return fig;
  };

  // Periodically broadcast position for the selected figure so peers see walking
  setInterval(() => {
    if (!wsReady) return;
    const fig = STATE.figures.find(f => f.id === STATE.selectedId);
    if (!fig) return;
    ws.send(JSON.stringify({ type: 'move', id: fig.id, x: fig.root.position.x, z: fig.root.position.z, facingY: fig.facingY }));
  }, 100);
```

- [ ] **Step 2: Replace the previously-declared placeholder helpers**

Earlier tasks declared `function sendUpdate() {}`, `function sendStiffness() {}`, `function sendDelete() {}` as no-ops. The block above re-assigns them on `window`. Remove the earlier `function sendX() {}` placeholder declarations so the assignments aren't shadowed by hoisted empties — or change those earlier declarations to `var sendUpdate = function(){}` etc. so the later `window.sendUpdate = ...` actually wins. Pick one approach and apply consistently.

- [ ] **Step 3: Manual verify**

Open two browser tabs to `http://localhost:3000/?room=test`. Click `Stand` in tab 1 — both tabs animate to standing. Drag a contact sphere in tab 1 — tab 2 sees the IK rotation. Walk in tab 1 — tab 2 sees the figure translate. Move the stiffness slider in tab 1 — tab 2's slider position updates. Online indicator shows `● 2 online` in both.

- [ ] **Step 4: Commit**

```bash
git add brett/public/index.html
git commit -m "feat(brett): WebSocket sync for figures, presets, IK, walk, stiffness"
```

---

## Task 11: Server — handle `stiffness` broadcast, drop art-library static mount

**Files:**
- Modify: `brett/server.js`

- [ ] **Step 1: Add `stiffness` to the message switch and persist it on room state**

In `brett/server.js`, find the `switch` inside the message handler (look for `case 'optik':` near line 192) and add a `case 'stiffness':` arm next to it that:
1. Stores `state.stiffness = msg.value` on the room state object (alongside whatever already lives there for `optik`).
2. Broadcasts the message to all other connections in the room: `broadcast(room, msg, ws);`

Then, in the snapshot send (look for the line that sends `{ type: 'snapshot', figures: ..., optik: ... }`), add `stiffness: state.stiffness ?? 0.65` to the object.

- [ ] **Step 2: Drop the `art-library` static mount**

Search for any `express.static(...art-library...)` or `app.use('/art-library', ...)` line in `server.js`. Delete it. If nothing matches, no change is needed.

- [ ] **Step 3: Manual verify**

```bash
cd brett && node server.js
```

Open two tabs to `http://localhost:3000/?room=t11`. Move the slider in tab 1 → tab 2 follows. Refresh tab 2 → it snapshots with the same `stiffness` value (slider position matches).

Also verify `curl -sI http://localhost:3000/art-library/anything` returns 404.

- [ ] **Step 4: Commit**

```bash
git add brett/server.js
git commit -m "feat(brett): server-side stiffness sync; drop art-library mount"
```

---

## Task 12: Delete the legacy art-library directory and the .legacy backup

**Files:**
- Delete: `brett/public/art-library/`
- Delete: `brett/public/index.html.legacy`

- [ ] **Step 1: Remove the directories**

```bash
git rm -r brett/public/art-library
git rm brett/public/index.html.legacy
```

- [ ] **Step 2: Verify the app still loads**

```bash
cd brett && node server.js &
SERVER=$!
sleep 1
curl -sf http://localhost:3000/ > /dev/null && echo OK
kill $SERVER
```

Expected: `OK`.

- [ ] **Step 3: Commit**

```bash
git commit -m "chore(brett): remove art-library assets and legacy index backup"
```

---

## Task 13: Final smoke test and PR-prep

- [ ] **Step 1: Full feature smoke (single session, single tab)**

```bash
cd brett && node server.js
```

In a browser, walk through every spec section:

1. Topbar present, no rail/dock/minimap (§1).
2. Click each of the 6 presets — body morphs to each (§4).
3. Slider at 0.05 → body sags forward; at 1.0 → snaps stiff (§3).
4. Drag every coloured contact sphere (gold/green/blue/brass/red) — chain follows cursor, release springs back (§2, §3).
5. Double-click floor → new figure spawns at click (§6).
6. Click another figure → selection moves, dim/bright swap correctly (§6).
7. `Tab` cycles, `Esc` deselects, `Del` removes (§6).
8. Click floor with selection → figure walks to target with arm/leg swing (§5).
9. WASD → camera-relative walk; facing slerps (§5).
10. Slider < 0.3 → status pill says "zu schlaff …" and walking stops (§5, §1).

- [ ] **Step 2: Two-tab sync smoke**

Open two tabs at `?room=smoke`. Verify add / select / preset / drag / walk / stiffness all propagate, and `● N online` updates on connect/disconnect.

- [ ] **Step 3: Commit anything that was tweaked**

```bash
git status
git add -A
git diff --cached
git commit -m "chore(brett): final tweaks from manual smoke" || echo "nothing to commit"
```

- [ ] **Step 4: Push and open PR**

```bash
git push -u origin feature/brett-mannequin-focus
gh pr create --title "feat(brett): rebuild as mannequin-focus sandbox" --body "$(cat <<'EOF'
## Summary
- Strips Brett of settings panels, art-library, constellation selector
- Adds slim topbar with 6 pose presets + stiffness slider
- Implements Verlet spring + CCD-IK ragdoll on 9 contact points
- Adds click-to-walk + WASD walk system with arm/leg animation
- Extends WebSocket sync: stiffness broadcast, boneOverrides, walkTarget

Spec: docs/superpowers/specs/2026-05-14-brett-mannequin-focus-design.md
Plan: docs/superpowers/plans/2026-05-14-brett-mannequin-focus.md

## Test plan
- [x] All 6 presets transition smoothly
- [x] Slider blends physics ↔ IK as expected
- [x] All 9 contact spheres are draggable with CCD-IK chain
- [x] Click-to-walk and WASD both honour camera azimuth
- [x] Two-tab sync covers add/select/preset/drag/walk/stiffness
EOF
)"
```

- [ ] **Step 5: Deploy to both prod clusters after merge**

```bash
task feature:brett
```

(Per CLAUDE.md: `feature:brett` rebuilds and rolls Brett on both `mentolder` and `korczewski` clusters.)

---

## Self-Review Notes

- **Spec coverage:** §1 topbar+pill (Tasks 1, 9), §2 mannequin+spheres (Task 3), §3 spring+IK (Tasks 5, 7), §4 presets (Task 4), §5 walk (Task 9), §6 figure mgmt (Task 8), §7 WS sync (Tasks 10, 11), §8 file changes (Tasks 1, 11, 12), §9 out-of-scope respected (no physics lib, no recording, no save).
- **No-placeholder check:** every code step shows the actual code. The Task 7 floor-click branch is intentionally a stub line replaced in Task 9 — note left for the engineer.
- **Type/name consistency:** bone names are reused across tasks (`bones[name]`, `fig.bone[name].targetRot`); `STATE.figures`, `STATE.selectedId`, `STATE.stiffness` are stable; sync message types match between client (Task 10) and server (Task 11) — `stiffness`, `update`, `add`, `move`, `delete`, `info`, `snapshot`.

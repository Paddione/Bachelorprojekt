---
ticket_id: T000369
title: Brett Mannequin — Implementierungsplan
domains: []
status: done
pr_number: 761
---

# Brett Mannequin — Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Holz-Künstlermännequin als neuen Figurtyp im Brett-Service implementieren — vollgelenkig, mit Walk-Animation, klickbaren Messing-Gelenken und Art-Library-Integration.

**Architecture:** Alle neuen Funktionen landen als abgegrenzte Mannequin-Sektion am Ende von `brett/public/index.html`, direkt vor `animate()`. Eingriffe in bestehenden Code beschränken sich auf genau 10 Callsites (CAT_LABELS, buildFigure, bootArtLibrary, renderTabContent, addFigure, recolorFigure, selectFigure, figToJSON, applyRemote, animate-Loop). `manifest.json` erhält einen neuen Eintrag.

**Tech Stack:** Three.js r128 (bereits vorhanden) · Canvas 2D API (Thumbnail) · bestehender Brett-WebSocket-Sync

---

## Geänderte Dateien

| Datei | Änderung |
|---|---|
| `brett/public/art-library/manifest.json` | 1 neuer Eintrag (mannequin, kind=mannequin, category=3d) |
| `brett/public/index.html` | Neue Mannequin-Sektion + 10 Callsite-Eingriffe |

---

## Smoke-Test-Setup (einmalig vor Task 2)

Brett benötigt `DATABASE_URL`. Für lokale Tests gegen den Dev-Cluster:

```bash
# Dev-Port-Forward starten (in separatem Terminal lassen)
kubectl port-forward svc/brett 3000:3000 -n workspace-dev --context mentolder
# Dann im Browser: http://localhost:3000
```

Alternativ nach jedem Task deployen:
```bash
task brett:build && task brett:deploy ENV=dev
# URL: https://brett.dev.mentolder.de
```

---

## Task 1: manifest.json — Mannequin-Eintrag

**Files:**
- Modify: `brett/public/art-library/manifest.json`

- [ ] **Schritt 1: Baseline-Testlauf**

```bash
task test:all
```

Erwartet: alle Tests grün (PASS). Falls rot — erst fixen, dann weitermachen.

- [ ] **Schritt 2: Eintrag in manifest.json ergänzen**

Am Ende des `"assets"`-Arrays, nach dem letzten `wurzel`-Eintrag, vor der schließenden `]`:

```json
    { "id": "mannequin", "kind": "mannequin", "label": "Mannequin", "category": "3d" }
```

Das gesamte Array-Ende sieht dann so aus:
```json
    { "id": "wurzel", "kind": "character", "label": "Wurzel","category": "natur", "files": { "figurine": "wurzel.svg" } },
    { "id": "mannequin", "kind": "mannequin", "label": "Mannequin", "category": "3d" }
  ]
}
```

- [ ] **Schritt 3: Test-Suite erneut laufen**

```bash
task test:all
```

Erwartet: weiterhin alle Tests grün. Falls `test:manifests` fehlschlägt — Syntax der JSON prüfen.

- [ ] **Schritt 4: Commit**

```bash
git add brett/public/art-library/manifest.json
git commit -m "feat(brett): add mannequin to art-library manifest"
```

---

## Task 2: `buildMannequin()` — 3D-Skelett + `buildFigure`-Zweig

**Files:**
- Modify: `brett/public/index.html`

Die neue Mannequin-Sektion wird direkt **vor** der Zeile `animate();` eingefügt.
`buildFigure` erhält einen neuen `else if`-Zweig vor dem `else`-Fallback.

- [ ] **Schritt 1: Baseline-Testlauf**

```bash
task test:all
```

Erwartet: grün.

- [ ] **Schritt 2: `buildMannequin` als neue Sektion einfügen**

Suche die Zeile `animate();` am Ende der Datei.
**Unmittelbar davor** diesen Block einfügen:

```javascript
// ── Mannequin ─────────────────────────────────────────────────────────────────

function buildMannequin(color, group) {
  const woodCol  = new THREE.Color(color).lerp(new THREE.Color(0xd4a26a), 0.5);
  const brassCol = new THREE.Color(0xc8a96e);

  function woodMat() {
    return new THREE.MeshStandardMaterial({ color: woodCol.clone(), roughness: 0.75, metalness: 0.0 });
  }
  function brassMat() {
    return new THREE.MeshStandardMaterial({ color: brassCol.clone(), roughness: 0.35, metalness: 0.55 });
  }
  function brassJoint(r, parentGrp) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8), brassMat());
    s.castShadow = true;
    s.userData.isBrassJoint = true;
    s.userData.boneGroup    = parentGrp;
    parentGrp.add(s);
    return s;
  }

  // ── Trunk ────────────────────────────────────────────────────────
  const hipsGrp = new THREE.Group();
  hipsGrp.position.y = 1.10;
  group.add(hipsGrp);

  const pelvisMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.30, 0.26, 0.22, 16), woodMat());
  pelvisMesh.castShadow = true;
  hipsGrp.add(pelvisMesh);

  const spineGrp = new THREE.Group();
  spineGrp.position.y = 0.22;
  hipsGrp.add(spineGrp);

  const spineMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.20, 0.20, 0.28, 12), woodMat());
  spineMesh.position.y = 0.14;
  spineMesh.castShadow = true;
  spineGrp.add(spineMesh);

  const chestGrp = new THREE.Group();
  chestGrp.position.y = 0.28;
  spineGrp.add(chestGrp);

  const chestMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.22, 0.34, 16), woodMat());
  chestMesh.position.y = 0.17;
  chestMesh.castShadow = true;
  chestGrp.add(chestMesh);

  const neckGrp = new THREE.Group();
  neckGrp.position.y = 0.34;
  chestGrp.add(neckGrp);

  const neckMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.10, 0.18, 10), woodMat());
  neckMesh.position.y = 0.09;
  neckMesh.castShadow = true;
  neckGrp.add(neckMesh);

  const headGrp = new THREE.Group();
  headGrp.position.y = 0.18;
  neckGrp.add(headGrp);

  const headSphere = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), woodMat());
  headSphere.position.y = 0.22;
  headSphere.castShadow = true;
  headGrp.add(headSphere);

  // ── Arms ─────────────────────────────────────────────────────────
  const lShoulderGrp = new THREE.Group();
  lShoulderGrp.position.set(0.35, 0.28, 0);
  chestGrp.add(lShoulderGrp);
  brassJoint(0.070, lShoulderGrp);

  const lUpperArmMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.35, 10), woodMat());
  lUpperArmMesh.position.y = -0.175;
  lUpperArmMesh.castShadow = true;
  lShoulderGrp.add(lUpperArmMesh);

  const lElbowGrp = new THREE.Group();
  lElbowGrp.position.y = -0.35;
  lShoulderGrp.add(lElbowGrp);
  brassJoint(0.065, lElbowGrp);

  const lForearmMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.30, 10), woodMat());
  lForearmMesh.position.y = -0.15;
  lForearmMesh.castShadow = true;
  lElbowGrp.add(lForearmMesh);

  const lWristGrp = new THREE.Group();
  lWristGrp.position.y = -0.30;
  lElbowGrp.add(lWristGrp);
  brassJoint(0.055, lWristGrp);

  const lHandMesh = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.14, 0.05), woodMat());
  lHandMesh.position.y = -0.07;
  lHandMesh.castShadow = true;
  lWristGrp.add(lHandMesh);

  const rShoulderGrp = new THREE.Group();
  rShoulderGrp.position.set(-0.35, 0.28, 0);
  chestGrp.add(rShoulderGrp);
  brassJoint(0.070, rShoulderGrp);

  const rUpperArmMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.35, 10), woodMat());
  rUpperArmMesh.position.y = -0.175;
  rUpperArmMesh.castShadow = true;
  rShoulderGrp.add(rUpperArmMesh);

  const rElbowGrp = new THREE.Group();
  rElbowGrp.position.y = -0.35;
  rShoulderGrp.add(rElbowGrp);
  brassJoint(0.065, rElbowGrp);

  const rForearmMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.30, 10), woodMat());
  rForearmMesh.position.y = -0.15;
  rForearmMesh.castShadow = true;
  rElbowGrp.add(rForearmMesh);

  const rWristGrp = new THREE.Group();
  rWristGrp.position.y = -0.30;
  rElbowGrp.add(rWristGrp);
  brassJoint(0.055, rWristGrp);

  const rHandMesh = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.14, 0.05), woodMat());
  rHandMesh.position.y = -0.07;
  rHandMesh.castShadow = true;
  rWristGrp.add(rHandMesh);

  // ── Legs ─────────────────────────────────────────────────────────
  const lHipGrp = new THREE.Group();
  lHipGrp.position.set(0.14, 0, 0);
  hipsGrp.add(lHipGrp);
  brassJoint(0.075, lHipGrp);

  const lThighMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.08, 0.45, 12), woodMat());
  lThighMesh.position.y = -0.225;
  lThighMesh.castShadow = true;
  lHipGrp.add(lThighMesh);

  const lKneeGrp = new THREE.Group();
  lKneeGrp.position.y = -0.45;
  lHipGrp.add(lKneeGrp);
  brassJoint(0.070, lKneeGrp);

  const lShinMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.065, 0.42, 12), woodMat());
  lShinMesh.position.y = -0.21;
  lShinMesh.castShadow = true;
  lKneeGrp.add(lShinMesh);

  const lAnkleGrp = new THREE.Group();
  lAnkleGrp.position.y = -0.42;
  lKneeGrp.add(lAnkleGrp);
  brassJoint(0.060, lAnkleGrp);

  const lFootMesh = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.06, 0.22), woodMat());
  lFootMesh.position.set(0, -0.03, 0.06);
  lFootMesh.castShadow = true;
  lAnkleGrp.add(lFootMesh);

  const rHipGrp = new THREE.Group();
  rHipGrp.position.set(-0.14, 0, 0);
  hipsGrp.add(rHipGrp);
  brassJoint(0.075, rHipGrp);

  const rThighMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.08, 0.45, 12), woodMat());
  rThighMesh.position.y = -0.225;
  rThighMesh.castShadow = true;
  rHipGrp.add(rThighMesh);

  const rKneeGrp = new THREE.Group();
  rKneeGrp.position.y = -0.45;
  rHipGrp.add(rKneeGrp);
  brassJoint(0.070, rKneeGrp);

  const rShinMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.065, 0.42, 12), woodMat());
  rShinMesh.position.y = -0.21;
  rShinMesh.castShadow = true;
  rKneeGrp.add(rShinMesh);

  const rAnkleGrp = new THREE.Group();
  rAnkleGrp.position.y = -0.42;
  rKneeGrp.add(rAnkleGrp);
  brassJoint(0.060, rAnkleGrp);

  const rFootMesh = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.06, 0.22), woodMat());
  rFootMesh.position.set(0, -0.03, 0.06);
  rFootMesh.castShadow = true;
  rAnkleGrp.add(rFootMesh);

  group.userData.bones = {
    hips:      hipsGrp,
    spine:     spineGrp,
    chest:     chestGrp,
    neck:      neckGrp,
    head:      headGrp,
    lShoulder: lShoulderGrp,
    lElbow:    lElbowGrp,
    lWrist:    lWristGrp,
    rShoulder: rShoulderGrp,
    rElbow:    rElbowGrp,
    rWrist:    rWristGrp,
    lHip:      lHipGrp,
    lKnee:     lKneeGrp,
    lAnkle:    lAnkleGrp,
    rHip:      rHipGrp,
    rKnee:     rKneeGrp,
    rAnkle:    rAnkleGrp,
  };
  return group;
}
```

- [ ] **Schritt 3: `buildFigure`-Zweig für mannequin ergänzen**

Suche diesen Block in `buildFigure`:
```javascript
  } else if (type === 'diamond') {
    const octF = new THREE.Mesh(new THREE.OctahedronGeometry(1.05, 0), mat);
    octF.position.y = 1.05; octF.castShadow = true;
    group.add(octF);
    const dot = makeFaceMarker(color); dot.position.set(0, 1.05, 1.0); dot.scale.set(0.45, 0.45, 1); group.add(dot);
  } else {
```

Ersetze das `  } else {` am Ende durch:
```javascript
  } else if (type === 'diamond') {
    const octF = new THREE.Mesh(new THREE.OctahedronGeometry(1.05, 0), mat);
    octF.position.y = 1.05; octF.castShadow = true;
    group.add(octF);
    const dot = makeFaceMarker(color); dot.position.set(0, 1.05, 1.0); dot.scale.set(0.45, 0.45, 1); group.add(dot);
  } else if (type === 'mannequin') {
    buildMannequin(color, group);
  } else {
```

Hinweis: `buildMannequin` ist erst weiter unten im Skript definiert. JavaScript function-Statements werden gehoisted — das funktioniert.

- [ ] **Schritt 4: `task test:all` laufen**

```bash
task test:all
```

Erwartet: grün.

- [ ] **Schritt 5: Smoke-Test — Mannequin erscheint im 3D**

Brett deployen oder Port-Forward nutzen. In der Browser-Konsole:
```javascript
const fig = addFigure('mannequin', '#c8843a', 0, 0, 'Test', 1.0, 0);
console.log(fig.mesh.userData.bones); // soll Objekt mit 17 Keys sein
```
Erwartet: Holzfarbene Figur mit Gliedmaßen erscheint auf dem Brett, Messing-Kugeln an den 12 Gelenken sichtbar.

- [ ] **Schritt 6: Commit**

```bash
git add brett/public/index.html
git commit -m "feat(brett): add buildMannequin() with full bone hierarchy"
```

---

## Task 3: State-Management — `addFigure` + `recolorFigure`

**Files:**
- Modify: `brett/public/index.html`

Nach diesem Task kennt ein mannequin-fig seine `bones` und `walking`-State — auch nach Recolor.

- [ ] **Schritt 1: `addFigure` — bones + walking initialisieren**

Suche in `addFigure`:
```javascript
  const fig = { type, color, mesh, label: label||'', sprite: null, scale: scale||1.0, rotY: rotY||0 };
  fig.id = id || `fig_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
  if (fig.label) { attachLabel(fig); }
  figures.push(fig);
  return fig;
```

Ersetze durch:
```javascript
  const fig = { type, color, mesh, label: label||'', sprite: null, scale: scale||1.0, rotY: rotY||0 };
  fig.id = id || `fig_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
  if (type === 'mannequin') {
    fig.bones   = mesh.userData.bones;
    fig.walking = false;
  }
  if (fig.label) { attachLabel(fig); }
  figures.push(fig);
  return fig;
```

- [ ] **Schritt 2: `recolorFigure` — bones + walking nach Rebuild übertragen**

Suche in `recolorFigure`:
```javascript
  fig.mesh = newMesh;
  if (fig.label) attachLabel(fig);
```

Ersetze durch:
```javascript
  fig.mesh = newMesh;
  if (fig.type === 'mannequin') {
    fig.bones   = newMesh.userData.bones;
    fig.walking = fig.walking || false;
  }
  if (fig.label) attachLabel(fig);
```

- [ ] **Schritt 3: `task test:all` laufen**

```bash
task test:all
```

Erwartet: grün.

- [ ] **Schritt 4: Smoke-Test — Recolor behält Figur-State**

```javascript
// In der Browser-Konsole:
const fig = addFigure('mannequin', '#c8843a', 0, 0, '', 1.0, 0);
console.assert(fig.bones !== undefined, 'bones nach addFigure vorhanden');
window.recolorFigure(fig, '#4488cc');
console.assert(fig.bones !== undefined, 'bones nach recolorFigure vorhanden');
console.assert(fig.mesh !== null, 'mesh nach recolorFigure vorhanden');
```

- [ ] **Schritt 5: Commit**

```bash
git add brett/public/index.html
git commit -m "feat(brett): mannequin state management in addFigure + recolorFigure"
```

---

## Task 4: Art-Library — `'3d'`-Tab mit Canvas-Thumbnail

**Files:**
- Modify: `brett/public/index.html`

Neues `mannequinIds`-Set. `renderTabContent` erhält einen Canvas-Button-Zweig. `bootArtLibrary` befüllt `mannequinIds`. `drawMannequinThumb` in der Mannequin-Sektion.

- [ ] **Schritt 1: `drawMannequinThumb` in der Mannequin-Sektion**

Nach `buildMannequin` (noch vor `animate();`) anhängen:

```javascript
function drawMannequinThumb(canvas) {
  canvas.width  = 64;
  canvas.height = 96;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#102540';
  ctx.fillRect(0, 0, 64, 96);
  ctx.strokeStyle = '#d4a26a';
  ctx.lineWidth   = 2;
  ctx.lineCap     = 'round';

  function seg(x1, y1, x2, y2) {
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  }
  function jnt(x, y) {
    ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#c8a96e'; ctx.fill();
  }

  // Head
  ctx.beginPath(); ctx.arc(32, 32, 9, 0, Math.PI * 2);
  ctx.strokeStyle = '#d4a26a'; ctx.stroke();
  // Trunk: neck (32,41) → pelvis (32,64)
  seg(32, 41, 32, 64);
  // Left arm:  shoulder(24,42) elbow(24,54) wrist(24,64)
  seg(32, 42, 24, 42); seg(24, 42, 24, 54); seg(24, 54, 24, 64);
  // Right arm: shoulder(40,42) elbow(40,54) wrist(40,64)
  seg(32, 42, 40, 42); seg(40, 42, 40, 54); seg(40, 54, 40, 64);
  // Left leg:  hip(29,64) knee(29,75) ankle(29,85) foot
  seg(32, 64, 29, 64); seg(29, 64, 29, 75); seg(29, 75, 29, 85); seg(29, 85, 22, 87);
  // Right leg: hip(35,64) knee(35,75) ankle(35,85) foot
  seg(32, 64, 35, 64); seg(35, 64, 35, 75); seg(35, 75, 35, 85); seg(35, 85, 42, 87);

  // Joints (Messing)
  jnt(24, 42); jnt(40, 42);  // shoulders
  jnt(24, 54); jnt(40, 54);  // elbows
  jnt(24, 64); jnt(40, 64);  // wrists
  jnt(29, 64); jnt(35, 64);  // hips
  jnt(29, 75); jnt(35, 75);  // knees
  jnt(29, 85); jnt(35, 85);  // ankles
}
```

- [ ] **Schritt 2: `'3d'`-Label + `mannequinIds`-Set deklarieren**

Suche:
```javascript
const CAT_LABELS = {
  personen:  '👤 Personen',
  rollen:    '🏢 Rollen',
  abstrakta: '◆ Abstrakta',
  symbole:   '♥ Symbole',
  raeume:    '🚪 Räume',
  natur:     '🌿 Natur',
};
```

Ersetze durch:
```javascript
const CAT_LABELS = {
  personen:  '👤 Personen',
  rollen:    '🏢 Rollen',
  abstrakta: '◆ Abstrakta',
  symbole:   '♥ Symbole',
  raeume:    '🚪 Räume',
  natur:     '🌿 Natur',
  '3d':      '🪆 3D',
};
const mannequinIds = new Set();
```

- [ ] **Schritt 3: `bootArtLibrary` — `mannequinIds` befüllen**

Suche in `bootArtLibrary`:
```javascript
    for (const a of ART_MANIFEST.assets) {
      if (a.kind === 'character') characterIds.add(a.id);
    }
```

Ersetze durch:
```javascript
    for (const a of ART_MANIFEST.assets) {
      if (a.kind === 'character') characterIds.add(a.id);
      if (a.kind === 'mannequin') mannequinIds.add(a.id);
    }
```

- [ ] **Schritt 4: `renderTabContent` — Canvas-Button-Zweig vor `characterIds`-Check**

Suche in `renderTabContent`:
```javascript
  for (const a of ART_MANIFEST.assets) {
    if (a.category !== categoryId) continue;
    if (!characterIds.has(a.id)) continue;
    const btn = document.createElement('button');
    btn.className = 'figure-btn';
    btn.dataset.type = a.id;
    btn.title = a.label || a.id;
    btn.setAttribute('aria-label', a.label || a.id);
    const artSpan = document.createElement('span');
    artSpan.className = 'figure-art';
    btn.appendChild(artSpan);
    const svgUrl = '/art-library/' + a.files.figurine;
    fetch(svgUrl).then(r => r.text()).then(svgText => {
      const parsed = new DOMParser().parseFromString(svgText, 'image/svg+xml');
      artSpan.appendChild(document.importNode(parsed.documentElement, true));
    });
    btn.addEventListener('click', () => {
      const x = (Math.random()-0.5)*(BW-4);
      const z = (Math.random()-0.5)*(BD-4);
      const fig = addFigure(btn.dataset.type, currentColor, x, z, '', 1.0, 0);
      send({ type: 'add', fig: figToJSON(fig) });
      selectFigure(fig);
      openLabelModal(fig);
    });
    container.appendChild(btn);
  }
```

Ersetze durch:
```javascript
  for (const a of ART_MANIFEST.assets) {
    if (a.category !== categoryId) continue;
    if (mannequinIds.has(a.id)) {
      const btn = document.createElement('button');
      btn.className = 'figure-btn';
      btn.dataset.type = a.id;
      btn.title = a.label || a.id;
      btn.setAttribute('aria-label', a.label || a.id);
      const thumbCanvas = document.createElement('canvas');
      drawMannequinThumb(thumbCanvas);
      thumbCanvas.style.cssText = 'width:32px;height:48px;display:block;margin:auto';
      btn.appendChild(thumbCanvas);
      btn.addEventListener('click', () => {
        const x = (Math.random()-0.5)*(BW-4);
        const z = (Math.random()-0.5)*(BD-4);
        const fig = addFigure(btn.dataset.type, currentColor, x, z, '', 1.0, 0);
        send({ type: 'add', fig: figToJSON(fig) });
        selectFigure(fig);
        openLabelModal(fig);
      });
      container.appendChild(btn);
      continue;
    }
    if (!characterIds.has(a.id)) continue;
    const btn = document.createElement('button');
    btn.className = 'figure-btn';
    btn.dataset.type = a.id;
    btn.title = a.label || a.id;
    btn.setAttribute('aria-label', a.label || a.id);
    const artSpan = document.createElement('span');
    artSpan.className = 'figure-art';
    btn.appendChild(artSpan);
    const svgUrl = '/art-library/' + a.files.figurine;
    fetch(svgUrl).then(r => r.text()).then(svgText => {
      const parsed = new DOMParser().parseFromString(svgText, 'image/svg+xml');
      artSpan.appendChild(document.importNode(parsed.documentElement, true));
    });
    btn.addEventListener('click', () => {
      const x = (Math.random()-0.5)*(BW-4);
      const z = (Math.random()-0.5)*(BD-4);
      const fig = addFigure(btn.dataset.type, currentColor, x, z, '', 1.0, 0);
      send({ type: 'add', fig: figToJSON(fig) });
      selectFigure(fig);
      openLabelModal(fig);
    });
    container.appendChild(btn);
  }
```

- [ ] **Schritt 5: `task test:all` laufen**

```bash
task test:all
```

Erwartet: grün.

- [ ] **Schritt 6: Smoke-Test — `🪆 3D`-Tab erscheint**

Im Browser:
1. Art-Library öffnen — Tab `🪆 3D` erscheint als letzter Tab
2. Tab anklicken — Mannequin-Button mit Stick-Figure-Silhouette auf `#102540`-Hintergrund sichtbar
3. Button anklicken — Mannequin erscheint auf dem Brett, Label-Modal öffnet

- [ ] **Schritt 7: Commit**

```bash
git add brett/public/index.html
git commit -m "feat(brett): 3D art-library tab with mannequin canvas thumbnail"
```

---

## Task 5: Walk-Animation + Walk-Toggle-Button

**Files:**
- Modify: `brett/public/index.html`

- [ ] **Schritt 1: `tickMannequinWalk` + `tickAllMannequinWalks` in der Mannequin-Sektion**

Nach `drawMannequinThumb` (noch vor `animate();`) anhängen:

```javascript
function tickMannequinWalk(fig, t) {
  if (!fig.walking || !fig.bones) return;
  const b    = fig.bones;
  const freq = 1.8 * Math.PI * 2;
  const tA   = freq * t;

  b.lHip.rotation.x      =  0.45 * Math.sin(tA);
  b.rHip.rotation.x      = -0.45 * Math.sin(tA);
  b.lKnee.rotation.x     =  0.30 * Math.max(0, Math.sin(tA - 0.4));
  b.rKnee.rotation.x     =  0.30 * Math.max(0, Math.sin(tA - 0.4 + Math.PI));
  b.lShoulder.rotation.x = -0.35 * Math.sin(tA);
  b.rShoulder.rotation.x =  0.35 * Math.sin(tA);
  b.hips.rotation.z      =  0.06 * Math.sin(2 * tA);
}

function tickAllMannequinWalks(t) {
  for (const fig of figures) {
    if (fig.type === 'mannequin' && fig.walking) tickMannequinWalk(fig, t);
  }
}
```

- [ ] **Schritt 2: `tickAllMannequinWalks` in `animate()` einhängen**

Suche in der `animate`-Funktion:
```javascript
  const dt = tickAutoOrbit();
  tickFreeFly(dt);
  tickOrbitKeys(dt);
  updateCamera();
  tickCompass();
```

Ersetze durch:
```javascript
  tickAllMannequinWalks(t);
  const dt = tickAutoOrbit();
  tickFreeFly(dt);
  tickOrbitKeys(dt);
  updateCamera();
  tickCompass();
```

- [ ] **Schritt 3: Walk-Toggle-Button in `selectFigure` — per DOM-Methode einhängen**

Suche das Ende der `selectFigure`-Funktion, direkt nach der Zeile:
```javascript
    si.querySelector('.si-rot-r').addEventListener('click', () => { setRotY(fig, fig.rotY + Math.PI/4); if (!applyingRemote) send({ type: 'update', id: fig.id, changes: { rotY: fig.rotY } }); });
```

**Direkt danach** diese Zeilen einfügen:
```javascript
    if (fig.type === 'mannequin') {
      const actionsDiv = si.querySelector('.si-actions');
      const wb = document.createElement('button');
      wb.className = 'si-btn si-walk';
      wb.title = 'Walk-Animation ein/aus';
      wb.textContent = '🚶 Walk';
      if (fig.walking) wb.classList.add('active');
      wb.addEventListener('click', () => {
        fig.walking = !fig.walking;
        wb.classList.toggle('active', fig.walking);
        if (!applyingRemote) send({ type: 'update', id: fig.id, changes: { walking: fig.walking } });
      });
      actionsDiv.prepend(wb);
    }
```

- [ ] **Schritt 4: `task test:all` laufen**

```bash
task test:all
```

Erwartet: grün.

- [ ] **Schritt 5: Smoke-Test — Walk-Animation läuft**

Im Browser:
1. Mannequin aus der Art-Library platzieren
2. Figur anklicken — `🚶 Walk`-Button erscheint ganz links in `#selected-info`
3. Walk-Button klicken — Figur geht in Gehbewegung (Arme und Beine schwingen, Hüfte wippt leicht)
4. Walk-Button erneut klicken — Animation stoppt, Pose bleibt in letzter Stellung

- [ ] **Schritt 6: Commit**

```bash
git add brett/public/index.html
git commit -m "feat(brett): mannequin walk animation + walk toggle button"
```

---

## Task 6: `figToJSON` + WebSocket `walking`-Synchronisation

**Files:**
- Modify: `brett/public/index.html`

- [ ] **Schritt 1: `figToJSON` — `walking`-Feld ergänzen**

Suche:
```javascript
function figToJSON(fig) {
  return {
    id:    fig.id,
    type:  fig.type,
    color: fig.color,
    label: fig.label || '',
    scale: fig.scale,
    rotY:  fig.rotY,
    x:     fig.mesh.position.x,
    z:     fig.mesh.position.z,
  };
}
```

Ersetze durch:
```javascript
function figToJSON(fig) {
  return {
    id:      fig.id,
    type:    fig.type,
    color:   fig.color,
    label:   fig.label || '',
    scale:   fig.scale,
    rotY:    fig.rotY,
    x:       fig.mesh.position.x,
    z:       fig.mesh.position.z,
    walking: fig.walking || false,
  };
}
```

- [ ] **Schritt 2: `applyRemote` — `walking`-Handler im `update`-Zweig**

Suche:
```javascript
      if (f && msg.changes) {
        if (msg.changes.label !== undefined) setLabel(f, msg.changes.label);
        if (msg.changes.scale !== undefined) setScale(f, msg.changes.scale);
        if (msg.changes.rotY  !== undefined) setRotY (f, msg.changes.rotY);
        if (msg.changes.color !== undefined) recolorFigure(f, msg.changes.color);
      }
```

Ersetze durch:
```javascript
      if (f && msg.changes) {
        if (msg.changes.label   !== undefined) setLabel(f, msg.changes.label);
        if (msg.changes.scale   !== undefined) setScale(f, msg.changes.scale);
        if (msg.changes.rotY    !== undefined) setRotY (f, msg.changes.rotY);
        if (msg.changes.color   !== undefined) recolorFigure(f, msg.changes.color);
        if (msg.changes.walking !== undefined) f.walking = msg.changes.walking;
      }
```

- [ ] **Schritt 3: `applySnapshot` — `walking`-State nach `addFigure` setzen**

Suche:
```javascript
function applySnapshot(figList) {
  applyingRemote = true;
  try {
    figures.slice().forEach(f => { scene.remove(f.mesh); });
    figures.length = 0;
    for (const f of figList) {
      addFigure(f.type, f.color, f.x, f.z, f.label || '', f.scale || 1.0, f.rotY || 0, f.id);
    }
    selectFigure(null);
  } finally { applyingRemote = false; }
}
```

Ersetze durch:
```javascript
function applySnapshot(figList) {
  applyingRemote = true;
  try {
    figures.slice().forEach(f => { scene.remove(f.mesh); });
    figures.length = 0;
    for (const fd of figList) {
      const fig = addFigure(fd.type, fd.color, fd.x, fd.z, fd.label || '', fd.scale || 1.0, fd.rotY || 0, fd.id);
      if (fd.walking && fig.type === 'mannequin') fig.walking = true;
    }
    selectFigure(null);
  } finally { applyingRemote = false; }
}
```

- [ ] **Schritt 4: `applyRemote` — `walking`-State im `add`-Zweig setzen**

Suche:
```javascript
    if (msg.type === 'add' && msg.fig && !findFigById(msg.fig.id)) {
      addFigure(msg.fig.type, msg.fig.color, msg.fig.x, msg.fig.z,
                msg.fig.label, msg.fig.scale, msg.fig.rotY, msg.fig.id);
```

Ersetze durch:
```javascript
    if (msg.type === 'add' && msg.fig && !findFigById(msg.fig.id)) {
      const newFig = addFigure(msg.fig.type, msg.fig.color, msg.fig.x, msg.fig.z,
                               msg.fig.label, msg.fig.scale, msg.fig.rotY, msg.fig.id);
      if (msg.fig.walking && newFig && newFig.type === 'mannequin') newFig.walking = true;
```

- [ ] **Schritt 5: `task test:all` laufen**

```bash
task test:all
```

Erwartet: grün.

- [ ] **Schritt 6: Smoke-Test — Walk-State wird synchronisiert**

Im Browser zwei Tabs auf der gleichen Brett-Session öffnen:
1. Tab 1: Mannequin platzieren, Walk-Toggle aktivieren
2. Tab 2: Mannequin erscheint sofort gehend
3. Tab-Reload in Tab 2: Snapshot lädt Mannequin mit `walking: true` — Animation startet ohne Button-Klick

- [ ] **Schritt 7: Commit**

```bash
git add brett/public/index.html
git commit -m "feat(brett): sync mannequin walking state over WebSocket"
```

---

## Task 7: Gelenk-Dragging

**Files:**
- Modify: `brett/public/index.html`

- [ ] **Schritt 1: `jointDrag`-State und `pickJoint()` in der Mannequin-Sektion**

Nach `tickAllMannequinWalks` anhängen:

```javascript
let jointDrag = null;
// { boneGroup, startX, startY, startRotZ, startRotX }

function pickJoint(ndc) {
  if (!selectedFigure || selectedFigure.type !== 'mannequin') return null;
  raycaster.setFromCamera(ndc, camera_obj);
  const hits = raycaster.intersectObject(selectedFigure.mesh, true);
  for (const hit of hits) {
    if (hit.object.userData.isBrassJoint) return hit.object.userData.boneGroup;
  }
  return null;
}
```

- [ ] **Schritt 2: Mousedown — Joint-Pick vor normalem Figur-Drag (V-case)**

Suche im Mousedown-Handler diesen V-case-Block:
```javascript
    case 'V':
      if (fig) {
        const now = Date.now();
        if (lastClick.fig === fig && now - lastClick.time < 380) { openLabelModal(fig); lastClick.fig = null; return; }
        lastClick = { fig, time: now };
        selectFigure(fig);
        drag = { on: true, fig };
        if (ctrlBallActive) hideCtrlBall();
      } else {
        selectFigure(null);
        lastClick.fig = null;
        const bpos = pickBoard(ndc);
        if (bpos) {
          if (ctrlBallActive) hideCtrlBall();
          else showCtrlBall(bpos.x, bpos.z);
        }
      }
      break;
```

Ersetze durch:
```javascript
    case 'V': {
      const joint = pickJoint(ndc);
      if (joint) {
        if (selectedFigure) selectedFigure.walking = false;
        jointDrag = {
          boneGroup: joint,
          startX:    e.clientX,
          startY:    e.clientY,
          startRotZ: joint.rotation.z,
          startRotX: joint.rotation.x,
        };
        break;
      }
      if (fig) {
        const now = Date.now();
        if (lastClick.fig === fig && now - lastClick.time < 380) { openLabelModal(fig); lastClick.fig = null; break; }
        lastClick = { fig, time: now };
        selectFigure(fig);
        drag = { on: true, fig };
        if (ctrlBallActive) hideCtrlBall();
      } else {
        selectFigure(null);
        lastClick.fig = null;
        const bpos = pickBoard(ndc);
        if (bpos) {
          if (ctrlBallActive) hideCtrlBall();
          else showCtrlBall(bpos.x, bpos.z);
        }
      }
      break;
    }
```

- [ ] **Schritt 3: Mousemove — jointDrag-Rotation anwenden**

Suche in `mousemove`:
```javascript
  if (drag.on && drag.fig) {
    const pos = pickBoard(getNDC(e));
    if (pos) {
      drag.fig.mesh.position.x = Math.max(-BW/2+1, Math.min(BW/2-1, pos.x));
      drag.fig.mesh.position.z = Math.max(-BD/2+1, Math.min(BD/2-1, pos.z));
      if (!applyingRemote) sendMoveThrottled(drag.fig);
    }
  }
```

Ersetze durch:
```javascript
  if (jointDrag) {
    jointDrag.boneGroup.rotation.z = jointDrag.startRotZ + (e.clientX - jointDrag.startX) * 0.01;
    jointDrag.boneGroup.rotation.x = jointDrag.startRotX + (e.clientY - jointDrag.startY) * 0.01;
    return;
  }
  if (drag.on && drag.fig) {
    const pos = pickBoard(getNDC(e));
    if (pos) {
      drag.fig.mesh.position.x = Math.max(-BW/2+1, Math.min(BW/2-1, pos.x));
      drag.fig.mesh.position.z = Math.max(-BD/2+1, Math.min(BD/2-1, pos.z));
      if (!applyingRemote) sendMoveThrottled(drag.fig);
    }
  }
```

- [ ] **Schritt 4: Mouseup — jointDrag zurücksetzen**

Suche in `mouseup`:
```javascript
  if (drag.on && drag.fig && !applyingRemote) {
    send({ type: 'move', id: drag.fig.id, x: drag.fig.mesh.position.x, z: drag.fig.mesh.position.z });
  }
  drag = { on:false, fig:null };
```

Ersetze durch:
```javascript
  if (jointDrag) { jointDrag = null; return; }
  if (drag.on && drag.fig && !applyingRemote) {
    send({ type: 'move', id: drag.fig.id, x: drag.fig.mesh.position.x, z: drag.fig.mesh.position.z });
  }
  drag = { on:false, fig:null };
```

- [ ] **Schritt 5: `task test:all` laufen**

```bash
task test:all
```

Erwartet: grün.

- [ ] **Schritt 6: Smoke-Test — Gelenk-Drag funktioniert**

Im Browser:
1. Mannequin platzieren und anklicken (selektieren)
2. Auf eine Messing-Kugel (z.B. Schulter) klicken und horizontal ziehen — Gelenk rotiert um Z-Achse
3. Vertikal ziehen — Rotation um X-Achse
4. Maustaste loslassen — `jointDrag` endet, Pose bleibt
5. Normaler Figur-Drag (auf Körper, nicht Messing-Sphere) funktioniert weiterhin
6. Walk-Toggle aktivieren, dann Gelenk-Drag — Walk stoppt beim Joint-Click

- [ ] **Schritt 7: Commit**

```bash
git add brett/public/index.html
git commit -m "feat(brett): mannequin joint dragging via brass sphere raycaster"
```

---

## Task 8: Abschlussprüfung

**Files:** keine Änderungen

- [ ] **Schritt 1: Finaler `task test:all`**

```bash
task test:all
```

Erwartet: alle Tests grün.

- [ ] **Schritt 2: Snapshot-Roundtrip**

Im Browser:
1. Mannequin platzieren, Walk aktivieren
2. Tab schließen und neu öffnen
3. Erwartet: `walking: true` aus Snapshot — Animation startet sofort, ohne Button-Klick

- [ ] **Schritt 3: Recolor bei laufender Walk-Animation**

Im Browser:
1. Mannequin mit aktiver Walk-Animation
2. Andere Farbe in der Palette anklicken
3. Erwartet: Figur erhält neue Farbe, Walk-Animation läuft weiter, keine Fehlermeldung in der Konsole

- [ ] **Schritt 4: Deploy auf Dev**

```bash
task brett:build && task brett:deploy ENV=dev
```

Keine Startfehler in `task brett:logs ENV=dev`.

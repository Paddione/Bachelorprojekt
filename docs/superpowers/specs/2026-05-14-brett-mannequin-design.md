# Brett Mannequin — Design Spec

**Datum:** 2026-05-14  
**Branch:** feature/brett-mannequin  
**Scope:** Holz-Künstlermännequin als neuer Figurtyp im Systembrett-Service

---

## 1. Ziel

Die bestehenden 3D-Figuren im Brett-Service um einen vollgelenkigen Holz-Künstlermännequin erweitern. Der Mannequin basiert ausschließlich auf Three.js r128-Primitives (keine CapsuleGeometry), hat anklickbare Messing-Kugelgelenke, eine Walk-Animation und Farb-Tinting mit Holzton.

---

## 2. Scope

### In-Scope

- `buildMannequin(color, group)` — Konstruiert Mannequin aus CylinderGeometry + SphereGeometry + BoxGeometry
- Vollständige Knochenhierarchie mit Gelenk-Pivot-Gruppen
- Messing-SphereGeometry-Gelenke (12 Stück) — clickbar
- Walk-Animation via `tickMannequinWalk(fig, t)` + Toggle-Button `🚶 Walk` im selected-info-Panel
- Gelenk-Dragging (nur am selektierten Mannequin): Klick auf Messing-Sphere → Drag → `rotation.z`/`rotation.x` des Knochengroups
- Farb-Tinting: `lerp(userColor, #d4a26a, 0.5)`
- `manifest.json`: neuer Eintrag `{ id: "mannequin", kind: "mannequin", category: "3d" }`
- Neuer `'3d'`-Tab in der Art-Library mit Canvas-Mini-Render als Button-Thumbnail
- Walk-State synchronisiert via WebSocket (`figToJSON` + `update`-Pakete)

### Out-of-Scope

- Full IK / CCDIKSolver
- Persistenz von Gelenk-Poses über Sessions hinweg
- Ragdoll-Physik (Rapier.js)
- Mehrere Walk-Geschwindigkeiten / weitere Animationsclips

---

## 3. Geänderte Dateien

| Datei | Änderung |
|---|---|
| `brett/public/art-library/manifest.json` | 1 neuer Eintrag (mannequin) |
| `brett/public/index.html` | Alle weiteren Änderungen |

---

## 4. Architektur

### Ansatz: Dedizierte Mannequin-Sektion (Ansatz B)

Alle neuen Funktionen landen als klar abgegrenzte Sektion am Ende von `index.html`:

```
// ── Mannequin ─────────────────────────────────────────────────────────────────
//  buildMannequin(color, group)
//  tickMannequinWalk(fig, t)
//  tickAllMannequinWalks(t)
//  pickJoint(fig, raycaster) → THREE.Group | null
//  drawMannequinThumb(canvas)
//  Joint-drag state + event-handler patches
```

Eingriffe in bestehenden Code sind auf folgende Stellen beschränkt:

1. `CAT_LABELS` — `'3d': '🪆 3D'` ergänzen
2. `buildFigure()` — neuer `else if (type === 'mannequin')` Zweig
3. `bootArtLibrary()` — erkennt `kind === 'mannequin'`, rendert Canvas-Thumbnail statt SVG
4. `selectFigure()` — Walk-Toggle-Button wenn `fig.type === 'mannequin'`
5. `recolorFigure()` — `fig.walking` + `fig.bones` nach Rebuild übertragen
6. `figToJSON()` — `walking: fig.walking || false` ergänzen
7. WebSocket-Handler (`add`, `snapshot`) — lesen `walking` aus eingehenden Daten
8. `animate()`-Loop — `tickAllMannequinWalks(t)` einmal pro Frame
9. Maus-Handler (mousedown/mousemove/mouseup) — Joint-Drag-Logik einbauen

---

## 5. Knochenhierarchie

**Koordinatensystem:** Y = oben. Figur steht auf Y = 0 (Basescheibe bei Y = 0.09).  
**Gesamthöhe:** ~2.7 Einheiten.

```
fig.mesh (THREE.Group)
  baseDisk          CylinderGeo r=0.78 h=0.18          y=0.09
  directionArrow    (unverändert, wie andere Figuren)
  hipsGrp           y=1.10
    pelvisMesh        CylinderGeo r_top=0.30 r_bot=0.26 h=0.22   y=0
    spineGrp          y=0.22
      spineMesh         CylinderGeo r=0.20 h=0.28                 y=0.14
      chestGrp          y=0.28
        chestMesh         CylinderGeo r_top=0.28 r_bot=0.22 h=0.34  y=0.17
        neckGrp           y=0.34
          neckMesh          CylinderGeo r=0.10 h=0.18               y=0.09
          headGrp           y=0.18
            headSphere        SphereGeo r=0.22                      y=0.22

        lShoulderGrp [Messing r=0.070]  x=+0.35 y=0.28
          lUpperArmMesh CylinderGeo r_top=0.07 r_bot=0.06 h=0.35   y=-0.175
          lElbowGrp [Messing r=0.065]   y=-0.35
            lForearmMesh  CylinderGeo r_top=0.06 r_bot=0.05 h=0.30  y=-0.15
            lWristGrp [Messing r=0.055]  y=-0.30
              lHandMesh     BoxGeo 0.10×0.14×0.05                   y=-0.07

        rShoulderGrp [Messing r=0.070]  x=-0.35 y=0.28  (Spiegelung)
          … (identisch lShoulder)

    lHipGrp [Messing r=0.075]  x=+0.14 y=0
      lThighMesh    CylinderGeo r_top=0.09 r_bot=0.08 h=0.45       y=-0.225
      lKneeGrp [Messing r=0.070]  y=-0.45
        lShinMesh     CylinderGeo r_top=0.08 r_bot=0.065 h=0.42    y=-0.21
        lAnkleGrp [Messing r=0.060]  y=-0.42
          lFootMesh     BoxGeo 0.10×0.06×0.22                       y=-0.03 z=+0.06

    rHipGrp [Messing r=0.075]  x=-0.14 y=0  (Spiegelung)
      … (identisch lHip)
```

**`fig.bones`-Referenzobjekt:**
```js
fig.bones = {
  hips, spine, chest, neck, head,
  lShoulder, lElbow, lWrist,
  rShoulder, rElbow, rWrist,
  lHip, lKnee, lAnkle,
  rHip, rKnee, rAnkle
}
```

---

## 6. Materialien

| Typ | Material | Farbe | roughness | metalness |
|---|---|---|---|---|
| Holz-Meshes | MeshStandardMaterial | `lerp(userColor, #d4a26a, 0.5)` | 0.75 | 0.0 |
| Messing-Gelenke | MeshStandardMaterial | `#c8a96e` | 0.35 | 0.55 |

Jede Messing-Sphere bekommt:
```js
sphere.userData.isBrassJoint = true;
sphere.userData.boneGroup = <übergeordneter *Grp>;
```

---

## 7. Walk-Animation

`tickMannequinWalk(fig, t)` — aufgerufen wenn `fig.walking === true`:

```
freq     = 1.8 * 2π  rad/s
amp_thigh = 0.45 rad
amp_shin  = 0.30 rad  (nur Vorwärtsschwung via max(0,…))
amp_arm   = 0.35 rad
hip_sway  = 0.06 rad

bones.lHip.rotation.x     =  amp_thigh * sin(freq*t)
bones.rHip.rotation.x     = -amp_thigh * sin(freq*t)
bones.lKnee.rotation.x    =  amp_shin  * max(0, sin(freq*t - 0.4))
bones.rKnee.rotation.x    =  amp_shin  * max(0, sin(freq*t - 0.4 + π))
bones.lShoulder.rotation.x = -amp_arm  * sin(freq*t)
bones.rShoulder.rotation.x =  amp_arm  * sin(freq*t)
bones.hips.rotation.z     =  hip_sway  * sin(2*freq*t)
```

`tickAllMannequinWalks(t)` iteriert über `figures` und ruft `tickMannequinWalk` für alle mit `fig.walking === true` auf.

**Walk-Toggle-Button** — erscheint in `#selected-info` nur wenn `fig.type === 'mannequin'`:
```html
<button class="si-btn si-walk">🚶 Walk</button>
```
Klick: `fig.walking = !fig.walking`, sendet `{ type: 'update', id, changes: { walking: fig.walking } }`.

---

## 8. Gelenk-Dragging

**Voraussetzung:** Figur ist selektiert (`selectedFigure`), Modus ist V (Select).

**State:**
```js
let jointDrag = null;
// { boneGroup: THREE.Group, startX, startY, startRotZ, startRotX }
```

**Mousedown:**
1. Raycaster gegen `selectedFigure.mesh` (recursive)
2. Ersten Hit mit `userData.isBrassJoint === true` suchen
3. Treffer → `jointDrag` setzen, `fig.walking = false` stoppen
4. Kein Treffer → normale Figur-Drag-Logik (unverändert)

**Mousemove** wenn `jointDrag !== null`:
```js
jointDrag.boneGroup.rotation.z = jointDrag.startRotZ + (e.clientX - jointDrag.startX) * 0.01;
jointDrag.boneGroup.rotation.x = jointDrag.startRotX + (e.clientY - jointDrag.startY) * 0.01;
```
Kein Netzwerk-Update während Drag (Bone-Poses sind nicht persistent).

**Mouseup:** `jointDrag = null`.

---

## 9. Farb-Tinting

```js
function woodColor(hexColor) {
  return new THREE.Color(hexColor).lerp(new THREE.Color(0xd4a26a), 0.5);
}
```

Wird in `buildMannequin()` für alle Holz-Meshes verwendet.

---

## 10. Toolbar-Button (Canvas-Mini-Render)

`drawMannequinThumb(canvas)` zeichnet eine 2D-Silhouette auf einem `64×96px`-`<canvas>`:
- Stick-Figure-Linien in `#d4a26a` auf dunklem Hintergrund `#102540`
- Gelenk-Punkte als kleine gefüllte Kreise in `#c8a96e` (Messing)
- Einmalig beim `bootArtLibrary()`-Call gezeichnet, dann als Button-`<canvas>` eingesetzt

---

## 11. Datenmodell-Erweiterungen

### `figToJSON()` — neu:
```js
walking: fig.walking || false
```

### WebSocket-Paket `add`:
```json
{ "type": "add", "fig": { "...", "walking": false } }
```

### WebSocket-Paket `update`:
```json
{ "type": "update", "id": "...", "changes": { "walking": true } }
```

### `applySnapshot()` / `add`-Handler:
Lesen `walking` aus eingehenden Daten; nach `addFigure()` setzen:
```js
if (figData.walking) fig.walking = true;
```

---

## 12. Teststrategie

- Manueller Smoke-Test im Browser: Mannequin platzieren, Walk-Toggle, Gelenk-Drag, Recolor
- Bestehende Tests (`task test:all`) müssen weiterhin grün sein
- Snapshot-Roundtrip: Brett speichern + laden, `walking`-State bleibt erhalten

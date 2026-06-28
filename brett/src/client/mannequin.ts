import * as THREE from 'three';
import { getScene, STATE } from './state';
import { setPhysicsSendMove } from './mannequin-physics';

// Fallback für Dual-Package-Hazard bei 'three' (instanceof checks in tests)
if (typeof THREE.Vector3 === 'function') {
  Object.defineProperty(THREE.Vector3, Symbol.hasInstance, {
    value: (instance: any) => {
      return instance && (instance.isVector3 || instance.constructor?.name === 'Vector3');
    },
    configurable: true
  });
}
import('three').then((esmThree) => {
  if (esmThree && typeof esmThree.Vector3 === 'function') {
    Object.defineProperty(esmThree.Vector3, Symbol.hasInstance, {
      value: (instance: any) => {
        return instance && (instance.isVector3 || instance.constructor?.name === 'Vector3');
      },
      configurable: true
    });
  }
}).catch(() => {});

export const BONE_NAMES = [
  'hips', 'head',
  'lShoulder', 'rShoulder', 'lElbow', 'rElbow', 'lWrist', 'rWrist',
  'lHip', 'rHip', 'lKnee', 'rKnee', 'lAnkle', 'rAnkle'
] as const;

export const BODY_RADIUS = 0.30;
export const JUMP_V0 = 4.5;
export const GRAVITY = 12.0;
export const BOUNCE_K_DRAG = 6.0;
export const BOUNCE_K_LAND = 9.0;
export const COLLISION_MAX_ITER = 3;

export const CONTACT_POINTS = [
  { bone: 'lWrist', color: 0xffd84a }, { bone: 'rWrist', color: 0xffd84a },
  { bone: 'lAnkle', color: 0x6be0a0 }, { bone: 'rAnkle', color: 0x6be0a0 },
  { bone: 'lKnee',  color: 0x4a9adf }, { bone: 'rKnee',  color: 0x4a9adf },
  { bone: 'lElbow', color: 0xc8a96e }, { bone: 'rElbow', color: 0xc8a96e },
  { bone: 'head',   color: 0xe09090 },
];



export const IK_CHAINS: Record<string, string[]> = {
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

const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();

// _sendMove is injected to avoid a cycle with ws-client.ts.
let _sendMove: (id: string, x: number, z: number, facingY: number) => void = () => {};
export function setSendMove(fn: typeof _sendMove): void {
  _sendMove = fn;
  setPhysicsSendMove(fn);
}

export function makeBone(parent: THREE.Object3D, length: number, color = 0xb8c0a8): THREE.Group {
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

export function makeMannequin(id?: string, position = { x: 0, z: 0 }, opts: any = {}): any {
  if (typeof id === 'object' && id !== null) {
    opts = id;
    id = undefined;
  }
  if (typeof position === 'object' && position !== null && (position as any).x === undefined && (position as any).z === undefined) {
    opts = position;
    position = { x: 0, z: 0 };
  }
  if (!id) {
    id = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : ('m-' + Math.random().toString(36).slice(2, 10));
  }

  const root = new THREE.Group();
  root.position.set(position.x, 0, position.z);

  const bodyColor = opts.bodyColor !== undefined ? opts.bodyColor : 0xb8c0a8;
  const skinColor = opts.skinColor !== undefined ? opts.skinColor : 0xd9c89b;
  const trimColor = opts.trimColor !== undefined ? opts.trimColor : null;
  const jointFactor = opts.jointFactor !== undefined ? opts.jointFactor : 1.0;

  function getJointColor(baseHex: number) {
    if (jointFactor === 1.0) return baseHex;
    const c = new THREE.Color(baseHex);
    c.multiplyScalar(jointFactor);
    return c.getHex();
  }

  // Hips at y≈1.0; spine up to head
  const hips = new THREE.Group(); hips.position.y = 1.0; root.add(hips);
  hips.name = 'hips';
  const torsoMesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.7, 0.25),
    new THREE.MeshLambertMaterial({ color: bodyColor })
  );
  torsoMesh.position.y = 0.35; hips.add(torsoMesh);
  torsoMesh.name = 'torso';

  const head = new THREE.Group(); head.position.y = 0.85; hips.add(head);
  head.name = 'head';
  const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12),
    new THREE.MeshLambertMaterial({ color: skinColor }));
  head.add(headMesh);
  headMesh.name = 'headMesh';

  if (trimColor !== null) {
    const band = new THREE.Mesh(
      new THREE.TorusGeometry(0.205, 0.012, 8, 28),
      new THREE.MeshLambertMaterial({ color: trimColor })
    );
    band.rotation.x = Math.PI / 2;
    band.position.y = 0.08;
    head.add(band);
    band.name = 'headband';

    const belt = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, 0.04, 0.24),
      new THREE.MeshLambertMaterial({ color: trimColor })
    );
    belt.position.y = -0.44;
    hips.add(belt);
    belt.name = 'belt';
  }

  // Arms
  const lShoulder = new THREE.Group(); lShoulder.position.set( 0.28, 0.65, 0); hips.add(lShoulder);
  const rShoulder = new THREE.Group(); rShoulder.position.set(-0.28, 0.65, 0); hips.add(rShoulder);
  lShoulder.name = 'lShoulder';
  rShoulder.name = 'rShoulder';
  makeBone(lShoulder, 0.32, bodyColor); const lElbow = new THREE.Group(); lElbow.position.y = -0.32; lShoulder.add(lElbow);
  makeBone(rShoulder, 0.32, bodyColor); const rElbow = new THREE.Group(); rElbow.position.y = -0.32; rShoulder.add(rElbow);
  lElbow.name = 'lElbow';
  rElbow.name = 'rElbow';
  makeBone(lElbow, 0.30, bodyColor);    const lWrist = new THREE.Group(); lWrist.position.y = -0.30; lElbow.add(lWrist);
  makeBone(rElbow, 0.30, bodyColor);    const rWrist = new THREE.Group(); rWrist.position.y = -0.30; rElbow.add(rWrist);
  lWrist.name = 'lWrist';
  rWrist.name = 'rWrist';

  // Legs
  const lHip = new THREE.Group(); lHip.position.set( 0.12, 0, 0); hips.add(lHip);
  const rHip = new THREE.Group(); rHip.position.set(-0.12, 0, 0); hips.add(rHip);
  lHip.name = 'lHip';
  rHip.name = 'rHip';
  makeBone(lHip, 0.42, bodyColor); const lKnee = new THREE.Group(); lKnee.position.y = -0.42; lHip.add(lKnee);
  makeBone(rHip, 0.42, bodyColor); const rKnee = new THREE.Group(); rKnee.position.y = -0.42; rHip.add(rKnee);
  lKnee.name = 'lKnee';
  rKnee.name = 'rKnee';
  makeBone(lKnee, 0.40, bodyColor); const lAnkle = new THREE.Group(); lAnkle.position.y = -0.40; lKnee.add(lAnkle);
  makeBone(rKnee, 0.40, bodyColor); const rAnkle = new THREE.Group(); rAnkle.position.y = -0.40; rKnee.add(rAnkle);
  lAnkle.name = 'lAnkle';
  rAnkle.name = 'rAnkle';

  const bones: Record<string, THREE.Group> = { hips, head, lShoulder, rShoulder, lElbow, rElbow, lWrist, rWrist, lHip, rHip, lKnee, rKnee, lAnkle, rAnkle };

  // Contact-point spheres (raycaster-hittable)
  for (const cp of CONTACT_POINTS) {
    const jointColor = getJointColor(cp.color);
    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(0.07, 12, 10),
      new THREE.MeshLambertMaterial({ color: jointColor })
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

  // Possession indicator ring (dashed brass torus — shown for free/possessed figures)
  const possessionRingGeo = new THREE.TorusGeometry(0.52, 0.025, 8, 48);
  const possessionRingMat = new THREE.MeshBasicMaterial({
    color: 0xc8a96e,
    transparent: true,
    opacity: 0.45,
    depthTest: true,
  });
  const possessionRing = new THREE.Mesh(possessionRingGeo, possessionRingMat);
  possessionRing.rotation.x = -Math.PI / 2;
  possessionRing.position.y = 0.03;
  possessionRing.visible = false;
  root.add(possessionRing);

  // Floating possessor label sprite
  const labelCanvas = document.createElement('canvas');
  labelCanvas.width = 256;
  labelCanvas.height = 64;
  const labelTex = new THREE.CanvasTexture(labelCanvas);
  labelTex.minFilter = THREE.LinearFilter;
  const labelSpriteMat = new THREE.SpriteMaterial({ map: labelTex, transparent: true, depthTest: false, depthWrite: false });
  const labelSprite = new THREE.Sprite(labelSpriteMat);
  labelSprite.position.y = 2.4;
  labelSprite.scale.set(2.0, 0.5, 1);
  labelSprite.visible = false;
  root.add(labelSprite);

  // Freeze indicator sprite (T000471) — shown when room is frozen
  const freezeCanvas = document.createElement('canvas');
  freezeCanvas.width = 64;
  freezeCanvas.height = 64;
  const freezeCtx = freezeCanvas.getContext('2d')!;
  freezeCtx.font = '40px serif';
  freezeCtx.fillStyle = '#7dc8f7';
  freezeCtx.textAlign = 'center';
  freezeCtx.textBaseline = 'middle';
  freezeCtx.fillText('❄', 32, 32);
  const freezeTex = new THREE.CanvasTexture(freezeCanvas);
  const freezeSpriteMat = new THREE.SpriteMaterial({ map: freezeTex, transparent: true, depthTest: false, depthWrite: false });
  const freezeSprite = new THREE.Sprite(freezeSpriteMat);
  freezeSprite.position.y = 2.1;
  freezeSprite.scale.set(0.5, 0.5, 1);
  freezeSprite.visible = false;
  root.add(freezeSprite);

  const { scene } = getScene();
  scene.add(root);

  // Per-bone spring state (filled by preset/spring in later tasks)
  const bone: Record<string, { currentRot: { x: number; z: number }; targetRot: { x: number; z: number }; velocity: { x: number; z: number } }> = {};
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
    possessionRing,
    labelSprite,
    freezeSprite,
    bone,
    headMesh,
    appearanceMeshes: {},
    appearance: { face: null, body: 'adult-average', accessories: { head: null, upper: null, feet: null } },
    boneOverrides: {},
    label: 'Figur',
    color: '#b8c0a8',
    facingY: 0,
    jumping: false,
    jumpV: 0,
    jumpY: 0,
    _lastCollisionCheck: 0,
    _serverPossessor: null as string | null,
  };
}

export function recolorFigure(fig: any, hexColor: string): void {
  const threeColor = new THREE.Color(hexColor);
  fig.root.traverse((o: any) => {
    if (o.isMesh && !o.userData.isContact && o !== fig.ring) {
      if (o.material) o.material.color.set(threeColor);
    }
  });
  fig.color = hexColor;
}



export function setNdcFromPoint(clientX: number, clientY: number): void {
  const { renderer } = getScene();
  const rect = renderer.domElement.getBoundingClientRect();
  ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
}

export function setNdc(ev: { clientX: number; clientY: number }): void {
  setNdcFromPoint(ev.clientX, ev.clientY);
}

export function pickContact(ev: { clientX: number; clientY: number }): any {
  setNdc(ev);
  const { camera } = getScene();
  raycaster.setFromCamera(ndc, camera);
  const meshes: any[] = [];
  for (const fig of STATE.figures) {
    fig.root.traverse((o: any) => { if (o.userData && o.userData.isContact) meshes.push(o); });
  }
  const hit = raycaster.intersectObjects(meshes, false)[0];
  return hit ? hit.object : null;
}

export function pickMannequinBody(ev: { clientX: number; clientY: number }): any {
  setNdc(ev);
  const { camera } = getScene();
  raycaster.setFromCamera(ndc, camera);
  for (const fig of STATE.figures) {
    const hits = raycaster.intersectObject(fig.root, true);
    const nonContact = hits.find(h => !(h.object.userData && h.object.userData.isContact));
    if (nonContact) return fig;
  }
  return null;
}

export function pickFloor(ev: { clientX: number; clientY: number }): THREE.Vector3 | null {
  setNdc(ev);
  const { camera, floor } = getScene();
  raycaster.setFromCamera(ndc, camera);
  const hit = raycaster.intersectObject(floor, false)[0];
  return hit ? hit.point : null;
}

// CCD: rotate chain bones so end-effector sphere world position approaches targetWorld.
export function ccdIK(fig: any, endBoneName: string, targetWorld: THREE.Vector3, iterations = 8): void {
  const chain = IK_CHAINS[endBoneName];
  if (!chain) return;
  const endSphere = fig.bones[endBoneName].children.find((c: any) => c.userData && c.userData.isContact);
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

export function getTickRefs() {
  return {
    raycaster,
    ndc,
    get lastTickMs() { return lastTickMs; },
    set lastTickMs(v: number) { lastTickMs = v; }
  };
}
let lastTickMs = performance.now();



// ── Moderation Visuals (T000471) ───────────────────────────────────────────

/**
 * SEC T000660 bug #4: three.js GPU-Memory-Leak beim Figure-Remove.
 * Traversiert fig.root (THREE.Group) und ruft dispose() auf jede
 * BufferGeometry, jedes Material und jede Textur (material.map) auf.
 * Muss an BEIDEN scene.remove()-Stellen in ws-client.ts aufgerufen werden:
 * - Snapshot-Reset (~Z.226): for (const f of STATE.figures) { disposeMannequin(f); ... }
 * - delete-Handler (~Z.419): disposeMannequin(STATE.figures[idx]); getScene().scene.remove(...)
 */
export function disposeMannequin(fig: { root: THREE.Object3D }): void {
  fig.root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.geometry) {
      mesh.geometry.dispose();
    }
    if (mesh.material) {
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mat of mats) {
        if ((mat as any).map) {
          (mat as any).map.dispose();
        }
        mat.dispose();
      }
    }
  });
}

// Re-exports für Rückwärtskompatibilität
export { tickSpring, startJump, resolveCollisions, _floorClampScratch } from './mannequin-physics';
export {
  updatePossessionVisuals, clearPossessionVisuals,
  updateModerationVisuals, clearModerationVisuals,
  type ModerationVisualState,
} from './mannequin-visuals';


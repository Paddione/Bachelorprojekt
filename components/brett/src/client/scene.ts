import * as THREE from 'three';
import { setScene } from './state';

// ── Orbit state type ─────────────────────────────────────────────────────────
/** The three spherical coordinates that define the current orbit camera pose. */
export interface OrbitState {
  /** Azimuth angle in radians (horizontal rotation around Y axis). */
  theta: number;
  /** Elevation angle in radians (vertical tilt above horizon). */
  phi: number;
  /** Radial distance from the origin. */
  dist: number;
}

export interface SceneApi {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  floor: THREE.Mesh;
  updateCameraFromOrbit: () => void;
  /** Return a snapshot of the current orbit camera state (theta, phi, dist). */
  getOrbitState: () => OrbitState;
  /**
   * Teleport the orbit camera to the given position.
   * DARK-LAUNCH: gated behind window.__brettFeatures['sf-t000465']; no-op when
   * the flag is absent or false so the merge ships dark.
   */
  setCameraToOrbit: (position: OrbitState) => void;
  /**
   * Set the orbit camera radial distance directly and re-render.
   * Clamped to [2, 40] (same range as wheel/pinch zoom). Un-gated
   * (unlike setCameraToOrbit) — used by touch pinch-zoom.
   */
  setOrbitDist: (dist: number) => void;
  /** Apply incremental orbit angle deltas (theta += dTheta, phi += dPhi, phi clamped). */
  applyOrbitDelta: (dTheta: number, dPhi: number) => void;
}

export function initScene(): SceneApi {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight - 36);
  renderer.domElement.style.position = 'absolute';
  renderer.domElement.style.top = '36px';
  renderer.domElement.style.left = '0';
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  document.body.appendChild(renderer.domElement);

  const scene = new THREE.Scene();

  // Procedural gradient sky
  (function buildSky() {
    const skyGeo = new THREE.SphereGeometry(120, 24, 12);
    const skyCanvas = document.createElement('canvas');
    skyCanvas.width = 128;
    skyCanvas.height = 256;
    const skyCtx = skyCanvas.getContext('2d')!;
    const grad = skyCtx.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#0d1520'); // midnight zenith
    grad.addColorStop(0.45, '#1a2c45'); // deep blue mid
    grad.addColorStop(0.78, '#2d3d55'); // horizon fade
    grad.addColorStop(1, '#1c2030'); // ground ambient
    skyCtx.fillStyle = grad;
    skyCtx.fillRect(0, 0, 128, 256);
    const skyTex = new THREE.CanvasTexture(skyCanvas);
    const skyMat = new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide });
    scene.add(new THREE.Mesh(skyGeo, skyMat));
  })();

  const camera = new THREE.PerspectiveCamera(
    50, window.innerWidth / (window.innerHeight - 36), 0.1, 200
  );
  camera.position.set(4, 4, 6);
  camera.lookAt(0, 1, 0);

  const ambient = new THREE.AmbientLight(0xb8c8e8, 0.45);
  scene.add(ambient);
  const sun = new THREE.DirectionalLight(0xf0d28c, 1.1); // warm key
  sun.position.set(5, 10, 4);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0x6fa8d8, 0.18); // cold fill
  fill.position.set(-6, 4, -8);
  scene.add(fill);

  // Floor grid
  const grid = new THREE.GridHelper(40, 40, 0x2a3d5a, 0x1a2535);
  grid.position.y = 0;
  scene.add(grid);

  // Procedural arena floor
  const tc = document.createElement('canvas');
  tc.width = 512;
  tc.height = 512;
  const ctx = tc.getContext('2d')!;
  ctx.fillStyle = '#111620';
  ctx.fillRect(0, 0, 512, 512);
  ctx.strokeStyle = 'rgba(10,15,28,0.6)';
  ctx.lineWidth = 2;
  for (let i = 0; i <= 512; i += 64) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 512); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(512, i); ctx.stroke();
  }
  for (let k = 0; k < 4000; k++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const a = Math.random() * 0.06;
    ctx.fillStyle = `rgba(255,255,255,${a})`;
    ctx.fillRect(x, y, 1, 1);
  }
  const floorTex = new THREE.CanvasTexture(tc);
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
  floorTex.repeat.set(10, 10);
  const floorMat = new THREE.MeshStandardMaterial({
    map: floorTex,
    roughness: 0.88,
    metalness: 0.04,
  });
  const floorGeo = new THREE.PlaneGeometry(40, 40);
  const floorMesh = new THREE.Mesh(floorGeo, floorMat);
  floorMesh.rotation.x = -Math.PI / 2;
  floorMesh.position.y = -0.001;
  scene.add(floorMesh);

  // Minimal manual orbit
  const cameraOrbit = {
    theta: Math.atan2(camera.position.x, camera.position.z),
    phi: 0.6,
    dist: Math.hypot(camera.position.x, camera.position.z, camera.position.y)
  };

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

  let dragMode: 'orbit' | null = null;
  let dragLast: { x: number; y: number } | null = null;

  renderer.domElement.addEventListener('mousedown', (e) => {
    if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
      dragMode = 'orbit';
      dragLast = { x: e.clientX, y: e.clientY };
    }
  });

  window.addEventListener('mousemove', (e) => {
    if (dragMode === 'orbit' && dragLast) {
      const dx = e.clientX - dragLast.x;
      const dy = e.clientY - dragLast.y;
      cameraOrbit.theta -= dx * 0.005;
      cameraOrbit.phi = Math.max(-1.2, Math.min(1.2, cameraOrbit.phi + dy * 0.005));
      updateCameraFromOrbit();
      dragLast = { x: e.clientX, y: e.clientY };
    }
  });

  window.addEventListener('mouseup', () => {
    dragMode = null;
    dragLast = null;
  });

  renderer.domElement.addEventListener('wheel', (e) => {
    e.preventDefault();
    cameraOrbit.dist = Math.max(2, Math.min(40, cameraOrbit.dist * (1 + e.deltaY * 0.001)));
    updateCameraFromOrbit();
  }, { passive: false });

  window.addEventListener('resize', () => {
    const w = window.innerWidth;
    const h = window.innerHeight - 36;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    (window as any).__brettPostFx?.resize(w, h);
  });

  // ── Orbit API ─────────────────────────────────────────────────────────────

  function getOrbitState(): OrbitState {
    return { theta: cameraOrbit.theta, phi: cameraOrbit.phi, dist: cameraOrbit.dist };
  }

  /**
   * Teleport the orbit camera to `position`.
   * DARK-LAUNCH: gated behind window.__brettFeatures['sf-t000465'].
   * The flag defaults OFF so this is a no-op until the Deploy phase seeds the row.
   */
  function setCameraToOrbit(position: OrbitState): void {
    const feats: Record<string, boolean> =
      (typeof window !== 'undefined' && (window as any).__brettFeatures) || {};
    if (!feats['sf-t000465']) return;
    cameraOrbit.theta = position.theta;
    cameraOrbit.phi   = Math.max(-1.2, Math.min(1.2, position.phi));
    cameraOrbit.dist  = Math.max(2, Math.min(40, position.dist));
    updateCameraFromOrbit();
  }

  function setOrbitDist(dist: number): void {
    cameraOrbit.dist = Math.max(2, Math.min(40, dist));
    updateCameraFromOrbit();
  }

  function applyOrbitDelta(dTheta: number, dPhi: number): void {
    cameraOrbit.theta += dTheta;
    cameraOrbit.phi = Math.max(-1.2, Math.min(1.2, cameraOrbit.phi + dPhi));
    updateCameraFromOrbit();
  }

  setScene({ renderer, scene, camera, floor: floorMesh });
  return { renderer, scene, camera, floor: floorMesh, updateCameraFromOrbit, getOrbitState, setCameraToOrbit, setOrbitDist, applyOrbitDelta };
}

// brett/src/client/ui/optik.ts — Phase D / D11
//
// Three-aware optik application. Consumes the PURE optikToSceneParams mapper and
// mutates the live scene (floor material, directional key light, ambient).
// Build/typecheck-verified (no unit test — the pure mapper is the tested part).

import * as THREE from 'three';
import { getScene } from '../state';
import type { OptikSettings } from '../../types/state';
import { optikToSceneParams } from './optik-map';

/**
 * Apply the optik to the live scene. Best-effort: if the scene is not yet
 * initialized (lobby, pre-board), it silently no-ops so callers (live
 * lobby_settings_change + snapshot mount) need no guards.
 */
export function applyOptikToScene(optik: OptikSettings): void {
  let refs;
  try {
    refs = getScene();
  } catch {
    return; // scene not mounted yet (e.g. still in lobby)
  }
  const params = optikToSceneParams(optik);

  // Floor base color.
  const floorMat = refs.floor?.material as THREE.MeshStandardMaterial | undefined;
  if (floorMat && (floorMat as any).color) {
    (floorMat as any).color.set(params.floorColor);
    floorMat.needsUpdate = true;
  }

  // Lights: tint + intensity of the directional key light; ambient stays.
  refs.scene.traverse((obj: THREE.Object3D) => {
    if ((obj as THREE.DirectionalLight).isDirectionalLight) {
      const dl = obj as THREE.DirectionalLight;
      dl.color.set(params.lightColor);
      dl.intensity = params.lightIntensity;
    }
  });
}

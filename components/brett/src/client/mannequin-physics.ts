// brett/src/client/mannequin-physics.ts
// Physik-Simulation: Spring-Knochen, Sprung, Kollisions-Auflösung.

import * as THREE from 'three';
import { STATE } from './state';
import {
  BONE_NAMES,
  CONTACT_POINTS,
  GRAVITY,
  JUMP_V0,
  COLLISION_MAX_ITER,
  BOUNCE_K_LAND,
  BODY_RADIUS,
} from './mannequin';

// sendMove — injected via setPhysicsSendMove
let sendMove: (id: string, x: number, z: number, facingY: number) => void = () => {};
export function setPhysicsSendMove(fn: typeof sendMove): void {
  sendMove = fn;
}

const K_SPRING = 80;
const DAMPING = 0.85;

const GRAVITY_OFFSET: Record<string, { x: number; z: number }> = {
  hips:     { x: 0.2,  z: 0 },
  head:     { x: 0.4,  z: 0 },
  lShoulder:{ x: 0.6,  z: 0.3 }, rShoulder:{ x: 0.6, z: -0.3 },
  lElbow:   { x: 0.3,  z: 0 },   rElbow:   { x: 0.3, z: 0 },
  lWrist:   { x: 0,    z: 0 },   rWrist:   { x: 0,   z: 0 },
  lHip:     { x: -0.2, z: 0 },   rHip:     { x: -0.2, z: 0 },
  lKnee:    { x: 0.2,  z: 0 },   rKnee:    { x: 0.2, z: 0 },
  lAnkle:   { x: 0,    z: 0 },   rAnkle:   { x: 0,   z: 0 },
};

export const _floorClampScratch = new THREE.Vector3();

export function tickSpring(dt: number): void {
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
        const s = fig.bones[cp.bone].children.find((c: any) => c.userData && c.userData.isContact);
        if (s) {
          s.getWorldPosition(_floorClampScratch);
          if (_floorClampScratch.y < minY) minY = _floorClampScratch.y;
        }
      }
    }
    if (fig.jumping) {
      fig.jumpY += fig.jumpV * dt;
      fig.jumpV -= GRAVITY * dt;
      if (fig.jumpY <= 0) {
        fig.jumpY = 0;
        fig.jumpV = 0;
        fig.jumping = false;
        resolveCollisions(fig, BOUNCE_K_LAND); // Landungs-Impact
      }
      fig.root.position.y = fig.jumpY;
    } else if (minY < 0) {
      fig.root.position.y -= minY; // lift onto floor
    }
  }
}

export function startJump(fig: any): void {
  fig.jumping = true;
  fig.jumpV = JUMP_V0;
  fig.jumpY = 0;
}

export function resolveCollisions(movedFig: any, impulseK: number): void {
  for (let iter = 0; iter < COLLISION_MAX_ITER; iter++) {
    let resolved = false;
    for (const other of STATE.figures) {
      if (other === movedFig) continue;
      const dx = other.root.position.x - movedFig.root.position.x;
      const dz = other.root.position.z - movedFig.root.position.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      const minDist = 2 * BODY_RADIUS;
      if (dist >= minDist || dist === 0) continue;
      const nx = dx / dist, nz = dz / dist;
      const overlap = minDist - dist + 0.02;
      other.root.position.x += nx * overlap;
      other.root.position.z += nz * overlap;
      for (const name of BONE_NAMES) {
        other.bone[name].velocity.x += impulseK * nx;
        other.bone[name].velocity.z += impulseK * nz;
      }
      sendMove(other.id, other.root.position.x, other.root.position.z, other.facingY);
      resolved = true;
    }
    if (!resolved) break;
  }
}

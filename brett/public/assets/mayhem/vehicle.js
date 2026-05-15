'use strict';
const VEHICLE_SPEED = 6.0;
const VEHICLE_DESPAWN_DIST = 12.0;
const VEHICLE_SIZE = { w: 1.5, h: 1.0, d: 1.0 };

class Vehicle {
  constructor({ id, scene, fromX, fromZ, dirX, dirZ, kind = 'cart' }) {
    this.id = id;
    this.kind = kind;
    this.dirX = dirX;
    this.dirZ = dirZ;
    this.startX = fromX;
    this.startZ = fromZ;
    const THREE = window.THREE;
    this.mesh = new THREE.Mesh(
      new THREE.BoxGeometry(VEHICLE_SIZE.w, VEHICLE_SIZE.h, VEHICLE_SIZE.d),
      new THREE.MeshLambertMaterial({ color: 0x707070 })
    );
    this.mesh.position.set(fromX, VEHICLE_SIZE.h / 2, fromZ);
    this.mesh.rotation.y = Math.atan2(dirX, dirZ);
    scene.add(this.mesh);
    this.alive = true;
  }
  update(dt) {
    if (!this.alive) return;
    this.mesh.position.x += this.dirX * VEHICLE_SPEED * dt;
    this.mesh.position.z += this.dirZ * VEHICLE_SPEED * dt;
    const dx = this.mesh.position.x - this.startX;
    const dz = this.mesh.position.z - this.startZ;
    if (Math.hypot(dx, dz) > VEHICLE_DESPAWN_DIST) this.alive = false;
  }
  getAABB() {
    const p = this.mesh.position;
    return {
      minX: p.x - VEHICLE_SIZE.w / 2, maxX: p.x + VEHICLE_SIZE.w / 2,
      minY: p.y - VEHICLE_SIZE.h / 2, maxY: p.y + VEHICLE_SIZE.h / 2,
      minZ: p.z - VEHICLE_SIZE.d / 2, maxZ: p.z + VEHICLE_SIZE.d / 2,
    };
  }
  getImpulse() {
    const M = 12.0;
    return { x: this.dirX * M, z: this.dirZ * M };
  }
  remove(scene) { scene.remove(this.mesh); this.alive = false; }
}

Vehicle.SPEED = VEHICLE_SPEED;
if (typeof window !== 'undefined') window.MayhemVehicle = Vehicle;

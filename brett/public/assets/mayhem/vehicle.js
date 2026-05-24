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

  static spawn(type, position, scene) {
    const THREE = window.THREE;
    const size = type === 'motorcycle' ? { w: 0.6, h: 0.7, d: 1.4 } : { w: 1.6, h: 0.9, d: 2.0 };
    const color = type === 'motorcycle' ? 0xc8a96e : 0x2a3040;
    const geo = new THREE.BoxGeometry(size.w, size.h, size.d);
    const mat = new THREE.MeshLambertMaterial({ color });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(position.x, size.h / 2, position.z);
    scene.add(mesh);

    const vehicle = {
      type,
      mesh,
      hp: 100,
      maxHp: 100,
      speedMult: 1,
      damagesOnContact: false,
    };
    return vehicle;
  }

  static despawn(vehicle, scene) {
    if (vehicle && vehicle.mesh) {
      scene.remove(vehicle.mesh);
      if (vehicle.mesh.geometry) vehicle.mesh.geometry.dispose();
      if (vehicle.mesh.material) vehicle.mesh.material.dispose();
    }
  }
}

class AutoTurret {
  constructor({ vehicle, scene, THREE, onFire }) {
    this._vehicle = vehicle;
    this._active  = false;
    this._lastFire = 0;
    this._geo  = new THREE.BoxGeometry(0.15, 0.15, 0.5);
    this._mat  = new THREE.MeshLambertMaterial({ color: 0x2a3040 });
    this._mesh = new THREE.Mesh(this._geo, this._mat);
    this._mesh.position.set(0, 0.6, -0.4);
    vehicle.mesh && vehicle.mesh.add(this._mesh);
    this._onFire = onFire || (() => {});
  }

  enable()  { this._active = true; }
  disable() { this._active = false; }

  tick(remoteAvatars, nowMs) {
    if (!this._active) return;
    if (nowMs - this._lastFire < 600) return;
    let nearest = null, nearestDist = Infinity;
    const vp = this._vehicle.mesh ? this._vehicle.mesh.position : { x: 0, z: 0 };
    for (const [id, av] of remoteAvatars) {
      if (av.isDead) continue;
      const rp   = av.mannequin.root.position;
      const dist = Math.hypot(rp.x - vp.x, rp.z - vp.z);
      if (dist < 4 && dist < nearestDist) { nearest = { id, pos: rp }; nearestDist = dist; }
    }
    if (!nearest) return;
    this._lastFire = nowMs;
    const dx = nearest.pos.x - vp.x, dz = nearest.pos.z - vp.z;
    this._mesh.rotation.y = Math.atan2(dx, dz);
    this._onFire({ targetId: nearest.id, damage: 15, weaponKey: 'turret' });
  }
}

Vehicle.SPEED = VEHICLE_SPEED;
Vehicle.Vehicle = Vehicle;
Vehicle.AutoTurret = AutoTurret;

if (typeof window !== 'undefined') window.MayhemVehicle = Vehicle;

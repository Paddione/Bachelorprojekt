'use strict';

class ChaseCamera {
  constructor(threeCamera, canvas) {
    this.cam = threeCamera;
    this.canvas = canvas;
    this.target = null;
    this.yaw = 0;
    this.pitch = -0.2;
    this.distance = 3.0;
    this.height = 1.5;
    this.sensitivity = 0.0025;
    this._locked = false;
    this._onMove = this._onMove.bind(this);
    this._onLockChange = this._onLockChange.bind(this);
    canvas.addEventListener('click', () => {
      if (this.target) canvas.requestPointerLock();
    });
    document.addEventListener('pointerlockchange', this._onLockChange);
    document.addEventListener('mousemove', this._onMove);
  }
  _onLockChange() {
    this._locked = (document.pointerLockElement === this.canvas);
  }
  _onMove(e) {
    if (!this._locked) return;
    this.yaw   -= e.movementX * this.sensitivity;
    this.pitch -= e.movementY * this.sensitivity;
    this.pitch = Math.max(-1.2, Math.min(0.5, this.pitch));
  }
  attach(obj) { this.target = obj; }
  detach() {
    this.target = null;
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
  }
  getYaw() { return this.yaw; }
  update() {
    if (!this.target) return;
    const cosP = Math.cos(this.pitch), sinP = Math.sin(this.pitch);
    const sinY = Math.sin(this.yaw),   cosY = Math.cos(this.yaw);
    const ox = sinY * this.distance * cosP;
    const oz = cosY * this.distance * cosP;
    const oy = this.height + sinP * this.distance;
    this.cam.position.set(
      this.target.position.x + ox,
      this.target.position.y + oy,
      this.target.position.z + oz
    );
    this.cam.lookAt(
      this.target.position.x,
      this.target.position.y + 1.0,
      this.target.position.z
    );
  }
  dispose() {
    document.removeEventListener('pointerlockchange', this._onLockChange);
    document.removeEventListener('mousemove', this._onMove);
    this.detach();
  }
}

if (typeof window !== 'undefined') window.MayhemChaseCamera = ChaseCamera;

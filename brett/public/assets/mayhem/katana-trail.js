'use strict';

(function () {
  class KatanaTrail {
    constructor(scene, THREE) {
      this._scene = scene;
      this._THREE = THREE;
      this.trailSamples = [];
      this.TRAIL_MAX = 48;
      this.trailLen = 22;
      this.ribbonWidth = 0.55;
      this.headColor = new THREE.Color(0xfff5c8);
      this.tailColor = new THREE.Color(0xc8a96e);

      this._initGeometry();
    }

    _initGeometry() {
      const THREE = this._THREE;
      const TRAIL_MAX = this.TRAIL_MAX;
      this.trailGeometry = new THREE.BufferGeometry();
      this.posArr   = new Float32Array(TRAIL_MAX * 2 * 3);
      this.colArr   = new Float32Array(TRAIL_MAX * 2 * 3);
      this.alphaArr = new Float32Array(TRAIL_MAX * 2);
      const indexArr = new Uint16Array((TRAIL_MAX - 1) * 6);
      for (let i = 0; i < TRAIL_MAX - 1; i++) {
        const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
        const o = i * 6;
        indexArr[o + 0] = a; indexArr[o + 1] = c; indexArr[o + 2] = b;
        indexArr[o + 3] = b; indexArr[o + 4] = c; indexArr[o + 5] = d;
      }
      this.trailGeometry.setIndex(new THREE.BufferAttribute(indexArr, 1));
      this.trailGeometry.setAttribute('position', new THREE.BufferAttribute(this.posArr, 3));
      this.trailGeometry.setAttribute('color',    new THREE.BufferAttribute(this.colArr, 3));
      this.trailGeometry.setAttribute('vAlpha',   new THREE.BufferAttribute(this.alphaArr, 1));

      this.trailMaterial = new THREE.ShaderMaterial({
        uniforms: {},
        vertexShader: /* glsl */`
          attribute vec3 color;
          attribute float vAlpha;
          varying vec3 vColor;
          varying float vA;
          void main() {
            vColor = color;
            vA = vAlpha;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: /* glsl */`
          varying vec3 vColor;
          varying float vA;
          void main() {
            if (vA < 0.001) discard;
            gl_FragColor = vec4(vColor, vA);
          }
        `,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });

      this.trailMesh = new THREE.Mesh(this.trailGeometry, this.trailMaterial);
      this._scene.add(this.trailMesh);
    }

    sampleFromBlade(weaponMesh) {
      if (!weaponMesh) return;
      const THREE = this._THREE;
      const blade = weaponMesh.getObjectByName('blade');
      if (!blade) return;
      const tipMarker = blade.getObjectByName('tipMarker');
      const baseMarker = blade.getObjectByName('baseMarker');
      if (!tipMarker || !baseMarker) return;

      const tip = new THREE.Vector3();
      const base = new THREE.Vector3();
      tipMarker.getWorldPosition(tip);
      baseMarker.getWorldPosition(base);

      // base is interpolated toward tip by (1 - ribbonWidth) to control thickness
      const baseLerp = base.clone().lerp(tip, 1 - this.ribbonWidth);
      this.trailSamples.unshift({ tip: tip.clone(), base: baseLerp });
      if (this.trailSamples.length > this.TRAIL_MAX) {
        this.trailSamples.length = this.TRAIL_MAX;
      }

      this.rebuild();
    }

    rebuild() {
      const THREE = this._THREE;
      const TRAIL_MAX = this.TRAIL_MAX;
      const n = Math.min(this.trailSamples.length, this.trailLen);
      const len = Math.min(this.trailLen, TRAIL_MAX);
      const _tmpCol = new THREE.Color();

      for (let i = 0; i < TRAIL_MAX; i++) {
        const inRange = i < len && i < n;
        const idx0 = i * 2, idx1 = idx0 + 1;
        if (!inRange) {
          const s = this.trailSamples[0];
          const tx = s ? s.tip.x  : 0, ty = s ? s.tip.y  : 0, tz = s ? s.tip.z  : 0;
          this.posArr[idx0 * 3] = tx; this.posArr[idx0 * 3 + 1] = ty; this.posArr[idx0 * 3 + 2] = tz;
          this.posArr[idx1 * 3] = tx; this.posArr[idx1 * 3 + 1] = ty; this.posArr[idx1 * 3 + 2] = tz;
          this.alphaArr[idx0] = 0; this.alphaArr[idx1] = 0;
          continue;
        }
        const sample = this.trailSamples[i];
        this.posArr[idx0 * 3]     = sample.tip.x;
        this.posArr[idx0 * 3 + 1] = sample.tip.y;
        this.posArr[idx0 * 3 + 2] = sample.tip.z;
        this.posArr[idx1 * 3]     = sample.base.x;
        this.posArr[idx1 * 3 + 1] = sample.base.y;
        this.posArr[idx1 * 3 + 2] = sample.base.z;

        const age = len > 1 ? i / (len - 1) : 0;
        const a = Math.pow(1 - age, 1.6);
        this.alphaArr[idx0] = a;
        this.alphaArr[idx1] = a * 0.45;

        _tmpCol.copy(this.headColor).lerp(this.tailColor, age);
        this.colArr[idx0 * 3]     = _tmpCol.r;
        this.colArr[idx0 * 3 + 1] = _tmpCol.g;
        this.colArr[idx0 * 3 + 2] = _tmpCol.b;

        this.colArr[idx1 * 3]     = _tmpCol.r * 0.65;
        this.colArr[idx1 * 3 + 1] = _tmpCol.g * 0.65;
        this.colArr[idx1 * 3 + 2] = _tmpCol.b * 0.65;
      }

      this.trailGeometry.attributes.position.needsUpdate = true;
      this.trailGeometry.attributes.color.needsUpdate = true;
      this.trailGeometry.attributes.vAlpha.needsUpdate = true;
    }

    destroy() {
      if (this.trailMesh && this.trailMesh.parent) {
        this.trailMesh.parent.remove(this.trailMesh);
      }
      if (this.trailGeometry) this.trailGeometry.dispose();
      if (this.trailMaterial) this.trailMaterial.dispose();
    }
  }

  if (typeof window !== 'undefined') {
    window.MayhemKatanaTrail = KatanaTrail;
  }
})();

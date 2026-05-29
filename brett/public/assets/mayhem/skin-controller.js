// brett/public/assets/mayhem/skin-controller.js
(function () {
'use strict';

// Each brett bone maps to a list of candidates across naming schemes.
// First match in the loaded skeleton wins. Supports Mixamo (Adobe rig)
// and Quaternius (Blender-style: Hips, UpperArm.L, etc.).
const SKIN_BONE_MAP = Object.freeze({
  hips:      ['mixamorigHips',         'Hips'],
  head:      ['mixamorigHead',         'Head'],
  lShoulder: ['mixamorigLeftArm',      'UpperArm.L'],
  rShoulder: ['mixamorigRightArm',     'UpperArm.R'],
  lElbow:    ['mixamorigLeftForeArm',  'LowerArm.L'],
  rElbow:    ['mixamorigRightForeArm', 'LowerArm.R'],
  lWrist:    ['mixamorigLeftHand',     'Palm.L'],
  rWrist:    ['mixamorigRightHand',    'Palm.R'],
  lHip:      ['mixamorigLeftUpLeg',    'UpperLeg.L'],
  rHip:      ['mixamorigRightUpLeg',   'UpperLeg.R'],
  lKnee:     ['mixamorigLeftLeg',      'LowerLeg.L'],
  rKnee:     ['mixamorigRightLeg',     'LowerLeg.R'],
  lAnkle:    ['mixamorigLeftFoot',     'Foot.L'],
  rAnkle:    ['mixamorigRightFoot',    'Foot.R'],
});

// Quaternius animation suffix → brett clip key. The full clip name comes in
// like `HumanArmature|Man_Idle` or `HumanArmature|Female_Run`; the suffix
// after the last `_` is what we match on.
const QUATERNIUS_CLIP_ALIASES = Object.freeze({
  idle:   'Idle',
  walk:   'Walk',
  run:    'Run',
  death:  'Death',
  jump:   'Jump',
  punch:  'Punch',
  slash:  'SwordSlash',
  sit:    'Sitting',
  cheer:  'Clapping',
});

const CROSSFADE_IDLE_RUN_S  = 0.2;
const CROSSFADE_RECOVER_S   = 0.4;

class SkinController {
  constructor(skinId, gltfRoot, animations, mannequin) {
    this.skinId = skinId;
    this.mesh = gltfRoot;                       // THREE.Group — added to mannequin.root by caller
    this.mannequin = mannequin;
    this.ready = true;
    this._boneNodes = {};
    this._currentAction = null;
    this._currentClipName = null;
    this._disposed = false;

    const THREE = window.THREE;
    this.mixer = new THREE.AnimationMixer(gltfRoot);

    // Index named clips for state-machine lookup; missing clips are fine, we fall back.
    // Two passes: (1) exact name (Mixamo skins ship `idle`/`walk`/`run` directly),
    // (2) Quaternius-style `HumanArmature|Man_Idle` → extract suffix, alias to brett key.
    this._clips = {};
    for (const clip of (animations || [])) {
      if (!clip || typeof clip.name !== 'string') continue;
      this._clips[clip.name] = clip;
      const suffix = clip.name.split('|').pop().split('_').pop(); // "Idle" from "HumanArmature|Man_Idle"
      for (const [brettKey, quatSuffix] of Object.entries(QUATERNIUS_CLIP_ALIASES)) {
        if (suffix === quatSuffix && !this._clips[brettKey]) this._clips[brettKey] = clip;
      }
    }

    // Resolve bone nodes across naming schemes (Mixamo, Quaternius).
    gltfRoot.traverse(node => {
      if (!node || !node.isBone) return;
      for (const [brettName, candidates] of Object.entries(SKIN_BONE_MAP)) {
        if (this._boneNodes[brettName]) continue;
        if (candidates.includes(node.name)) this._boneNodes[brettName] = node;
      }
    });

    // Snap to idle on creation if available.
    this._play('idle', 0);
  }

  // Static factory — async load of <skinId>/skin.glb.
  static load(skinId, mannequin) {
    return new Promise((resolve, reject) => {
      const THREE = window.THREE;
      if (!THREE || !THREE.GLTFLoader) {
        return reject(new Error('THREE.GLTFLoader not loaded'));
      }
      const url = `/assets/skins/${encodeURIComponent(skinId)}/skin.glb`;
      const loader = new THREE.GLTFLoader();
      loader.load(
        url,
        gltf => {
          try {
            const ctrl = new SkinController(skinId, gltf.scene, gltf.animations, mannequin);
            resolve(ctrl);
          } catch (err) { reject(err); }
        },
        undefined,
        err => reject(err),
      );
    });
  }

  getBone(brettName) {
    return this._boneNodes[brettName] || null;
  }

  setVisible(v) { if (this.mesh) this.mesh.visible = !!v; }

  // Per-frame tick. avatarState may be a plain string or { state, sprint }.
  update(dt, avatarState) {
    if (this._disposed || !this.ready) return;
    this.mixer.update(dt);
    const state  = (typeof avatarState === 'string') ? avatarState : (avatarState && avatarState.state);
    const sprint = !!(avatarState && avatarState.sprint);

    // RAGDOLL / FLAILING → hand off to Brett spring system; freeze the mixer-driven clip.
    if (state === 'ragdoll' || state === 'flailing') {
      if (this._currentAction) {
        this._currentAction.fadeOut(0);
        this._currentAction = null;
        this._currentClipName = null;
      }
      return;
    }
    if (state === 'dead') { this._play('death', 0, false); return; }
    if (state === 'running') {
      const target = sprint && this._clips.run ? 'run' : (this._clips.walk ? 'walk' : 'idle');
      this._play(target, CROSSFADE_IDLE_RUN_S);
      return;
    }
    if (state === 'recovering') {
      this._play('idle', CROSSFADE_RECOVER_S);
      return;
    }
    // default — idle
    this._play('idle', CROSSFADE_IDLE_RUN_S);
  }

  _play(clipName, fadeSeconds, loop = true) {
    const THREE = window.THREE;
    if (this._currentClipName === clipName) return;
    let clip = this._clips[clipName];
    if (!clip && clipName === 'walk') clip = this._clips.idle;
    if (!clip) return; // missing death → freeze; missing idle → no-op
    const nextAction = this.mixer.clipAction(clip);
    nextAction.reset();
    nextAction.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
    nextAction.clampWhenFinished = !loop;
    if (this._currentAction) {
      nextAction.crossFadeFrom(this._currentAction, fadeSeconds, false);
    }
    nextAction.play();
    this._currentAction   = nextAction;
    this._currentClipName = clipName;
  }

  dispose(scene) {
    if (this._disposed) return;
    this._disposed = true;
    if (this.mixer) this.mixer.stopAllAction();
    if (this.mesh && this.mesh.parent) this.mesh.parent.remove(this.mesh);
    if (this.mesh) {
      this.mesh.traverse(obj => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
          else obj.material.dispose();
        }
        if (obj.skeleton && obj.skeleton.dispose) obj.skeleton.dispose();
      });
    }
    this.mesh = null;
    this._boneNodes = {};
    this._clips = {};
    void scene; // unused — included for API symmetry with PlayerAvatar.remove(scene)
  }
}

SkinController.BONE_MAP = SKIN_BONE_MAP;
if (typeof window !== 'undefined') window.MayhemSkinController = SkinController;
})();

// Mayhem audio manager — Web Audio API, all CC0 sources from Freesound.org
// Sources documented in brett/public/assets/sfx/CREDITS.md
// Preloads on first user gesture (AudioContext requires interaction).

const SFX_ROOT = 'assets/sfx/';

const SFX_MAP = {
  handgun:   SFX_ROOT + 'handgun.ogg',
  rifle:     SFX_ROOT + 'rifle.ogg',
  fireball:  SFX_ROOT + 'fire-burn-loop.ogg',
  club:      SFX_ROOT + 'club-hit.ogg',
  katana:    SFX_ROOT + 'katana-swing.ogg',

  'katana-hit':    SFX_ROOT + 'katana-hit.ogg',
  'blood-splat':   SFX_ROOT + 'blood-splat.ogg',
  'hit-marker':    SFX_ROOT + 'hit-marker.ogg',
  'fire-burn-loop': SFX_ROOT + 'fire-burn-loop.ogg',

  'footstep-1': SFX_ROOT + 'footstep-concrete-01.ogg',
  'footstep-2': SFX_ROOT + 'footstep-concrete-02.ogg',
  'footstep-3': SFX_ROOT + 'footstep-concrete-03.ogg',
  'footstep-4': SFX_ROOT + 'footstep-concrete-04.ogg',
};

class MayhemAudio {
  constructor() {
    this._ctx = null;
    this._buffers = {};
    this._ready = false;
    this._fireLoop = null;   // currently playing fire ambient node
  }

  // Call once after a user gesture to unlock AudioContext and preload all buffers.
  async init() {
    if (this._ready) return;
    this._ctx = new (window.AudioContext || window.webkitAudioContext)();
    await Promise.all(
      Object.entries(SFX_MAP).map(([key, url]) =>
        fetch(url)
          .then(r => r.arrayBuffer())
          .then(buf => this._ctx.decodeAudioData(buf))
          .then(decoded => { this._buffers[key] = decoded; })
          .catch(() => {})          // missing file → silent fail
      )
    );
    this._ready = true;
  }

  // Play a one-shot buffer at optional volume (0–1).
  _play(key, volume = 1, pitchShift = 0) {
    if (!this._ready || !this._buffers[key]) return;
    const src = this._ctx.createBufferSource();
    src.buffer = this._buffers[key];
    src.playbackRate.value = Math.pow(2, pitchShift / 12); // semitones → ratio
    const gain = this._ctx.createGain();
    gain.gain.value = volume;
    src.connect(gain).connect(this._ctx.destination);
    src.start();
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  // Call when a shot is fired; weaponKey matches WEAPONS registry keys.
  onFire(weaponKey) {
    if (weaponKey === 'katana') {
      this._play('katana', 0.9, randCents(-5, 5));
    } else {
      this._play(weaponKey, 0.85, randCents(-3, 3));
    }
  }

  // Call when a projectile hits a figure.
  onHit(weaponKey) {
    if (weaponKey === 'katana') {
      this._play('katana-hit', 0.8, randCents(-8, 8));
    }
    // Ranged + club hits: blood-splat + hit-marker cover the feel
    this._play('blood-splat', 0.6 + Math.random() * 0.2);
    this._play('hit-marker',  0.45);
  }

  // Call from EffectsManager.spawnBloodSplat.
  onBloodSplat() {
    this._play('blood-splat', 0.5 + Math.random() * 0.25, randCents(-12, 12));
  }

  // Footstep — call each time the local player moves; pick a random variant.
  onFootstep() {
    const n = Math.floor(Math.random() * 4) + 1;
    this._play(`footstep-${n}`, 0.35, randCents(-6, 6));
  }

  // Looping fire ambient — start when fireball weapon is active, stop otherwise.
  startFireAmbient() {
    if (this._fireLoop || !this._ready || !this._buffers['fire-burn-loop']) return;
    const src = this._ctx.createBufferSource();
    src.buffer = this._buffers['fire-burn-loop'];
    src.loop = true;
    const gain = this._ctx.createGain();
    gain.gain.value = 0.25;
    src.connect(gain).connect(this._ctx.destination);
    src.start();
    this._fireLoop = { src, gain };
  }

  stopFireAmbient() {
    if (!this._fireLoop) return;
    const { src, gain } = this._fireLoop;
    gain.gain.setTargetAtTime(0, this._ctx.currentTime, 0.3);
    src.stop(this._ctx.currentTime + 1.5);
    this._fireLoop = null;
  }
}

function randCents(lo, hi) {
  return lo + Math.random() * (hi - lo);
}

window.MayhemAudio = new MayhemAudio();

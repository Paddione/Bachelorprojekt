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

  // Terrain footsteps (Fantozzi stone + rubberduck mud)
  'footstep-stone-1': SFX_ROOT + 'footstep-stone-01.ogg',
  'footstep-stone-2': SFX_ROOT + 'footstep-stone-02.ogg',
  'footstep-stone-3': SFX_ROOT + 'footstep-stone-03.ogg',
  'footstep-stone-4': SFX_ROOT + 'footstep-stone-04.ogg',
  'footstep-mud-1':   SFX_ROOT + 'footstep-mud-01.ogg',
  'footstep-mud-2':   SFX_ROOT + 'footstep-mud-02.ogg',
  'footstep-mud-3':   SFX_ROOT + 'footstep-mud-03.ogg',
  'footstep-mud-4':   SFX_ROOT + 'footstep-mud-04.ogg',
  'footstep-grass':   SFX_ROOT + 'footstep-grass.ogg',

  // Hero abilities
  'frostnova':          SFX_ROOT + 'frostnova.ogg',
  'chainlightning':     SFX_ROOT + 'chainlightning.ogg',
  'summon-minion':      SFX_ROOT + 'summon-minion.ogg',
  'shield-minion':      SFX_ROOT + 'shield-minion.ogg',
  'frenzy-minion':      SFX_ROOT + 'frenzy-minion.ogg',
  'motorcycle-engine':  SFX_ROOT + 'motorcycle-engine.ogg',
  'vehicle-switch':     SFX_ROOT + 'vehicle-switch.ogg',
  'vehicle-repair':     SFX_ROOT + 'vehicle-repair.ogg',
  'vehicle-crash':      SFX_ROOT + 'vehicle-crash.ogg',
  'hero-stealth':       SFX_ROOT + 'hero-stealth.ogg',
  'hero-teleport':      SFX_ROOT + 'hero-teleport.ogg',
  'explosion':          SFX_ROOT + 'explosion.ogg',
  'shatter':            SFX_ROOT + 'shatter.ogg',

  // Duel theatre
  'duel-gong':          SFX_ROOT + 'duel-gong.ogg',
  'phase-gong':         SFX_ROOT + 'phase-gong.ogg',
  'ko-stinger':         SFX_ROOT + 'ko-stinger.ogg',
  'crowd-cheer':        SFX_ROOT + 'crowd-cheer.ogg',
  'kill-confirmed':     SFX_ROOT + 'kill-confirmed.ogg',

  // UI / menu (Lokif GUI pack)
  'ui-click':    SFX_ROOT + 'ui-click.ogg',
  'ui-click-alt':SFX_ROOT + 'ui-click-alt.ogg',
  'ui-confirm':  SFX_ROOT + 'ui-confirm.ogg',
  'ui-cancel':   SFX_ROOT + 'ui-cancel.ogg',
  'ui-error':    SFX_ROOT + 'ui-error.ogg',
  'menu-open':   SFX_ROOT + 'menu-open.ogg',
  'menu-close':  SFX_ROOT + 'menu-close.ogg',
  'menu-hover':  SFX_ROOT + 'menu-hover.ogg',
  'alert':       SFX_ROOT + 'alert.ogg',
  'match-start': SFX_ROOT + 'match-start.ogg',
  'match-end':   SFX_ROOT + 'match-end.ogg',
  'unlock':      SFX_ROOT + 'unlock.ogg',
  'bell-ui':     SFX_ROOT + 'bell-ui.ogg',
  'bounce':      SFX_ROOT + 'bounce.ogg',
};

// Terrain-keyed footstep buckets — picks one variant by terrain type.
const FOOTSTEP_TERRAINS = {
  concrete: ['footstep-1', 'footstep-2', 'footstep-3', 'footstep-4'],
  stone:    ['footstep-stone-1', 'footstep-stone-2', 'footstep-stone-3', 'footstep-stone-4'],
  mud:      ['footstep-mud-1', 'footstep-mud-2', 'footstep-mud-3', 'footstep-mud-4'],
  grass:    ['footstep-grass'],
};

class MayhemAudio {
  constructor() {
    this._ctx = null;
    this._buffers = {};
    this._ready = false;
    this._fireLoop = null;   // currently playing fire ambient node
  }

  // Public method to play one-shot sounds
  play(key, volume = 1, pitchShift = 0) {
    this._play(key, volume, pitchShift);
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

  // Call when a kill is confirmed.
  onKill() {
    this._play('kill-confirmed', 0.85);
  }

  // Call from EffectsManager.spawnBloodSplat.
  onBloodSplat() {
    this._play('blood-splat', 0.5 + Math.random() * 0.25, randCents(-12, 12));
  }

  // Footstep — pick a variant for the current terrain ('concrete' is default).
  onFootstep(terrain = 'concrete') {
    const bucket = FOOTSTEP_TERRAINS[terrain] || FOOTSTEP_TERRAINS.concrete;
    const key = bucket[Math.floor(Math.random() * bucket.length)];
    this._play(key, 0.35, randCents(-6, 6));
  }

  // UI helpers — short, low-volume one-shots tied to the menu/loadout flow.
  onUiClick()   { this._play('ui-click',   0.5); }
  onUiConfirm() { this._play('ui-confirm', 0.45); }
  onUiCancel()  { this._play('ui-cancel',  0.4); }
  onUiHover()   { this._play('menu-hover', 0.18); }
  onMenuOpen()  { this._play('menu-open',  0.5); }
  onMenuClose() { this._play('menu-close', 0.4); }
  onMatchStart(){ this._play('match-start', 0.65); this._play('phase-gong', 0.5); }
  onMatchEnd()  { this._play('match-end',  0.7); }
  onAlert()     { this._play('alert',      0.45); }

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

// Auto-init on first user gesture — AudioContext requires interaction. Without
// this, every _play() short-circuits silently because _ready stays false.
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  const _unlock = () => {
    document.removeEventListener('pointerdown', _unlock, true);
    document.removeEventListener('keydown', _unlock, true);
    document.removeEventListener('touchstart', _unlock, true);
    window.MayhemAudio.init();
  };
  document.addEventListener('pointerdown', _unlock, true);
  document.addEventListener('keydown', _unlock, true);
  document.addEventListener('touchstart', _unlock, true);
}

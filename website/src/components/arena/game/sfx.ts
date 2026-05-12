import type { WeaponId } from '../shared/lobbyTypes';

let ctx: AudioContext | null = null;
function getCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  return ctx;
}

function noiseBuffer(c: AudioContext, durationS: number): AudioBuffer {
  const buf = c.createBuffer(1, Math.ceil(c.sampleRate * durationS), c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

export let isMuted: boolean = typeof localStorage !== 'undefined'
  ? localStorage.getItem('arena:sfx:muted') === 'true'
  : false;

export function toggleMute(): void {
  isMuted = !isMuted;
  if (typeof localStorage !== 'undefined')
    localStorage.setItem('arena:sfx:muted', String(isMuted));
}

export function playShot(weapon: WeaponId): void {
  if (isMuted) return;
  const c = getCtx();
  if (c.state === 'suspended') c.resume();
  const gain = c.createGain();
  gain.connect(c.destination);

  if (weapon === 'glock') {
    // 100ms white-noise burst, 2 kHz bandpass, fast decay
    const src = c.createBufferSource();
    src.buffer = noiseBuffer(c, 0.1);
    const filter = c.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 2000;
    filter.Q.value = 1;
    gain.gain.setValueAtTime(0.7, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.1);
    src.connect(filter);
    filter.connect(gain);
    src.start();
  } else if (weapon === 'm4a1') {
    // 150ms noise burst, 400 Hz bandpass, rumble envelope
    const src = c.createBufferSource();
    src.buffer = noiseBuffer(c, 0.15);
    const filter = c.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 400;
    filter.Q.value = 0.8;
    gain.gain.setValueAtTime(0.9, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.15);
    src.connect(filter);
    filter.connect(gain);
    src.start();
  } else {
    // deagle: 40ms sharp transient, 8 kHz highpass click
    const src = c.createBufferSource();
    src.buffer = noiseBuffer(c, 0.04);
    const filter = c.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 8000;
    gain.gain.setValueAtTime(1.0, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.04);
    src.connect(filter);
    filter.connect(gain);
    src.start();
  }
}

export function playMelee(): void {
  if (isMuted) return;
  const c = getCtx();
  if (c.state === 'suspended') c.resume();
  // 80ms noise burst, 200 Hz bandpass, soft thud envelope
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(c, 0.08);
  const filter = c.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 200;
  filter.Q.value = 1;
  const gain = c.createGain();
  gain.gain.setValueAtTime(0, c.currentTime);
  gain.gain.linearRampToValueAtTime(0.8, c.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.08);
  src.connect(filter);
  filter.connect(gain);
  gain.connect(c.destination);
  src.start();
}

export function playDeath(): void {
  if (isMuted) return;
  const c = getCtx();
  if (c.state === 'suspended') c.resume();
  // 400ms descending sawtooth: 300 → 80 Hz, amplitude ramps to zero
  const osc = c.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(300, c.currentTime);
  osc.frequency.linearRampToValueAtTime(80, c.currentTime + 0.4);
  const gain = c.createGain();
  gain.gain.setValueAtTime(0.4, c.currentTime);
  gain.gain.linearRampToValueAtTime(0, c.currentTime + 0.4);
  osc.connect(gain);
  gain.connect(c.destination);
  osc.start();
  osc.stop(c.currentTime + 0.4);
}

let zoneWarnPlayed = false;
export function resetZoneWarnFlag(): void { zoneWarnPlayed = false; }

export function playZoneWarning(): void {
  if (isMuted || zoneWarnPlayed) return;
  zoneWarnPlayed = true;
  const c = getCtx();
  if (c.state === 'suspended') c.resume();
  // 300ms two-tone pulse: 440 Hz + 880 Hz sine
  [440, 880].forEach((freq, i) => {
    const osc = c.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const gain = c.createGain();
    gain.gain.setValueAtTime(0.2, c.currentTime + i * 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.3 + i * 0.05);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(c.currentTime + i * 0.05);
    osc.stop(c.currentTime + 0.31 + i * 0.05);
  });
}

export function playSlowMo(): void {
  if (isMuted) return;
  const c = getCtx();
  if (c.state === 'suspended') c.resume();
  // 600ms noise swept from 200 → 80 Hz via bandpass linearRamp
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(c, 0.6);
  const filter = c.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(200, c.currentTime);
  filter.frequency.linearRampToValueAtTime(80, c.currentTime + 0.6);
  const gain = c.createGain();
  gain.gain.setValueAtTime(0.6, c.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.6);
  src.connect(filter);
  filter.connect(gain);
  gain.connect(c.destination);
  src.start();
}

export function playVictory(): void {
  if (isMuted) return;
  const c = getCtx();
  if (c.state === 'suspended') c.resume();
  // 800ms: C4 → E4 → G4 arpeggio, 200ms each + 200ms sustain on G4
  const notes = [261.63, 329.63, 392.0]; // C4, E4, G4
  notes.forEach((freq, i) => {
    const osc = c.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const gain = c.createGain();
    const startAt = c.currentTime + i * 0.2;
    const endAt = startAt + (i === notes.length - 1 ? 0.4 : 0.18);
    gain.gain.setValueAtTime(0, startAt);
    gain.gain.linearRampToValueAtTime(0.3, startAt + 0.01);
    gain.gain.setValueAtTime(0.3, endAt - 0.04);
    gain.gain.linearRampToValueAtTime(0, endAt);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(startAt);
    osc.stop(endAt);
  });
}

// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { computeWasd, computeAim, loadBindings, saveBinding, DEFAULT_BINDINGS } from './input';

describe('computeWasd — 9-direction enum mirroring server WASD_DX/DY', () => {
  it('returns 0 when no keys pressed', () => {
    expect(computeWasd(false, false, false, false)).toBe(0);
  });
  it('returns 1 for up (W) only', () => {
    expect(computeWasd(true, false, false, false)).toBe(1);
  });
  it('returns 2 for up-right (W+D)', () => {
    expect(computeWasd(true, false, false, true)).toBe(2);
  });
  it('returns 3 for right (D) only', () => {
    expect(computeWasd(false, false, false, true)).toBe(3);
  });
  it('returns 4 for down-right (S+D)', () => {
    expect(computeWasd(false, true, false, true)).toBe(4);
  });
  it('returns 5 for down (S) only', () => {
    expect(computeWasd(false, true, false, false)).toBe(5);
  });
  it('returns 6 for down-left (S+A)', () => {
    expect(computeWasd(false, true, true, false)).toBe(6);
  });
  it('returns 7 for left (A) only', () => {
    expect(computeWasd(false, false, true, false)).toBe(7);
  });
  it('returns 8 for up-left (W+A)', () => {
    expect(computeWasd(true, false, true, false)).toBe(8);
  });
  it('returns 0 when up+down cancel', () => {
    expect(computeWasd(true, true, false, false)).toBe(0);
  });
  it('returns 0 when left+right cancel', () => {
    expect(computeWasd(false, false, true, true)).toBe(0);
  });
  it('returns 0 when all four keys pressed', () => {
    expect(computeWasd(true, true, true, true)).toBe(0);
  });
});

describe('computeAim', () => {
  it('returns ~0 for mouse directly right of center', () => {
    expect(computeAim(100, 0, 0, 0)).toBeCloseTo(0);
  });
  it('returns ~PI/2 for mouse directly below center', () => {
    expect(computeAim(0, 100, 0, 0)).toBeCloseTo(Math.PI / 2);
  });
  it('returns ~PI for mouse directly left of center', () => {
    expect(computeAim(-100, 0, 0, 0)).toBeCloseTo(Math.PI);
  });
  it('returns ~-PI/2 for mouse directly above center', () => {
    expect(computeAim(0, -100, 0, 0)).toBeCloseTo(-Math.PI / 2);
  });
  it('handles non-zero canvas origin', () => {
    expect(computeAim(150, 50, 50, 50)).toBeCloseTo(0);
  });
});

describe('loadBindings / saveBinding', () => {
  beforeEach(() => localStorage.clear());

  it('returns defaults when nothing stored', () => {
    const b = loadBindings();
    expect(b.up).toBe('KeyW');
    expect(b.down).toBe('KeyS');
    expect(b.left).toBe('KeyA');
    expect(b.right).toBe('KeyD');
    expect(b.fire).toBe('Mouse0');
    expect(b.melee).toBe('KeyE');
    expect(b.pickup).toBe('KeyF');
    expect(b.dodge).toBe('Space');
  });

  it('returns defaults when localStorage contains invalid JSON', () => {
    localStorage.setItem('arena:keybindings', 'bad{json');
    const b = loadBindings();
    expect(b.up).toBe('KeyW');
  });

  it('merges saved override onto defaults', () => {
    saveBinding('up', 'ArrowUp');
    const b = loadBindings();
    expect(b.up).toBe('ArrowUp');
    expect(b.down).toBe('KeyS'); // default preserved
  });

  it('reflects multiple saved bindings', () => {
    saveBinding('melee', 'KeyG');
    saveBinding('dodge', 'ShiftLeft');
    const b = loadBindings();
    expect(b.melee).toBe('KeyG');
    expect(b.dodge).toBe('ShiftLeft');
    expect(b.pickup).toBe('KeyF'); // default preserved
  });
});

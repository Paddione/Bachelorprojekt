// brett/test/lobby-types.test.ts — Phase B / B1
import { test } from 'node:test';
import assert from 'node:assert';
import type {
  Phase,
  Role,
  OptikSettings,
  LobbySettings,
  Participant,
} from '../src/types/state';

test('Phase union includes lobby (value+type level)', () => {
  const p: Phase = 'lobby';
  assert.strictEqual(p, 'lobby');
  const phases: Phase[] = ['lobby', 'warmup', 'active', 'paused', 'ended'];
  assert.strictEqual(phases.length, 5);
  assert.strictEqual(phases[0], 'lobby');
});

test('Role union members assignable', () => {
  const r: Role = 'beobachter';
  assert.strictEqual(r, 'beobachter');
  const all: Role[] = ['leiter', 'stellvertreter', 'beobachter'];
  assert.strictEqual(all.length, 3);
});

test('Participant accepts role + ready flags', () => {
  const p: Participant = {
    userId: 'u1',
    name: 'Anna',
    color: '#4ea1ff',
    role: 'leiter',
    ready: true,
  };
  assert.strictEqual(p.role, 'leiter');
  assert.strictEqual(p.ready, true);
});

test('OptikSettings + LobbySettings shapes', () => {
  const optik: OptikSettings = { sky: 'dusk', lightMood: 'warm', floor: 'felt-green' };
  assert.strictEqual(optik.sky, 'dusk');
  const settings: LobbySettings = {
    templateId: 'fam5',
    optik,
    maxParticipants: 8,
    allowRepresentativeAdd: false,
  };
  assert.strictEqual(settings.allowRepresentativeAdd, false);
  assert.strictEqual(settings.optik?.lightMood, 'warm');
});

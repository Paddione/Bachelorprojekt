import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveLiveState } from '../src/lib/live-state.js';

test('empty when no stream and no rooms', () => {
  const data = { stream: { live: false, recording: false }, rooms: [], pollActive: null, recentSessions: [], schedule: { nextEvent: null } };
  assert.equal(deriveLiveState(data), 'empty');
});

test('stream when only stream live', () => {
  const data = { stream: { live: true, recording: false }, rooms: [], pollActive: null, recentSessions: [], schedule: { nextEvent: null } };
  assert.equal(deriveLiveState(data), 'stream');
});

test('rooms when only rooms active', () => {
  const data = { stream: { live: false, recording: false }, rooms: [{ token: 't1', name: 'r', displayName: 'r', activeSince: new Date() }], pollActive: null, recentSessions: [], schedule: { nextEvent: null } };
  assert.equal(deriveLiveState(data), 'rooms');
});

test('both when stream and rooms', () => {
  const data = { stream: { live: true, recording: false }, rooms: [{ token: 't1', name: 'r', displayName: 'r', activeSince: new Date() }], pollActive: null, recentSessions: [], schedule: { nextEvent: null } };
  assert.equal(deriveLiveState(data), 'both');
});

test('recording-only counts as stream', () => {
  const data = { stream: { live: false, recording: true }, rooms: [], pollActive: null, recentSessions: [], schedule: { nextEvent: null } };
  assert.equal(deriveLiveState(data), 'stream');
});

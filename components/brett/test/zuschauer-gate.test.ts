import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gateMutation } from '../src/server/ws-handler';

const baseDeps = {
  buildStateFromMutations: () => ({ sessionCode: 'ABC', roles: { leiter1: 'leiter' } }),
  figureMaps: new Map(),
  canMutate: () => true,
  resolveRole: () => 'beobachter' as const,
};

test('T000706-B1: zuschauer WS is blocked for move', () => {
  const ws = { _isZuschauer: true };
  assert.equal(gateMutation(ws, 'room1', 'move', undefined, baseDeps), false);
});

test('T000706-B2: zuschauer WS is blocked for add', () => {
  const ws = { _isZuschauer: true };
  assert.equal(gateMutation(ws, 'room1', 'add', undefined, baseDeps), false);
});

test('T000706-B3: zuschauer WS is blocked for delete', () => {
  const ws = { _isZuschauer: true };
  assert.equal(gateMutation(ws, 'room1', 'delete', undefined, baseDeps), false);
});

test('T000706-B4: zuschauer WS is blocked for update', () => {
  const ws = { _isZuschauer: true };
  assert.equal(gateMutation(ws, 'room1', 'update', undefined, baseDeps), false);
});

test('T000706-B5: zuschauer WS is blocked for clear', () => {
  const ws = { _isZuschauer: true };
  assert.equal(gateMutation(ws, 'room1', 'clear', undefined, baseDeps), false);
});

test('T000706-B6: zuschauer WS is blocked for stiffness', () => {
  const ws = { _isZuschauer: true };
  assert.equal(gateMutation(ws, 'room1', 'stiffness', undefined, baseDeps), false);
});

test('T000706-B7: zuschauer WS is blocked for snapshot', () => {
  const ws = { _isZuschauer: true };
  assert.equal(gateMutation(ws, 'room1', 'snapshot', undefined, baseDeps), false);
});

test('T000706-B8: zuschauer WS allows request_state_snapshot', () => {
  const ws = { _isZuschauer: true };
  assert.equal(gateMutation(ws, 'room1', 'request_state_snapshot', undefined, baseDeps), true);
});

test('T000706-B9: zuschauer WS is blocked for jump', () => {
  const ws = { _isZuschauer: true };
  assert.equal(gateMutation(ws, 'room1', 'jump', undefined, baseDeps), false);
});

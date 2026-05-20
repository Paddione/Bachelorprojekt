'use strict';
const test = require('node:test');
const assert = require('node:assert');

// Mock localStorage for Node
let _store = {};
global.localStorage = {
  getItem: k => _store[k] ?? null,
  setItem: (k, v) => { _store[k] = v; },
  removeItem: k => { delete _store[k]; },
};

const { DEFAULT_BINDINGS, load, save, getAction } = require('../public/assets/mayhem/keybindings.js');

test('load returns defaults when nothing stored', () => {
  _store = {};
  const b = load();
  assert.strictEqual(b.forward, 'KeyW');
  assert.strictEqual(b.backward, 'KeyS');
  assert.strictEqual(b.jump, 'Space');
  assert.strictEqual(b.toggleMayhem, 'KeyM');
});

test('load merges stored overrides onto defaults', () => {
  _store = {};
  save({ forward: 'ArrowUp', jump: 'KeyX' });
  const b = load();
  assert.strictEqual(b.forward, 'ArrowUp');
  assert.strictEqual(b.jump, 'KeyX');
  assert.strictEqual(b.backward, 'KeyS'); // default preserved
  assert.strictEqual(b.reload, 'KeyR');   // default preserved
});

test('load returns defaults when localStorage contains invalid JSON', () => {
  _store = { 'brett:keybindings': 'not-json{' };
  const b = load();
  assert.strictEqual(b.forward, 'KeyW');
});

test('getAction finds action for a default key code', () => {
  const b = { ...DEFAULT_BINDINGS };
  assert.strictEqual(getAction('KeyW', b), 'forward');
  assert.strictEqual(getAction('Space', b), 'jump');
  assert.strictEqual(getAction('KeyM', b), 'toggleMayhem');
});

test('getAction returns null for unmapped key', () => {
  assert.strictEqual(getAction('KeyZ', { ...DEFAULT_BINDINGS }), null);
});

test('getAction reflects custom bindings', () => {
  const b = { ...DEFAULT_BINDINGS, forward: 'ArrowUp' };
  assert.strictEqual(getAction('ArrowUp', b), 'forward');
  assert.strictEqual(getAction('KeyW', b), null);
});

test('save persists and load retrieves', () => {
  _store = {};
  const custom = { ...DEFAULT_BINDINGS, jump: 'KeyJ' };
  save(custom);
  const b = load();
  assert.strictEqual(b.jump, 'KeyJ');
});

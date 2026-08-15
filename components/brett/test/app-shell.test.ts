// brett/test/app-shell.test.ts — Phase A / A2
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { viewForPhase, createAppShell } from '../src/client/app-shell';

test('viewForPhase maps every phase (defensive for lobby + unknown)', () => {
  assert.equal(viewForPhase(null), 'menu');
  assert.equal(viewForPhase(undefined), 'menu');
  assert.equal(viewForPhase('menu'), 'menu');
  assert.equal(viewForPhase('lobby'), 'lobby');
  assert.equal(viewForPhase('warmup'), 'board');
  assert.equal(viewForPhase('active'), 'board');
  assert.equal(viewForPhase('paused'), 'board');
  assert.equal(viewForPhase('ended'), 'summary');
  assert.equal(viewForPhase('something-unknown'), 'menu');
});

test('shell starts in menu and never eagerly mounts the board', () => {
  let mountCalls = 0;
  const renders: string[] = [];
  const shell = createAppShell({
    mountBoard: () => { mountCalls++; },
    renderView: (v) => { renders.push(v); },
  });
  assert.equal(shell.getView(), 'menu');
  assert.equal(mountCalls, 0, 'mountBoard must not run while in menu');
});

test('mountBoard fires exactly once on first board entry (lazy-once latch)', () => {
  let mountCalls = 0;
  const renders: string[] = [];
  const shell = createAppShell({
    mountBoard: () => { mountCalls++; },
    renderView: (v) => { renders.push(v); },
  });

  shell.setPhase('active');
  assert.equal(mountCalls, 1, 'first board entry mounts once');
  assert.equal(renders.at(-1), 'board');

  // leave + re-enter the board → no second mount
  shell.setPhase('lobby');
  assert.equal(renders.at(-1), 'lobby');
  shell.setPhase('paused');
  assert.equal(renders.at(-1), 'board');
  assert.equal(mountCalls, 1, 'second board entry must NOT remount');
});

test('renderView fires on every transition with the resolved view', () => {
  const renders: string[] = [];
  const shell = createAppShell({
    mountBoard: () => {},
    renderView: (v) => { renders.push(v); },
  });
  shell.goTo('lobby');
  shell.goTo('board');
  shell.goTo('summary');
  assert.deepEqual(renders, ['lobby', 'board', 'summary']);
});

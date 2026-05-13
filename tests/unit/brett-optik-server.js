'use strict';
// Standalone test for pure optik logic in server.js.
// Run with: node tests/unit/brett-optik-server.js
// No DB required — tests pure in-memory logic only.

// ── Reimplementation of the logic under test (spec-first) ──────────────────
const figureMaps = new Map();

function ensureFigureMap(room) {
  if (!figureMaps.has(room)) figureMaps.set(room, new Map());
  return figureMaps.get(room);
}

function applyMutation(room, msg) {
  const figs = ensureFigureMap(room);
  switch (msg.type) {
    case 'add':
      if (msg.fig && typeof msg.fig.id === 'string' && figs.size < 200) {
        figs.set(msg.fig.id, msg.fig);
      }
      break;
    case 'delete':
      figs.delete(msg.id);
      break;
    case 'clear':
      figs.clear();
      break;
    case 'optik':
      if (msg.settings && typeof msg.settings === 'object') {
        figs.set('__optik__', { id: '__optik__', settings: msg.settings });
      }
      break;
  }
}

function buildStateFromMutations(room) {
  const figs = figureMaps.get(room);
  if (!figs) return null;
  const figures = Array.from(figs.values()).filter(f => f.id !== '__optik__');
  const optikEntry = figs.get('__optik__');
  const result = { figures };
  if (optikEntry) result.optik = optikEntry.settings;
  return result;
}

// ── Tests ──────────────────────────────────────────────────────────────────
let passed = 0, failed = 0;
function assert(label, cond) {
  if (cond) { console.log(`  ✓ ${label}`); passed++; }
  else       { console.error(`  ✗ ${label}`); failed++; }
}

console.log('\nbrett-optik-server: applyMutation + buildStateFromMutations\n');

// T1: optik message stores settings under __optik__ key
{
  const room = 'test-room-1';
  const settings = { board: 'felt-green', customColor: null, bg: 'dusk', light: 'warm' };
  applyMutation(room, { type: 'optik', settings });
  const figs = figureMaps.get(room);
  assert('optik message stores __optik__ entry', figs.has('__optik__'));
  assert('__optik__ entry has correct settings', JSON.stringify(figs.get('__optik__').settings) === JSON.stringify(settings));
}

// T2: buildStateFromMutations excludes __optik__ from figures array
{
  const room = 'test-room-2';
  applyMutation(room, { type: 'add', fig: { id: 'fig1', type: 'pawn', x: 0, z: 0 } });
  applyMutation(room, { type: 'optik', settings: { board: 'slate', customColor: null, bg: 'space', light: 'neutral' } });
  const state = buildStateFromMutations(room);
  assert('figures array has no __optik__ entry', state.figures.every(f => f.id !== '__optik__'));
  assert('figures array has real figures', state.figures.length === 1 && state.figures[0].id === 'fig1');
}

// T3: buildStateFromMutations includes optik in result
{
  const room = 'test-room-3';
  const settings = { board: 'marble', customColor: null, bg: 'forest', light: 'cool' };
  applyMutation(room, { type: 'optik', settings });
  const state = buildStateFromMutations(room);
  assert('state includes optik field', state.optik !== undefined);
  assert('state.optik matches settings', JSON.stringify(state.optik) === JSON.stringify(settings));
}

// T4: buildStateFromMutations returns null for unknown room
{
  const state = buildStateFromMutations('no-such-room');
  assert('returns null for unknown room', state === null);
}

// T5: optik with invalid settings is ignored
{
  const room = 'test-room-5';
  applyMutation(room, { type: 'optik', settings: 'not-an-object' });
  assert('invalid optik settings ignored', !figureMaps.get(room)?.has('__optik__'));
}

// T6: clear removes __optik__ entry
{
  const room = 'test-room-6';
  applyMutation(room, { type: 'optik', settings: { board: 'wood-dark', customColor: null, bg: 'space', light: 'neutral' } });
  applyMutation(room, { type: 'clear' });
  const figs = figureMaps.get(room);
  assert('clear removes __optik__', !figs.has('__optik__'));
}

// T7: buildStateFromMutations returns no optik field when none set
{
  const room = 'test-room-7';
  applyMutation(room, { type: 'add', fig: { id: 'fig1', type: 'pawn', x: 0, z: 0 } });
  const state = buildStateFromMutations(room);
  assert('state has no optik field when none set', state.optik === undefined);
}

// T8: DB state with optik key hydrates into figureMap
{
  const room = 'test-room-8';
  const dbState = {
    figures: [{ id: 'fig1', type: 'pawn', x: 1, z: 2 }],
    optik: { board: 'sand', customColor: null, bg: 'light', light: 'warm' },
  };
  const figs = ensureFigureMap(room);
  for (const f of dbState.figures || []) {
    if (f && typeof f.id === 'string') figs.set(f.id, f);
  }
  if (dbState.optik && typeof dbState.optik === 'object') {
    figs.set('__optik__', { id: '__optik__', settings: dbState.optik });
  }
  const state = buildStateFromMutations(room);
  assert('snapshot includes optik from DB state', JSON.stringify(state.optik) === JSON.stringify(dbState.optik));
  assert('snapshot figures excludes __optik__', state.figures.every(f => f.id !== '__optik__'));
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);

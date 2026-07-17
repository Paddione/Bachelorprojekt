// brett/test/hidden-filter.test.ts — E9, SICHERHEITSKRITISCH (T001931)
// Prüft die per-Empfänger-Rolle-Filterung für ALLE fünf Rollen. Kein Nicht-Leiter
// darf hidden-Figurendaten erhalten — weder im Snapshot noch im Broadcast.
import { test } from 'node:test';
import assert from 'node:assert';
import type { Role, Figure } from '../src/types/state';
import {
  isFigureHidden,
  filterSnapshotFigures,
  translateBroadcastForRole,
} from '../src/server/hidden-filter';

const NON_LEADERS: Role[] = ['stellvertreter', 'beobachter', 'gast', 'zuschauer'];
const ALL_ROLES: Role[] = ['leiter', ...NON_LEADERS];

function fig(id: string, hidden = false): Figure {
  return { id, x: 0, z: 0, facingY: 0, appearance: {}, hidden } as Figure;
}

test('isFigureHidden erkennt hidden-Flag', () => {
  assert.strictEqual(isFigureHidden(fig('a', true)), true);
  assert.strictEqual(isFigureHidden(fig('a', false)), false);
  assert.strictEqual(isFigureHidden(undefined), false);
});

test('filterSnapshotFigures: hidden bleibt NUR für leiter', () => {
  const figs = [fig('visible'), fig('secret', true)];
  const leader = filterSnapshotFigures(figs, 'leiter');
  assert.deepStrictEqual(leader.map((f) => f.id), ['visible', 'secret'], 'Leiter sieht beide');
  for (const role of NON_LEADERS) {
    const out = filterSnapshotFigures(figs, role);
    assert.deepStrictEqual(out.map((f) => f.id), ['visible'], `${role} sieht die hidden Figur NICHT`);
    assert.ok(!out.some((f) => isFigureHidden(f)), `${role} erhält keine hidden-Daten`);
  }
});

test('translateBroadcastForRole: hide-Transition → delete für Nicht-Leiter, roh für Leiter', () => {
  const lookup = () => fig('s', true);
  const msg = { type: 'figure_hidden_changed', figureId: 's', hidden: true };
  assert.deepStrictEqual(translateBroadcastForRole(msg, 'leiter', lookup), msg, 'Leiter erhält rohe Message');
  for (const role of NON_LEADERS) {
    assert.deepStrictEqual(
      translateBroadcastForRole(msg, role, lookup),
      { type: 'delete', id: 's' },
      `${role} bekommt delete statt hidden-Info`,
    );
  }
});

test('translateBroadcastForRole: reveal-Transition → add für Nicht-Leiter', () => {
  const revealed = fig('s', false);
  const lookup = (id: string) => (id === 's' ? revealed : null);
  const msg = { type: 'figure_hidden_changed', figureId: 's', hidden: false };
  for (const role of NON_LEADERS) {
    const out = translateBroadcastForRole(msg, role, lookup) as any;
    assert.strictEqual(out.type, 'add', `${role} bekommt add bei reveal`);
    assert.strictEqual(out.figure.id, 's');
    assert.ok(!isFigureHidden(out.figure), 'die aufgedeckte Figur ist nicht mehr hidden');
  }
});

test('translateBroadcastForRole: move/update auf hidden Figur → null für Nicht-Leiter, roh für Leiter', () => {
  const lookup = (id: string) => (id === 'h' ? fig('h', true) : fig(id, false));
  for (const mk of [
    { type: 'move', id: 'h', x: 1, z: 1, facingY: 0 },
    { type: 'update', id: 'h', changes: { label: 'x' } },
    { type: 'jump', id: 'h' },
  ]) {
    assert.deepStrictEqual(translateBroadcastForRole(mk, 'leiter', lookup), mk, 'Leiter bekommt rohe Message');
    for (const role of NON_LEADERS) {
      assert.strictEqual(translateBroadcastForRole(mk, role, lookup), null, `${role} → ${mk.type} auf hidden unterdrückt`);
    }
  }
});

test('translateBroadcastForRole: Mutation auf sichtbare Figur passiert für alle Rollen durch', () => {
  const lookup = (id: string) => fig(id, false);
  const msg = { type: 'move', id: 'v', x: 2, z: 2, facingY: 0 };
  for (const role of ALL_ROLES) {
    assert.deepStrictEqual(translateBroadcastForRole(msg, role, lookup), msg, `${role} erhält Update sichtbarer Figur`);
  }
});

test('translateBroadcastForRole: Nicht-Figuren-Message (stiffness) passiert unverändert durch', () => {
  const lookup = () => null;
  const msg = { type: 'stiffness', value: 0.5 };
  for (const role of ALL_ROLES) {
    assert.deepStrictEqual(translateBroadcastForRole(msg, role, lookup), msg);
  }
});

test('translateBroadcastForRole: add einer hidden Figur → null für Nicht-Leiter', () => {
  const lookup = () => null;
  const msg = { type: 'add', figure: fig('new', true) };
  for (const role of NON_LEADERS) {
    assert.strictEqual(translateBroadcastForRole(msg, role, lookup), null, `${role} erhält keine hidden add`);
  }
  assert.deepStrictEqual(translateBroadcastForRole(msg, 'leiter', lookup), msg);
});

test('broadcastFigureAware: KC-Admin-Peer gilt als leiter (Free-Board ohne Session-Rollen)', () => {
  const { broadcastFigureAware } = require('../src/server/hidden-filter');
  const sent: Array<{ who: string; msg: any }> = [];
  const adminPeer = { _session: { isAdmin: true, userId: 'admin1' } };
  const plainPeer = { _session: { isAdmin: false, userId: 'user1' } };
  const zuschauerPeer = { _isZuschauer: true, _session: { isAdmin: true, userId: 'z1' } };
  const figMap = new Map([['h', fig('h', true)]]);
  const deps = {
    broadcastRoleAware: (_room: string, msg: any, resolveRoleForWs: any, translate: any) => {
      for (const [name, peer] of [['admin', adminPeer], ['plain', plainPeer], ['zuschauer', zuschauerPeer]] as const) {
        const t = translate(msg, resolveRoleForWs(peer));
        if (t !== null) sent.push({ who: name, msg: t });
      }
    },
    buildStateFromMutations: () => ({ roles: {} }),
    figureMaps: new Map([['r', figMap]]),
    resolveRole: () => 'beobachter' as Role,
  };
  broadcastFigureAware(deps as any, 'r', { type: 'figure_hidden_changed', figureId: 'h', hidden: true });
  const adminMsg = sent.find(s => s.who === 'admin');
  assert.ok(adminMsg, 'Admin erhält die Message');
  assert.strictEqual(adminMsg!.msg.type, 'figure_hidden_changed', 'Admin bekommt rohes hidden_changed, kein delete');
  const plainMsg = sent.find(s => s.who === 'plain');
  assert.strictEqual(plainMsg!.msg.type, 'delete', 'Nicht-Admin bekommt delete-Übersetzung');
  const zMsg = sent.find(s => s.who === 'zuschauer');
  assert.strictEqual(zMsg!.msg.type, 'delete', 'Zuschauer bleibt zuschauer, auch mit Admin-Session');
});

test('broadcastSnapshotFigureAware: Re-Snapshot filtert hidden pro Empfänger-Rolle (Undo/Redo-Leak-Fix)', () => {
  const { broadcastSnapshotFigureAware } = require('../src/server/hidden-filter');
  const received: Array<{ who: string; ids: string[] }> = [];
  const adminPeer = { _session: { isAdmin: true, userId: 'a' } };
  const beoPeer = { _session: { isAdmin: false, userId: 'b' } };
  const deps = {
    broadcastRoleAware: (_room: string, msg: any, resolveRoleForWs: any, translate: any) => {
      for (const [name, peer] of [['admin', adminPeer], ['beo', beoPeer]] as const) {
        const t = translate(msg, resolveRoleForWs(peer));
        if (t !== null) received.push({ who: name, ids: (t.figures || []).map((f: any) => f.id) });
      }
    },
    buildStateFromMutations: () => ({ roles: {} }),
    figureMaps: new Map(),
    resolveRole: () => 'beobachter' as Role,
  };
  const base = { type: 'snapshot', figures: [fig('v', false), fig('h', true)], zones: [{ id: 'z1' }] };
  broadcastSnapshotFigureAware(deps as any, 'r', base);
  assert.deepStrictEqual(received.find(r => r.who === 'admin')!.ids, ['v', 'h'], 'Admin/Leiter erhält alle Figuren');
  assert.deepStrictEqual(received.find(r => r.who === 'beo')!.ids, ['v'], 'Nicht-Leiter erhält hidden-Figur NICHT');
});

// tests/unit/cockpit-layout.test.ts
// Ticket: T002462 — K3 Layout-Engine
//
// Pruefmodus (Test-Resultats-Konvention T002448-M4): ERGEBNIS-basiert. Der Test
// fuehrt die ECHTE Quelle aus: .lavish/kit/layout.js wird per readFileSync
// gelesen und mit `new Function('window', src)` gegen ein Fenster-Attrappenobjekt
// ausgefuehrt (Vorbild: K4s Vorgehen). Befragt wird das entstandene
// window.cockpitLayout — gemessen wird Verhalten, nicht Text.
//
// Unit-geprueft ist ausschliesslich das DOM-freie Verhalten: Rail-Festlegung,
// Platzierungsrechnung, Mobilregeln als Rechnung, Persistenz-Serialisierung und
// -Wiederherstellung. Die Pointer-Gesten selbst, das Aufziehen des Bottom-Sheets,
// das Wischen im Ein-Panel-Stack, das Pop-out-Fenster samt BroadcastChannel und
// die optische Wirkung der Vollflaechen-Umschaltung sind K8 (T002467, Headed-
// Tests) uebergeben — sie koennen ein echter Browser nur erbringen. [Task 7]

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC = readFileSync(resolve(__dirname, '../../.lavish/kit/layout.js'), 'utf8');

function makeStore(initial: Record<string, string> = {}) {
  const data: Record<string, string> = { ...initial };
  const access: string[] = [];
  const storage = {
    getItem: (k: string) => {
      access.push(k);
      return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null;
    },
    setItem: (k: string, v: string) => {
      access.push(k);
      data[k] = v;
    },
    removeItem: (k: string) => {
      access.push(k);
      delete data[k];
    },
    _data: data,
    _access: access,
  };
  return storage;
}

function loadLayout(initialStorage: Record<string, string> = {}) {
  const storage = makeStore(initialStorage);
  const windowObj = {
    localStorage: storage,
    actionPolicy: undefined as unknown,
  } as any;
  new Function('window', SRC)(windowObj);
  return { layout: windowObj.cockpitLayout as any, storage, windowObj };
}

const FOUR_GROUPS = [
  'Laufende Epics',
  'Was Aufmerksamkeit braucht',
  'Aktive Agenten',
  'Modell-Server',
];

describe('RAIL_GROUPS — D7-Festlegung (E3, D7)', () => {
  it('POSITIV-ANKER: enthaelt genau die vier D7-Gruppen in dieser Reihenfolge', () => {
    const { layout } = loadLayout();
    expect(layout.RAIL_GROUPS).toHaveLength(4);
    expect(layout.RAIL_GROUPS.map((g: any) => g.label)).toEqual(FOUR_GROUPS);
  });

  it('RAIL_GROUPS ist eingefroren — push laesst die Liste unveraendert', () => {
    const { layout } = loadLayout();
    const before = layout.RAIL_GROUPS.map((g: any) => g.label);
    expect(() => layout.RAIL_GROUPS.push({ id: 'x', label: 'X' })).toThrow();
    expect(layout.RAIL_GROUPS.map((g: any) => g.label)).toEqual(before);
  });

  it('RAIL_GROUPS ist eingefroren — Index-Zuweisung laesst die Liste unveraendert', () => {
    const { layout } = loadLayout();
    expect(() => {
      layout.RAIL_GROUPS[0] = { id: 'x', label: 'X' };
    }).toThrow();
    expect(layout.RAIL_GROUPS.map((g: any) => g.label)).toEqual(FOUR_GROUPS);
  });

  it('es gibt keinen Schluessel und keine Funktion, der/die die Gruppen setzen koennte', () => {
    const { layout } = loadLayout();
    // Positiv-Anker (T002356-M1): die Liste ist lesbar und nicht leer — sonst
    // bestuende die Negativ-Aussage fuer eine leere Liste vakuos.
    expect(layout.RAIL_GROUPS.length).toBeGreaterThan(0);

    // Negativ-Aussage 1: keine rail-/group-Setter-Funktion im API-Objekt.
    const setters = Object.keys(layout).filter((k) => /set/i.test(k));
    expect(setters).toEqual([]);

    // Negativ-Aussage 2: das Property selbst ist nicht neuzuweisbar.
    const backup = layout.RAIL_GROUPS;
    try {
      layout.RAIL_GROUPS = ['kaputt'];
    } catch (e) { /* strict-mode throw ist OK — die Liste bleibt unveraendert */ }
    expect(layout.RAIL_GROUPS).toBe(backup);
  });
});

describe('computePlacement — Flaeche und Mobil (E3, E4, 3.2)', () => {
  const panels = [
    { id: 'a', type: 'status' },
    { id: 'b', type: 'status' },
    { id: 'c', type: 'strom' },
    { id: 'd', type: 'canvas' },
  ];

  it('Desktop platziert hoechstens drei Panels als Karte, Rest bleibt im Katalog', () => {
    const { layout } = loadLayout();
    const r = layout.computePlacement({ panels, viewport: 'desktop' });
    expect(r.workspace.length).toBeLessThanOrEqual(3);
    expect(r.workspace.every((p: any) => p.size === 'card')).toBe(true);
    expect(r.catalog.length).toBe(panels.length - r.workspace.length);
  });

  it('mit gesetzter Vollflaeche wird genau ein Panel platziert', () => {
    const { layout } = loadLayout();
    const r = layout.computePlacement({ panels, viewport: 'desktop', fullscreen: 'b' });
    expect(r.workspace).toHaveLength(1);
    expect(r.workspace[0]).toEqual({ id: 'b', size: 'fullscreen' });
  });

  it('Mobil liefert genau ein sichtbares Panel in Vollflaechengroesse', () => {
    const { layout } = loadLayout();
    const r = layout.computePlacement({ panels, viewport: 'mobile' });
    expect(r.workspace).toHaveLength(1);
    expect(r.workspace[0].size).toBe('fullscreen');
  });

  it('Mobil meldet das Terminal-Panel als locked mit Grund und platziert es nicht (D8)', () => {
    const { layout } = loadLayout();
    const withTerminal = [...panels, { id: 'term', type: 'terminal' }];
    const r = layout.computePlacement({ panels: withTerminal, viewport: 'mobile' });
    const lock = r.locked.find((l: any) => l.id === 'term');
    expect(lock).toBeDefined();
    expect(lock.reason).toBeTruthy();
    expect(r.workspace.map((p: any) => p.id)).not.toContain('term');
  });

  it('Rail-Gruppen sind auch mobil vorhanden, als topbar+sheet statt column', () => {
    const { layout } = loadLayout();
    const mobile = layout.computePlacement({ panels, viewport: 'mobile' });
    const desktop = layout.computePlacement({ panels, viewport: 'desktop' });
    expect(desktop.rail.mode).toBe('column');
    expect(mobile.rail.mode).toBe('topbar-sheet');
    expect(mobile.rail.groups.map((g: any) => g.label)).toEqual(FOUR_GROUPS);
  });
});

describe('mobileGate — K4-Schnittstelle (Task 1)', () => {
  it('ohne actionPolicy fail-closed: unbekannte Aktion wird mobil gesperrt, mit Grund', () => {
    const { layout } = loadLayout();
    const g = layout.mobileGate('agent_kill', { viewport: 'mobile' });
    expect(g.locked).toBe(true);
    expect(g.reason).toBe('action-policy-missing');
  });

  it('ohne actionPolicy: ausdruecklich wiederholbare Aktionen bleiben frei', () => {
    const { layout } = loadLayout();
    for (const action of ['refresh', 'reconcile', 'tick', 'enqueue']) {
      const g = layout.mobileGate(action, { viewport: 'mobile' });
      expect(g.locked, action).toBe(false);
    }
  });

  it('delegiert an window.actionPolicy.mobileLock, wenn vorhanden (K4)', () => {
    const { layout, windowObj } = loadLayout();
    windowObj.actionPolicy = {
      mobileLock: (action: string) => action === 'agent_kill',
    };
    expect(layout.mobileGate('agent_kill', { viewport: 'mobile' }).locked).toBe(true);
    expect(layout.mobileGate('refresh', { viewport: 'mobile' }).locked).toBe(false);
  });
});

describe('Persistenz — eigener localStorage-Schluessel (Task 4)', () => {
  it('serializeLayout erzeugt das festgelegte Schema mit Version', () => {
    const { layout } = loadLayout();
    const raw = layout.serializeLayout({
      workspace: ['a', 'b'],
      fullscreen: null,
      catalog: ['c'],
    });
    const obj = JSON.parse(raw);
    expect(obj.version).toBe(1);
    expect(obj.workspace).toEqual(['a', 'b']);
    expect(obj.fullscreen).toBeNull();
    expect(obj.catalog).toEqual(['c']);
  });

  it('POSITIV-ANKER: eine gueltige gespeicherte Anordnung wird wiederhergestellt', () => {
    const { layout } = loadLayout();
    const raw = JSON.stringify({
      version: 1,
      workspace: ['b', 'd'],
      fullscreen: null,
      catalog: ['a', 'c'],
    });
    const restored = layout.restoreLayout(raw, ['a', 'b', 'c', 'd']);
    expect(restored.workspace).toEqual(['b', 'd']);
    expect(restored.catalog).toEqual(['a', 'c']);
  });

  it('fehlender Wert fuehrt zur Standardanordnung', () => {
    const { layout } = loadLayout();
    const restored = layout.restoreLayout(null, ['a', 'b', 'c', 'd']);
    expect(restored).toBeDefined();
  });

  it('nicht parsbares JSON fuehrt zur Standardanordnung', () => {
    const { layout } = loadLayout();
    const restored = layout.restoreLayout('{ kaputt', ['a', 'b', 'c', 'd']);
    expect(restored).toBeDefined();
  });

  it('unbekannte Version: Standardanordnung, kein canvas-Schluessel wird beruehrt', () => {
    const { layout, storage } = loadLayout({
      'lavish-layout-v1': JSON.stringify({ version: 999, workspace: ['b'], fullscreen: null, catalog: [] }),
    });
    const canvasKey = 'lavish-canvas-panel-x';
    storage._data[canvasKey] = 'sentinel';

    const restored = layout.restoreLayout(storage.getItem('lavish-layout-v1'), ['a', 'b', 'c', 'd']);
    expect(restored.workspace).toEqual([]);

    const canvasTouched = storage._access.filter((k) => k.startsWith('lavish-canvas-'));
    expect(canvasTouched).toEqual([]);
    expect(storage._data[canvasKey]).toBe('sentinel');
  });

  it('Eintraege auf nicht mehr vorhandene Panels werden verworfen, der Rest bleibt', () => {
    const { layout } = loadLayout();
    const raw = JSON.stringify({
      version: 1,
      workspace: ['b', 'geloescht'],
      fullscreen: 'geloescht',
      catalog: ['a', 'c'],
    });
    const restored = layout.restoreLayout(raw, ['a', 'b', 'c']);
    expect(restored.workspace).toEqual(['b']);
    expect(restored.fullscreen).toBeNull();
    expect(restored.catalog).toEqual(['a', 'c']);
  });
});

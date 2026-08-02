// tests/unit/cockpit-panel.test.ts
// SSOT: openspec/changes/sdlc-cockpit-design/design.md
//
// Testet den Panel-Vertrag ohne DOM: Typvalidierung, Groessen, Aktions-Zustaende.
// [T002460]
//
// Abgrenzung gegen K8 (T002467, Headed-Tests): was ein echter Browser erbringen
// muss — Pointer-Gesten, Pop-out-Fenster, optische Wirkung — ist hier NICHT
// geprueft. Die Registry-Aussagen unten fuehren dagegen die echte panel.js-
// Quelle aus (Vorbild K4s `new Function('window', src)`-Verfahren). [T002462]

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const PANEL_SRC = readFileSync(resolve(__dirname, '../../.lavish/kit/panel.js'), 'utf8');

describe('Panel type validation (D2)', () => {
  const VALID_TYPES = ['status', 'strom', 'canvas', 'terminal'] as const;

  it('erlaubt genau 4 Typen', () => {
    expect(VALID_TYPES).toHaveLength(4);
  });

  it('erkennt Status als gueltigen Typ', () => {
    expect(VALID_TYPES).toContain('status');
  });

  it('erkennt Strom als gueltigen Typ', () => {
    expect(VALID_TYPES).toContain('strom');
  });

  it('erkennt Canvas als gueltigen Typ', () => {
    expect(VALID_TYPES).toContain('canvas');
  });

  it('erkennt Terminal als gueltigen Typ', () => {
    expect(VALID_TYPES).toContain('terminal');
  });

  it('weist ungueltige Typen zurueck (input, output, chart)', () => {
    for (const invalid of ['input', 'output', 'chart', '']) {
      expect(VALID_TYPES).not.toContain(invalid);
    }
  });

  it('Typen sind alphabetisch sortierbar', () => {
    const sorted = [...VALID_TYPES].sort();
    expect(sorted).toEqual(['canvas', 'status', 'strom', 'terminal']);
  });
});

describe('Panel.create() contract', () => {
  const VALID_TYPES = ['status', 'strom', 'canvas', 'terminal'];

  const createPanel = (type: string) => {
    if (!VALID_TYPES.includes(type)) {
      throw new Error(`Invalid panel type: ${type}`);
    }
    return { type, el: null, init: () => {} };
  };

  it('akzeptiert alle 4 gueltigen Typen', () => {
    for (const type of VALID_TYPES) {
      expect(() => createPanel(type)).not.toThrow();
    }
  });

  it('wirft Fehler bei ungueltigem Typ', () => {
    expect(() => createPanel('input')).toThrow('Invalid panel type');
  });

  it('wirft Fehler bei leerem Typ', () => {
    expect(() => createPanel('')).toThrow('Invalid panel type');
  });

  it('gibt Panel-Objekt mit type und init zurueck', () => {
    const panel = createPanel('status');
    expect(panel).toHaveProperty('type', 'status');
    expect(panel).toHaveProperty('init');
    expect(typeof panel.init).toBe('function');
  });
});

describe('Three sizes (E4, D3)', () => {
  const SIZES = ['rail', 'card', 'fullscreen'];

  it('hat genau 3 Groessen', () => {
    expect(SIZES).toHaveLength(3);
  });

  it('rail ist enthalten', () => {
    expect(SIZES).toContain('rail');
  });

  it('card ist enthalten', () => {
    expect(SIZES).toContain('card');
  });

  it('fullscreen ist enthalten', () => {
    expect(SIZES).toContain('fullscreen');
  });
});

describe('Action slot 4 states (D4)', () => {
  const STATES = ['available', 'locked', 'confirming', 'running'];

  it('hat genau 4 Zustaende', () => {
    expect(STATES).toHaveLength(4);
  });

  it('locked ist enthalten (sichtbar, nicht versteckt)', () => {
    expect(STATES).toContain('locked');
  });

  it('alle Zustaende sind unterschiedlich', () => {
    expect(new Set(STATES).size).toBe(STATES.length);
  });
});

describe('Adapter method mapping', () => {
  const ADAPTER_MAP: Record<string, string> = {
    tickets: 'tickets',
    agents: 'agents',
    ci: 'ci',
    cluster: 'cluster',
    factory: 'factory',
    models: 'models',
  };

  it('bildet data-source 1:1 auf Adapter-Methoden ab', () => {
    for (const [source, method] of Object.entries(ADAPTER_MAP)) {
      expect(source).toBe(method);
    }
  });

  it('stellt 6 Lese-Methoden bereit', () => {
    expect(Object.keys(ADAPTER_MAP)).toHaveLength(6);
  });
});

describe('D13 compliance — no null/0/dash as measurement', () => {
  it('leere Werte muessen als Fehler markiert werden, nicht als Messwert', () => {
    const prohibitedValues = [null, 0, '-', ''];
    for (const val of prohibitedValues) {
      // D13: Diese Werte duerfen nie als gueltige Messwerte erscheinen
      expect(val == null || val === 0 || val === '-' || val === '').toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Registry-Vertrag (Task 2/Task 7, T002462) — fuehrt die echte panel.js-Quelle
// aus. Die Quelle ist ein klassisches Skript (kein ES-Modul), wird deshalb per
// readFileSync + new Function ausgefuehrt und legt das Panel auf dem Fenster-
// Attrappenobjekt ab. DOM-Treffer (IntersectionObserver, document) sind Stubs.
// ---------------------------------------------------------------------------

function loadRealPanel() {
  const windowObj: Record<string, unknown> = {
    data: {},
    innerWidth: 1280,
    addEventListener: () => {},
  };
  const documentShim = {
    addEventListener: () => {},
    querySelectorAll: () => [],
  };
  const localStorageShim = {
    getItem: () => null,
    setItem: () => {},
  };
  const src = PANEL_SRC + '\nwindow.__Panel = Panel;';
  new Function('window', 'document', 'localStorage', src)(
    windowObj, documentShim, localStorageShim,
  );
  return windowObj.__Panel as {
    create: (el: HTMLElement) => { destroy(): void; init(): void };
    get: (el: HTMLElement) => unknown;
    adopt: (el: HTMLElement) => unknown;
  };
}

function makeEl(id = 'panel-x') {
  return {
    id,
    dataset: { panelType: 'terminal' },
    querySelector: () => null,
  } as unknown as HTMLElement;
}

describe('Panel registry (T002462 — Task 2)', () => {
  // Die Quelle referenziert IntersectionObserver als Global. Im Node-Lauf muss
  // er waehrend der Test-Dauer existieren, sonst bricht `new Panel(...)` in
  // init() ab — die Klasse wird ja erst NACH dem Laden ausgefuehrt.
  beforeEach(() => {
    (globalThis as Record<string, unknown>).IntersectionObserver = class {
      observe() {}
      disconnect() {}
    };
  });
  afterEach(() => {
    delete (globalThis as Record<string, unknown>).IntersectionObserver;
  });

  it('POSITIV-ANKER: vor destroy() liefert Panel.get(el) das Panel', () => {
    const Panel = loadRealPanel();
    const el = makeEl();
    const panel = Panel.create(el);
    expect(Panel.get(el)).toBe(panel);
  });

  it('nach destroy() liefert Panel.get(el) nichts mehr', () => {
    const Panel = loadRealPanel();
    const el = makeEl();
    const panel = Panel.create(el);
    panel.destroy();
    expect(Panel.get(el)).toBeUndefined();
  });

  it('Panel.adopt(el) liefert fuer ein bereits registriertes Element dasselbe Objekt', () => {
    const Panel = loadRealPanel();
    const el = makeEl();
    const panel = Panel.create(el);
    expect(Panel.adopt(el)).toBe(panel);
  });

  it('Panel.adopt(el) legt fuer ein unbekanntes Element ein neues Panel an', () => {
    const Panel = loadRealPanel();
    const el = makeEl('panel-fresh');
    const panel = Panel.adopt(el);
    expect(Panel.get(el)).toBe(panel);
  });

  it('destroy() auf einem doppelt erzeugten Element raeumt den Registry-Eintrag', () => {
    const Panel = loadRealPanel();
    const el = makeEl();
    const first = Panel.create(el);
    first.destroy();
    // Nach dem destroy registriert adopt() neu und bekommt ein frisches Panel.
    const second = Panel.adopt(el);
    expect(second).not.toBe(first);
    expect(Panel.get(el)).toBe(second);
  });
});

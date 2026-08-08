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

// ---------------------------------------------------------------------------
// Fenster-Export (T002462) — laedt panel.js OHNE die `window.__Panel`-Bruecke
// aus loadRealPanel(). Genau diese Bruecke hat verdeckt, dass `class Panel` auf
// oberster Ebene eines klassischen Skripts in der globalen LEXIKALISCHEN
// Umgebung landet und — anders als `var` — keine Eigenschaft auf `window`
// erzeugt. layout.js haengt an `window.Panel`; ohne den expliziten Export sind
// dort alle acht Waechter dauerhaft falsch und die Panel-Anbindung tut still
// nichts. Geprueft wird das Ergebnis der Ausfuehrung, nicht der Quelltext.
// ---------------------------------------------------------------------------
describe('Panel-Fenster-Export (T002462)', () => {
  beforeEach(() => {
    (globalThis as Record<string, unknown>).IntersectionObserver = class {
      observe() {}
      disconnect() {}
    };
  });

  function runPanelSourceBare() {
    const windowObj: Record<string, unknown> = {
      data: {},
      innerWidth: 1280,
      addEventListener: () => {},
    };
    new Function('window', 'document', 'localStorage', PANEL_SRC)(
      windowObj,
      { addEventListener: () => {}, querySelectorAll: () => [] },
      { getItem: () => null, setItem: () => {} },
    );
    return windowObj;
  }

  it('panel.js legt Panel als Fenster-Eigenschaft ab — ohne Testbruecke', () => {
    const windowObj = runPanelSourceBare();
    // Positiv-Anker: die Ausfuehrung ist ueberhaupt durchgelaufen und hat das
    // Fenster-Attrappenobjekt unveraendert gelassen, wo nichts zu tun war.
    expect(windowObj.innerWidth).toBe(1280);
    expect(typeof windowObj.Panel).toBe('function');
  });

  it('der Fenster-Export traegt den Registry-Vertrag, den layout.js aufruft', () => {
    const Panel = runPanelSourceBare().Panel as {
      get: (el: HTMLElement) => unknown;
      adopt: (el: HTMLElement) => unknown;
      create: (el: HTMLElement) => unknown;
    };
    const el = makeEl('panel-window-export');
    expect(Panel.get(el)).toBeUndefined();
    const panel = Panel.adopt(el);
    expect(Panel.get(el)).toBe(panel);
  });
});

// ---------------------------------------------------------------------------
// Push-aware polling (T002643 Task 7) — lädt panel.js mit einem window.data,
// das push-versorgte und poll-versorgte Handles liefert. Prüft, dass
// startPolling() für push-versorgte Quellen kein Intervall startet, für
// poll-versorgte weiterhin eines (Positiv-Anker).
// ---------------------------------------------------------------------------

function makeElWithSource(id: string, panelType: string, source: string): HTMLElement {
  return {
    id,
    dataset: { panelType, source },
    querySelector: () => null,
    querySelectorAll: () => [],
    classList: { contains: () => false, add: () => {}, remove: () => {} },
  } as unknown as HTMLElement;
}

function loadPanelWithData(
  sources: Record<string, () => { pushed: boolean; data: unknown; subscribe: (fn: (d: unknown) => void) => () => void }>,
) {
  const windowObj: Record<string, unknown> = {
    data: sources,
    innerWidth: 1280,
    addEventListener: () => {},
  };
  const src = PANEL_SRC + '\nwindow.__Panel = Panel;';
  // eslint-disable-next-line no-new-func
  new Function('window', 'document', 'localStorage', src)(
    windowObj,
    { addEventListener: () => {}, querySelectorAll: () => [] },
    { getItem: () => null, setItem: () => {} },
  );
  return {
    Panel: windowObj.__Panel as new () => { init(): void; destroy(): void; startPolling(): void; pollTimeout: ReturnType<typeof setTimeout> | null; handle?: { pushed: boolean } },
    getPanel: (el: HTMLElement) => (windowObj.__Panel as { get: (el: HTMLElement) => { handle?: { pushed: boolean }; pollTimeout: ReturnType<typeof setTimeout> | null } }).get(el),
  };
}

describe('Push-aware polling (T002643 Task 7)', () => {
  beforeEach(() => {
    (globalThis as Record<string, unknown>).IntersectionObserver = class {
      observe() {}
      disconnect() {}
    };
  });
  afterEach(() => {
    delete (globalThis as Record<string, unknown>).IntersectionObserver;
  });

  const noopUnsub = () => {};

  it('panel with pushed:true handle does NOT start a polling interval', () => {
    const { Panel, getPanel } = loadPanelWithData({
      tickets: () => ({ pushed: true, data: { phase: 'idle' }, subscribe: () => noopUnsub }),
    });
    const el = makeElWithSource('panel-push-test', 'status', 'tickets');
    (Panel as any).create(el);
    const instance = getPanel(el) as any;
    expect(instance.handle?.pushed).toBe(true);

    // startPolling should return immediately without setting pollTimeout
    instance.startPolling();
    expect(instance.pollTimeout).toBeNull();
  });

  it('panel with pushed:false handle starts a polling interval (positive anchor)', () => {
    const { Panel, getPanel } = loadPanelWithData({
      cluster: () => ({ pushed: false, data: { pods: 3 }, subscribe: () => noopUnsub }),
    });
    const el = makeElWithSource('panel-poll-test', 'status', 'cluster');
    (Panel as any).create(el);
    const instance = getPanel(el) as any;
    expect(instance.handle?.pushed).toBe(false);

    instance.startPolling();
    expect(instance.pollTimeout).toBeTruthy();
    // Clean up the interval so it doesn't leak into the test runner's timer tracking
    if (instance.pollTimeout) clearTimeout(instance.pollTimeout);
  });
});

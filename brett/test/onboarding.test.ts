import { test } from 'node:test';
import assert from 'node:assert';
import { maybeStartOnboarding, ONBOARDING_KEY, TOASTS } from '../src/client/ui/onboarding';

function fakeStorage(initial: Record<string, string> = {}) {
  const m = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => { m.set(k, v); },
    _map: m,
  };
}

// Minimal DOM stub: records created elements + appended children.
function fakeDoc() {
  const appended: any[] = [];
  function makeEl(): any {
    return {
      className: '', textContent: '', style: {}, children: [] as any[],
      dataset: {} as Record<string, string>,
      _listeners: {} as Record<string, () => void>,
      setAttribute() {}, appendChild(c: any) { this.children.push(c); },
      addEventListener(ev: string, fn: () => void) { this._listeners[ev] = fn; },
      remove() { this._removed = true; },
      querySelector() { return null; },
    };
  }
  return {
    appended,
    createElement: () => makeEl(),
    body: { appendChild(c: any) { appended.push(c); }, },
    getElementById: () => null,
  };
}

test('TOASTS has the three spec steps with the final confirm label', () => {
  assert.strictEqual(TOASTS.length, 3);
  assert.match(TOASTS[0].title, /Figur hinzufügen/);
  assert.strictEqual(TOASTS[0].button, 'Weiter →');
  assert.strictEqual(TOASTS[2].button, 'Verstanden ✓');
});

test('does nothing when role is not leiter', () => {
  const storage = fakeStorage();
  const doc: any = fakeDoc();
  maybeStartOnboarding({ role: 'klient', storage, doc, delayMs: 0 });
  assert.strictEqual(doc.appended.length, 0);
  assert.strictEqual(storage.getItem(ONBOARDING_KEY), null);
});

test('does nothing when the key is already set', () => {
  const storage = fakeStorage({ [ONBOARDING_KEY]: '1' });
  const doc: any = fakeDoc();
  maybeStartOnboarding({ role: 'leiter', storage, doc, delayMs: 0 });
  assert.strictEqual(doc.appended.length, 0);
});

test('mounts the first toast for a leiter without the key', () => {
  const storage = fakeStorage();
  const doc: any = fakeDoc();
  maybeStartOnboarding({ role: 'leiter', storage, doc, delayMs: 0 });
  assert.strictEqual(doc.appended.length, 1);
});

test('advancing through all toasts sets the localStorage key', () => {
  const storage = fakeStorage();
  const doc: any = fakeDoc();
  maybeStartOnboarding({ role: 'leiter', storage, doc, delayMs: 0 });
  // Click "Weiter/Verstanden" on each mounted toast in turn.
  for (let i = 0; i < TOASTS.length; i++) {
    const toast = doc.appended[doc.appended.length - 1];
    // find the button element among descendants and fire its click listener
    const btn = findButton(toast);
    assert.ok(btn, `toast ${i} has a button`);
    btn._listeners.click();
  }
  assert.strictEqual(storage.getItem(ONBOARDING_KEY), '1');
});

function findButton(el: any): any {
  if (el?.dataset?.role === 'onboarding-next') return el;
  for (const c of el?.children ?? []) {
    const found = findButton(c);
    if (found) return found;
  }
  return null;
}

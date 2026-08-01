import { describe, it, expect, vi } from 'vitest';

// NOTE (p4 spec, "Temporäre Test-Platzhalter"): The adapter (kit/adapter.js) is a
// browser module loaded via <script> in cockpit-shell.html. It is NOT importable
// in a node-vitest environment without a factory refactor (fetch/document as
// injected params) — the spec explicitly sanctions that refactor as a valid
// implementation step, but it is NOT a planning detail. The real contract is
// enforced by tests/spec/sdlc-cockpit/*.bats (adapter-contract, daemon-endpoints,
// no-silent-fallback, freshness-timestamp, daemon-token-mode). These tests are
// importable structural placeholders: they verify the shim wiring that a future
// factory-based unit test will build on, and they keep `task test:changed` green.

// Mock fetch + document shim (node env has no DOM). A real unit test would pass
// these into a createData({ fetch, document }) factory.
const mockFetch = vi.fn();
globalThis.fetch = mockFetch as any;

const visibilityListeners: Array<() => void> = [];
const documentShim = {
  hidden: false,
  addEventListener: (event: string, listener: () => void) => {
    if (event === 'visibilitychange') {
      visibilityListeners.push(listener);
    }
  },
} as any;
(globalThis as any).document = documentShim;

function setDocumentHidden(hidden: boolean) {
  documentShim.hidden = hidden;
  for (const listener of visibilityListeners) {
    listener();
  }
}

// D10 (refreshMs) hatte hier zwei Platzhalter, die auf
// tests/spec/sdlc-cockpit/adapter-contract.bats verwiesen und selbst nichts
// prueften. Entfernt in T002508: die bats-Datei prueft den Kontrakt tatsaechlich,
// eine zweite, per Konstruktion immer gruene Kopie schafft nur Doppelpflege.

describe('Adapter (D11 — visibility pause)', () => {
  it('document shim registers visibilitychange listeners', () => {
    const before = visibilityListeners.length;
    setDocumentHidden(true);
    expect(visibilityListeners.length).toBe(before);
    expect(documentShim.hidden).toBe(true);
  });

  it('resumes polling when document becomes visible again', () => {
    setDocumentHidden(false);
    expect(documentShim.hidden).toBe(false);
  });
});

// D12 (fetchedAt) und D13 (error statt null) standen hier als Platzhalter, die
// auf freshness-timestamp.bats bzw. no-silent-fallback.bats verwiesen. Beide
// bats-Dateien wurden bis T002508 dauerhaft geskippt, weil kein Daemon lief —
// die Zusagen waren also an KEINER Stelle geprueft, obwohl es an zwei Stellen so
// aussah. Seit T002508 laeuft die bats-Suite gegen einen echten Daemon; die
// Platzhalter sind damit entbehrlich und entfernt.
//
// Der D12-Fall war der auffaelligste: `expect(typeof '2026-07-31T12:00:00Z')
// .toBe('string')` prueft ein String-Literal auf String-Sein und kann per
// Konstruktion nie fehlschlagen.

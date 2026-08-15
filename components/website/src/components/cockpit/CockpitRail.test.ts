// Komponententests fuer die kontextsensitive Rail.
//
// Prueffmodus: Verhalten der gerenderten Komponente (jsdom), nicht Quelltext.
// Die Rail ist der Teil des Redesigns, der auf mode/phase reagiert — genau das
// wird hier gemessen, statt nur ihre Existenz zu behaupten.
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import CockpitRail from './CockpitRail.svelte';

function headings(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('.rail-section__heading')).map(
    (el) => el.textContent?.trim() ?? '',
  );
}

describe('CockpitRail — kontextsensitive Sektionen', () => {
  it('rendert im Overview-Modus die Aufmerksamkeits- und Epic-Sektionen', () => {
    const { container } = render(CockpitRail, {
      props: { mode: 'overview' as const, brand: 'mentolder' },
    });
    expect(container.querySelector('[data-testid="cockpit-rail"]')).toBeTruthy();
    expect(headings(container)).toEqual([
      'Aufmerksamkeit',
      'Laufende Epics',
      'Aktive Agenten',
      'Modell-Server',
    ]);
  });

  it('rendert im Insights-Modus Metriken und Traces statt der Overview-Sektionen', () => {
    const { container } = render(CockpitRail, {
      props: { mode: 'insights' as const, brand: 'mentolder' },
    });
    const found = headings(container);
    // Positiv-Anker zuerst: die erwarteten Sektionen sind da …
    expect(found).toEqual(['Metriken', 'Traces']);
    // … erst dann die Negativ-Aussage, dass Overview-Inhalte verschwunden sind.
    expect(found).not.toContain('Aufmerksamkeit');
  });

  // Der eigentliche Kern: im Fokus-Modus haengt der Inhalt an der Phase.
  // Ohne diese Faelle waere "kontextsensitiv" eine unbelegte Behauptung.
  const PHASE_HEADINGS: Array<[string, string[]]> = [
    ['planung', ['Planung']],
    ['bauen', ['Factory', 'Modelle']],
    ['review', ['Pull Requests']],
    ['deploy', ['Deployment']],
    ['ship', ['Ausgeliefert']],
  ];

  it.each(PHASE_HEADINGS)('Fokus/%s rendert die passenden Sektionen', (phase, expected) => {
    const { container } = render(CockpitRail, {
      props: { mode: 'fokus' as const, phase: phase as never, brand: 'mentolder' },
    });
    expect(headings(container)).toEqual(expected);
  });

  it('unterscheidet die Phasen tatsaechlich, statt ueberall dasselbe zu rendern', () => {
    const rendered = PHASE_HEADINGS.map(([phase]) => {
      const { container } = render(CockpitRail, {
        props: { mode: 'fokus' as const, phase: phase as never, brand: 'mentolder' },
      });
      return headings(container).join('|');
    });
    expect(new Set(rendered).size).toBe(PHASE_HEADINGS.length);
  });

  it('rendert fuer die Phase triage keine Sektionen (bewusste Luecke)', () => {
    const { container } = render(CockpitRail, {
      props: { mode: 'fokus' as const, phase: 'triage' as never, brand: 'mentolder' },
    });
    // Positiv-Anker: die Rail selbst ist da — die Leere ist Inhalt, kein Renderfehler.
    expect(container.querySelector('[data-testid="cockpit-rail"]')).toBeTruthy();
    expect(headings(container)).toEqual([]);
  });
});

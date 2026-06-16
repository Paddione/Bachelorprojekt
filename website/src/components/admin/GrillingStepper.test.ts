import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import GrillingStepper from './GrillingStepper.svelte';
import { QUESTIONNAIRES } from '../../lib/tickets/grilling';

const QN = 'coaching-sessions-v1';

function setup(answers: any = null, meta: any = null) {
  return render(GrillingStepper, {
    props: { ticketId: 't1', questionnaireId: QN, grillingAnswers: answers, grillingMeta: meta },
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }) as any;
});

describe('GrillingStepper', () => {
  it('shows the first OPEN question and a progress counter', () => {
    setup({ [QN]: { q1: 'beantwortet' } }, null);
    expect(screen.getByText(QUESTIONNAIRES[QN].sections[0].questions[1].label)).toBeTruthy();
    expect(screen.getByTestId('grilling-progress').textContent).toMatch(/1 beantwortet/);
  });

  it('navigates with Weiter/Zurück', async () => {
    setup(null, null);
    const first = QUESTIONNAIRES[QN].sections[0].questions[0].label;
    const second = QUESTIONNAIRES[QN].sections[0].questions[1].label;
    expect(screen.getByText(first)).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: /Weiter/ }));
    expect(screen.getByText(second)).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: /Zurück/ }));
    expect(screen.getByText(first)).toBeTruthy();
  });
});

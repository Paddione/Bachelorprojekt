import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/svelte';
import GrillingStepper from './GrillingStepper.svelte';
import { QUESTIONNAIRES, type GrillingAnswers, type GrillingMeta } from '../../lib/tickets/grilling';

const QN = 'coaching-sessions-v1';

function setup(answers: GrillingAnswers | null = null, meta: GrillingMeta | null = null) {
  return render(GrillingStepper, {
    props: { ticketId: 't1', questionnaireId: QN, grillingAnswers: answers, grillingMeta: meta },
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
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

  it('debounce-saves the typed answer via PATCH with merged grillingAnswers', async () => {
    setup(null, null);
    const ta = screen.getByLabelText('Antwort') as HTMLTextAreaElement;
    await fireEvent.input(ta, { target: { value: 'Meine Antwort' } });
    await new Promise((r) => setTimeout(r, 1000));
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const [url, opts] = vi.mocked(global.fetch).mock.calls.at(-1)!;
    expect(url).toBe('/api/admin/tickets/t1');
    expect(opts?.method).toBe('PATCH');
    const body = JSON.parse(opts?.body as string);
    expect(body.grillingAnswers[QN].q1).toBe('Meine Antwort');
  });

  it('Verwerfen adds the question to grillingMeta.dismissed and advances the queue', async () => {
    setup(null, null);
    const first = QUESTIONNAIRES[QN].sections[0].questions[0].label;
    expect(screen.getByText(first)).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: /Verwerfen/ }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const [, opts] = vi.mocked(global.fetch).mock.calls.at(-1)!;
    const body = JSON.parse(opts?.body as string);
    expect(body.grillingMeta[QN].dismissed).toContain('q1');
    expect(screen.getByText(QUESTIONNAIRES[QN].sections[0].questions[1].label)).toBeTruthy();
  });

  it('typing an answer does NOT advance to the next question (regression: skip-on-keypress)', async () => {
    setup(null, null);
    const first = QUESTIONNAIRES[QN].sections[0].questions[0].label;
    expect(screen.getByText(first)).toBeTruthy();
    const ta = screen.getByLabelText('Antwort') as HTMLTextAreaElement;
    // Simulate typing character by character — each input must keep the same question visible
    for (const char of ['H', 'He', 'Hel', 'Hell', 'Hello']) {
      await fireEvent.input(ta, { target: { value: char } });
      expect(screen.getByText(first)).toBeTruthy();
    }
    // After typing, textarea still holds the typed value
    expect(ta.value).toBe('Hello');
  });

  it('mode toggle switches between step and all mode', async () => {
    setup(null, null);
    const btn = screen.getByTestId('grilling-mode');
    expect(btn.textContent).toMatch(/Alle anzeigen/);
    await fireEvent.click(btn);
    expect(btn.textContent).toMatch(/Schritt für Schritt/);
  });
});

describe('GrillingStepper — Export', () => {
  it('Export button is not shown when answers is empty', () => {
    setup(null, null);
    expect(screen.queryByRole('button', { name: /Export/ })).toBeNull();
  });

  it('Export button is shown when at least one answer exists', () => {
    setup({ [QN]: { q1: 'meine Antwort' } }, null);
    expect(screen.getByRole('button', { name: /Export/ })).toBeTruthy();
  });

  it('clicking Export triggers a blob download', async () => {
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url');
    vi.spyOn(URL, 'revokeObjectURL').mockReturnValue();

    setup({ [QN]: { q1: 'meine Antwort' } }, null);
    const exportBtn = screen.getByText('Export');
    await fireEvent.click(exportBtn);

    expect(createObjectURL).toHaveBeenCalled();
  });
});

function setupFinal(answers: GrillingAnswers | null = null, meta: GrillingMeta | null = null) {
  return render(GrillingStepper, {
    props: { ticketId: 't1', questionnaireId: 'final-grilling-v1', grillingAnswers: answers, grillingMeta: meta },
  });
}

describe('GrillingStepper choice chips', () => {
  it('renders chips for a question that has choices', async () => {
    setupFinal(null, null);
    for (let i = 0; i < 7; i++) {
      await fireEvent.click(screen.getByRole('button', { name: /Weiter/ }));
    }
    expect(screen.getByTestId('grilling-choice-Nein,-rückwärtskompatibel')).toBeTruthy();
  });

  it('clicking a chip fills the textarea with the choice text', async () => {
    setupFinal(null, null);
    for (let i = 0; i < 7; i++) {
      await fireEvent.click(screen.getByRole('button', { name: /Weiter/ }));
    }
    const chip = screen.getByTestId('grilling-choice-Ja,-aber-kontrolliert');
    await fireEvent.click(chip);
    const ta = screen.getByLabelText('Antwort') as HTMLTextAreaElement;
    expect(ta.value).toBe('Ja, aber kontrolliert');
  });

  it('a question without choices renders no chip buttons', () => {
    setupFinal(null, null);
    expect(screen.queryByTestId(/^grilling-choice-/)).toBeNull();
  });
});

describe('GrillingStepper all mode', () => {
  it('shows all questions as a list when mode is "all"', async () => {
    setup(null, null); // coaching-sessions-v1, 23 questions
    await fireEvent.click(screen.getByTestId('grilling-mode')); // step -> all
    const list = screen.getByTestId('grilling-all-list');
    expect(list).toBeTruthy();
    // every registry question label is present in all-mode
    const labels = QUESTIONNAIRES[QN].sections.flatMap((s) => s.questions).map((q) => q.label);
    for (const label of labels) {
      expect(within(list).getByText(label)).toBeTruthy();
    }
  });

  it('answered questions show their answer preview in all mode', async () => {
    setup({ [QN]: { q1: 'Meine erste Antwort' } }, null);
    await fireEvent.click(screen.getByTestId('grilling-mode'));
    const list = screen.getByTestId('grilling-all-list');
    expect(within(list).getByText(/Meine erste Antwort/)).toBeTruthy();
  });
});

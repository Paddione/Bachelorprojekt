import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import InstructionBeatView from './InstructionBeatView.svelte';
import type { InstructionBeat } from '../../../lib/coaching-session-prompts';

describe('InstructionBeatView (P2)', () => {
  it('shows the regie text and advances with the captured value', async () => {
    const beat: InstructionBeat = {
      kind: 'instruction',
      regie: 'Begrüße den Coachee und erkläre den Ablauf.',
      capture: { key: 'ist_soll', label: 'Ist- und Soll-Zustand' },
    };
    const onAdvance = vi.fn();
    const { getByRole, getByText } = render(InstructionBeatView, {
      props: {
        beat, beatState: undefined, disabled: false, canGoBack: false,
        onAdvance, onBack: () => {},
      },
    });

    expect(getByText('Begrüße den Coachee und erkläre den Ablauf.')).toBeTruthy();
    await fireEvent.input(getByRole('textbox'), { target: { value: 'Mein Anliegen' } });
    await fireEvent.click(getByRole('button', { name: /Weiter/ }));
    expect(onAdvance).toHaveBeenCalledWith('Mein Anliegen');
  });
});

import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import SuggestionBar from './SuggestionBar.svelte';
import { makeFeature, makeRollup } from '../../lib/tickets/__tests__/fixtures';

const features = [
  makeFeature({ id: 'f1', extId: 'f1', title: 'F1', priority: 'mittel', health: 'amber', rollup: makeRollup({ total: 0, open: 0 }), nextStep: true }),
  makeFeature({ id: 'f2', extId: 'f2', title: 'F2', priority: 'hoch', health: 'green', rollup: makeRollup({ total: 0, open: 0 }), discarded: true, majorFeature: true }),
  makeFeature({ id: 'f3', extId: 'f3', title: 'F3', priority: 'niedrig', health: 'red', rollup: makeRollup({ total: 0, open: 0 }) }),
];

describe('SuggestionBar', () => {
  it('renders provider selector and roll button', () => {
    const { getByRole, getByText } = render(SuggestionBar, { features, isRolling: false });
    expect(getByRole('button', { name: /rollen/i })).toBeTruthy();
    expect(getByText(/1 nächster Schritt/)).toBeTruthy();
  });

  it('shows correct counters', () => {
    const { getByText } = render(SuggestionBar, { features, isRolling: false });
    expect(getByText(/1 nächster Schritt/)).toBeTruthy();
    expect(getByText(/1 verworfen/)).toBeTruthy();
    expect(getByText(/1 Major/)).toBeTruthy();
    expect(getByText(/3 Features/)).toBeTruthy();
  });

  it('dispatches roll event with provider and model', async () => {
    const onRoll = vi.fn();
    const { getByRole } = render(SuggestionBar, { features, isRolling: false, onroll: onRoll });
    await fireEvent.click(getByRole('button', { name: /rollen/i }));
    expect(onRoll).toHaveBeenCalled();
    expect(onRoll.mock.calls[0][0].provider).toBe('deepseek');
    expect(onRoll.mock.calls[0][0].model).toBe('deepseek-chat');
  });

  it('dispatches apply event', async () => {
    const onApply = vi.fn();
    const { getByText } = render(SuggestionBar, { features, isRolling: false, onapply: onApply });
    await fireEvent.click(getByText('Übernehmen'));
    expect(onApply).toHaveBeenCalled();
  });

  it('dispatches reset event', async () => {
    const onReset = vi.fn();
    const { getByText } = render(SuggestionBar, { features, isRolling: false, onreset: onReset });
    await fireEvent.click(getByText('Zurücksetzen'));
    expect(onReset).toHaveBeenCalled();
  });

  it('disables roll button when isRolling is true', () => {
    const { getByRole } = render(SuggestionBar, { features, isRolling: true });
    expect((getByRole('button', { name: /rolle/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('disables apply and reset when no features are nextStep', () => {
    const noNextFeatures = features.map(f => ({ ...f, nextStep: false }));
    const { getByText } = render(SuggestionBar, { features: noNextFeatures, isRolling: false });
    expect((getByText('Übernehmen') as HTMLButtonElement).disabled).toBe(true);
    expect((getByText('Zurücksetzen') as HTMLButtonElement).disabled).toBe(true);
  });

  it('renders the rich AI suggestions with reason, title and impact badge', () => {
    const suggestions = [
      { featureId: 'f1', nextStep: true, reason: 'fast fertig, hoher Wert', impact: 'hoch' as const },
      { featureId: 'f3', nextStep: false, reason: 'blockiert' },
    ];
    const { getByTestId, getByText } = render(SuggestionBar, { features, suggestions, isRolling: false });
    expect(getByTestId('suggestion-list')).toBeTruthy();
    expect(getByText('fast fertig, hoher Wert')).toBeTruthy();
    expect(getByText('hoch')).toBeTruthy();       // impact badge
    expect(getByText('F1')).toBeTruthy();          // resolved feature title
  });

  it('does not render the suggestion list when there are no suggestions', () => {
    const { queryByTestId } = render(SuggestionBar, { features, isRolling: false });
    expect(queryByTestId('suggestion-list')).toBeNull();
  });
});

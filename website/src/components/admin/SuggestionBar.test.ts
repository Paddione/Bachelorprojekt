import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import SuggestionBar from './SuggestionBar.svelte';

const features = [
  { id: 'f1', extId: 'f1', title: 'F1', priority: 'mittel', health: 'amber' as const,
    rollup: { total: 0, done: 0, blocked: 0, inProgress: 0, open: 0, pctDone: 0 },
    nextStep: true, discarded: false, majorFeature: false },
  { id: 'f2', extId: 'f2', title: 'F2', priority: 'hoch', health: 'green' as const,
    rollup: { total: 0, done: 0, blocked: 0, inProgress: 0, open: 0, pctDone: 0 },
    nextStep: false, discarded: true, majorFeature: true },
  { id: 'f3', extId: 'f3', title: 'F3', priority: 'niedrig', health: 'red' as const,
    rollup: { total: 0, done: 0, blocked: 0, inProgress: 0, open: 0, pctDone: 0 },
    nextStep: false, discarded: false, majorFeature: false },
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
});

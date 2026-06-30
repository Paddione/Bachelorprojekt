// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import FilterBar from './FilterBar.svelte';
import { DEFAULT_PRESETS, savePreset, loadPresets } from '../../../lib/cockpit-presets';

describe('FilterBar Component', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders DEFAULT_PRESETS and triggers onApplyPreset on click', async () => {
    const onApplyPreset = vi.fn();
    const currentFilter = { status: ['offen'], area: [], brand: [] };

    const { getByTestId, queryAllByTestId } = render(FilterBar, {
      currentFilter,
      onApplyPreset,
    });

    const toggleBtn = getByTestId('presets-toggle');
    await fireEvent.click(toggleBtn);

    const items = queryAllByTestId('preset-item');
    expect(items.length).toBe(DEFAULT_PRESETS.length);
    expect(items[0].textContent).toContain('Offen');

    await fireEvent.click(items[0].querySelector('.apply-btn')!);
    expect(onApplyPreset).toHaveBeenCalledWith(DEFAULT_PRESETS[0].state);
  });

  it('renders custom presets and permits deleting only custom ones', async () => {
    const currentFilter = { status: ['planning'], area: ['infra'], brand: ['mentolder'] };
    // Save a custom preset first
    savePreset('My Preset', currentFilter);

    const onApplyPreset = vi.fn();
    const { getByTestId, queryAllByTestId } = render(FilterBar, {
      currentFilter,
      onApplyPreset,
    });

    const toggleBtn = getByTestId('presets-toggle');
    await fireEvent.click(toggleBtn);

    const items = queryAllByTestId('preset-item');
    // 3 defaults + 1 custom
    expect(items.length).toBe(4);
    expect(items[3].textContent).toContain('My Preset');

    // Check delete buttons: first 3 should not have delete buttons (lock icon instead), 4th should
    expect(items[0].querySelector('.delete-btn')).toBeNull();
    expect(items[0].querySelector('.lock-icon')).toBeTruthy();

    const deleteBtn = items[3].querySelector('.delete-btn');
    expect(deleteBtn).toBeTruthy();

    // Click delete
    await fireEvent.click(deleteBtn!);
    // Check loadPresets to verify it was deleted
    const updated = loadPresets();
    expect(updated.length).toBe(3);
  });

  it('opens save dialog and saves a new preset', async () => {
    const currentFilter = { status: ['done'], area: ['website'], brand: ['mentolder'] };
    const { getByText, getByPlaceholderText } = render(FilterBar, {
      currentFilter,
      onApplyPreset: () => {},
    });

    const saveBtn = getByText(/Als Preset speichern/i);
    await fireEvent.click(saveBtn);

    const heading = getByText('Als Preset speichern', { selector: 'h3' });
    expect(heading).toBeTruthy();

    const input = getByPlaceholderText('Name des Presets...');
    await fireEvent.input(input, { target: { value: 'New Saved Preset' } });

    const confirmBtn = getByText('Speichern');
    await fireEvent.click(confirmBtn);

    const presets = loadPresets();
    expect(presets.length).toBe(4);
    expect(presets[3].name).toBe('New Saved Preset');
    expect(presets[3].state).toEqual(currentFilter);
  });

  it('shows private mode banner when localStorage is unavailable', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });

    const { getByTestId } = render(FilterBar, {
      currentFilter: { status: [], area: [], brand: [] },
      onApplyPreset: () => {},
    });

    const banner = getByTestId('private-banner');
    expect(banner).toBeTruthy();
    expect(banner.textContent).toContain('Private');

    vi.restoreAllMocks();
  });

});

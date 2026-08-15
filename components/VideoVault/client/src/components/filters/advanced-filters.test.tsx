import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@/test/renderWithProviders';
import { AdvancedFiltersPanel } from './advanced-filters';

const emptyFilters = {
  dateRange: { startDate: '', endDate: '' },
  fileSizeRange: { min: 0, max: 0 },
  durationRange: { min: 0, max: 0 },
};

describe('AdvancedFiltersPanel', () => {
  it('shows active count and can reset and apply custom ranges', () => {
    const onFiltersChange = vi.fn();
    const onClearFilters = vi.fn();

    // Start with active file size and duration to exercise UI without Radix selects
    const startFilters = {
      dateRange: { startDate: '', endDate: '' },
      fileSizeRange: { min: 5 * 1024 * 1024, max: 10 * 1024 * 1024 },
      durationRange: { min: 60, max: 300 },
    };

    render(
      <AdvancedFiltersPanel
        filters={startFilters}
        onFiltersChange={onFiltersChange}
        onClearFilters={onClearFilters}
      />,
    );

    // Button displays active count badge (2: size + duration)
    const trigger = screen.getByTestId('button-advanced-filters');
    expect(trigger.textContent).toMatch(/2/);

    // Open popover
    fireEvent.click(trigger);

    // Edit custom file size min and max via inputs
    const minMb = screen.getByLabelText('Min (MB)');
    const maxMb = screen.getByLabelText('Max (MB)');
    fireEvent.change(minMb, { target: { value: '8' } });
    fireEvent.change(maxMb, { target: { value: '12' } });

    // Apply should propagate new values
    fireEvent.click(screen.getByText('Apply Filters'));
    expect(onFiltersChange).toHaveBeenCalled();
    const last = onFiltersChange.mock.calls.at(-1)?.[0] as typeof emptyFilters | undefined;
    expect(last?.fileSizeRange.min).toBe(8 * 1024 * 1024);
    expect(last?.fileSizeRange.max).toBe(12 * 1024 * 1024);

    // Reset All fires change with empty filters immediately
    fireEvent.click(screen.getByText('Reset All'));
    expect(onFiltersChange).toHaveBeenCalledWith(emptyFilters);
  });
});

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { PresetManagerModal } from './preset-manager-modal';
import { FilterPresetsService } from '@/services/filter-presets';

// Minimal preset seed
FilterPresetsService.savePreset('test1', ['a'], '', {
  dateRange: { startDate: '', endDate: '' },
  fileSizeRange: { min: 0, max: 0 },
  durationRange: { min: 0, max: 0 }
});
FilterPresetsService.savePreset('test2', ['b'], '', {
  dateRange: { startDate: '', endDate: '' },
  fileSizeRange: { min: 0, max: 0 },
  durationRange: { min: 0, max: 0 }
});

describe('PresetManagerModal', () => {
	it('lists presets and triggers load/delete', () => {
		const onLoadPreset = vi.fn();
		const onClose = vi.fn();
		render(<PresetManagerModal isOpen={true} onClose={onClose} onLoadPreset={onLoadPreset} />);

		// Lists presets
		expect(screen.getByText('test1')).toBeTruthy();
		expect(screen.getByText('test2')).toBeTruthy();

		// Load one
		fireEvent.click(screen.getByTestId('button-load-test1'));
		expect(onLoadPreset).toHaveBeenCalled();

		// Delete the other
		fireEvent.click(screen.getByTestId('button-delete-test2'));
		expect(screen.queryByText('test2')).toBeNull();
	});
});

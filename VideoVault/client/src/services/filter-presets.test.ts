import { describe, it, expect, beforeEach } from 'vitest';
import { FilterPresetsService } from './filter-presets';

function resetStorage() {
	FilterPresetsService.clearAllPresets();
}

describe('FilterPresetsService', () => {
	beforeEach(() => {
		resetStorage();
	});

	it('saves and loads a preset', () => {
    FilterPresetsService.savePreset('foo', ['age:teen'], 'q', {
      dateRange: { startDate: '2024-01-01', endDate: '2024-12-31' },
      fileSizeRange: { min: 0, max: 0 },
      durationRange: { min: 0, max: 0 },
    });
		const preset = FilterPresetsService.loadPreset('foo');
		expect(preset?.name).toBe('foo');
		expect(preset?.categories).toEqual(['age:teen']);
		expect(preset?.searchQuery).toBe('q');
		expect(preset?.dateRange.startDate).toBe('2024-01-01');
	});

	it('overwrites an existing preset by name', () => {
    FilterPresetsService.savePreset('x', ['a'], '', {
      dateRange: { startDate: '', endDate: '' },
      fileSizeRange: { min: 0, max: 0 },
      durationRange: { min: 0, max: 0 },
    });
		const first = FilterPresetsService.loadPreset('x');
    FilterPresetsService.savePreset('x', ['b'], 'hello', {
      dateRange: { startDate: '', endDate: '' },
      fileSizeRange: { min: 0, max: 0 },
      durationRange: { min: 0, max: 0 },
    });
		const updated = FilterPresetsService.loadPreset('x');
		expect(updated?.categories).toEqual(['b']);
		expect(updated?.searchQuery).toBe('hello');
		expect(updated?.createdAt).toBe(first?.createdAt);
	});

	it('deletes a preset', () => {
    FilterPresetsService.savePreset('x', ['a'], '', {
      dateRange: { startDate: '', endDate: '' },
      fileSizeRange: { min: 0, max: 0 },
      durationRange: { min: 0, max: 0 },
    });
		FilterPresetsService.deletePreset('x');
		expect(FilterPresetsService.loadPreset('x')).toBeNull();
	});

	it('exports and imports presets', () => {
		FilterPresetsService.savePreset('x', ['a'], '', {
      dateRange: { startDate: '', endDate: '' },
      fileSizeRange: { min: 0, max: 0 },
      durationRange: { min: 0, max: 0 },
    });
    FilterPresetsService.savePreset('y', ['b'], '', {
      dateRange: { startDate: '', endDate: '' },
      fileSizeRange: { min: 0, max: 0 },
      durationRange: { min: 0, max: 0 },
    });
		const json = FilterPresetsService.exportPresets();
		resetStorage();
		FilterPresetsService.importPresets(json);
		const all = FilterPresetsService.loadAllPresets();
		expect(all.map(p => p.name).sort()).toEqual(['x', 'y']);
	});

  it('import merges without overwriting existing names', () => {
    FilterPresetsService.savePreset('keep', ['a'], '', {
      dateRange: { startDate: '', endDate: '' },
      fileSizeRange: { min: 0, max: 0 },
      durationRange: { min: 0, max: 0 },
    });
		const exported = FilterPresetsService.exportPresets();
    FilterPresetsService.savePreset('keep', ['b'], 'updated', {
      dateRange: { startDate: '', endDate: '' },
      fileSizeRange: { min: 0, max: 0 },
      durationRange: { min: 0, max: 0 },
    });
		FilterPresetsService.importPresets(exported);
		const keep = FilterPresetsService.loadPreset('keep');
		expect(keep?.categories).toEqual(['b']);
    expect(keep?.searchQuery).toBe('updated');
  });

  it('importPresets returns number of added presets', () => {
	  // Reset and seed with one existing preset
	  resetStorage();
	  FilterPresetsService.savePreset('keep', ['b'], 'updated', {
	    dateRange: { startDate: '', endDate: '' },
	    fileSizeRange: { min: 0, max: 0 },
	    durationRange: { min: 0, max: 0 },
	  });
	  expect(FilterPresetsService.loadAllPresets().length).toBe(1);

	  // Create import with one new and one duplicate name
	  const importData = JSON.stringify([
	    { name: 'keep', categories: ['z'] },
	    { name: 'new-one', categories: ['n'], dateRange: { startDate: '', endDate: '' }, fileSizeRange: { min: 0, max: 0 }, durationRange: { min: 0, max: 0 } },
	  ]);
	  const added = FilterPresetsService.importPresets(importData);
	  expect(added).toBe(1);
	  const all = FilterPresetsService.loadAllPresets();
	  expect(all.find(p => p.name === 'new-one')).toBeTruthy();
	  expect(all.find(p => p.name === 'keep')?.categories).toEqual(['b']);
	});
});

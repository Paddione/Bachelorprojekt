// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  savePreset,
  loadPresets,
  deletePreset,
  applyPreset,
  encodeState,
  decodeState,
  parsePresetFromUrl,
  buildShareUrl,
} from './cockpit-presets';

describe('cockpit-presets pure logic', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('savePreset writes to localStorage and loadPresets reads it back', () => {
    const filterState = {
      status: ['offen'],
      area: ['Frontend'],
      brand: ['mentolder'],
    };

    const preset = savePreset('My Custom Preset', filterState);
    expect(preset.name).toBe('My Custom Preset');
    expect(preset.state).toEqual(filterState);
    expect(preset.isDefault).toBe(false);

    const presets = loadPresets();
    // 3 defaults + 1 custom
    expect(presets.length).toBe(4);
    expect(presets[0].isDefault).toBe(true);
    expect(presets[3].name).toBe('My Custom Preset');
    expect(presets[3].state).toEqual(filterState);
  });

  it('auto-suffixes names on duplicate', () => {
    const filterState = { status: [], area: [], brand: [] };
    const p1 = savePreset('Test', filterState);
    const p2 = savePreset('Test', filterState);
    const p3 = savePreset('Test', filterState);

    expect(p1.name).toBe('Test');
    expect(p2.name).toBe('Test-2');
    expect(p3.name).toBe('Test-3');
  });

  it('prevents deletion of default presets', () => {
    const originalCount = loadPresets().length;
    deletePreset('default-offen');
    expect(loadPresets().length).toBe(originalCount);
  });

  it('deletes custom presets successfully', () => {
    const filterState = { status: [], area: [], brand: [] };
    const p = savePreset('Delete Me', filterState);
    expect(loadPresets().length).toBe(4);

    deletePreset(p.id);
    expect(loadPresets().length).toBe(3);
  });

  it('applyPreset returns state or null', () => {
    const filterState = { status: ['offen'], area: [], brand: [] };
    const state = applyPreset('default-offen');
    expect(state).toEqual(filterState);

    const invalid = applyPreset('non-existent');
    expect(invalid).toBeNull();
  });

  it('encodeState and decodeState round-trip reproduces state exactly', () => {
    const state = {
      status: ['planning', 'offen'],
      area: ['UI', 'Backend'],
      brand: ['mentolder'],
    };

    const encoded = encodeState(state);
    expect(typeof encoded).toBe('string');
    // Ensure base64 padding is removed
    expect(encoded.endsWith('=')).toBe(false);

    const decoded = decodeState(encoded);
    expect(decoded).toEqual(state);
  });

  it('encodeState throws when length exceeds 2000 characters', () => {
    const giantState = {
      status: Array(500).fill('status-item'),
      area: Array(500).fill('area-item'),
      brand: Array(500).fill('brand-item'),
    };
    expect(() => encodeState(giantState)).toThrow('Encoded state too long');
  });

  it('decodeState returns null on invalid input instead of throwing', () => {
    expect(decodeState('!!!invalid-base64!!!')).toBeNull();
  });

  it('parsePresetFromUrl parses preset query param correctly', () => {
    const state = { status: ['offen'], area: [], brand: [] };
    const encoded = encodeState(state);
    
    const parsed = parsePresetFromUrl(`?preset=${encoded}`);
    expect(parsed).toEqual(state);

    const parsedNull = parsePresetFromUrl('?other=param');
    expect(parsedNull).toBeNull();

    const parsedInvalid = parsePresetFromUrl('?preset=invalid');
    expect(parsedInvalid).toBeNull();
  });

  it('buildShareUrl generates correct URL', () => {
    const state = { status: ['offen'], area: [], brand: [] };
    const encoded = encodeState(state);
    const url = buildShareUrl(state, 'https://example.com');
    expect(url).toBe(`https://example.com/admin/cockpit?preset=${encoded}`);
  });

  it('works in session-only mode if localStorage throws / is not available', () => {
    // Mock localStorage to simulate unavailability (e.g. disabled cookies/storage)
    const storeMock = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('SecurityError: The operation is insecure.');
    });

    const filterState = { status: ['offen'], area: [], brand: [] };
    const p1 = savePreset('Session Preset', filterState);
    expect(p1.name).toBe('Session Preset');

    const presets = loadPresets();
    // Defaults + session preset
    expect(presets.length).toBe(4);
    expect(presets[3].name).toBe('Session Preset');

    deletePreset(p1.id);
    expect(loadPresets().length).toBe(3);

    storeMock.mockRestore();
  });

  it('evicts oldest non-default preset on QuotaExceededError', () => {
    const filterState = { status: ['offen'], area: [], brand: [] };
    savePreset('Oldest', filterState);
    // Mock setItem to throw QuotaExceededError on next save unless we have reduced size
    let callCount = 0;
    const storeMock = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
      callCount++;
      if (callCount === 1) {
        const err = new DOMException('The quota has been exceeded.', 'QuotaExceededError');
        throw err;
      }
      // Simple write mock
      localStorage.setItem(key, value);
    });

    // Save second preset, should trigger QuotaExceededError, evict 'Oldest', and succeed
    const p2 = savePreset('Newest', filterState);
    expect(p2.name).toBe('Newest');

    const presets = loadPresets();
    // Default presets + 'Newest' (Oldest was evicted)
    expect(presets.find(p => p.name === 'Oldest')).toBeUndefined();
    expect(presets.find(p => p.name === 'Newest')).toBeDefined();

    storeMock.mockRestore();
  });
});

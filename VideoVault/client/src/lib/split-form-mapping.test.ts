import { describe, it, expect } from 'vitest';
import { splitFormToOptions } from './split-form-mapping';
import type { SplitVideoFormValues } from '@/components/video/video-splitter';

const mockForm: SplitVideoFormValues = {
  splitTimeSeconds: 30,
  first: {
    displayName: 'Part 1',
    filename: 'video-part1',
    categories: {
      age: ['adult'],
      physical: [],
      ethnicity: [],
      relationship: [],
      acts: [],
      setting: [],
      quality: [],
      performer: [],
    },
    customCategories: { genre: ['action'] },
  },
  second: {
    displayName: 'Part 2',
    filename: 'video-part2',
    categories: {
      age: ['adult'],
      physical: [],
      ethnicity: [],
      relationship: [],
      acts: [],
      setting: [],
      quality: [],
      performer: [],
    },
    customCategories: {},
  },
};

describe('splitFormToOptions', () => {
  it('maps SplitVideoFormValues to SplitVideoOptions', () => {
    const result = splitFormToOptions(mockForm);
    expect(result.splitTimeSeconds).toBe(30);
    expect(result.first.displayName).toBe('Part 1');
    expect(result.second.displayName).toBe('Part 2');
    expect(result.first.categories.age).toEqual(['adult']);
    expect(result.first.customCategories.genre).toEqual(['action']);
    expect(result.second.customCategories).toEqual({});
  });

  it('passes onProgress through', () => {
    const onProgress = vi.fn();
    const result = splitFormToOptions(mockForm, onProgress);
    expect(result.onProgress).toBe(onProgress);
    result.onProgress?.('test');
    expect(onProgress).toHaveBeenCalledWith('test');
  });
});

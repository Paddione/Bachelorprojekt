import { describe, it, expect } from 'vitest';
import { getCategoryColorClasses } from './category-colors';

describe('getCategoryColorClasses', () => {
  it('returns correct colors for standard category types', () => {
    expect(getCategoryColorClasses('age')).toBe('bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200');
    expect(getCategoryColorClasses('physical')).toBe('bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200');
    expect(getCategoryColorClasses('quality')).toBe('bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200');
    expect(getCategoryColorClasses('ethnicity')).toBe('bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-200');
    expect(getCategoryColorClasses('acts')).toBe('bg-rose-100 dark:bg-rose-900 text-rose-800 dark:text-rose-200');
    expect(getCategoryColorClasses('setting')).toBe('bg-teal-100 dark:bg-teal-900 text-teal-800 dark:text-teal-200');
    expect(getCategoryColorClasses('performer')).toBe('bg-indigo-100 dark:bg-indigo-900 text-indigo-800 dark:text-indigo-200');
    expect(getCategoryColorClasses('relationship')).toBe('bg-pink-100 dark:bg-pink-900 text-pink-800 dark:text-pink-200');
  });

  it('returns default color for unknown standard category types', () => {
    expect(getCategoryColorClasses('unknown')).toBe('bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200');
    expect(getCategoryColorClasses('')).toBe('bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200');
  });

  it('returns deterministic colors for custom categories', () => {
    // Same type should always return same color
    expect(getCategoryColorClasses('genre', true)).toBe(getCategoryColorClasses('genre', true));
    expect(getCategoryColorClasses('mood', true)).toBe(getCategoryColorClasses('mood', true));
    
    // Different types should return different colors
    const genreColor = getCategoryColorClasses('genre', true);
    const moodColor = getCategoryColorClasses('mood', true);
    expect(genreColor).not.toBe(moodColor);
  });

  it('returns consistent colors for custom categories across calls', () => {
    const color1 = getCategoryColorClasses('customType', true);
    const color2 = getCategoryColorClasses('customType', true);
    const color3 = getCategoryColorClasses('customType', true);
    
    expect(color1).toBe(color2);
    expect(color2).toBe(color3);
  });

  it('handles empty string for custom category type', () => {
    const color = getCategoryColorClasses('', true);
    // Empty string should still get a color from the palette, not default
    expect(color).toMatch(/^bg-\w+-\d+ dark:bg-\w+-\d+ text-\w+-\d+ dark:text-\w+-\d+$/);
  });

  it('distinguishes between standard and custom categories', () => {
    const standardColor = getCategoryColorClasses('age');
    const customColor = getCategoryColorClasses('age', true);
    
    expect(standardColor).not.toBe(customColor);
    expect(standardColor).toBe('bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200');
  });

  it('returns colors from the custom palette for custom categories', () => {
    const customColors = [
      'bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200',
      'bg-cyan-100 dark:bg-cyan-900 text-cyan-800 dark:text-cyan-200',
      'bg-lime-100 dark:bg-lime-900 text-lime-800 dark:text-lime-200',
      'bg-orange-100 dark:bg-orange-900 text-orange-800 dark:text-orange-200',
      'bg-fuchsia-100 dark:bg-fuchsia-900 text-fuchsia-800 dark:text-fuchsia-200',
      'bg-violet-100 dark:bg-violet-900 text-violet-800 dark:text-violet-200',
      'bg-sky-100 dark:bg-sky-900 text-sky-800 dark:text-sky-200',
      'bg-emerald-100 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-200',
      'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200',
      'bg-stone-100 dark:bg-stone-900 text-stone-800 dark:text-stone-200',
    ];
    
    const result = getCategoryColorClasses('testCustom', true);
    expect(customColors).toContain(result);
  });

  it('produces different colors for different custom category types', () => {
    const colors = new Set();
    
    // Test multiple custom types
    for (let i = 0; i < 20; i++) {
      const color = getCategoryColorClasses(`customType${i}`, true);
      colors.add(color);
    }
    
    // Should have multiple different colors (not all the same)
    expect(colors.size).toBeGreaterThan(1);
  });

  it('handles special characters in custom category types', () => {
    const color1 = getCategoryColorClasses('type-with-dashes', true);
    const color2 = getCategoryColorClasses('type_with_underscores', true);
    const color3 = getCategoryColorClasses('typeWithCamelCase', true);
    
    // All should return valid colors
    expect(color1).toMatch(/^bg-\w+-\d+ dark:bg-\w+-\d+ text-\w+-\d+ dark:text-\w+-\d+$/);
    expect(color2).toMatch(/^bg-\w+-\d+ dark:bg-\w+-\d+ text-\w+-\d+ dark:text-\w+-\d+$/);
    expect(color3).toMatch(/^bg-\w+-\d+ dark:bg-\w+-\d+ text-\w+-\d+ dark:text-\w+-\d+$/);
  });
});

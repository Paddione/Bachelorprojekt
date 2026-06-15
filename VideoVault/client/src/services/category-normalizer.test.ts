import { describe, it, expect } from 'vitest';
import { CategoryNormalizer } from './category-normalizer';

describe('CategoryNormalizer', () => {
	it('normalizeValue lowercases and trims', () => {
		expect(CategoryNormalizer.normalizeValue('  Busty  ')).toBe('busty');
		expect(CategoryNormalizer.normalizeValue('SLIM')).toBe('slim');
	});

	it('normalizeArray dedupes and removes empties', () => {
		expect(CategoryNormalizer.normalizeArray(['Busty', 'busty', '  ', 'Slim'])).toEqual(['busty', 'slim']);
	});

	it('isDuplicateIgnoreCase detects case-insensitive duplicates', () => {
		expect(CategoryNormalizer.isDuplicateIgnoreCase(['Busty', 'Slim'], 'busty')).toBe(true);
		expect(CategoryNormalizer.isDuplicateIgnoreCase(['Busty', 'Slim'], 'curvy')).toBe(false);
	});
});

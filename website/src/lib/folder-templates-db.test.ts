import { describe, it, expect } from 'vitest';
import { DEFAULT_FOLDERS, validateStructure, MAX_FOLDERS } from './folder-templates-db';

describe('DEFAULT_FOLDERS', () => {
  it('contains exactly 5 folders in the correct order', () => {
    expect(DEFAULT_FOLDERS).toHaveLength(5);
    expect(DEFAULT_FOLDERS[0]).toBe('01_Vertrag');
    expect(DEFAULT_FOLDERS[1]).toBe('02_Rechnungen');
    expect(DEFAULT_FOLDERS[2]).toBe('03_Dokumente');
    expect(DEFAULT_FOLDERS[3]).toBe('04_Assets');
    expect(DEFAULT_FOLDERS[4]).toBe('05_Kommunikation');
  });
});

describe('validateStructure', () => {
  it('accepts a valid folder list', () => {
    const result = validateStructure(['01_Vertrag', '02_Rechnungen']);
    expect(result.ok).toBe(true);
    expect(result.folders).toEqual(['01_Vertrag', '02_Rechnungen']);
  });

  it('rejects non-array input', () => {
    expect(validateStructure('not-an-array').ok).toBe(false);
    expect(validateStructure(null).ok).toBe(false);
    expect(validateStructure({}).ok).toBe(false);
  });

  it('rejects empty array', () => {
    expect(validateStructure([]).ok).toBe(false);
  });

  it('rejects .. path traversal', () => {
    expect(validateStructure(['..']).ok).toBe(false);
    expect(validateStructure(['foo/../bar']).ok).toBe(false);
    expect(validateStructure(['foo/bar/..']).ok).toBe(false);
  });

  it('rejects leading slash', () => {
    expect(validateStructure(['/etc']).ok).toBe(false);
  });

  it('rejects empty strings', () => {
    expect(validateStructure(['  ']).ok).toBe(false);
  });

  it('rejects too many folders', () => {
    const many = Array.from({ length: MAX_FOLDERS + 1 }, (_, i) => `ordner_${i}`);
    expect(validateStructure(many).ok).toBe(false);
  });

  it('rejects segment longer than 100 characters', () => {
    expect(validateStructure(['a'.repeat(101)]).ok).toBe(false);
    expect(validateStructure([`foo/${'b'.repeat(101)}`]).ok).toBe(false);
  });

  it('rejects unallowed characters', () => {
    expect(validateStructure(['foo*bar']).ok).toBe(false);
    expect(validateStructure(['foo?']).ok).toBe(false);
    expect(validateStructure(['<script>']).ok).toBe(false);
  });

  it('accepts nested paths with slash', () => {
    expect(validateStructure(['01_Vertrag/Draft', '02_Rechnungen/2024']).ok).toBe(true);
  });

  it('rejects duplicate folder names', () => {
    expect(validateStructure(['a', 'a']).ok).toBe(false);
  });

  it('accepts exactly MAX_FOLDERS', () => {
    const max = Array.from({ length: MAX_FOLDERS }, (_, i) => `ordner_${i}`);
    expect(validateStructure(max).ok).toBe(true);
  });
});

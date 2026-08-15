import { describe, it, expect } from 'vitest';
import { 
  toTitleCase,
  applyTransform,
  buildBatchName,
  getFilenameWithOriginalExt,
  sanitizeBaseName,
  buildNameFromCategories,
  BatchRenameOptions
} from './rename-engine';
import { Video } from '@/types/video';

function createMockVideo(overrides: Partial<Video> = {}): Video {
  return {
    id: 'video-1',
    filename: 'test-video.mp4',
    displayName: 'Test Video',
    path: '/path/to/test-video.mp4',
    size: 50 * 1024 * 1024,
    lastModified: '2024-01-15T10:30:00Z',
    categories: {
      age: [],
      physical: [],
      ethnicity: [],
      relationship: [],
      acts: [],
      setting: [],
      quality: [],
      performer: [],
    },
    customCategories: {},
    metadata: {
      duration: 600,
      width: 1920,
      height: 1080,
      bitrate: 5000,
      codec: 'H.264/AVC',
      fps: 30,
      aspectRatio: '16:9',
    },
    thumbnail: { dataUrl: '', generated: false, timestamp: '' },
    rootKey: 'test-root',
    ...overrides,
  };
}

describe('toTitleCase', () => {
  it('converts string to title case', () => {
    expect(toTitleCase('hello world')).toBe('Hello World');
    expect(toTitleCase('HELLO WORLD')).toBe('Hello World');
    expect(toTitleCase('hELLo WoRLd')).toBe('Hello World');
    expect(toTitleCase('single')).toBe('Single');
  });

  it('handles empty string', () => {
    expect(toTitleCase('')).toBe('');
  });

  it('handles single character words', () => {
    expect(toTitleCase('a b c')).toBe('A B C');
  });
});

describe('applyTransform', () => {
  const input = 'Hello World Test';

  it('applies lowercase transform', () => {
    expect(applyTransform(input, 'lower')).toBe('hello world test');
  });

  it('applies uppercase transform', () => {
    expect(applyTransform(input, 'upper')).toBe('HELLO WORLD TEST');
  });

  it('applies title case transform', () => {
    expect(applyTransform(input, 'title')).toBe('Hello World Test');
  });

  it('applies no transform for "none"', () => {
    expect(applyTransform(input, 'none')).toBe(input);
  });

  it('applies no transform for undefined', () => {
    expect(applyTransform(input, undefined)).toBe(input);
  });
});

describe('buildBatchName', () => {
  const baseVideo = createMockVideo({ displayName: 'Sample Video' });

  it('builds name with default options', () => {
    const result = buildBatchName(baseVideo, 0, {});
    expect(result).toBe('Sample Video 01');
  });

  it('applies prefix and suffix', () => {
    const options: BatchRenameOptions = {
      prefix: 'New_',
      suffix: '_HD',
    };
    const result = buildBatchName(baseVideo, 0, options);
    expect(result).toBe('New_Sample Video_HD 01');
  });

  it('uses custom start index', () => {
    const options: BatchRenameOptions = {
      startIndex: 10,
    };
    const result = buildBatchName(baseVideo, 0, options);
    expect(result).toBe('Sample Video 10');
  });

  it('applies custom padding', () => {
    const options: BatchRenameOptions = {
      padDigits: 4,
    };
    const result = buildBatchName(baseVideo, 5, options);
    expect(result).toBe('Sample Video 0006');
  });

  it('applies transform', () => {
    const options: BatchRenameOptions = {
      transform: 'upper',
    };
    const result = buildBatchName(baseVideo, 0, options);
    expect(result).toBe('SAMPLE VIDEO 01');
  });

  it('handles multiple options together', () => {
    const options: BatchRenameOptions = {
      prefix: 'Movie_',
      suffix: '_Final',
      startIndex: 5,
      padDigits: 3,
      transform: 'lower',
    };
    const result = buildBatchName(baseVideo, 2, options);
    expect(result).toBe('movie_sample video_final 007');
  });
});

describe('getFilenameWithOriginalExt', () => {
  it('preserves original file extension', () => {
    expect(getFilenameWithOriginalExt('newname', 'original.mp4')).toBe('newname.mp4');
    expect(getFilenameWithOriginalExt('newname', 'original.avi')).toBe('newname.avi');
    expect(getFilenameWithOriginalExt('newname', 'original.mkv')).toBe('newname.mkv');
  });

  it('handles files without extensions', () => {
    expect(getFilenameWithOriginalExt('newname', 'original')).toBe('newname');
  });

  it('handles complex extensions', () => {
    expect(getFilenameWithOriginalExt('newname', 'original.tar.gz')).toBe('newname.gz');
  });

  it('handles paths with dots', () => {
    expect(getFilenameWithOriginalExt('newname', '/path/to/file.with.dots.mp4')).toBe('newname.mp4');
  });
});

describe('sanitizeBaseName', () => {
  it('replaces spaces with underscores', () => {
    expect(sanitizeBaseName('hello world')).toBe('hello_world');
    expect(sanitizeBaseName('multiple   spaces')).toBe('multiple_spaces');
  });

  it('removes invalid filename characters', () => {
    expect(sanitizeBaseName('file\\name')).toBe('filename');
    expect(sanitizeBaseName('file/name')).toBe('filename');
    expect(sanitizeBaseName('file:name')).toBe('filename');
    expect(sanitizeBaseName('file*name')).toBe('filename');
    expect(sanitizeBaseName('file?name')).toBe('filename');
    expect(sanitizeBaseName('file"name')).toBe('filename');
    expect(sanitizeBaseName('file<name>')).toBe('filename');
    expect(sanitizeBaseName('file|name')).toBe('filename');
  });

  it('collapses multiple underscores', () => {
    expect(sanitizeBaseName('hello___world')).toBe('hello_world');
  });

  it('trims leading and trailing underscores', () => {
    expect(sanitizeBaseName('_hello_world_')).toBe('hello_world');
    expect(sanitizeBaseName('___hello___world___')).toBe('hello_world');
  });

  it('handles empty input', () => {
    expect(sanitizeBaseName('')).toBe('');
    expect(sanitizeBaseName('   ')).toBe('');
  });

  it('handles complex combinations', () => {
    expect(sanitizeBaseName('  hello world:test*?  ')).toBe('hello_worldtest');
  });
});

describe('buildNameFromCategories', () => {
  it('builds name from empty video', () => {
    const video = createMockVideo({ displayName: 'Basic Video' });
    const result = buildNameFromCategories(video);
    expect(result).toBe('Basic_Video');
  });

  it('prioritizes performers in title', () => {
    const video = createMockVideo({
      displayName: 'Jane Doe Amazing Performance',
      categories: {
        ...createMockVideo().categories,
        performer: ['Jane Doe', 'John Smith'],
        age: ['adult']
      }
    });
    
    const result = buildNameFromCategories(video);
    expect(result.startsWith('jane_doe')).toBe(true);
    expect(result).toContain('john_smith');
    expect(result).toContain('adult');
  });

  it('handles all standard categories in order', () => {
    const video = createMockVideo({
      displayName: 'Test Video',
      categories: {
        age: ['young'],
        physical: ['athletic'],
        ethnicity: ['caucasian'],
        relationship: ['couple'],
        acts: ['romantic'],
        setting: ['bedroom'],
        quality: ['hd'],
        performer: ['test-performer'],
      }
    });
    
    const result = buildNameFromCategories(video);
    const parts = result.split('_');
    
    expect(parts).toContain('test-performer');
    expect(parts).toContain('young');
    expect(parts).toContain('athletic');
    expect(parts).toContain('caucasian');
    expect(parts).toContain('couple');
    expect(parts).toContain('romantic');
    expect(parts).toContain('bedroom');
    expect(parts).toContain('hd');
  });

  it('includes custom categories with type prefix', () => {
    const video = createMockVideo({
      displayName: 'Custom Video',
      customCategories: {
        genre: ['action', 'thriller'],
        mood: ['intense']
      }
    });
    
    const result = buildNameFromCategories(video);
    expect(result).toContain('genre-action');
    expect(result).toContain('genre-thriller');
    expect(result).toContain('mood-intense');
  });

  it('deduplicates categories', () => {
    const video = createMockVideo({
      displayName: 'Test Video',
      categories: {
        ...createMockVideo().categories,
        age: ['adult', 'adult'], // duplicate
        quality: ['hd']
      }
    });
    
    const result = buildNameFromCategories(video);
    const parts = result.split('_');
    const adultCount = parts.filter(p => p === 'adult').length;
    expect(adultCount).toBe(1);
  });

  it('sanitizes category values', () => {
    const video = createMockVideo({
      displayName: 'Test Video',
      categories: {
        ...createMockVideo().categories,
        performer: ['Jane/Doe*Special']
      }
    });
    
    const result = buildNameFromCategories(video);
    expect(result).toContain('janedoespecial');
  });

  it('handles empty categories gracefully', () => {
    const video = createMockVideo({
      displayName: 'Empty Categories',
      categories: {
        age: [''],  // Only empty string, not null/undefined which cause errors
        physical: [],
        ethnicity: [],
        relationship: [],
        acts: [],
        setting: [],
        quality: [],
        performer: [],
      }
    });
    
    const result = buildNameFromCategories(video);
    expect(result).toBe('Empty_Categories'); // Falls back to displayName sanitization
  });

  it('falls back to filename when displayName is empty', () => {
    const video = createMockVideo({
      displayName: '',
      filename: 'fallback-file.mp4'
    });
    
    const result = buildNameFromCategories(video);
    expect(result).toBe('fallback-file');
  });

  it('handles video with no categories and empty displayName', () => {
    const video = createMockVideo({
      displayName: '',
      filename: 'test.mp4',
      categories: {
        age: [],
        physical: [],
        ethnicity: [],
        relationship: [],
        acts: [],
        setting: [],
        quality: [],
        performer: [],
      },
      customCategories: {}
    });
    
    const result = buildNameFromCategories(video);
    expect(result).toBe('test');
  });

  it('handles undefined categories', () => {
    const video = createMockVideo({
      displayName: 'Test Video',
      categories: undefined as any
    });
    
    const result = buildNameFromCategories(video);
    expect(result).toBe('Test_Video');
  });
});

describe('edge cases', () => {
  it('handles video with undefined displayName', () => {
    const video = createMockVideo({
      displayName: undefined as any,
      filename: 'backup.mp4'
    });
    
    const result = buildNameFromCategories(video);
    expect(result).toBe('backup');
  });

  it('handles very long category names', () => {
    const longName = 'a'.repeat(100);
    const video = createMockVideo({
      categories: {
        ...createMockVideo().categories,
        performer: [longName]
      }
    });
    
    const result = buildNameFromCategories(video);
    expect(result.length).toBeGreaterThan(0);
    expect(result).toContain(longName);
  });

  it('handles special unicode characters', () => {
    const video = createMockVideo({
      displayName: 'Café Naïve Résumé',
      categories: {
        ...createMockVideo().categories,
        performer: ['José María']
      }
    });
    
    const result = buildNameFromCategories(video);
    expect(result.length).toBeGreaterThan(0);
  });
});
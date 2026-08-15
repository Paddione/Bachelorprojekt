import { describe, it, expect } from 'vitest';
import { changedBlockIds } from './homepageDiff';

const doc = (blocks: any[]) => ({ schemaVersion: 1, blocks }) as any;
const hero = (title: string) => ({ id: 'hero', type: 'hero', props: { title, subtitle: 'S' } });
const cta = (title: string) => ({ id: 'cta', type: 'cta', props: { title } });

describe('changedBlockIds', () => {
  it('returns an empty array when nothing changed', () => {
    expect(changedBlockIds(doc([hero('A'), cta('X')]), doc([hero('A'), cta('X')]))).toEqual([]);
  });

  it('returns the id of a single block whose props changed', () => {
    expect(changedBlockIds(doc([hero('A'), cta('X')]), doc([hero('B'), cta('X')]))).toEqual(['hero']);
  });

  it('returns all changed ids in document order', () => {
    expect(changedBlockIds(doc([hero('A'), cta('X')]), doc([hero('B'), cta('Y')]))).toEqual([
      'hero',
      'cta',
    ]);
  });

  it('detects a change in a nested prop', () => {
    const a = doc([{ id: 'hero', type: 'hero', props: { intro: { emphasis: 'old' } } }]);
    const b = doc([{ id: 'hero', type: 'hero', props: { intro: { emphasis: 'new' } } }]);
    expect(changedBlockIds(a, b)).toEqual(['hero']);
  });

  it('returns an empty array when either side is null', () => {
    expect(changedBlockIds(null, doc([hero('A')]))).toEqual([]);
    expect(changedBlockIds(doc([hero('A')]), null)).toEqual([]);
  });
});

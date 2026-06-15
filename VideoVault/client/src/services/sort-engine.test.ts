import { describe, it, expect } from 'vitest';
import { SortEngine } from './sort-engine';
import { Video } from '@/types/video';

function makeVideo(id: string, displayName: string, path: string, size: number, lastModified: string, cats: number = 0): Video {
  const base: Video = {
    id,
    filename: `${displayName}.mp4`,
    displayName,
    path,
    size,
    lastModified,
    categories: {
      age: [], physical: [], ethnicity: [], relationship: [], acts: [], setting: [], quality: [], performer: []
    },
    customCategories: {},
    metadata: { duration: 0, width: 0, height: 0, bitrate: 0, codec: '', fps: 0, aspectRatio: '' },
    thumbnail: { dataUrl: '', generated: false, timestamp: '' },
  };
  // Seed categoryCount using 'acts' for simplicity
  for (let i = 0; i < cats; i++) base.categories.acts.push(`c${i}`);
  return base;
}

const videos: Video[] = [
  makeVideo('1', 'alpha', 'z/path/c.mp4', 300, '2023-01-01T00:00:00.000Z', 2),
  makeVideo('2', 'Bravo', 'a/path/a.mp4', 100, '2024-01-01T00:00:00.000Z', 0),
  makeVideo('3', 'charlie', 'm/path/b.mp4', 200, '2022-01-01T00:00:00.000Z', 5),
];

describe('SortEngine.sortVideos', () => {
  it('sorts by displayName asc/desc (case-insensitive, numeric-aware)', () => {
    const asc = SortEngine.sortVideos(videos, 'displayName', 'asc');
    expect(asc.map(v => v.id)).toEqual(['1','2','3']);
    const desc = SortEngine.sortVideos(videos, 'displayName', 'desc');
    expect(desc.map(v => v.id)).toEqual(['3','2','1']);
  });

  it('sorts by path asc/desc', () => {
    const asc = SortEngine.sortVideos(videos, 'path', 'asc');
    expect(asc.map(v => v.id)).toEqual(['2','3','1']);
    const desc = SortEngine.sortVideos(videos, 'path', 'desc');
    expect(desc.map(v => v.id)).toEqual(['1','3','2']);
  });

  it('sorts by size asc/desc', () => {
    const asc = SortEngine.sortVideos(videos, 'size', 'asc');
    expect(asc.map(v => v.id)).toEqual(['2','3','1']);
    const desc = SortEngine.sortVideos(videos, 'size', 'desc');
    expect(desc.map(v => v.id)).toEqual(['1','3','2']);
  });

  it('sorts by lastModified asc/desc', () => {
    const asc = SortEngine.sortVideos(videos, 'lastModified', 'asc');
    expect(asc.map(v => v.id)).toEqual(['3','1','2']);
    const desc = SortEngine.sortVideos(videos, 'lastModified', 'desc');
    expect(desc.map(v => v.id)).toEqual(['2','1','3']);
  });

  it('sorts by categoryCount asc/desc', () => {
    const asc = SortEngine.sortVideos(videos, 'categoryCount', 'asc');
    expect(asc.map(v => v.id)).toEqual(['2','1','3']);
    const desc = SortEngine.sortVideos(videos, 'categoryCount', 'desc');
    expect(desc.map(v => v.id)).toEqual(['3','1','2']);
  });
});

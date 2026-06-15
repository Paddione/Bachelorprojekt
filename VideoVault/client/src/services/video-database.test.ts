import { describe, it, expect, beforeEach } from 'vitest';
import { VideoDatabase } from './video-database';
import type { Video } from '@/types/video';

function makeVideo(overrides?: Partial<Video>): Video {
	return {
		id: 'v1',
		filename: 'Clip.mp4',
		displayName: 'Clip',
		path: 'root/Clip.mp4',
		size: 100,
		lastModified: new Date().toISOString(),
		categories: {
			age: [], physical: [], ethnicity: [], relationship: [], acts: [], setting: [], quality: [], performer: []
		},
		customCategories: {},
		metadata: { duration: 0, width: 0, height: 0, bitrate: 0, codec: '', fps: 0, aspectRatio: '' },
		thumbnail: { dataUrl: '', generated: false, timestamp: '' },
		...overrides,
	};
}

describe('VideoDatabase category normalization and removal', () => {
	beforeEach(() => {
		localStorage.clear();
	});

	it('normalizes casing on updateVideoCategories and dedupes case-insensitively (standard)', () => {
		const vids = [makeVideo({ id: '1', categories: { age: [], physical: ['Busty'], ethnicity: [], relationship: [], acts: [], setting: [], quality: [], performer: [] } })];
		const updated = VideoDatabase.updateVideoCategories(vids, '1', { categories: { ...vids[0].categories, physical: [...vids[0].categories.physical, 'bUSTY', 'slim'] } });
		const phys = updated[0].categories.physical;
		expect(phys).toContain('busty');
		expect(phys).toContain('slim');
		expect(phys.filter(v => v === 'busty').length).toBe(1);
	});

	it('removeCategory removes standard categories case-insensitively', () => {
		const vids = [makeVideo({ id: '1', categories: { age: [], physical: ['busty', 'Slim'], ethnicity: [], relationship: [], acts: [], setting: [], quality: [], performer: [] } })];
		const after = VideoDatabase.removeCategory(vids, '1', 'physical', 'SLIM');
		expect(after[0].categories.physical).toEqual(['busty']);
	});

	it('normalizes custom types and values on updateVideoCategories', () => {
		const vids = [makeVideo({ id: '1', customCategories: { Mood: ['Romantic'], rating: ['5-Stars'] } })];
		const after = VideoDatabase.updateVideoCategories(vids, '1', { customCategories: { ...vids[0].customCategories, mood: ['romantic', 'Favorite'] } });
		expect(Object.keys(after[0].customCategories)).toContain('mood');
		expect(after[0].customCategories.mood).toContain('romantic');
		expect(after[0].customCategories.mood).toContain('favorite');
		// Deduped
		expect(after[0].customCategories.mood.filter(v => v === 'romantic').length).toBe(1);
	});

	it('removeCategory removes custom categories case-insensitively and cleans empty types', () => {
		const vids = [makeVideo({ id: '1', customCategories: { mood: ['romantic', 'FAVORITE'] } })];
		const after = VideoDatabase.removeCategory(vids, '1', 'custom', 'mood:favorite');
		expect(after[0].customCategories.mood).toEqual(['romantic']);
		const after2 = VideoDatabase.removeCategory(after, '1', 'custom', 'mood:ROMANTIC');
		expect(after2[0].customCategories.mood).toBeUndefined();
	});
});

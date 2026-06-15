import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { MainContent } from './main-content';
import { Video } from '@/types/video';

// Mock ThumbnailGenerator to prevent async state updates during tests
vi.mock('@/services/thumbnail-generator', () => ({
  ThumbnailGenerator: {
    generateThumbnailForVideo: vi.fn().mockResolvedValue(null),
  },
}));

function makeVideo(id: number): Video {
	return {
		id: `v${id}`,
		filename: `video_${id}.mp4`,
		displayName: `Video ${id}`,
		path: `/videos/video_${id}.mp4`,
		size: 10_000_000,
		lastModified: new Date().toISOString(),
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
			duration: 120,
			width: 1920,
			height: 1080,
			bitrate: 0,
			codec: 'H.264/AVC',
			fps: 30,
			aspectRatio: '16:9',
		},
		thumbnail: { dataUrl: '', generated: false, timestamp: new Date().toISOString() },
		rootKey: 'test'
	};
}

const noop = () => {};

describe('MainContent virtualization', () => {
	it('renders a virtualized grid, not all items', () => {
		const videos = Array.from({ length: 200 }, (_, i) => makeVideo(i + 1));
		render(
			<MainContent
				videos={videos}
				filteredVideos={videos}
				selectedCategories={[]}
				isScanning={false}
				onVideoPlay={noop}
				onVideoEditTags={noop}
				onVideoRename={noop}
				onSelectDirectory={noop}
				onFileDrop={noop as any}
				onRequestMove={noop as any}
			/>
		);

		const cards = document.querySelectorAll('[data-testid^="video-card-"]');
		expect(cards.length).toBeGreaterThan(0);
		expect(cards.length).toBeLessThan(200);
	});

	it('renders a virtualized list when toggled', () => {
		const videos = Array.from({ length: 150 }, (_, i) => makeVideo(i + 1));
		render(
			<MainContent
				videos={videos}
				filteredVideos={videos}
				selectedCategories={[]}
				isScanning={false}
				onVideoPlay={noop}
				onVideoEditTags={noop}
				onVideoRename={noop}
				onSelectDirectory={noop}
				onFileDrop={noop as any}
				onRequestMove={noop as any}
			/>
		);

		// In some renders there may be multiple matching toggles (e.g., responsive wrappers)
		const listToggles = screen.getAllByTestId('button-view-list');
		act(() => {
			fireEvent.click(listToggles[0]);
		});
		const cards = document.querySelectorAll('[data-testid^="video-card-"]');
		expect(cards.length).toBeGreaterThan(0);
		expect(cards.length).toBeLessThan(150);
	});
});

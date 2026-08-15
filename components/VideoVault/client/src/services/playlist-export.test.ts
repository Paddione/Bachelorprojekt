import { describe, it, expect } from 'vitest';
import { PlaylistExportService } from './playlist-export';
import { Video } from '@/types/video';

describe('PlaylistExportService', () => {
    const mockVideos: Video[] = [
        {
            id: '1',
            filename: 'video1.mp4',
            displayName: 'Video One',
            path: '/path/to/video1.mp4',
            size: 1024,
            lastModified: '2023-01-01',
            categories: {} as any,
            customCategories: {},
            metadata: { duration: 60 } as any,
            thumbnail: { dataUrl: '', generated: false, timestamp: '' },
        },
        {
            id: '2',
            filename: 'video2.mp4',
            displayName: 'Video Two',
            path: '/path/to/video2.mp4',
            size: 2048,
            lastModified: '2023-01-02',
            categories: {} as any,
            customCategories: {},
            metadata: { duration: 120.5 } as any,
            thumbnail: { dataUrl: '', generated: false, timestamp: '' },
        },
    ];

    it('should generate valid M3U content', () => {
        const m3u = PlaylistExportService.generateM3U(mockVideos, { relativePaths: false });
        expect(m3u).toContain('#EXTM3U');
        expect(m3u).toContain('#EXTINF:60,Video One');
        expect(m3u).toContain('/path/to/video1.mp4');
        expect(m3u).toContain('#EXTINF:121,Video Two');
        expect(m3u).toContain('/path/to/video2.mp4');
    });

    it('should generate valid JSON content', () => {
        const jsonStr = PlaylistExportService.generateJSON(mockVideos, { relativePaths: false });
        const json = JSON.parse(jsonStr);
        expect(json).toHaveLength(2);
        expect(json[0]).toEqual({
            title: 'Video One',
            filename: 'video1.mp4',
            path: '/path/to/video1.mp4',
            duration: 60,
            size: 1024,
            mtime: '2023-01-01',
        });
        expect(json[1]).toEqual({
            title: 'Video Two',
            filename: 'video2.mp4',
            path: '/path/to/video2.mp4',
            duration: 120.5,
            size: 2048,
            mtime: '2023-01-02',
        });
    });
});

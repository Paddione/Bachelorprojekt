import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ThumbnailGenerator } from './thumbnail-generator';
import { VideoThumbnailService } from './video-thumbnail';
import { FileHandleRegistry } from './file-handle-registry';
import { VideoUrlRegistry } from './video-url-registry';

// Mock the dependencies
vi.mock('./video-thumbnail', () => ({
  VideoThumbnailService: {
    generateThumbnail: vi.fn(),
    generatePlaceholderThumbnail: vi.fn(),
  },
}));
vi.mock('./file-handle-registry', () => ({
  FileHandleRegistry: {
    get: vi.fn(),
  },
}));
vi.mock('./video-url-registry', () => ({
  VideoUrlRegistry: {
    get: vi.fn(),
  },
}));

describe('ThumbnailGenerator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ThumbnailGenerator.clearCache();
  });

  afterEach(() => {
    ThumbnailGenerator.clearCache();
  });

  it('should return cached thumbnail if valid', async () => {
    const mockThumbnail = {
      dataUrl: 'data:image/jpeg;base64,mock',
      generated: true,
      timestamp: new Date().toISOString(),
    };

    // First call should generate and cache
    vi.mocked(VideoThumbnailService.generatePlaceholderThumbnail).mockReturnValue(mockThumbnail);

    const result1 = await ThumbnailGenerator.generateThumbnailForVideo('test-video-1', 'test.mp4');
    expect(result1).toEqual(
      expect.objectContaining({
        dataUrl: mockThumbnail.dataUrl,
        generated: mockThumbnail.generated,
      }),
    );

    // Second call should return cached result
    vi.clearAllMocks();
    const result2 = await ThumbnailGenerator.generateThumbnailForVideo('test-video-1', 'test.mp4');
    expect(result2).toEqual(
      expect.objectContaining({
        dataUrl: mockThumbnail.dataUrl,
        generated: mockThumbnail.generated,
      }),
    );

    // generatePlaceholderThumbnail should not be called again due to caching
    expect(VideoThumbnailService.generatePlaceholderThumbnail).not.toHaveBeenCalled();
  });

  it('should generate placeholder thumbnail as fallback', async () => {
    const mockThumbnail = {
      dataUrl: 'data:image/jpeg;base64,placeholder',
      generated: false,
      timestamp: new Date().toISOString(),
    };

    vi.mocked(VideoThumbnailService.generatePlaceholderThumbnail).mockReturnValue(mockThumbnail);

    const result = await ThumbnailGenerator.generateThumbnailForVideo('test-video-2', 'video.mp4');

    expect(result).toEqual(
      expect.objectContaining({
        dataUrl: mockThumbnail.dataUrl,
        generated: mockThumbnail.generated,
      }),
    );
    expect(VideoThumbnailService.generatePlaceholderThumbnail).toHaveBeenCalledWith('video.mp4');
  });

  it('should prevent duplicate generation requests', async () => {
    const mockThumbnail = {
      dataUrl: 'data:image/jpeg;base64,test',
      generated: false,
      timestamp: new Date().toISOString(),
    };

    vi.mocked(VideoThumbnailService.generatePlaceholderThumbnail).mockReturnValue(mockThumbnail);

    // Start two concurrent generation requests
    const promise1 = ThumbnailGenerator.generateThumbnailForVideo('test-video-3', 'test.mp4');
    const promise2 = ThumbnailGenerator.generateThumbnailForVideo('test-video-3', 'test.mp4');

    const [result1, result2] = await Promise.all([promise1, promise2]);

    // First request should succeed, second should return null (avoided duplicate)
    expect(result1).toEqual(
      expect.objectContaining({
        dataUrl: mockThumbnail.dataUrl,
      }),
    );
    expect(result2).toBe(null);
  });

  it('should clear cache correctly', async () => {
    const mockThumbnail = {
      dataUrl: 'data:image/jpeg;base64,test',
      generated: false,
      timestamp: new Date().toISOString(),
    };

    vi.mocked(VideoThumbnailService.generatePlaceholderThumbnail).mockReturnValue(mockThumbnail);

    // Add some items to cache first
    await ThumbnailGenerator.generateThumbnailForVideo('video1', 'test1.mp4');
    await ThumbnailGenerator.generateThumbnailForVideo('video2', 'test2.mp4');

    expect(ThumbnailGenerator.getCacheSize()).toBeGreaterThan(0);

    ThumbnailGenerator.clearCache();
    expect(ThumbnailGenerator.getCacheSize()).toBe(0);
  });

  it('should clear individual cache items', async () => {
    const mockThumbnail = {
      dataUrl: 'data:image/jpeg;base64,test',
      generated: false,
      timestamp: new Date().toISOString(),
    };

    vi.mocked(VideoThumbnailService.generatePlaceholderThumbnail).mockReturnValue(mockThumbnail);

    await ThumbnailGenerator.generateThumbnailForVideo('video1', 'test1.mp4');
    await ThumbnailGenerator.generateThumbnailForVideo('video2', 'test2.mp4');

    expect(ThumbnailGenerator.getCacheSize()).toBe(2);

    ThumbnailGenerator.clearCache('video1');
    expect(ThumbnailGenerator.getCacheSize()).toBe(1);
  });

  describe('file handle strategy', () => {
    it('should generate thumbnail from file handle when available', async () => {
      const mockFile = new File([''], 'test.mp4', { type: 'video/mp4' });
      const mockHandle = { getFile: vi.fn().mockResolvedValue(mockFile) };
      const mockThumbnail = {
        dataUrl: 'data:image/jpeg;base64,fromfile',
        generated: true,
        timestamp: new Date().toISOString(),
      };

      vi.mocked(FileHandleRegistry.get).mockReturnValue(mockHandle as any);
      vi.mocked(VideoThumbnailService.generateThumbnail).mockResolvedValue(mockThumbnail);

      const result = await ThumbnailGenerator.generateThumbnailForVideo('test-video');

      expect(FileHandleRegistry.get).toHaveBeenCalledWith('test-video');
      expect(mockHandle.getFile).toHaveBeenCalled();
      expect(VideoThumbnailService.generateThumbnail).toHaveBeenCalledWith(mockFile);
      expect(result).toEqual(
        expect.objectContaining({
          dataUrl: mockThumbnail.dataUrl,
          generated: true,
        }),
      );
    });

    it('should handle file handle errors gracefully', async () => {
      const mockHandle = { getFile: vi.fn().mockRejectedValue(new Error('File access failed')) };
      const mockPlaceholder = {
        dataUrl: 'data:image/jpeg;base64,placeholder',
        generated: false,
        timestamp: new Date().toISOString(),
      };

      vi.mocked(FileHandleRegistry.get).mockReturnValue(mockHandle as any);
      vi.mocked(VideoThumbnailService.generatePlaceholderThumbnail).mockReturnValue(
        mockPlaceholder,
      );

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await ThumbnailGenerator.generateThumbnailForVideo('test-video', 'test.mp4');

      expect(result).toEqual(
        expect.objectContaining({
          dataUrl: mockPlaceholder.dataUrl,
          generated: false,
        }),
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to generate thumbnail from file handle'),
        expect.any(Error),
      );

      consoleSpy.mockRestore();
    });

    it('should fall back to placeholder when file handle returns no file', async () => {
      const mockHandle = { getFile: vi.fn().mockResolvedValue(null) };
      const mockPlaceholder = {
        dataUrl: 'data:image/jpeg;base64,placeholder',
        generated: false,
        timestamp: new Date().toISOString(),
      };

      vi.mocked(FileHandleRegistry.get).mockReturnValue(mockHandle as any);
      vi.mocked(VideoThumbnailService.generatePlaceholderThumbnail).mockReturnValue(
        mockPlaceholder,
      );

      const result = await ThumbnailGenerator.generateThumbnailForVideo('test-video', 'test.mp4');

      expect(result).toEqual(
        expect.objectContaining({
          dataUrl: mockPlaceholder.dataUrl,
          generated: false,
        }),
      );
    });
  });

  describe('video URL strategy', () => {
    let mockVideo: any;

    beforeEach(() => {
      mockVideo = {
        preload: '',
        muted: false,
        crossOrigin: '',
        src: '',
        pause: vi.fn(),
        removeAttribute: vi.fn(),
        load: vi.fn(),
        readyState: HTMLMediaElement.HAVE_CURRENT_DATA,
        videoWidth: 1920,
        videoHeight: 1080,
        duration: 120,
        currentTime: 0,
        onloadedmetadata: null,
        onloadeddata: null,
        onseeked: null,
        onerror: null,
      };

      // Mock document.createElement for video and canvas
      vi.spyOn(document, 'createElement').mockImplementation(((tagName: string) => {
        if (tagName === 'video') {
          return mockVideo as unknown as HTMLVideoElement;
        }
        if (tagName === 'canvas') {
          const canvas = {
            width: 0,
            height: 0,
            getContext: vi.fn().mockReturnValue({
              drawImage: vi.fn(),
            }),
            toDataURL: vi.fn().mockReturnValue('data:image/jpeg;base64,fromurl'),
          };
          return canvas as unknown as HTMLCanvasElement;
        }
        return {} as unknown as HTMLElement;
      }) as any);
    });

    it('should generate thumbnail from video URL when available', async () => {
      const mockUrl = 'blob:video-url';

      vi.mocked(FileHandleRegistry.get).mockReturnValue(undefined);
      vi.mocked(VideoUrlRegistry.get).mockReturnValue(mockUrl);

      const generatePromise = ThumbnailGenerator.generateThumbnailForVideo('test-video');

      // Simulate video loading
      setTimeout(() => {
        if (mockVideo.onloadedmetadata) {
          mockVideo.onloadedmetadata();
        }
        if (mockVideo.onloadeddata) {
          mockVideo.onloadeddata();
        }
      }, 10);

      const result = await generatePromise;

      expect(VideoUrlRegistry.get).toHaveBeenCalledWith('test-video');
      expect(result).toEqual(
        expect.objectContaining({
          dataUrl: 'data:image/jpeg;base64,fromurl',
          generated: true,
        }),
      );
    });

    it('should handle video URL timeout', async () => {
      const mockUrl = 'blob:video-url';
      const mockPlaceholder = {
        dataUrl: 'data:image/jpeg;base64,placeholder',
        generated: false,
        timestamp: new Date().toISOString(),
      };

      vi.mocked(FileHandleRegistry.get).mockReturnValue(undefined);
      vi.mocked(VideoUrlRegistry.get).mockReturnValue(mockUrl);
      vi.mocked(VideoThumbnailService.generatePlaceholderThumbnail).mockReturnValue(
        mockPlaceholder,
      );

      // Don't trigger any video events to simulate timeout
      const result = await ThumbnailGenerator.generateThumbnailForVideo('test-video', 'test.mp4');

      expect(result).toEqual(
        expect.objectContaining({
          dataUrl: mockPlaceholder.dataUrl,
          generated: false,
        }),
      );
    });

    it('should handle video URL error', async () => {
      const mockUrl = 'blob:video-url';
      const mockPlaceholder = {
        dataUrl: 'data:image/jpeg;base64,placeholder',
        generated: false,
        timestamp: new Date().toISOString(),
      };

      vi.mocked(FileHandleRegistry.get).mockReturnValue(undefined);
      vi.mocked(VideoUrlRegistry.get).mockReturnValue(mockUrl);
      vi.mocked(VideoThumbnailService.generatePlaceholderThumbnail).mockReturnValue(
        mockPlaceholder,
      );

      const generatePromise = ThumbnailGenerator.generateThumbnailForVideo(
        'test-video',
        'test.mp4',
      );

      // Simulate video error
      setTimeout(() => {
        if (mockVideo.onerror) {
          mockVideo.onerror();
        }
      }, 10);

      const result = await generatePromise;

      expect(result).toEqual(
        expect.objectContaining({
          dataUrl: mockPlaceholder.dataUrl,
          generated: false,
        }),
      );
    });

    it('should handle video with insufficient readyState', async () => {
      const mockUrl = 'blob:video-url';
      mockVideo.readyState = HTMLMediaElement.HAVE_NOTHING;

      const mockPlaceholder = {
        dataUrl: 'data:image/jpeg;base64,placeholder',
        generated: false,
        timestamp: new Date().toISOString(),
      };

      vi.mocked(FileHandleRegistry.get).mockReturnValue(undefined);
      vi.mocked(VideoUrlRegistry.get).mockReturnValue(mockUrl);
      vi.mocked(VideoThumbnailService.generatePlaceholderThumbnail).mockReturnValue(
        mockPlaceholder,
      );

      const generatePromise = ThumbnailGenerator.generateThumbnailForVideo(
        'test-video',
        'test.mp4',
      );

      // Simulate video loading with insufficient data
      setTimeout(() => {
        if (mockVideo.onloadeddata) {
          mockVideo.onloadeddata();
        }
      }, 10);

      const result = await generatePromise;

      // Should fall back to placeholder since video URL strategy fails
      expect(result).toEqual(
        expect.objectContaining({
          dataUrl: mockPlaceholder.dataUrl,
          generated: false,
        }),
      );
    });

    it('should handle canvas context creation failure', async () => {
      const mockUrl = 'blob:video-url';
      const mockPlaceholder = {
        dataUrl: 'data:image/jpeg;base64,placeholder',
        generated: false,
        timestamp: new Date().toISOString(),
      };

      vi.mocked(FileHandleRegistry.get).mockReturnValue(undefined);
      vi.mocked(VideoUrlRegistry.get).mockReturnValue(mockUrl);
      vi.mocked(VideoThumbnailService.generatePlaceholderThumbnail).mockReturnValue(
        mockPlaceholder,
      );

      // Mock canvas with no context
      vi.spyOn(document, 'createElement').mockImplementation(((tagName: string) => {
        if (tagName === 'video') {
          return mockVideo as unknown as HTMLVideoElement;
        }
        if (tagName === 'canvas') {
          return {
            width: 0,
            height: 0,
            getContext: vi.fn().mockReturnValue(null),
          } as unknown as HTMLCanvasElement;
        }
        return {} as unknown as HTMLElement;
      }) as any);

      const generatePromise = ThumbnailGenerator.generateThumbnailForVideo(
        'test-video',
        'test.mp4',
      );

      // Simulate video loading
      setTimeout(() => {
        if (mockVideo.onloadeddata) {
          mockVideo.onloadeddata();
        }
      }, 10);

      const result = await generatePromise;

      // Should fall back to placeholder
      expect(result).toEqual(
        expect.objectContaining({
          dataUrl: mockPlaceholder.dataUrl,
          generated: false,
        }),
      );
    });
  });

  describe('cache invalidation', () => {
    it('should invalidate expired cache entries', async () => {
      const expiredThumbnail = {
        dataUrl: 'data:image/jpeg;base64,expired',
        generated: true,
        timestamp: new Date(Date.now() - 10 * 60 * 1000).toISOString(), // 10 minutes ago
      };

      // Manually add expired item to cache
      (ThumbnailGenerator as any).thumbnailCache.set('test-video', expiredThumbnail);

      const newThumbnail = {
        dataUrl: 'data:image/jpeg;base64,new',
        generated: false,
        timestamp: new Date().toISOString(),
      };

      vi.mocked(VideoThumbnailService.generatePlaceholderThumbnail).mockReturnValue(newThumbnail);

      const result = await ThumbnailGenerator.generateThumbnailForVideo('test-video', 'test.mp4');

      expect(result).toEqual(
        expect.objectContaining({
          dataUrl: newThumbnail.dataUrl,
          generated: false,
        }),
      );
      expect(VideoThumbnailService.generatePlaceholderThumbnail).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should handle complete failure gracefully', async () => {
      vi.mocked(FileHandleRegistry.get).mockImplementation(() => {
        throw new Error('Registry error');
      });
      vi.mocked(VideoUrlRegistry.get).mockImplementation(() => {
        throw new Error('URL registry error');
      });
      vi.mocked(VideoThumbnailService.generatePlaceholderThumbnail).mockImplementation(() => {
        throw new Error('Placeholder generation error');
      });

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await ThumbnailGenerator.generateThumbnailForVideo('test-video', 'test.mp4');

      expect(result).toEqual(
        expect.objectContaining({
          dataUrl: expect.any(String),
          generated: false,
        }),
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to generate thumbnail for video test-video'),
        expect.any(Error),
      );

      consoleSpy.mockRestore();
    });

    it('should use default filename when none provided', async () => {
      const mockPlaceholder = {
        dataUrl: 'data:image/jpeg;base64,default',
        generated: false,
        timestamp: new Date().toISOString(),
      };

      vi.mocked(VideoThumbnailService.generatePlaceholderThumbnail).mockReturnValue(
        mockPlaceholder,
      );

      const result = await ThumbnailGenerator.generateThumbnailForVideo('test-video');

      expect(VideoThumbnailService.generatePlaceholderThumbnail).toHaveBeenCalledWith(
        'video-test-video',
      );
      expect(result).toEqual(
        expect.objectContaining({
          dataUrl: mockPlaceholder.dataUrl,
          generated: false,
        }),
      );
    });
  });
});

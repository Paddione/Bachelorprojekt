import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AdaptiveThumbnailManager } from './adaptive-thumbnail-manager';
import { WebCodecsThumbnailService } from './webcodecs-thumbnail-service';

// Mock the video thumbnail service dependencies
vi.mock('./video-thumbnail', () => ({
  VideoThumbnailService: {
    generateThumbnail: vi.fn().mockResolvedValue({
      dataUrl: 'data:image/jpeg;base64,test',
      generated: true,
      timestamp: '2024-01-01T12:00:00Z'
    }),
    generatePlaceholderThumbnail: vi.fn().mockReturnValue({
      dataUrl: 'data:image/svg+xml;base64,placeholder',
      generated: false,
      timestamp: '2024-01-01T12:00:00Z'
    })
  }
}));

vi.mock('./thumbnail-worker-bridge', () => ({
  encodeImageBitmapInWorker: vi.fn().mockResolvedValue('data:image/webp;base64,worker'),
  supportsThumbnailWorker: vi.fn().mockReturnValue(true)
}));

describe('WebCodecsThumbnailService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should check WebCodecs support', () => {
    // Mock VideoDecoder not being available
    const originalVideoDecoder = (globalThis as any).VideoDecoder;
    const originalVideoFrame = (globalThis as any).VideoFrame;
    delete (globalThis as any).VideoDecoder;
    delete (globalThis as any).VideoFrame;

    const support = WebCodecsThumbnailService.checkWebCodecsSupport();
    expect(support.isSupported).toBe(false);
    expect(support.hasVideoDecoder).toBe(false);

    // Mock VideoDecoder being available
    (globalThis as any).VideoDecoder = vi.fn();
    (globalThis as any).VideoFrame = vi.fn();

    const supportWithWebCodecs = WebCodecsThumbnailService.checkWebCodecsSupport();
    expect(supportWithWebCodecs.isSupported).toBe(true);
    expect(supportWithWebCodecs.hasVideoDecoder).toBe(true);

    // Restore original state
    if (originalVideoDecoder) {
      (globalThis as any).VideoDecoder = originalVideoDecoder;
    } else {
      delete (globalThis as any).VideoDecoder;
    }
    if (originalVideoFrame) {
      (globalThis as any).VideoFrame = originalVideoFrame;
    } else {
      delete (globalThis as any).VideoFrame;
    }
  });

  it('should determine optimal thumbnail method', () => {
    // Test basic method when no advanced features available
    delete (globalThis as any).VideoDecoder;
    delete (globalThis as any).createImageBitmap;
    delete (globalThis as any).OffscreenCanvas;

    const method = WebCodecsThumbnailService.getOptimalThumbnailMethod();
    expect(method).toBe('basic');
  });

  it('should generate thumbnail using optimal method', async () => {
    const file = new File(['test'], 'test.mp4', { type: 'video/mp4' });
    
    const result = await WebCodecsThumbnailService.generateOptimalThumbnail(file);
    
    expect(result).toBeDefined();
    expect(result.thumbnail).toBeDefined();
    expect(result.thumbnail.dataUrl).toBeDefined();
    expect(result.metadata).toBeDefined();
  });
});

describe('AdaptiveThumbnailManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    AdaptiveThumbnailManager.clearCache();
  });

  it('should generate adaptive thumbnail with performance metrics', async () => {
    const file = new File(['test'], 'test.mp4', { 
      type: 'video/mp4',
      lastModified: Date.now()
    });
    
    const result = await AdaptiveThumbnailManager.generateAdaptiveThumbnail(file, {
      quality: 'medium',
      speed: 'balanced'
    });
    
    expect(result).toBeDefined();
    expect(result.thumbnail).toBeDefined();
    expect(result.performanceMetrics).toBeDefined();
    expect(result.performanceMetrics.duration).toBeGreaterThanOrEqual(0);
    expect(result.performanceMetrics.method).toMatch(/basic|enhanced|webcodecs/);
  });

  it('should use cache when available', async () => {
    const file = new File(['test'], 'test.mp4', { 
      type: 'video/mp4',
      lastModified: Date.now()
    });
    
    // First call should generate thumbnail
    const result1 = await AdaptiveThumbnailManager.generateAdaptiveThumbnail(file);
    expect(result1.performanceMetrics.cacheHit).toBe(false);
    
    // Second call should use cache
    const result2 = await AdaptiveThumbnailManager.generateAdaptiveThumbnail(file);
    expect(result2.performanceMetrics.cacheHit).toBe(true);
  });

  it('should provide cache statistics', () => {
    const stats = AdaptiveThumbnailManager.getCacheStats();
    
    expect(stats).toBeDefined();
    expect(typeof stats.entryCount).toBe('number');
    expect(typeof stats.estimatedSizeMB).toBe('number');
    expect(typeof stats.hitRate).toBe('number');
  });

  it('should provide performance report', () => {
    const report = AdaptiveThumbnailManager.getPerformanceReport();
    
    expect(report).toBeDefined();
    expect(typeof report.totalOperations).toBe('number');
    expect(typeof report.averageDuration).toBe('number');
    expect(typeof report.successRate).toBe('number');
    expect(typeof report.methodDistribution).toBe('object');
  });

  it('should clear cache', () => {
    AdaptiveThumbnailManager.clearCache();
    const stats = AdaptiveThumbnailManager.getCacheStats();
    expect(stats.entryCount).toBe(0);
  });

  it('should handle different quality settings', async () => {
    const file = new File(['test'], 'test.mp4', { type: 'video/mp4' });
    
    const lowQuality = await AdaptiveThumbnailManager.generateAdaptiveThumbnail(file, {
      quality: 'low',
      speed: 'fast'
    });
    
    const highQuality = await AdaptiveThumbnailManager.generateAdaptiveThumbnail(file, {
      quality: 'high',
      speed: 'quality'
    });
    
    expect(lowQuality.performanceMetrics.method).toBeDefined();
    expect(highQuality.performanceMetrics.method).toBeDefined();
  });
});

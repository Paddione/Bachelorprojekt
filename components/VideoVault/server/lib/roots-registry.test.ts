import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RootsRegistry } from './roots-registry';

describe('RootsRegistry', () => {
  beforeEach(() => {
    delete process.env.MEDIA_ROOTS;
    delete process.env.HDD_EXT_DIR;
    delete process.env.MEDIA_ROOT;
    RootsRegistry.reset();
  });

  afterEach(() => {
    delete process.env.MEDIA_ROOTS;
    delete process.env.HDD_EXT_DIR;
    delete process.env.MEDIA_ROOT;
    RootsRegistry.reset();
  });

  describe('resolveVideoDir', () => {
    it('resolves hdd-ext via HDD_EXT_DIR', () => {
      process.env.HDD_EXT_DIR = '/mnt/hdd-ext';
      RootsRegistry.init();
      const dir = RootsRegistry.resolveVideoDir({ rootKey: 'hdd-ext', path: 'clips/scene.mp4' });
      expect(dir).toBe('/mnt/hdd-ext/clips');
    });

    it('resolves via MEDIA_ROOTS env', () => {
      process.env.MEDIA_ROOTS = 'movies:/mnt/media/movies,hdd-ext:/mnt/hdd-ext';
      RootsRegistry.init();
      const dir = RootsRegistry.resolveVideoDir({ rootKey: 'movies', path: 'action/film.mp4' });
      expect(dir).toBe('/mnt/media/movies/action');
    });

    it('falls back to MEDIA_ROOT for videos without rootKey', () => {
      process.env.MEDIA_ROOT = '/mnt/media';
      RootsRegistry.init();
      const dir = RootsRegistry.resolveVideoDir({ path: 'scenes/video.mp4' });
      expect(dir).toBe('/mnt/media/scenes');
    });

    it('returns null for unresolvable root', () => {
      RootsRegistry.init();
      const dir = RootsRegistry.resolveVideoDir({ rootKey: 'unknown', path: 'video.mp4' });
      expect(dir).toBeNull();
    });

    it('MEDIA_ROOTS takes priority over HDD_EXT_DIR', () => {
      process.env.MEDIA_ROOTS = 'hdd-ext:/custom/path';
      process.env.HDD_EXT_DIR = '/default/hdd-ext';
      RootsRegistry.init();
      const dir = RootsRegistry.resolveVideoDir({ rootKey: 'hdd-ext', path: 'video.mp4' });
      expect(dir).toBe('/custom/path');
    });

    it('handles video in root directory (no subdirectory)', () => {
      process.env.MEDIA_ROOTS = 'movies:/mnt/movies';
      RootsRegistry.init();
      const dir = RootsRegistry.resolveVideoDir({ rootKey: 'movies', path: 'video.mp4' });
      expect(dir).toBe('/mnt/movies');
    });
  });

  describe('registerRoot', () => {
    it('allows dynamic root registration', () => {
      RootsRegistry.init();
      RootsRegistry.registerRoot('custom', '/mnt/custom');
      const dir = RootsRegistry.resolveVideoDir({ rootKey: 'custom', path: 'sub/file.mp4' });
      expect(dir).toBe('/mnt/custom/sub');
    });
  });

  describe('listRoots', () => {
    it('returns all registered roots', () => {
      process.env.MEDIA_ROOTS = 'a:/path/a,b:/path/b';
      RootsRegistry.init();
      expect(RootsRegistry.listRoots()).toEqual({ a: '/path/a', b: '/path/b' });
    });
  });
});

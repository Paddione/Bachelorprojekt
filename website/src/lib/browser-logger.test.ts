import { beforeEach, describe, it, expect, vi } from 'vitest';
import { browserLogger } from './browser-logger';

describe('browserLogger', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockClear();
    vi.spyOn(console, 'warn').mockClear();
    vi.spyOn(console, 'log').mockClear();
  });

  describe('error()', () => {
    it('logs error message with string', () => {
      browserLogger.error('test error');
      expect(console.error).toHaveBeenCalledWith('[browser]', 'test error', '');
    });

    it('logs error message with object meta', () => {
      const meta = { code: 500, detail: 'error' };
      browserLogger.error(meta);
      expect(console.error).toHaveBeenCalledWith('[browser]', '', meta);
    });

    it('logs error message with string and meta objects', () => {
      const meta = { code: 500 };
      browserLogger.error(meta, 'custom msg');
      expect(console.error).toHaveBeenCalledWith('[browser]', 'custom msg', meta);
    });
  });

  describe('warn()', () => {
    it('logs warning message with string', () => {
      browserLogger.warn('test warn');
      expect(console.warn).toHaveBeenCalledWith('[browser]', 'test warn', '');
    });

    it('logs warning message with object meta', () => {
      const meta = { code: 400 };
      browserLogger.warn(meta);
      expect(console.warn).toHaveBeenCalledWith('[browser]', '', meta);
    });

    it('logs warning message with string and meta objects', () => {
      const meta = { code: 400 };
      browserLogger.warn(meta, 'custom msg');
      expect(console.warn).toHaveBeenCalledWith('[browser]', 'custom msg', meta);
    });
  });

  describe('info()', () => {
    it('logs info message with string', () => {
      browserLogger.info('test info');
      expect(console.log).toHaveBeenCalledWith('[browser]', 'test info', '');
    });

    it('logs info message with object meta', () => {
      const meta = { status: 'ok' };
      browserLogger.info(meta);
      expect(console.log).toHaveBeenCalledWith('[browser]', '', meta);
    });

    it('logs info message with string and meta objects', () => {
      const meta = { status: 'ok' };
      browserLogger.info(meta, 'custom msg');
      expect(console.log).toHaveBeenCalledWith('[browser]', 'custom msg', meta);
    });
  });

  describe('isolation test', () => {
    it('logs all three levels independently (no cross-contamination)', () => {
      vi.spyOn(console, 'error').mockClear();
      vi.spyOn(console, 'warn').mockClear();
      vi.spyOn(console, 'log').mockClear();

      browserLogger.error('error msg');
      browserLogger.warn('warn msg');
      browserLogger.info('info msg');

      expect(console.error).toHaveBeenCalledTimes(1);
      expect(console.warn).toHaveBeenCalledTimes(1);
      expect(console.log).toHaveBeenCalledTimes(1);
    });
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { toast } from '@/hooks/use-toast';
import { 
  handleError, 
  createError, 
  isVideoVaultError, 
  getErrorCode,
  ErrorCodes,
  VideoVaultError 
} from './error-handler';

// Mock the toast hook
vi.mock('@/hooks/use-toast', () => ({
  toast: vi.fn(),
}));

describe('error-handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('VideoVaultError', () => {
    it('creates error with correct properties', () => {
      const originalError = new Error('Original error');
      const context = { operation: 'test', fileName: 'test.mp4' };
      
      const error = createError(
        ErrorCodes.VIDEO_LOAD_FAILED,
        'Test message',
        context,
        originalError
      );

      expect(error).toBeInstanceOf(VideoVaultError);
      expect(error.message).toBe('Test message');
      expect(error.code).toBe(ErrorCodes.VIDEO_LOAD_FAILED);
      expect(error.context).toEqual(context);
      expect(error.originalError).toBe(originalError);
      expect(error.name).toBe('VideoVaultError');
    });
  });

  describe('isVideoVaultError', () => {
    it('returns true for VideoVaultError instances', () => {
      const error = createError(ErrorCodes.UNKNOWN_ERROR, 'Test');
      expect(isVideoVaultError(error)).toBe(true);
    });

    it('returns false for other error types', () => {
      expect(isVideoVaultError(new Error('Test'))).toBe(false);
      expect(isVideoVaultError('string error')).toBe(false);
      expect(isVideoVaultError(null)).toBe(false);
    });
  });

  describe('getErrorCode', () => {
    it('returns error code for VideoVaultError', () => {
      const error = createError(ErrorCodes.PERMISSION_DENIED, 'Test');
      expect(getErrorCode(error)).toBe(ErrorCodes.PERMISSION_DENIED);
    });

    it('returns UNKNOWN_ERROR for other error types', () => {
      expect(getErrorCode(new Error('Test'))).toBe(ErrorCodes.UNKNOWN_ERROR);
      expect(getErrorCode('string error')).toBe(ErrorCodes.UNKNOWN_ERROR);
    });
  });

  describe('handleError', () => {
    it('handles VideoVaultError correctly', () => {
      const error = createError(
        ErrorCodes.PERMISSION_DENIED,
        'Permission denied',
        { directoryName: 'test-dir' }
      );

      handleError(error);

      expect(toast).toHaveBeenCalledWith({
        title: 'Error',
        description: 'Permission denied for "test-dir". Please grant access when prompted.',
        variant: 'destructive',
      });
    });

    it('maps browser errors to appropriate error codes', () => {
      const notAllowedError = new Error('Permission denied');
      notAllowedError.name = 'NotAllowedError';

      handleError(notAllowedError);

      expect(toast).toHaveBeenCalledWith({
        title: 'Error',
        description: 'Permission denied. Please grant access when prompted.',
        variant: 'destructive',
      });
    });

    it('maps quota exceeded errors', () => {
      const quotaError = new Error('Quota exceeded');
      quotaError.name = 'QuotaExceededError';

      handleError(quotaError);

      expect(toast).toHaveBeenCalledWith({
        title: 'Error',
        description: 'Storage quota exceeded. Please free up some space and try again.',
        variant: 'destructive',
      });
    });

    it('maps file not found errors', () => {
      const notFoundError = new Error('File not found');
      notFoundError.name = 'NotFoundError';

      handleError(notFoundError);

      expect(toast).toHaveBeenCalledWith({
        title: 'Error',
        description: 'File not found. It may have been moved or deleted.',
        variant: 'destructive',
      });
    });

    it('maps unsupported feature errors', () => {
      const notSupportedError = new Error('Not supported');
      notSupportedError.name = 'NotSupportedError';

      handleError(notSupportedError);

      expect(toast).toHaveBeenCalledWith({
        title: 'Error',
        description: 'Your browser does not support the File System Access API. Please use Chrome, Edge, or another Chromium-based browser.',
        variant: 'destructive',
      });
    });

    it('maps network errors', () => {
      const networkError = new Error('Network error occurred');

      handleError(networkError);

      expect(toast).toHaveBeenCalledWith({
        title: 'Error',
        description: 'Network error occurred. Please check your connection and try again.',
        variant: 'destructive',
      });
    });

    it('handles unknown errors with context', () => {
      const unknownError = new Error('Unknown error');
      
      handleError(unknownError, { operation: 'scanning directory' });

      expect(toast).toHaveBeenCalledWith({
        title: 'Error',
        description: 'An unexpected error occurred while scanning directory. Please try again.',
        variant: 'destructive',
      });
    });

    it('handles non-Error objects', () => {
      handleError('String error' as unknown as Error);

      expect(toast).toHaveBeenCalledWith({
        title: 'Error',
        description: 'An unexpected error occurred. Please try again.',
        variant: 'destructive',
      });
    });

    it('logs errors to console', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const error = new Error('Test error');

      handleError(error);

      expect(consoleSpy).toHaveBeenCalledWith('Error handled by error handler:', error);

      consoleSpy.mockRestore();
    });
  });

  describe('error messages', () => {
    it('provides contextual error messages', () => {
      const error = createError(
        ErrorCodes.FILE_NOT_FOUND,
        'File not found',
        { fileName: 'video.mp4' }
      );

      handleError(error);

      expect(toast).toHaveBeenCalledWith({
        title: 'Error',
        description: 'File not found: "video.mp4". It may have been moved or deleted.',
        variant: 'destructive',
      });
    });

    it('handles missing context gracefully', () => {
      const error = createError(ErrorCodes.FILE_NOT_FOUND, 'File not found');

      handleError(error);

      expect(toast).toHaveBeenCalledWith({
        title: 'Error',
        description: 'File not found. It may have been moved or deleted.',
        variant: 'destructive',
      });
    });
  });
});

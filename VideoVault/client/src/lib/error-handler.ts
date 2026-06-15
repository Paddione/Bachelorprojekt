import { toast } from '@/hooks/use-toast';
import { AppSettingsService } from '@/services/app-settings';
import { ErrorCodes, type ErrorCode } from '@shared/errors';
import type { StoredError } from '@shared/errors';
export type { StoredError } from '@shared/errors';
// Re-export for existing imports in tests and client code
export { ErrorCodes } from '@shared/errors';

export interface ErrorContext {
  operation?: string;
  fileName?: string;
  directoryName?: string;
}

export class VideoVaultError extends Error {
  constructor(
    message: string,
    public code: string,
    public context?: ErrorContext,
    public originalError?: Error,
  ) {
    super(message);
    this.name = 'VideoVaultError';
  }
}

// ErrorCodes and ErrorCode are now shared from @shared/errors

const errorMessages: Record<ErrorCode, (context?: ErrorContext) => string> = {
  [ErrorCodes.FS_API_UNSUPPORTED]: () =>
    'Your browser does not support the File System Access API. Please use Chrome, Edge, or another Chromium-based browser.',

  [ErrorCodes.PERMISSION_DENIED]: (context) =>
    `Permission denied${context?.directoryName ? ` for "${context.directoryName}"` : ''}. Please grant access when prompted.`,

  [ErrorCodes.QUOTA_EXCEEDED]: () =>
    'Storage quota exceeded. Please free up some space and try again.',

  [ErrorCodes.FILE_NOT_FOUND]: (context) =>
    `File not found${context?.fileName ? `: "${context.fileName}"` : ''}. It may have been moved or deleted.`,

  [ErrorCodes.ACCESS_DENIED]: (context) =>
    `Access denied${context?.fileName ? ` to "${context.fileName}"` : ''}. Check file permissions.`,

  [ErrorCodes.VIDEO_LOAD_FAILED]: (context) =>
    `Failed to load video${context?.fileName ? `: "${context.fileName}"` : ''}. The file may be corrupted or in an unsupported format.`,

  [ErrorCodes.THUMBNAIL_GENERATION_FAILED]: (context) =>
    `Failed to generate thumbnail${context?.fileName ? ` for "${context.fileName}"` : ''}. This won't affect video playback.`,

  [ErrorCodes.METADATA_EXTRACTION_FAILED]: (context) =>
    `Failed to extract video metadata${context?.fileName ? ` from "${context.fileName}"` : ''}. Some features may be limited.`,

  [ErrorCodes.STORAGE_QUOTA_EXCEEDED]: () =>
    'Browser storage quota exceeded. Some settings may not be saved.',

  [ErrorCodes.NETWORK_ERROR]: () =>
    'Network error occurred. Please check your connection and try again.',

  // Server errors
  [ErrorCodes.SERVER_UNAVAILABLE]: () => 'Server is unavailable. Please try again later.',

  [ErrorCodes.UNKNOWN_ERROR]: (context) =>
    `An unexpected error occurred${context?.operation ? ` while ${context.operation}` : ''}. Please try again.`,

  [ErrorCodes.VALIDATION_ERROR]: (context) =>
    `Invalid input${context?.operation ? ` for ${context.operation}` : ''}. Please check your input and try again.`,
};

export function handleError(error: Error | VideoVaultError, context?: ErrorContext): void {
  // Silently ignore user-initiated aborts (e.g., canceling directory picker)
  if (
    error instanceof Error &&
    (error.name === 'AbortError' ||
      /user aborted a request/i.test(error.message) ||
      /aborted/i.test(error.name))
  ) {
    // No toast, no logging, no persistence — this is an expected user action
    return;
  }
  // Always log the primary error event for visibility and testability
  console.error('Error handled by error handler:', error);

  let errorCode: ErrorCode = ErrorCodes.UNKNOWN_ERROR;
  let message: string;
  let originalError: Error | undefined;
  let errorContext = context;

  if (error instanceof VideoVaultError) {
    errorCode = error.code as ErrorCode;
    message = error.message;
    originalError = error.originalError;
    errorContext = error.context || context;
  } else if (error instanceof Error) {
    // Map common browser errors to our error codes
    if (error.name === 'NotAllowedError' || error.message.includes('permission')) {
      errorCode = ErrorCodes.PERMISSION_DENIED;
    } else if (error.name === 'QuotaExceededError' || error.message.includes('quota')) {
      errorCode = ErrorCodes.QUOTA_EXCEEDED;
    } else if (error.name === 'NotFoundError' || error.message.includes('not found')) {
      errorCode = ErrorCodes.FILE_NOT_FOUND;
    } else if (error.name === 'NotSupportedError' || error.message.includes('not supported')) {
      errorCode = ErrorCodes.FS_API_UNSUPPORTED;
    } else if (
      error.message.toLowerCase().includes('network') ||
      error.message.toLowerCase().includes('fetch') ||
      error.message.toLowerCase().includes('connection')
    ) {
      errorCode = ErrorCodes.NETWORK_ERROR;
    }

    message = error.message;
    originalError = error;
  } else {
    // For non-Error objects, use the string representation
    message = String(error);
    // Don't change errorCode from UNKNOWN_ERROR for non-Error objects
  }

  // Get user-friendly message from our error message mapping
  const userMessage = errorMessages[errorCode](errorContext);

  // Show toast notification
  toast({
    title: 'Error',
    description: userMessage,
    variant: 'destructive',
  });

  // Store error for admin dashboard
  const storedError: StoredError = {
    id: `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    timestamp: new Date().toISOString(),
    message,
    code: errorCode,
    severity: getSeverityForErrorCode(errorCode),
    context: errorContext,
    userFriendly: {
      title: 'Error',
      message: userMessage,
      recoverable: true,
    },
  };
  storeError(storedError);

  // Log additional details in development
  if (process.env.NODE_ENV === 'development' && originalError) {
    console.group('Error Details (Development)');
    console.error('Original Error:', originalError);
    console.error('Error Code:', errorCode);
    console.error('Context:', errorContext);
    console.groupEnd();
  }
}

export function createError(
  code: ErrorCode,
  message: string,
  context?: ErrorContext,
  originalError?: Error,
): VideoVaultError {
  return new VideoVaultError(message, code, context, originalError);
}

export function isVideoVaultError(error: unknown): error is VideoVaultError {
  return error instanceof VideoVaultError;
}

export function getErrorCode(error: unknown): ErrorCode {
  if (isVideoVaultError(error)) {
    return error.code as ErrorCode;
  }
  return ErrorCodes.UNKNOWN_ERROR;
}

// Types for error dashboard
// StoredError is now shared from @shared/errors

// Error storage functions for admin dashboard
let ERRORS_CACHE: StoredError[] = [];

export function getStoredErrors(): StoredError[] {
  // Return in-memory cache and refresh in background
  void (async () => {
    try {
      const remote = await AppSettingsService.get<StoredError[]>('videovault_error_logs');
      if (Array.isArray(remote)) {
        ERRORS_CACHE = remote;
      }
    } catch {}
  })();
  return ERRORS_CACHE;
}

export function clearStoredErrors(): void {
  ERRORS_CACHE = [];
  void (async () => {
    try {
      await AppSettingsService.set('videovault_error_logs', [] as StoredError[]);
    } catch {}
  })();
}

function storeError(storedError: StoredError): void {
  // add to cache and persist remotely (best-effort)
  ERRORS_CACHE.unshift(storedError);
  if (ERRORS_CACHE.length > 100) ERRORS_CACHE = ERRORS_CACHE.slice(0, 100);
  void (async () => {
    try {
      await AppSettingsService.set('videovault_error_logs', ERRORS_CACHE);
    } catch {}
  })();
}

// Type alias for backwards compatibility
export type UserFriendlyError = StoredError;

function getSeverityForErrorCode(errorCode: ErrorCode): StoredError['severity'] {
  switch (errorCode) {
    case ErrorCodes.FS_API_UNSUPPORTED:
    case ErrorCodes.STORAGE_QUOTA_EXCEEDED:
      return 'high';
    case ErrorCodes.PERMISSION_DENIED:
    case ErrorCodes.ACCESS_DENIED:
      return 'medium';
    case ErrorCodes.FILE_NOT_FOUND:
    case ErrorCodes.THUMBNAIL_GENERATION_FAILED:
    case ErrorCodes.METADATA_EXTRACTION_FAILED:
      return 'low';
    case ErrorCodes.VIDEO_LOAD_FAILED:
    case ErrorCodes.NETWORK_ERROR:
    case ErrorCodes.QUOTA_EXCEEDED:
    case ErrorCodes.VALIDATION_ERROR:
      return 'medium';
    case ErrorCodes.UNKNOWN_ERROR:
    default:
      return 'medium';
  }
}

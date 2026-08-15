import { z } from 'zod';

export const ErrorCodes = {
  // Client-side and general errors
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NETWORK_ERROR: 'NETWORK_ERROR',

  // Browser APIs
  FS_API_UNSUPPORTED: 'FS_API_UNSUPPORTED',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  QUOTA_EXCEEDED: 'QUOTA_EXCEEDED',
  STORAGE_QUOTA_EXCEEDED: 'STORAGE_QUOTA_EXCEEDED',
  FILE_NOT_FOUND: 'FILE_NOT_FOUND',
  ACCESS_DENIED: 'ACCESS_DENIED',

  // Video processing
  VIDEO_LOAD_FAILED: 'VIDEO_LOAD_FAILED',
  THUMBNAIL_GENERATION_FAILED: 'THUMBNAIL_GENERATION_FAILED',
  METADATA_EXTRACTION_FAILED: 'METADATA_EXTRACTION_FAILED',

  // Server
  SERVER_UNAVAILABLE: 'SERVER_UNAVAILABLE',
} as const;

export type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes];

const ERROR_CODE_VALUES = Object.values(ErrorCodes) as [string, ...string[]];

export const apiErrorSchema = z.object({
  code: z.enum(ERROR_CODE_VALUES).or(z.string()),
  message: z.string(),
  details: z.any().optional(),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

export const storedErrorSchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  message: z.string(),
  code: z.string(),
  severity: z.union([
    z.literal('low'),
    z.literal('medium'),
    z.literal('high'),
    z.literal('critical'),
  ]),
  context: z.record(z.any()).optional(),
  userFriendly: z.object({
    title: z.string(),
    message: z.string(),
    actionable: z.string().optional(),
    recoverable: z.boolean().optional(),
  }),
});
export type StoredError = z.infer<typeof storedErrorSchema>;

export const errorSeveritySchema = z.union([
  z.literal('low'), z.literal('medium'), z.literal('high'), z.literal('critical'),
]);
export type ErrorSeverity = z.infer<typeof errorSeveritySchema>;

// Client error report payload
export const clientErrorReportSchema = z.object({
  errorId: z.string(),
  timestamp: z.string(),
  message: z.string(),
  code: z.string(),
  severity: errorSeveritySchema,
  context: z.record(z.any()).optional(),
  userAgent: z.string().optional(),
  url: z.string().optional(),
  stack: z.string().optional(),
});
export type ClientErrorReport = z.infer<typeof clientErrorReportSchema>;

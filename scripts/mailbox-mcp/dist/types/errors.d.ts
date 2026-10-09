/**
 * Custom error types for the Mailbox MCP Server
 * Provides structured error handling with context and categorization
 */
export declare enum ErrorCode {
    CONNECTION_FAILED = "CONNECTION_FAILED",
    CONNECTION_TIMEOUT = "CONNECTION_TIMEOUT",
    CONNECTION_REFUSED = "CONNECTION_REFUSED",
    CONNECTION_LOST = "CONNECTION_LOST",
    AUTH_FAILED = "AUTH_FAILED",
    AUTH_INVALID_CREDENTIALS = "AUTH_INVALID_CREDENTIALS",
    AUTH_TOKEN_EXPIRED = "AUTH_TOKEN_EXPIRED",
    AUTH_INSUFFICIENT_PERMISSIONS = "AUTH_INSUFFICIENT_PERMISSIONS",
    RATE_LIMIT_EXCEEDED = "RATE_LIMIT_EXCEEDED",
    QUOTA_EXCEEDED = "QUOTA_EXCEEDED",
    VALIDATION_FAILED = "VALIDATION_FAILED",
    INVALID_INPUT = "INVALID_INPUT",
    MISSING_REQUIRED_FIELD = "MISSING_REQUIRED_FIELD",
    INVALID_FORMAT = "INVALID_FORMAT",
    MAILBOX_SERVER_ERROR = "MAILBOX_SERVER_ERROR",
    MAILBOX_MAINTENANCE = "MAILBOX_MAINTENANCE",
    MAILBOX_FEATURE_UNAVAILABLE = "MAILBOX_FEATURE_UNAVAILABLE",
    EMAIL_NOT_FOUND = "EMAIL_NOT_FOUND",
    FOLDER_NOT_FOUND = "FOLDER_NOT_FOUND",
    ATTACHMENT_TOO_LARGE = "ATTACHMENT_TOO_LARGE",
    INVALID_EMAIL_ADDRESS = "INVALID_EMAIL_ADDRESS",
    CALENDAR_NOT_FOUND = "CALENDAR_NOT_FOUND",
    EVENT_NOT_FOUND = "EVENT_NOT_FOUND",
    INVALID_DATE_RANGE = "INVALID_DATE_RANGE",
    CALENDAR_CONFLICT = "CALENDAR_CONFLICT",
    CACHE_ERROR = "CACHE_ERROR",
    CACHE_MISS = "CACHE_MISS",
    CONFIG_INVALID = "CONFIG_INVALID",
    CONFIG_MISSING = "CONFIG_MISSING",
    INTERNAL_ERROR = "INTERNAL_ERROR",
    NOT_IMPLEMENTED = "NOT_IMPLEMENTED",
    OPERATION_FAILED = "OPERATION_FAILED"
}
export interface ErrorContext {
    operation?: string;
    service?: string;
    timestamp?: Date;
    requestId?: string;
    userId?: string;
    details?: Record<string, unknown>;
}
/**
 * Base error class for all MCP server errors
 */
export declare abstract class MCPError extends Error {
    readonly code: ErrorCode;
    readonly context: ErrorContext;
    readonly isRetryable: boolean;
    readonly timestamp: Date;
    constructor(message: string, code: ErrorCode, context?: ErrorContext, isRetryable?: boolean);
    /**
     * Get a serializable representation of the error
     */
    toJSON(): {
        name: string;
        message: string;
        code: ErrorCode;
        context: ErrorContext;
        isRetryable: boolean;
        timestamp: Date;
        stack: string | undefined;
    };
    /**
     * Get a user-friendly error message
     */
    getUserMessage(): string;
}
/**
 * Connection-related errors
 */
export declare class ConnectionError extends MCPError {
    constructor(message: string, code?: ErrorCode, context?: ErrorContext);
    getUserMessage(): string;
}
/**
 * Authentication-related errors
 */
export declare class AuthenticationError extends MCPError {
    constructor(message: string, code?: ErrorCode, context?: ErrorContext);
    getUserMessage(): string;
}
/**
 * Rate limiting errors
 */
export declare class RateLimitError extends MCPError {
    readonly retryAfter?: number;
    constructor(message: string, retryAfter?: number, context?: ErrorContext);
    getUserMessage(): string;
}
/**
 * Input validation errors
 */
export declare class ValidationError extends MCPError {
    readonly field?: string;
    readonly value?: unknown;
    constructor(message: string, field?: string, value?: unknown, context?: ErrorContext);
    getUserMessage(): string;
}
/**
 * Mailbox.org specific errors
 */
export declare class MailboxError extends MCPError {
    readonly serverCode?: string;
    constructor(message: string, code?: ErrorCode, serverCode?: string, context?: ErrorContext);
    getUserMessage(): string;
}
/**
 * Email-specific errors
 */
export declare class EmailError extends MCPError {
    readonly emailId?: string;
    readonly folder?: string;
    constructor(message: string, code: ErrorCode, emailId?: string, folder?: string, context?: ErrorContext);
    getUserMessage(): string;
}
/**
 * Calendar-specific errors
 */
export declare class CalendarError extends MCPError {
    readonly calendarId?: string;
    readonly eventId?: string;
    constructor(message: string, code: ErrorCode, calendarId?: string, eventId?: string, context?: ErrorContext);
    getUserMessage(): string;
}
/**
 * Cache-related errors
 */
export declare class CacheError extends MCPError {
    constructor(message: string, code?: ErrorCode, context?: ErrorContext);
    getUserMessage(): string;
}
/**
 * Configuration errors
 */
export declare class ConfigurationError extends MCPError {
    readonly configKey?: string;
    constructor(message: string, configKey?: string, context?: ErrorContext);
    getUserMessage(): string;
}
/**
 * Check if an error is retryable
 */
export declare function isRetryableError(error: Error): boolean;
/**
 * Extract error code from any error
 */
export declare function getErrorCode(error: Error): ErrorCode;
/**
 * Get user-friendly message from any error
 */
export declare function getUserMessage(error: Error): string;
/**
 * Convert any error to MCPError
 */
export declare function toMCPError(error: Error, context?: ErrorContext): MCPError;
/**
 * @deprecated Use individual functions instead: isRetryableError, getErrorCode, getUserMessage, toMCPError
 */
export declare const ErrorUtils: {
    isRetryable: typeof isRetryableError;
    getErrorCode: typeof getErrorCode;
    getUserMessage: typeof getUserMessage;
    toMCPError: typeof toMCPError;
};

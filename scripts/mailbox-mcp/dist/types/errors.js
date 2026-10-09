/**
 * Custom error types for the Mailbox MCP Server
 * Provides structured error handling with context and categorization
 */
export var ErrorCode;
(function (ErrorCode) {
    // Connection errors
    ErrorCode["CONNECTION_FAILED"] = "CONNECTION_FAILED";
    ErrorCode["CONNECTION_TIMEOUT"] = "CONNECTION_TIMEOUT";
    ErrorCode["CONNECTION_REFUSED"] = "CONNECTION_REFUSED";
    ErrorCode["CONNECTION_LOST"] = "CONNECTION_LOST";
    // Authentication errors
    ErrorCode["AUTH_FAILED"] = "AUTH_FAILED";
    ErrorCode["AUTH_INVALID_CREDENTIALS"] = "AUTH_INVALID_CREDENTIALS";
    ErrorCode["AUTH_TOKEN_EXPIRED"] = "AUTH_TOKEN_EXPIRED";
    ErrorCode["AUTH_INSUFFICIENT_PERMISSIONS"] = "AUTH_INSUFFICIENT_PERMISSIONS";
    // Rate limiting errors
    ErrorCode["RATE_LIMIT_EXCEEDED"] = "RATE_LIMIT_EXCEEDED";
    ErrorCode["QUOTA_EXCEEDED"] = "QUOTA_EXCEEDED";
    // Validation errors
    ErrorCode["VALIDATION_FAILED"] = "VALIDATION_FAILED";
    ErrorCode["INVALID_INPUT"] = "INVALID_INPUT";
    ErrorCode["MISSING_REQUIRED_FIELD"] = "MISSING_REQUIRED_FIELD";
    ErrorCode["INVALID_FORMAT"] = "INVALID_FORMAT";
    // Mailbox.org specific errors
    ErrorCode["MAILBOX_SERVER_ERROR"] = "MAILBOX_SERVER_ERROR";
    ErrorCode["MAILBOX_MAINTENANCE"] = "MAILBOX_MAINTENANCE";
    ErrorCode["MAILBOX_FEATURE_UNAVAILABLE"] = "MAILBOX_FEATURE_UNAVAILABLE";
    // Email specific errors
    ErrorCode["EMAIL_NOT_FOUND"] = "EMAIL_NOT_FOUND";
    ErrorCode["FOLDER_NOT_FOUND"] = "FOLDER_NOT_FOUND";
    ErrorCode["ATTACHMENT_TOO_LARGE"] = "ATTACHMENT_TOO_LARGE";
    ErrorCode["INVALID_EMAIL_ADDRESS"] = "INVALID_EMAIL_ADDRESS";
    // Calendar specific errors
    ErrorCode["CALENDAR_NOT_FOUND"] = "CALENDAR_NOT_FOUND";
    ErrorCode["EVENT_NOT_FOUND"] = "EVENT_NOT_FOUND";
    ErrorCode["INVALID_DATE_RANGE"] = "INVALID_DATE_RANGE";
    ErrorCode["CALENDAR_CONFLICT"] = "CALENDAR_CONFLICT";
    // Cache errors
    ErrorCode["CACHE_ERROR"] = "CACHE_ERROR";
    ErrorCode["CACHE_MISS"] = "CACHE_MISS";
    // Configuration errors
    ErrorCode["CONFIG_INVALID"] = "CONFIG_INVALID";
    ErrorCode["CONFIG_MISSING"] = "CONFIG_MISSING";
    // Internal errors
    ErrorCode["INTERNAL_ERROR"] = "INTERNAL_ERROR";
    ErrorCode["NOT_IMPLEMENTED"] = "NOT_IMPLEMENTED";
    ErrorCode["OPERATION_FAILED"] = "OPERATION_FAILED";
})(ErrorCode || (ErrorCode = {}));
/**
 * Base error class for all MCP server errors
 */
export class MCPError extends Error {
    code;
    context;
    isRetryable;
    timestamp;
    constructor(message, code, context = {}, isRetryable = false) {
        super(message);
        this.name = this.constructor.name;
        this.code = code;
        this.context = {
            ...context,
            timestamp: context.timestamp || new Date(),
        };
        this.isRetryable = isRetryable;
        this.timestamp = new Date();
        // Maintains proper stack trace for where our error was thrown
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor);
        }
    }
    /**
     * Get a serializable representation of the error
     */
    toJSON() {
        return {
            name: this.name,
            message: this.message,
            code: this.code,
            context: this.context,
            isRetryable: this.isRetryable,
            timestamp: this.timestamp,
            stack: this.stack,
        };
    }
    /**
     * Get a user-friendly error message
     */
    getUserMessage() {
        return this.message;
    }
}
/**
 * Connection-related errors
 */
export class ConnectionError extends MCPError {
    constructor(message, code = ErrorCode.CONNECTION_FAILED, context = {}) {
        super(message, code, context, true); // Connection errors are usually retryable
    }
    getUserMessage() {
        switch (this.code) {
            case ErrorCode.CONNECTION_TIMEOUT:
                return "Connection timed out. Please check your network connection and try again.";
            case ErrorCode.CONNECTION_REFUSED:
                return "Connection was refused. The server may be unavailable.";
            case ErrorCode.CONNECTION_LOST:
                return "Connection was lost. Attempting to reconnect...";
            default:
                return "Unable to connect to the server. Please try again later.";
        }
    }
}
/**
 * Authentication-related errors
 */
export class AuthenticationError extends MCPError {
    constructor(message, code = ErrorCode.AUTH_FAILED, context = {}) {
        super(message, code, context, false); // Auth errors are usually not retryable
    }
    getUserMessage() {
        switch (this.code) {
            case ErrorCode.AUTH_INVALID_CREDENTIALS:
                return "Invalid email or password. Please check your credentials.";
            case ErrorCode.AUTH_TOKEN_EXPIRED:
                return "Your session has expired. Please re-authenticate.";
            case ErrorCode.AUTH_INSUFFICIENT_PERMISSIONS:
                return "You don't have permission to perform this action.";
            default:
                return "Authentication failed. Please check your credentials.";
        }
    }
}
/**
 * Rate limiting errors
 */
export class RateLimitError extends MCPError {
    retryAfter;
    constructor(message, retryAfter, context = {}) {
        super(message, ErrorCode.RATE_LIMIT_EXCEEDED, context, true);
        this.retryAfter = retryAfter;
    }
    getUserMessage() {
        if (this.retryAfter) {
            return `Rate limit exceeded. Please try again in ${this.retryAfter} seconds.`;
        }
        return "Rate limit exceeded. Please try again later.";
    }
}
/**
 * Input validation errors
 */
export class ValidationError extends MCPError {
    field;
    value;
    constructor(message, field, value, context = {}) {
        super(message, ErrorCode.VALIDATION_FAILED, context, false);
        this.field = field;
        this.value = value;
    }
    getUserMessage() {
        if (this.field) {
            return `Invalid value for field '${this.field}': ${this.message}`;
        }
        return `Validation failed: ${this.message}`;
    }
}
/**
 * Mailbox.org specific errors
 */
export class MailboxError extends MCPError {
    serverCode;
    constructor(message, code = ErrorCode.MAILBOX_SERVER_ERROR, serverCode, context = {}) {
        super(message, code, context, true);
        this.serverCode = serverCode;
    }
    getUserMessage() {
        switch (this.code) {
            case ErrorCode.MAILBOX_MAINTENANCE:
                return "Mailbox.org is currently under maintenance. Please try again later.";
            case ErrorCode.MAILBOX_FEATURE_UNAVAILABLE:
                return "This feature is currently unavailable on mailbox.org.";
            default:
                return "A server error occurred. Please try again later.";
        }
    }
}
/**
 * Email-specific errors
 */
export class EmailError extends MCPError {
    emailId;
    folder;
    constructor(message, code, emailId, folder, context = {}) {
        super(message, code, context, false);
        this.emailId = emailId;
        this.folder = folder;
    }
    getUserMessage() {
        switch (this.code) {
            case ErrorCode.EMAIL_NOT_FOUND:
                return "The requested email could not be found.";
            case ErrorCode.FOLDER_NOT_FOUND:
                return "The specified folder does not exist.";
            case ErrorCode.ATTACHMENT_TOO_LARGE:
                return "The attachment is too large to process.";
            case ErrorCode.INVALID_EMAIL_ADDRESS:
                return "The email address format is invalid.";
            default:
                return "An email operation failed. Please try again.";
        }
    }
}
/**
 * Calendar-specific errors
 */
export class CalendarError extends MCPError {
    calendarId;
    eventId;
    constructor(message, code, calendarId, eventId, context = {}) {
        super(message, code, context, false);
        this.calendarId = calendarId;
        this.eventId = eventId;
    }
    getUserMessage() {
        switch (this.code) {
            case ErrorCode.CALENDAR_NOT_FOUND:
                return "The specified calendar could not be found.";
            case ErrorCode.EVENT_NOT_FOUND:
                return "The requested calendar event could not be found.";
            case ErrorCode.INVALID_DATE_RANGE:
                return "The specified date range is invalid.";
            case ErrorCode.CALENDAR_CONFLICT:
                return "There is a scheduling conflict with this calendar event.";
            default:
                return "A calendar operation failed. Please try again.";
        }
    }
}
/**
 * Cache-related errors
 */
export class CacheError extends MCPError {
    constructor(message, code = ErrorCode.CACHE_ERROR, context = {}) {
        super(message, code, context, true);
    }
    getUserMessage() {
        return "A caching error occurred. The operation may be slower than usual.";
    }
}
/**
 * Configuration errors
 */
export class ConfigurationError extends MCPError {
    configKey;
    constructor(message, configKey, context = {}) {
        super(message, ErrorCode.CONFIG_INVALID, context, false);
        this.configKey = configKey;
    }
    getUserMessage() {
        if (this.configKey) {
            return `Configuration error for '${this.configKey}': ${this.message}`;
        }
        return `Configuration error: ${this.message}`;
    }
}
/**
 * Check if an error is retryable
 */
export function isRetryableError(error) {
    if (error instanceof MCPError) {
        return error.isRetryable;
    }
    // Consider network errors as retryable
    if (error.message.includes("ECONNRESET") ||
        error.message.includes("ENOTFOUND") ||
        error.message.includes("ETIMEDOUT")) {
        return true;
    }
    return false;
}
/**
 * Extract error code from any error
 */
export function getErrorCode(error) {
    if (error instanceof MCPError) {
        return error.code;
    }
    return ErrorCode.INTERNAL_ERROR;
}
/**
 * Get user-friendly message from any error
 */
export function getUserMessage(error) {
    if (error instanceof MCPError) {
        return error.getUserMessage();
    }
    return "An unexpected error occurred. Please try again.";
}
/**
 * Convert any error to MCPError
 */
export function toMCPError(error, context = {}) {
    if (error instanceof MCPError) {
        return error;
    }
    // Categorize common error patterns
    if (error.message.includes("auth") || error.message.includes("login")) {
        return new AuthenticationError(error.message, ErrorCode.AUTH_FAILED, context);
    }
    if (error.message.includes("connection") ||
        error.message.includes("network") ||
        error.message.includes("ECONNRESET") ||
        error.message.includes("ENOTFOUND") ||
        error.message.includes("ECONNREFUSED") ||
        error.message.includes("Connection not available")) {
        return new ConnectionError(error.message, ErrorCode.CONNECTION_FAILED, context);
    }
    if (error.message.includes("timeout") ||
        error.message.includes("ETIMEDOUT")) {
        return new ConnectionError(error.message, ErrorCode.CONNECTION_TIMEOUT, context);
    }
    // Default to internal error
    return new (class extends MCPError {
        constructor() {
            super(error.message, ErrorCode.INTERNAL_ERROR, context, false);
            this.stack = error.stack;
        }
    })();
}
/**
 * @deprecated Use individual functions instead: isRetryableError, getErrorCode, getUserMessage, toMCPError
 */
export const ErrorUtils = {
    isRetryable: isRetryableError,
    getErrorCode,
    getUserMessage,
    toMCPError,
};
//# sourceMappingURL=errors.js.map
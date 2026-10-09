/**
 * Enhanced logging system for MCP servers
 * Provides both stderr logging and MCP notifications with RFC 5424 log levels
 */
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
/**
 * RFC 5424 log levels as specified in MCP specification
 */
export declare enum LogLevel {
    DEBUG = "debug",
    INFO = "info",
    NOTICE = "notice",
    WARNING = "warning",
    ERROR = "error",
    CRITICAL = "critical",
    ALERT = "alert",
    EMERGENCY = "emergency"
}
/**
 * Context information for log entries
 */
export interface LogContext {
    operation?: string;
    service?: string;
    requestId?: string;
    userId?: string;
    duration?: number;
    metadata?: Record<string, unknown>;
    timestamp?: Date;
}
/**
 * Performance metrics data
 */
export interface PerformanceMetrics {
    operation: string;
    duration: number;
    startTime: Date;
    endTime: Date;
    success: boolean;
    errorType?: string;
    metadata?: Record<string, unknown>;
}
/**
 * Structured log entry
 */
export interface LogEntry {
    level: LogLevel;
    message: string;
    logger?: string;
    context: LogContext;
    timestamp: Date;
    data?: Record<string, unknown>;
}
/**
 * Common interface for logging functionality
 * Implemented by both Logger and ChildLogger
 */
export interface LoggerLike {
    debug(message: string, context?: LogContext, data?: Record<string, unknown>): void;
    info(message: string, context?: LogContext, data?: Record<string, unknown>): void;
    notice(message: string, context?: LogContext, data?: Record<string, unknown>): void;
    warning(message: string, context?: LogContext, data?: Record<string, unknown>): void;
    error(message: string, context?: LogContext, data?: Record<string, unknown>): void;
    critical(message: string, context?: LogContext, data?: Record<string, unknown>): void;
    alert(message: string, context?: LogContext, data?: Record<string, unknown>): void;
    emergency(message: string, context?: LogContext, data?: Record<string, unknown>): void;
}
/**
 * Logger configuration
 */
export interface LoggerConfig {
    minLevel: LogLevel;
    enableStderr: boolean;
    enableMcpNotifications: boolean;
    includeTimestamp: boolean;
    includeContext: boolean;
    maxContextDepth: number;
}
/**
 * Enhanced logger for MCP servers
 */
export declare class Logger {
    private config;
    private mcpServer?;
    private performanceMetrics;
    private readonly maxMetricsHistory;
    constructor(config?: Partial<LoggerConfig>);
    /**
     * Set the MCP server instance for notifications
     */
    setMcpServer(server: Server): void;
    /**
     * Set minimum log level
     */
    setMinLevel(level: LogLevel): void;
    /**
     * Check if a log level should be processed
     */
    private shouldLog;
    /**
     * Format log entry for stderr output
     */
    private formatStderrLog;
    /**
     * Serialize data for logging with depth control
     */
    private serializeData;
    /**
     * Send log entry to stderr
     */
    private writeToStderr;
    /**
     * Send MCP logging notification
     */
    private sendMcpNotification;
    /**
     * Core logging method
     */
    private log;
    /**
     * Log at debug level
     */
    debug(message: string, context?: LogContext, data?: Record<string, unknown>): void;
    /**
     * Log at info level
     */
    info(message: string, context?: LogContext, data?: Record<string, unknown>): void;
    /**
     * Log at notice level
     */
    notice(message: string, context?: LogContext, data?: Record<string, unknown>): void;
    /**
     * Log at warning level
     */
    warning(message: string, context?: LogContext, data?: Record<string, unknown>): void;
    /**
     * Log at error level
     */
    error(message: string, context?: LogContext, data?: Record<string, unknown>): void;
    /**
     * Log at critical level
     */
    critical(message: string, context?: LogContext, data?: Record<string, unknown>): void;
    /**
     * Log at alert level
     */
    alert(message: string, context?: LogContext, data?: Record<string, unknown>): void;
    /**
     * Log at emergency level
     */
    emergency(message: string, context?: LogContext, data?: Record<string, unknown>): void;
    /**
     * Record performance metrics
     */
    recordPerformance(metrics: PerformanceMetrics): void;
    /**
     * Get performance metrics summary
     */
    getPerformanceMetrics(): {
        total: number;
        successful: number;
        failed: number;
        averageDuration: number;
        recentMetrics: PerformanceMetrics[];
    };
    /**
     * Internal method for child loggers to access logging functionality
     * @internal
     */
    _logInternal(level: LogLevel, message: string, context?: LogContext, loggerName?: string, data?: Record<string, unknown>): void;
    /**
     * Create a child logger with a specific logger name
     */
    child(loggerName: string): ChildLogger;
    /**
     * Create a performance timer
     */
    startTimer(operation: string, metadata?: Record<string, unknown>): PerformanceTimer;
}
/**
 * Child logger with a predefined logger name
 */
export declare class ChildLogger {
    private parent;
    private loggerName;
    constructor(parent: Logger, loggerName: string);
    /**
     * Access to parent's log method for internal use
     */
    private log;
    debug(message: string, context?: LogContext, data?: Record<string, unknown>): void;
    info(message: string, context?: LogContext, data?: Record<string, unknown>): void;
    notice(message: string, context?: LogContext, data?: Record<string, unknown>): void;
    warning(message: string, context?: LogContext, data?: Record<string, unknown>): void;
    error(message: string, context?: LogContext, data?: Record<string, unknown>): void;
    critical(message: string, context?: LogContext, data?: Record<string, unknown>): void;
    alert(message: string, context?: LogContext, data?: Record<string, unknown>): void;
    emergency(message: string, context?: LogContext, data?: Record<string, unknown>): void;
    startTimer(operation: string, metadata?: Record<string, unknown>): PerformanceTimer;
}
/**
 * Performance timer utility
 */
export declare class PerformanceTimer {
    private logger;
    private operation;
    private metadata?;
    private startTime;
    constructor(logger: Logger, operation: string, metadata?: Record<string, unknown> | undefined);
    /**
     * End the timer and record performance metrics
     */
    end(success?: boolean, errorType?: string): PerformanceMetrics;
}
/**
 * Global logger instance
 */
export declare const logger: Logger;
/**
 * Convenience function to create a child logger
 */
export declare function createLogger(loggerName: string): ChildLogger;

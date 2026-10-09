/**
 * Enhanced logging system for MCP servers
 * Provides both stderr logging and MCP notifications with RFC 5424 log levels
 */
/**
 * RFC 5424 log levels as specified in MCP specification
 */
export var LogLevel;
(function (LogLevel) {
    LogLevel["DEBUG"] = "debug";
    LogLevel["INFO"] = "info";
    LogLevel["NOTICE"] = "notice";
    LogLevel["WARNING"] = "warning";
    LogLevel["ERROR"] = "error";
    LogLevel["CRITICAL"] = "critical";
    LogLevel["ALERT"] = "alert";
    LogLevel["EMERGENCY"] = "emergency";
})(LogLevel || (LogLevel = {}));
/**
 * Numeric values for log levels (for comparison)
 */
const LOG_LEVEL_VALUES = {
    [LogLevel.DEBUG]: 0,
    [LogLevel.INFO]: 1,
    [LogLevel.NOTICE]: 2,
    [LogLevel.WARNING]: 3,
    [LogLevel.ERROR]: 4,
    [LogLevel.CRITICAL]: 5,
    [LogLevel.ALERT]: 6,
    [LogLevel.EMERGENCY]: 7,
};
/**
 * Default logger configuration
 */
const DEFAULT_CONFIG = {
    minLevel: LogLevel.INFO,
    enableStderr: true,
    enableMcpNotifications: true,
    includeTimestamp: true,
    includeContext: true,
    maxContextDepth: 3,
};
/**
 * Enhanced logger for MCP servers
 */
export class Logger {
    config;
    mcpServer;
    performanceMetrics = [];
    maxMetricsHistory = 1000;
    constructor(config = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }
    /**
     * Set the MCP server instance for notifications
     */
    setMcpServer(server) {
        this.mcpServer = server;
    }
    /**
     * Set minimum log level
     */
    setMinLevel(level) {
        this.config.minLevel = level;
    }
    /**
     * Check if a log level should be processed
     */
    shouldLog(level) {
        return LOG_LEVEL_VALUES[level] >= LOG_LEVEL_VALUES[this.config.minLevel];
    }
    /**
     * Format log entry for stderr output
     */
    formatStderrLog(entry) {
        const parts = [];
        if (this.config.includeTimestamp) {
            parts.push(`[${entry.timestamp.toISOString()}]`);
        }
        parts.push(`[${entry.level.toUpperCase()}]`);
        if (entry.logger) {
            parts.push(`[${entry.logger}]`);
        }
        parts.push(entry.message);
        if (this.config.includeContext && entry.context) {
            const contextParts = [];
            if (entry.context.operation) {
                contextParts.push(`op=${entry.context.operation}`);
            }
            if (entry.context.service) {
                contextParts.push(`svc=${entry.context.service}`);
            }
            if (entry.context.duration !== undefined) {
                contextParts.push(`dur=${entry.context.duration}ms`);
            }
            if (entry.context.requestId) {
                contextParts.push(`req=${entry.context.requestId}`);
            }
            if (contextParts.length > 0) {
                parts.push(`{${contextParts.join(", ")}}`);
            }
        }
        if (entry.data) {
            const serializedData = this.serializeData(entry.data);
            if (serializedData) {
                parts.push(`data=${serializedData}`);
            }
        }
        return parts.join(" ");
    }
    /**
     * Serialize data for logging with depth control
     */
    serializeData(data, depth = 0) {
        if (depth >= this.config.maxContextDepth) {
            return "[max depth reached]";
        }
        try {
            if (data === null || data === undefined) {
                return String(data);
            }
            if (typeof data === "string" ||
                typeof data === "number" ||
                typeof data === "boolean") {
                return String(data);
            }
            if (data instanceof Error) {
                return `Error: ${data.message}`;
            }
            if (data instanceof Date) {
                return data.toISOString();
            }
            if (Array.isArray(data)) {
                if (data.length === 0)
                    return "[]";
                if (data.length > 5)
                    return `[Array(${data.length})]`;
                return `[${data.map(item => this.serializeData(item, depth + 1)).join(", ")}]`;
            }
            if (typeof data === "object") {
                const keys = Object.keys(data);
                if (keys.length === 0)
                    return "{}";
                if (keys.length > 10)
                    return `{Object(${keys.length} keys)}`;
                const pairs = keys.slice(0, 10).map(key => {
                    const value = data[key];
                    return `${key}: ${this.serializeData(value, depth + 1)}`;
                });
                return `{${pairs.join(", ")}}`;
            }
            return String(data);
        }
        catch (error) {
            return "[serialization error]";
        }
    }
    /**
     * Send log entry to stderr
     */
    writeToStderr(entry) {
        if (!this.config.enableStderr)
            return;
        const formatted = this.formatStderrLog(entry);
        console.error(formatted);
    }
    /**
     * Send MCP logging notification
     */
    async sendMcpNotification(entry) {
        if (!this.config.enableMcpNotifications || !this.mcpServer)
            return;
        try {
            // Prepare notification data
            const notificationData = {
                message: entry.message,
                timestamp: entry.timestamp.toISOString(),
                ...entry.context,
            };
            if (entry.data) {
                notificationData.data = entry.data;
            }
            // Send MCP notification
            await this.mcpServer.sendLoggingMessage({
                level: entry.level,
                logger: entry.logger,
                data: notificationData,
            });
        }
        catch (error) {
            // Fall back to stderr if MCP notification fails
            console.error(`[LOGGER] Failed to send MCP notification: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    /**
     * Core logging method
     */
    log(level, message, context = {}, logger, data) {
        if (!this.shouldLog(level))
            return;
        const entry = {
            level,
            message,
            logger,
            context: {
                ...context,
                timestamp: context.timestamp || new Date(),
            },
            timestamp: new Date(),
            data,
        };
        // Write to stderr (synchronous)
        this.writeToStderr(entry);
        // Send MCP notification (asynchronous, fire and forget)
        // We don't await this to avoid blocking the application
        this.sendMcpNotification(entry).catch(() => {
            // Error already logged in sendMcpNotification
        });
    }
    /**
     * Log at debug level
     */
    debug(message, context, data) {
        this.log(LogLevel.DEBUG, message, context, undefined, data);
    }
    /**
     * Log at info level
     */
    info(message, context, data) {
        this.log(LogLevel.INFO, message, context, undefined, data);
    }
    /**
     * Log at notice level
     */
    notice(message, context, data) {
        this.log(LogLevel.NOTICE, message, context, undefined, data);
    }
    /**
     * Log at warning level
     */
    warning(message, context, data) {
        this.log(LogLevel.WARNING, message, context, undefined, data);
    }
    /**
     * Log at error level
     */
    error(message, context, data) {
        this.log(LogLevel.ERROR, message, context, undefined, data);
    }
    /**
     * Log at critical level
     */
    critical(message, context, data) {
        this.log(LogLevel.CRITICAL, message, context, undefined, data);
    }
    /**
     * Log at alert level
     */
    alert(message, context, data) {
        this.log(LogLevel.ALERT, message, context, undefined, data);
    }
    /**
     * Log at emergency level
     */
    emergency(message, context, data) {
        this.log(LogLevel.EMERGENCY, message, context, undefined, data);
    }
    /**
     * Record performance metrics
     */
    recordPerformance(metrics) {
        this.performanceMetrics.push(metrics);
        // Keep only recent metrics
        if (this.performanceMetrics.length > this.maxMetricsHistory) {
            this.performanceMetrics = this.performanceMetrics.slice(-this.maxMetricsHistory);
        }
        // Log performance metric
        const level = metrics.success ? LogLevel.INFO : LogLevel.WARNING;
        const message = `Performance: ${metrics.operation} ${metrics.success ? "completed" : "failed"} in ${metrics.duration}ms`;
        // Use the synchronous log method
        this.log(level, message, {
            operation: metrics.operation,
            duration: metrics.duration,
            metadata: {
                startTime: metrics.startTime.toISOString(),
                endTime: metrics.endTime.toISOString(),
                success: metrics.success,
                errorType: metrics.errorType,
                ...metrics.metadata,
            },
        }, "performance");
    }
    /**
     * Get performance metrics summary
     */
    getPerformanceMetrics() {
        const successful = this.performanceMetrics.filter(m => m.success).length;
        const failed = this.performanceMetrics.length - successful;
        const averageDuration = this.performanceMetrics.length > 0
            ? this.performanceMetrics.reduce((sum, m) => sum + m.duration, 0) /
                this.performanceMetrics.length
            : 0;
        return {
            total: this.performanceMetrics.length,
            successful,
            failed,
            averageDuration: Math.round(averageDuration * 100) / 100,
            recentMetrics: this.performanceMetrics.slice(-10), // Last 10 metrics
        };
    }
    /**
     * Internal method for child loggers to access logging functionality
     * @internal
     */
    _logInternal(level, message, context, loggerName, data) {
        this.log(level, message, context, loggerName, data);
    }
    /**
     * Create a child logger with a specific logger name
     */
    child(loggerName) {
        return new ChildLogger(this, loggerName);
    }
    /**
     * Create a performance timer
     */
    startTimer(operation, metadata) {
        return new PerformanceTimer(this, operation, metadata);
    }
}
/**
 * Child logger with a predefined logger name
 */
export class ChildLogger {
    parent;
    loggerName;
    constructor(parent, loggerName) {
        this.parent = parent;
        this.loggerName = loggerName;
    }
    /**
     * Access to parent's log method for internal use
     */
    log(level, message, context, data) {
        // Use the internal method provided by parent
        this.parent._logInternal(level, message, context, this.loggerName, data);
    }
    debug(message, context, data) {
        this.log(LogLevel.DEBUG, message, context, data);
    }
    info(message, context, data) {
        this.log(LogLevel.INFO, message, context, data);
    }
    notice(message, context, data) {
        this.log(LogLevel.NOTICE, message, context, data);
    }
    warning(message, context, data) {
        this.log(LogLevel.WARNING, message, context, data);
    }
    error(message, context, data) {
        this.log(LogLevel.ERROR, message, context, data);
    }
    critical(message, context, data) {
        this.log(LogLevel.CRITICAL, message, context, data);
    }
    alert(message, context, data) {
        this.log(LogLevel.ALERT, message, context, data);
    }
    emergency(message, context, data) {
        this.log(LogLevel.EMERGENCY, message, context, data);
    }
    startTimer(operation, metadata) {
        return this.parent.startTimer(operation, metadata);
    }
}
/**
 * Performance timer utility
 */
export class PerformanceTimer {
    logger;
    operation;
    metadata;
    startTime;
    constructor(logger, operation, metadata) {
        this.logger = logger;
        this.operation = operation;
        this.metadata = metadata;
        this.startTime = new Date();
    }
    /**
     * End the timer and record performance metrics
     */
    end(success = true, errorType) {
        const endTime = new Date();
        const duration = endTime.getTime() - this.startTime.getTime();
        const metrics = {
            operation: this.operation,
            duration,
            startTime: this.startTime,
            endTime,
            success,
            errorType,
            metadata: this.metadata,
        };
        this.logger.recordPerformance(metrics);
        return metrics;
    }
}
/**
 * Global logger instance
 */
export const logger = new Logger();
/**
 * Convenience function to create a child logger
 */
export function createLogger(loggerName) {
    return logger.child(loggerName);
}
//# sourceMappingURL=Logger.js.map
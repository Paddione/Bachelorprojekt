import { createWriteStream, WriteStream } from 'fs';
import { join } from 'path';
import { mkdir } from 'fs/promises';

export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3
}

export interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  context?: Record<string, any>;
  stack?: string;
  requestId?: string;
  userId?: string;
}

class Logger {
  private static instance: Logger;
  private logStreams: Map<string, WriteStream> = new Map();
  private logLevel: LogLevel = LogLevel.INFO;
  private logsDir: string;

  private constructor() {
    this.logsDir = join(process.cwd(), 'logs');
    this.initializeLogging();
  }

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  private async initializeLogging() {
    try {
      await mkdir(this.logsDir, { recursive: true });

      // Create different log streams
      const today = new Date().toISOString().split('T')[0];

      const streams = {
        error: `error-${today}.log`,
        warn: `warn-${today}.log`,
        info: `info-${today}.log`,
        debug: `debug-${today}.log`,
        combined: `combined-${today}.log`
      };

      for (const [level, filename] of Object.entries(streams)) {
        const stream = createWriteStream(join(this.logsDir, filename), { flags: 'a' });
        this.logStreams.set(level, stream);
      }
    } catch (error) {
      console.error('Failed to initialize logging:', error);
    }
  }

  private formatLogEntry(level: string, message: string, context?: Record<string, any>, stack?: string): LogEntry {
    return {
      timestamp: new Date().toISOString(),
      level: level.toUpperCase(),
      message,
      context,
      stack,
      requestId: context?.requestId,
      userId: context?.userId
    };
  }

  private writeToStream(level: string, entry: LogEntry) {
    const logLine = JSON.stringify(entry) + '\n';

    // Write to specific level stream
    const levelStream = this.logStreams.get(level);
    levelStream?.write(logLine);

    // Write to combined stream
    const combinedStream = this.logStreams.get('combined');
    combinedStream?.write(logLine);

    // Console output
    const consoleMessage = `[${entry.timestamp}] ${entry.level}: ${entry.message}`;

    switch (level) {
      case 'error':
        console.error(consoleMessage, entry.context || '');
        if (entry.stack) console.error(entry.stack);
        break;
      case 'warn':
        console.warn(consoleMessage, entry.context || '');
        break;
      case 'info':
        console.info(consoleMessage, entry.context || '');
        break;
      case 'debug':
        console.debug(consoleMessage, entry.context || '');
        break;
    }
  }

  error(message: string, context?: Record<string, any>, error?: Error) {
    const entry = this.formatLogEntry('error', message, context, error?.stack);
    this.writeToStream('error', entry);
  }

  warn(message: string, context?: Record<string, any>) {
    if (this.logLevel >= LogLevel.WARN) {
      const entry = this.formatLogEntry('warn', message, context);
      this.writeToStream('warn', entry);
    }
  }

  info(message: string, context?: Record<string, any>) {
    if (this.logLevel >= LogLevel.INFO) {
      const entry = this.formatLogEntry('info', message, context);
      this.writeToStream('info', entry);
    }
  }

  debug(message: string, context?: Record<string, any>) {
    if (this.logLevel >= LogLevel.DEBUG) {
      const entry = this.formatLogEntry('debug', message, context);
      this.writeToStream('debug', entry);
    }
  }

  // API Error logging with structured data
  logApiError(req: any, error: Error, statusCode: number = 500) {
    const context = {
      requestId: req.id || req.headers['x-request-id'],
      method: req.method,
      url: req.url,
      userAgent: req.headers['user-agent'],
      ip: req.ip || req.connection.remoteAddress,
      statusCode,
      body: req.body,
      query: req.query,
      params: req.params
    };

    this.error(`API Error: ${error.message}`, context, error);
  }

  // Client Error logging
  logClientError(error: any, context?: Record<string, any>) {
    const errorContext = {
      ...context,
      userAgent: context?.userAgent,
      url: context?.url,
      timestamp: new Date().toISOString(),
      type: 'client_error'
    };

    this.error(`Client Error: ${error.message || error}`, errorContext, error);
  }

  // Security event logging
  logSecurityEvent(event: string, context: Record<string, any>) {
    const securityContext = {
      ...context,
      type: 'security_event',
      severity: 'high'
    };

    this.warn(`Security Event: ${event}`, securityContext);
  }

  // Performance logging
  logPerformance(operation: string, duration: number, context?: Record<string, any>) {
    const perfContext = {
      ...context,
      duration,
      type: 'performance',
      operation
    };

    if (duration > 1000) { // Log slow operations
      this.warn(`Slow Operation: ${operation} took ${duration}ms`, perfContext);
    } else {
      this.info(`Performance: ${operation} completed in ${duration}ms`, perfContext);
    }
  }

  // Cleanup old logs (call this periodically)
  async cleanup(daysToKeep: number = 30) {
    try {
      const fs = await import('fs/promises');
      const files = await fs.readdir(this.logsDir);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

      for (const file of files) {
        const filePath = join(this.logsDir, file);
        const stats = await fs.stat(filePath);

        if (stats.mtime < cutoffDate) {
          await fs.unlink(filePath);
          this.info(`Cleaned up old log file: ${file}`);
        }
      }
    } catch (error) {
      this.error('Failed to cleanup logs', {}, error as Error);
    }
  }

  // Close all streams
  close() {
    for (const stream of Array.from(this.logStreams.values())) {
      stream.end();
    }
  }
}

// Export singleton instance
export const logger = Logger.getInstance();

// Graceful shutdown
process.on('SIGINT', () => {
  logger.info('Received SIGINT, closing log streams...');
  logger.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Received SIGTERM, closing log streams...');
  logger.close();
  process.exit(0);
});
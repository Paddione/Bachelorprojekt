import pino from 'pino';
import { serverLogBuffer } from './server-log-buffer';

const level = process.env.PINO_LOG_LEVEL ?? 'info';

// First multistream destination: stdout (→ Promtail/Loki) - unchanged
const stdoutStream = { stream: process.stdout, level: 'trace' };

// Second multistream destination: buffer for admin logging widget - unchanged
const bufferStream = {
  write(line: string) {
    serverLogBuffer.pushRaw(line);
  },
};

// Third multistream destination: persist error lines to DB (fire-and-forget)
// Note: This is a lazy import to avoid circular dependency with error-log-store.ts
const errorPersistStream = {
  level: 'error',
  write(line: string) {
    try {
      const entry = JSON.parse(line);
      // Dynamically import persistError to avoid circular deps
      (async () => {
        const { persistError } = await import('./logging/error-log-store.js');
        await persistError({ source: 'server' as const, message: entry.msg ?? line });
      })();
    } catch (err) {
      console.error('[logger] Failed to parse and persist error log:', err);
    }
  },
};

export const logger = pino(
  {
    level,
    base: { service: 'website' },
    serializers: { err: pino.stdSerializers.err },
  },
  pino.multistream([stdoutStream, bufferStream, errorPersistStream]),
);

export interface RequestLogContext {
  requestId: string;
  method: string;
  path: string;
}

export function createRequestLogger(fields: RequestLogContext): pino.Logger {
  return logger.child(fields);
}

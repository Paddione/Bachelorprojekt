import pino from 'pino';
import { serverLogBuffer } from './server-log-buffer';

const level = process.env.PINO_LOG_LEVEL ?? 'info';

// Second multistream destination: mirror every emitted line into the in-process
// ring buffer for the admin logging widget. stdout (→ Promtail/Loki) is kept as
// the first stream so existing log shipping is unchanged. Per-stream level is
// 'trace' so the logger's own `level` stays the single gate (no dev regression).
const bufferStream = {
  write(line: string) {
    serverLogBuffer.pushRaw(line);
  },
};

export const logger = pino(
  {
    level,
    base: { service: 'website' },
    serializers: { err: pino.stdSerializers.err },
  },
  pino.multistream([
    { stream: process.stdout, level: 'trace' },
    { stream: bufferStream, level: 'trace' },
  ]),
);

export interface RequestLogContext {
  requestId: string;
  method: string;
  path: string;
}

export function createRequestLogger(fields: RequestLogContext): pino.Logger {
  return logger.child(fields);
}

import pino from 'pino';

const level = process.env.PINO_LOG_LEVEL ?? 'info';

export const logger = pino({
  level,
  base: { service: 'website' },
  serializers: { err: pino.stdSerializers.err },
});

export interface RequestLogContext {
  requestId: string;
  method: string;
  path: string;
}

export function createRequestLogger(fields: RequestLogContext): pino.Logger {
  return logger.child(fields);
}

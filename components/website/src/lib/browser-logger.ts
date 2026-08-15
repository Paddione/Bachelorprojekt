import type { LogLevel } from './logging/log-types';

type Meta = Record<string, unknown>;

function emit(level: LogLevel, msgOrMeta: string | Meta, msg?: string): void {
  const message = typeof msgOrMeta === 'string' ? msgOrMeta : (msg ?? '');
  const meta = typeof msgOrMeta === 'object' ? msgOrMeta : undefined;
  if (level === 'error') console.error('[browser]', message, meta ?? '');
  else if (level === 'warn') console.warn('[browser]', message, meta ?? '');
  else console.log('[browser]', message, meta ?? '');
}

export const browserLogger = {
  error: (msgOrMeta: string | Meta, msg?: string) => emit('error', msgOrMeta, msg),
  warn:  (msgOrMeta: string | Meta, msg?: string) => emit('warn',  msgOrMeta, msg),
  info:  (msgOrMeta: string | Meta, msg?: string) => emit('info',  msgOrMeta, msg),
};

import type { LogLevel } from './logging/log-types';

type Meta = Record<string, unknown>;

// F5 (bp-browser-logger-rekursion): Der Graph meldete einen CALLS-Zyklus
// emit<->error/warn/info. In Wahrheit rief emit nie einen Geschwister-Wrapper
// auf (nur console.*) — die Rückkante war ein Index-Artefakt des
// Objekt-Literals. Trotzdem entkoppelt: genau EIN interner Sender (emitLog),
// die exportierten Wrapper rufen nur ihn auf. Es gibt keine Kante mehr
// zwischen Geschwistern, und ein Re-Entrancy-Guard macht verschachtelte
// Aufrufe (z. B. console-Patch ruft Logger) zum No-op statt Rekursion.
let emitting = false;

function emitLog(level: LogLevel, msgOrMeta: string | Meta, msg?: string): void {
  if (emitting) return;
  const message = typeof msgOrMeta === 'string' ? msgOrMeta : (msg ?? '');
  const meta = typeof msgOrMeta === 'object' ? msgOrMeta : undefined;
  emitting = true;
  try {
    if (level === 'error') console.error('[browser]', message, meta ?? '');
    else if (level === 'warn') console.warn('[browser]', message, meta ?? '');
    else console.log('[browser]', message, meta ?? '');
  } finally {
    emitting = false;
  }
}

export const browserLogger = {
  error: (msgOrMeta: string | Meta, msg?: string) => emitLog('error', msgOrMeta, msg),
  warn:  (msgOrMeta: string | Meta, msg?: string) => emitLog('warn',  msgOrMeta, msg),
  info:  (msgOrMeta: string | Meta, msg?: string) => emitLog('info',  msgOrMeta, msg),
};

// Browser-only EventSource wrappers that pipe the two server-side SSE endpoints
// into the central log store. Kept thin (no business logic) so the testable
// parsing/colour logic lives in log-format.ts.

import { addEntry } from './log-store';
import { parsePodLine } from './log-format';
import type { LogEntry } from './log-types';

export interface StreamHandle {
  close: () => void;
}

/** Stream the website server's own pino logs (already structured LogEntry JSON). */
export function openServerLogStream(onError?: () => void): StreamHandle {
  const es = new EventSource('/api/admin/ops/server-logs/stream');
  es.onmessage = (e) => {
    try {
      const entry = JSON.parse(e.data) as LogEntry;
      addEntry({ ...entry, source: 'server' });
    } catch {
      /* ignore malformed frame */
    }
  };
  es.onerror = () => onError?.();
  return { close: () => es.close() };
}

export interface PodStreamParams {
  ns: string;
  pod: string;
  container?: string;
  tail?: number;
}

/** Stream raw pod container stdout via the existing pod-log endpoint. */
export function openPodLogStream(params: PodStreamParams, onError?: () => void): StreamHandle {
  const qs = new URLSearchParams({ ns: params.ns, pod: params.pod, tail: String(params.tail ?? 200) });
  if (params.container) qs.set('container', params.container);
  const es = new EventSource(`/api/admin/ops/log-stream/stream?${qs}`);
  es.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);
      if (data && typeof data === 'object' && data._eof) return;
      if (typeof data === 'string') addEntry(parsePodLine(data));
    } catch {
      /* ignore malformed frame */
    }
  };
  es.onerror = () => onError?.();
  return { close: () => es.close() };
}

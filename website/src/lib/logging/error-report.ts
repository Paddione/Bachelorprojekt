import type { LogEntry } from './log-types.js';
import { parsePodLine } from './log-format.js';

export interface ErrorReport {
  source: 'browser' | 'pod';
  message: string;
  namespace?: string;
  pod_name?: string;
}

/**
 * POST /api/admin/ops/error-log mit fire-and-forget (kein Throw)
 */
export async function postError(report: ErrorReport): Promise<void> {
  try {
    const response = await fetch('/api/admin/ops/error-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(report),
    });
    if (!response.ok) {
      throw new Error(`postError failed: ${response.status}`);
    }
  } catch (err) {
    console.error('[error-report] postError failed:', err);
  }
}

/**
 * GET /api/admin/ops/error-log?since=24h → LogEntry[]
 */
export async function fetchErrorHistory(sinceHours = 24): Promise<LogEntry[]> {
  try {
    const response = await fetch(`/api/admin/ops/error-log?since=${sinceHours}h`, {
      credentials: 'same-origin',
    });
    if (!response.ok) {
      return [];
    }
    return (await response.json()) as LogEntry[];
  } catch (err) {
    console.error('[error-report] fetchErrorHistory failed:', err);
    return [];
  }
}

/**
 * Pod-Line → LogEntry (nur bei level==='error')
 */
export function podLineToError(raw: string): ErrorReport | null {
  const parsed = parsePodLine(raw);
  if (!parsed) return null;
  
  if (parsed.level !== 'error') return null;
  
  return { source: 'pod', message: parsed.message };
}

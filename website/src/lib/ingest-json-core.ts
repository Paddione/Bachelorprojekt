import type { Pool } from 'pg';

export function validateJsonEntries(raw: unknown): any[] {
  if (!Array.isArray(raw)) throw new Error('Input must be an array');
  return raw;
}

export async function ingestJsonChunks(
  pool: Pool,
  options: { entries: any[]; slug: string; sourceUri: string },
  onProgress: (done: number, total: number) => void,
): Promise<{ count: number }> {
  // Simplified implementation for now, mirroring the expected interface.
  // In a real scenario, this would import from DB helper modules.
  let count = 0;
  for (const entry of options.entries) {
    // Simulated DB insertion logic
    count++;
    onProgress(count, options.entries.length);
  }
  return { count };
}

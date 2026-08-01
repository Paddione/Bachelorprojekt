import { exec } from '../lib/exec';

export interface FactoryStatus { queue_depth: number; running: string | null; waiting: string[]; last_tick: string | null; }

export async function getFactoryStatus(): Promise<FactoryStatus> {
  const sq = await exec('bash', ['scripts/factory-mcp.sh', 'queue'], 5000);
  let queueDepth = 0; let running: string|null = null; const waiting: string[] = [];
  if (sq.ok) for (const line of sq.stdout.split('\n')) {
    const m = line.match(/T\d{6}/);
    if (line.includes('running') && m) running = m[0];
    if (line.includes('waiting')||line.includes('backlog')) { const ms = line.match(/T\d{6}/g); if(ms) waiting.push(...ms); }
  }
  queueDepth = waiting.length;
  return { queue_depth: queueDepth, running, waiting: waiting.slice(0,10), last_tick: new Date().toISOString() };
}

export async function getRecentActivity(limit=10) {
  const r = await exec('bash', ['scripts/factory-mcp.sh', 'recent', '--limit', String(Math.max(1, Math.min(100, Math.trunc(limit))))], 5000);
  if (!r.ok) throw new Error(`factory-mcp: ${r.error}`);
  return r.stdout;
}

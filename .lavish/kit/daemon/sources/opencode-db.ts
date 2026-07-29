import { exec } from '../lib/exec';

export interface OpenCodeSession { sid: string; label: string; ticket_id: string|null; worktree: string|null; status: string; }

export async function getSessions(): Promise<OpenCodeSession[]> {
  const r = await exec('bash scripts/vda.sh oracle \'list active sessions\' 2>/dev/null || true', 10000);
  if (!r.ok || !r.stdout) return [];
  try {
    const data = JSON.parse(r.stdout);
    if (Array.isArray(data)) return data.map((s:any) => ({ sid: s.sid||'', label: s.label||'', ticket_id: s.ticket_id||null, worktree: s.worktree||null, status: s.status||'idle' }));
  } catch { /* fallthrough */ }
  return [];
}

export async function getRecentActivity(): Promise<{event:string;ts:string;details:string}[]> {
  return [];
}

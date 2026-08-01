import { exec } from '../lib/exec';

export interface AgentSession { sid: string; label: string; ticket: string; worktree: string; status: string; tool: string; }

export async function getAgentSessions(): Promise<AgentSession[]> {
  const r = await exec('bash', ['scripts/agent-lock.sh', 'list'], 5000);
  if (!r.ok) throw new Error(`agent-lock: ${r.error}`);
  const sessions: AgentSession[] = [];
  for (const line of r.stdout.split('\n')) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 6 || parts[0] !== 'ticket') continue;
    sessions.push({ sid: parts[3], label: parts.slice(5).join(' '), ticket: parts[1], worktree: '', status: parts[4] === 'live' ? 'active' : parts[4], tool: parts[2] });
  }
  return sessions;
}

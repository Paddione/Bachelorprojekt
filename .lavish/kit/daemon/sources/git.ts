import { exec } from '../lib/exec';

export interface WorktreeInfo { path: string; branch: string; hash: string; }

export async function getWorktrees(): Promise<WorktreeInfo[]> {
  const r = await exec('git worktree list', 5000);
  if (!r.ok) throw new Error(`git worktree: ${r.error}`);
  return r.stdout.split('\n').filter(Boolean).map(line => {
    const p = line.trim().split(/\s+/);
    return { path: p[0], hash: p[1], branch: p[2] ? p[2].replace(/[\[\]]/g,'') : 'detached' };
  });
}

export async function getGitStatus(): Promise<{ branch: string; dirty: boolean }> {
  const br = await exec('git rev-parse --abbrev-ref HEAD', 5000);
  const st = await exec('git status --porcelain', 5000);
  return { branch: br.ok ? br.stdout : 'unknown', dirty: st.ok ? st.stdout.length > 0 : false };
}

import { exec } from '../lib/exec';

export interface PullRequest { number: number; title: string; state: string; author: string; review: string; }
export interface CIRun { run: number; workflow: string; status: string; started: string; branch: string; }

export async function getPullRequests(): Promise<PullRequest[]> {
  const r = await exec('gh-axi pr list --json number,title,state,author,review --limit 10', 10000);
  if (!r.ok) throw new Error(`gh-axi pr: ${r.error}`);
  try { return JSON.parse(r.stdout); } catch { throw new Error('gh-axi pr: invalid JSON'); }
}

export async function getCIRuns(): Promise<CIRun[]> {
  const r = await exec('gh-axi run list --json name,status,startedAt,headBranch --limit 8', 10000);
  if (!r.ok) throw new Error(`gh-axi ci: ${r.error}`);
  try {
    const raw = JSON.parse(r.stdout);
    return raw.map((x:any) => ({ run: x.databaseId||x.id, workflow: x.name||x.workflowName, status: x.status||x.conclusion, started: x.startedAt||x.createdAt, branch: x.headBranch }));
  } catch { throw new Error('gh-axi ci: invalid JSON'); }
}

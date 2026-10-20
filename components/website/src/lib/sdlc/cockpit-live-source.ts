// Cockpit Live-Lage collectors (server-only) — gh + git + Plan-Frontmatter.
// Never throws: every failing source degrades to a note in `degraded` with
// partial data. No DB, no port-forward, read-only (no merge/delete anywhere).
import { execFile } from 'node:child_process';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { logger } from '../logger';
import { findRepoRoot } from './repo-root';
import {
  buildLiveFloor,
  STALE_DAYS_DEFAULT,
  type LiveBranch,
  type LiveFloor,
  type LivePlan,
  type LivePr,
} from './cockpit-live';
import type { CiCheck } from './cockpit-ci';

const TIMEOUT_MS = 8000;
const MAX_PRS = 30;

function run(cmd: string, args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { cwd, timeout: TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => {
      if (err) return reject(err);
      resolve(String(stdout));
    });
  });
}

async function defaultBranch(root: string): Promise<string> {
  try {
    const out = await run('git', ['symbolic-ref', 'refs/remotes/origin/HEAD'], root);
    const m = out.trim().match(/refs\/remotes\/origin\/(.+)$/);
    if (m) return m[1];
  } catch {
    // fall through to convention default
  }
  return 'main';
}

async function collectBranches(root: string, degraded: string[]): Promise<LiveBranch[]> {
  try {
    const def = await defaultBranch(root);
    const out = await run(
      'git',
      ['branch', '--format=%(refname:short)|%(upstream:short)|%(committerdate:iso-strict)'],
      root,
    );
    return out.split('\n').map((l) => l.trim()).filter(Boolean).map((line) => {
      const [name = '', upstream = '', date = ''] = line.split('|');
      return {
        name,
        lastCommitAt: date || null,
        hasUpstream: upstream.length > 0,
        isDefault: name === def,
      };
    }).filter((b) => b.name.length > 0);
  } catch (err) {
    logger.error({ err }, '[cockpit-live] git branches failed');
    degraded.push('git-Branches nicht lesbar');
    return [];
  }
}

function parseFrontmatterField(text: string, key: string): string | null {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  const line = m[1].split('\n').find((l) => l.trim().startsWith(`${key}:`));
  if (!line) return null;
  return line.slice(line.indexOf(':') + 1).trim() || null;
}

async function collectPlans(root: string, degraded: string[]): Promise<LivePlan[]> {
  try {
    const dir = join(root, '.agents', 'plans');
    if (!existsSync(dir)) return [];
    return readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .flatMap((e) => {
        try {
          const tasks = join(dir, e.name, 'tasks.md');
          if (!existsSync(tasks)) return [];
          const text = readFileSync(tasks, 'utf8');
          return [{
            ref: e.name,
            title: parseFrontmatterField(text, 'title') ?? e.name,
            status: parseFrontmatterField(text, 'status') ?? 'unbekannt',
          }];
        } catch {
          return [];
        }
      });
  } catch (err) {
    logger.error({ err }, '[cockpit-live] plan scan failed');
    degraded.push('Plandateien nicht lesbar');
    return [];
  }
}

interface GhPr {
  number: number;
  title: string;
  headRefName: string;
  headRefOid: string;
  isDraft: boolean;
  mergeable: string;
  mergeStateStatus: string;
  updatedAt: string;
}

async function collectPrs(root: string, degraded: string[]): Promise<{ prs: LivePr[]; slug: string | null }> {
  let slug: string | null = null;
  try {
    slug = (await run('gh', ['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner'], root)).trim() || null;
  } catch {
    slug = null;
  }
  let raw: GhPr[] = [];
  try {
    const out = await run('gh', [
      'pr', 'list', '--state', 'open', '--limit', String(MAX_PRS),
      '--json', 'number,title,headRefName,headRefOid,isDraft,mergeable,mergeStateStatus,updatedAt',
    ], root);
    const parsed: unknown = JSON.parse(out);
    if (!Array.isArray(parsed)) throw new Error('unexpected gh pr list shape');
    raw = parsed as GhPr[];
  } catch (err) {
    logger.error({ err }, '[cockpit-live] gh pr list failed');
    degraded.push('gh-PR-Liste nicht lesbar');
    return { prs: [], slug };
  }
  const prs = await Promise.all(raw.map(async (p) => {
    let checks: CiCheck[] = [];
    if (slug && p.headRefOid) {
      try {
        const out = await run('gh', [
          'api', `repos/${slug}/commits/${p.headRefOid}/check-runs`,
          '--paginate', '--jq', '[.check_runs[] | {name: .name, status: .status, conclusion: .conclusion}]',
        ], root);
        const parsed: unknown = JSON.parse(out);
        if (Array.isArray(parsed)) checks = parsed as CiCheck[];
      } catch {
        degraded.push(`Checks für PR #${p.number} nicht lesbar`);
      }
    }
    return {
      number: p.number,
      title: p.title ?? '',
      branch: p.headRefName ?? '',
      draft: p.isDraft === true,
      mergeable: p.mergeable ?? 'UNKNOWN',
      mergeStateStatus: p.mergeStateStatus ?? '',
      updatedAt: p.updatedAt ?? null,
      checks,
    };
  }));
  if (!slug) degraded.push('Repo-Slug unbekannt — CI-Checks ausgelassen');
  return { prs, slug };
}

/** Read-only live floor snapshot. Resolves in every failure mode (degraded). */
export async function collectLiveFloor(staleDays: number = STALE_DAYS_DEFAULT): Promise<LiveFloor> {
  const degraded: string[] = [];
  const nowMs = Date.now();
  let root: string;
  try {
    root = findRepoRoot();
  } catch (err) {
    logger.error({ err }, '[cockpit-live] repo root failed');
    return { ...buildLiveFloor({ branches: [], plans: [], prs: [] }, nowMs), degraded: ['Repo-Wurzel nicht bestimmbar'] };
  }
  const [branches, plans, { prs }] = await Promise.all([
    collectBranches(root, degraded),
    Promise.resolve(collectPlans(root, degraded)),
    collectPrs(root, degraded),
  ]);
  return { ...buildLiveFloor({ branches, plans, prs, staleDays }, nowMs), degraded };
}

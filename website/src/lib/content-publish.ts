// Content publish pipeline (T001490 Task 6).
//
// Admin saves for any of the 13 content domains now go through this
// module instead of the legacy `site_settings` / `service_config` /
// `leistungen_config` / `referenzen_config` / `homepage_block_*` DB
// writes. The pipeline:
//
//   1. Zod-validate the payload against the matching `ContentBundleSchema`
//      entry — fail-closed 422 if invalid (no GitHub call is made).
//   2. Read the current blob SHA for the file in main. If the editor's
//      `baseSha` does not match the live SHA → 409 with the current
//      SHA + value, so the editor can show a "stale, rebase"
//      diff and the user can re-try.
//   3. Create a branch `content/<brand>-<domain>-<Date.now()>`,
//      PUT the new file content on that branch with the
//      current blob SHA (so the write is race-free on the branch
//      level too), open a PR labelled `content`, and enable
//      `squash` + `auto-merge`. The bot token is fine-grained and
//      scoped to `contents: write` + `pull-requests: write`.
//
// All GitHub interactions are routed through the injectable
// `GitHubClient` so unit tests can drive the 409/200/422 matrix
// without a real network round-trip. The default `realGitHubClient`
// reads `GITHUB_CONTENT_TOKEN` + `CONTENT_REPO` + `CONTENT_BRANCH_BASE`
// from env.
import { ContentBundleSchema, type Domain, type SchemaOf } from '../content-schema';

/** Default repo for the content PR. */
const DEFAULT_REPO = process.env.CONTENT_REPO || 'Paddione/Bachelorprojekt';
const DEFAULT_BASE = process.env.CONTENT_BRANCH_BASE || 'main';
const FILE_PATH = (brand: string, domain: Domain) => `website/content/${brand}/${domain}.json`;

/** Per-request result of `publishContent`. */
export type PublishResult =
  | { ok: true; sha: string; prNumber: number; prUrl: string }
  | { ok: false; status: 409; currentSha: string; currentValue: unknown }
  | { ok: false; status: 422; errors: string[] };

/** Minimal surface the pipeline needs from the GitHub API. */
export interface GitHubClient {
  getFile(opts: { repo: string; path: string; ref?: string }): Promise<{ sha: string; value: unknown }>;
  createBranch(opts: { repo: string; name: string; fromRef: string }): Promise<void>;
  putFile(opts: { repo: string; branch: string; path: string; content: string; sha: string }): Promise<{ sha: string }>;
  openPr(opts: {
    repo: string;
    branch: string;
    base: string;
    title: string;
    body: string;
    labels: string[];
    squash: boolean;
    autoMerge: boolean;
  }): Promise<{ prNumber: number; prUrl: string }>;
}

/** Branch-name format `content/<brand>-<domain>-<Date.now()>`. */
function branchNameFor(brand: string, domain: Domain, ts = Date.now()): string {
  return `content/${brand}-${domain}-${ts}`;
}

function jsonStringify(value: unknown): string {
  return JSON.stringify(value, null, 2) + '\n';
}

export interface PublishInput {
  brand: string;
  domain: Domain;
  payload: unknown;
  baseSha: string | null;
  editor: string;
  client?: GitHubClient;
}

export async function publishContent(input: PublishInput): Promise<PublishResult> {
  const { brand, domain, payload, baseSha, editor } = input;
  const client = input.client ?? realGitHubClient;
  const repo = DEFAULT_REPO;
  const base = DEFAULT_BASE;
  const filePath = FILE_PATH(brand, domain);

  // 1. Zod-validate (fail-closed 422, no GitHub call)
  const schema = ContentBundleSchema[domain];
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    return {
      ok: false,
      status: 422,
      errors: parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
    };
  }

  // 2. Read current blob SHA for optimistic-concurrency check
  const current = await client.getFile({ repo, path: filePath, ref: base });
  if (baseSha !== null && baseSha !== current.sha) {
    return {
      ok: false,
      status: 409,
      currentSha: current.sha,
      currentValue: current.value,
    };
  }

  // 3. Branch → PUT → PR with squash + auto-merge
  const branch = branchNameFor(brand, domain);
  await client.createBranch({ repo, name: branch, fromRef: base });
  const put = await client.putFile({
    repo,
    branch,
    path: filePath,
    content: jsonStringify(parsed.data as SchemaOf<typeof domain>),
    sha: current.sha,
  });
  const pr = await client.openPr({
    repo,
    branch,
    base,
    title: `content(${brand}/${domain}): admin save by ${editor}`,
    body: `T001490 bot-PR content publish.\n\nEditor: ${editor}\nDomain: ${brand}/${domain}\n`,
    labels: ['content'],
    squash: true,
    autoMerge: true,
  });

  return { ok: true, sha: put.sha, prNumber: pr.prNumber, prUrl: pr.prUrl };
}

/**
 * Real GitHub client (production path). Constructed lazily so the
 * bot token is only required in a running server, never at import
 * time. Throws if the env is not set.
 */
export const realGitHubClient: GitHubClient = {
  async getFile({ repo, path, ref }) {
    const token = requireToken();
    const r = await fetch(`https://api.github.com/repos/${repo}/contents/${encodeURIComponent(path)}${ref ? `?ref=${encodeURIComponent(ref)}` : ''}`, {
      headers: ghHeaders(token),
    });
    if (!r.ok) throw new Error(`github getFile ${path} ${r.status}`);
    const body = await r.json() as { sha: string; content: string; encoding?: string };
    return { sha: body.sha, value: decodeContent(body.content, body.encoding) };
  },
  async createBranch({ repo, name, fromRef }) {
    const token = requireToken();
    const refRes = await fetch(`https://api.github.com/repos/${repo}/git/ref/heads/${encodeURIComponent(fromRef)}`, {
      headers: ghHeaders(token),
    });
    if (!refRes.ok) throw new Error(`github ref ${fromRef} ${refRes.status}`);
    const refBody = await refRes.json() as { object: { sha: string } };
    const r = await fetch(`https://api.github.com/repos/${repo}/git/refs`, {
      method: 'POST',
      headers: ghHeaders(token),
      body: JSON.stringify({ ref: `refs/heads/${name}`, sha: refBody.object.sha }),
    });
    if (!r.ok && r.status !== 422) throw new Error(`github createBranch ${name} ${r.status}`);
  },
  async putFile({ repo, branch, path, content, sha }) {
    const token = requireToken();
    const r = await fetch(`https://api.github.com/repos/${repo}/contents/${encodeURIComponent(path)}`, {
      method: 'PUT',
      headers: ghHeaders(token),
      body: JSON.stringify({
        message: `content(${branch}): update`,
        branch,
        sha,
        content: Buffer.from(content, 'utf8').toString('base64'),
      }),
    });
    if (!r.ok) throw new Error(`github putFile ${path} ${r.status}`);
    const body = await r.json() as { commit: { sha: string } };
    return { sha: body.commit.sha };
  },
  async openPr({ repo, branch, base, title, body, labels, squash, autoMerge }) {
    const token = requireToken();
    const r = await fetch(`https://api.github.com/repos/${repo}/pulls`, {
      method: 'POST',
      headers: ghHeaders(token),
      body: JSON.stringify({ title, head: branch, base, body, labels }),
    });
    if (!r.ok) throw new Error(`github openPr ${r.status}`);
    const created = await r.json() as { number: number; html_url: string };
    if (squash || autoMerge) {
      await fetch(`https://api.github.com/repos/${repo}/pulls/${created.number}`, {
        method: 'PATCH',
        headers: ghHeaders(token),
        body: JSON.stringify({ squash: !!squash }),
      });
      // Enable auto-merge (GraphQL would be cleaner, REST works for
      // repos with auto-merge enabled at the org level).
      await fetch(`https://api.github.com/repos/${repo}/pulls/${created.number}/auto-merge`, {
        method: 'PUT',
        headers: ghHeaders(token),
        body: JSON.stringify({ commit_message: 'auto-merge: bot content publish', merge_method: 'squash' }),
      });
    }
    return { prNumber: created.number, prUrl: created.html_url };
  },
};

function requireToken(): string {
  const t = process.env.GITHUB_CONTENT_TOKEN;
  if (!t) throw new Error('GITHUB_CONTENT_TOKEN is required for realGitHubClient');
  return t;
}

function ghHeaders(token: string): Record<string, string> {
  return {
    authorization: `Bearer ${token}`,
    accept: 'application/vnd.github+json',
    'x-github-api-version': '2022-11-28',
    'content-type': 'application/json',
  };
}

function decodeContent(b64: string, encoding?: string): unknown {
  if (encoding !== 'base64') return b64;
  const text = Buffer.from(b64.replace(/\n/g, ''), 'base64').toString('utf8');
  try { return JSON.parse(text); } catch { return text; }
}

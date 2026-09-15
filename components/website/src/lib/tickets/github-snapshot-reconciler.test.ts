import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyGitHubIdentitySchema } from './tables/github-identities.ts';
import { applyGitHubSnapshotSchema } from './tables/github-snapshots.ts';

const databaseUrl = process.env.GITHUB_IDENTITY_TEST_DATABASE_URL;
const integration = describe.skipIf(!databaseUrl);
let testPool: pg.Pool;
let reconciler: typeof import('./github-snapshot-reconciler.ts');

const issueInput = (node: string, number: number, repositoryNodeId = 'R_repo1') => ({
  githubNodeId: node,
  coordinate: {
    repositoryNodeId,
    owner: 'Paddione',
    repository: 'Bachelorprojekt',
    number,
    url: `https://github.com/Paddione/Bachelorprojekt/issues/${number}`
  },
  title: `Issue title ${number}`,
  body: `Issue body for ${number}`,
  state: 'OPEN' as const,
  authorLogin: 'testauthor',
  labels: ['bug', 'triage'],
  createdAt: new Date('2026-09-01T00:00:00Z'),
  updatedAt: new Date('2026-09-02T00:00:00Z')
});

const prInput = (node: string, number: number, body = '', repositoryNodeId = 'R_repo1') => ({
  githubNodeId: node,
  coordinate: {
    repositoryNodeId,
    owner: 'Paddione',
    repository: 'Bachelorprojekt',
    number,
    url: `https://github.com/Paddione/Bachelorprojekt/pull/${number}`
  },
  title: `PR title ${number}`,
  body,
  state: 'MERGED' as const,
  isDraft: false,
  headRef: 'feature/test',
  baseRef: 'main',
  authorLogin: 'prauthor',
  labels: ['enhancement'],
  createdAt: new Date('2026-09-01T10:00:00Z'),
  updatedAt: new Date('2026-09-02T12:00:00Z'),
  mergedAt: new Date('2026-09-02T12:00:00Z'),
  mergeCommitSha: '1234567890abcdef'
});

integration('GitHub snapshot reconciler (real PostgreSQL)', () => {
  beforeAll(async () => {
    testPool = new pg.Pool({ connectionString: databaseUrl });
    await testPool.query(`
      CREATE EXTENSION IF NOT EXISTS pgcrypto;
      CREATE SCHEMA IF NOT EXISTS tickets;
      CREATE TABLE IF NOT EXISTS tickets.tickets (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        external_id text NOT NULL
      );
      CREATE TABLE IF NOT EXISTS tickets.pr_events (
        pr_number integer PRIMARY KEY,
        title text NOT NULL,
        category text NOT NULL,
        merged_at timestamptz NOT NULL,
        merged_by text,
        status text NOT NULL
      );
    `);
    await applyGitHubIdentitySchema(testPool);
    await applyGitHubSnapshotSchema(testPool);

    vi.doMock('../db-pool.ts', () => ({ pool: testPool }));
    vi.doMock('../tickets-schema.ts', () => ({ initTicketsSchema: async () => undefined }));
    reconciler = await import('./github-snapshot-reconciler.ts');
  });

  beforeEach(async () => {
    await testPool.query('TRUNCATE tickets.github_objects, tickets.github_sync_cursors, tickets.pr_events CASCADE');
  });

  afterAll(async () => {
    await testPool?.end();
    vi.doUnmock('../db-pool.ts');
    vi.doUnmock('../tickets-schema.ts');
  });

  it('reconciles issue snapshots and updates sync cursor atomically', async () => {
    const res = await reconciler.reconcileGitHubIssueSnapshots(
      [issueInput('I_snap_101', 101), issueInput('I_snap_102', 102)],
      'cursor_issues_v1'
    );
    expect(res.count).toBe(2);
    expect(res.cursor).toBe('cursor_issues_v1');

    const cursor = await reconciler.getSyncCursor('issues');
    expect(cursor?.cursor).toBe('cursor_issues_v1');
    expect(cursor?.syncedCount).toBe(2);

    const snapshots = await testPool.query('SELECT * FROM tickets.github_issue_snapshots WHERE object_number IN (101, 102)');
    expect(snapshots.rowCount).toBe(2);
  });

  it('reconciles PR snapshots, registers closing relations and projects to pr_events', async () => {
    // First register target issue 201
    await reconciler.reconcileGitHubIssueSnapshots([issueInput('I_snap_target_201', 201)], 'cursor_issues_v2');

    const res = await reconciler.reconcileGitHubPRSnapshots(
      [prInput('PR_snap_501', 501, 'Closes #201')],
      'cursor_prs_v1'
    );
    expect(res.count).toBe(1);

    const cursor = await reconciler.getSyncCursor('pull_requests');
    expect(cursor?.cursor).toBe('cursor_prs_v1');

    // Check pr_events projection
    const prEvents = await testPool.query('SELECT * FROM tickets.pr_events WHERE pr_number = 501');
    expect(prEvents.rowCount).toBe(1);
    expect(prEvents.rows[0].title).toBe('PR title 501');

    // Check closing relation in github_object_relations
    const relations = await testPool.query(
      "SELECT * FROM tickets.github_object_relations WHERE kind = 'closes'"
    );
    expect(relations.rowCount).toBeGreaterThanOrEqual(1);
  });

  it('rolls back completely on error without updating sync cursor', async () => {
    const initialCursor = await reconciler.getSyncCursor('issues');

    const invalidInput = {
      githubNodeId: '', // invalid node ID fails registerGitHubObject
      coordinate: {
        repositoryNodeId: 'R_err',
        owner: 'Paddione',
        repository: 'Bachelorprojekt',
        number: 999,
        url: 'https://github.com/Paddione/Bachelorprojekt/issues/999'
      },
      title: 'Invalid',
      state: 'OPEN' as const,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    await expect(
      reconciler.reconcileGitHubIssueSnapshots([invalidInput], 'cursor_failed')
    ).rejects.toThrow();

    const afterCursor = await reconciler.getSyncCursor('issues');
    expect(afterCursor?.cursor).toBe(initialCursor?.cursor);
  });
});

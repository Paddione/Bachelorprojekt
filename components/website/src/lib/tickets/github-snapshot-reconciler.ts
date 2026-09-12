import type { PoolClient } from 'pg';
import { pool } from '../db-pool.ts';
import { initTicketsSchema } from '../tickets-schema.ts';
import {
  registerGitHubObjectInTransaction,
  recordGitHubRelationInTransaction,
  type GitHubCoordinateInput
} from './github-identity-store.ts';
import { projectSnapshotToPREventsInTransaction } from './github-pr-events-compat.ts';

export interface GitHubIssueSnapshotInput {
  githubNodeId: string;
  coordinate: GitHubCoordinateInput;
  title: string;
  body?: string | null;
  state: 'OPEN' | 'CLOSED';
  stateReason?: 'COMPLETED' | 'NOT_PLANNED' | 'REOPENED' | null;
  authorLogin?: string | null;
  labels?: string[];
  createdAt: Date | string;
  updatedAt: Date | string;
  closedAt?: Date | string | null;
}

export interface GitHubPRSnapshotInput {
  githubNodeId: string;
  coordinate: GitHubCoordinateInput;
  title: string;
  body?: string | null;
  state: 'OPEN' | 'CLOSED' | 'MERGED';
  isDraft?: boolean;
  headRef: string;
  baseRef: string;
  authorLogin?: string | null;
  labels?: string[];
  createdAt: Date | string;
  updatedAt: Date | string;
  closedAt?: Date | string | null;
  mergedAt?: Date | string | null;
  mergeCommitSha?: string | null;
}

export interface ReconcileResult {
  count: number;
  cursor: string;
}

export interface SyncCursorRecord {
  id: string;
  cursor: string;
  lastSyncedAt: Date;
  syncedCount: number;
}

async function transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  await initTicketsSchema();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function getSyncCursor(syncId: 'issues' | 'pull_requests'): Promise<SyncCursorRecord | null> {
  await initTicketsSchema();
  const res = await pool.query(
    `SELECT id, cursor, last_synced_at, synced_count FROM tickets.github_sync_cursors WHERE id = $1`,
    [syncId]
  );
  if (!res.rows[0]) return null;
  const r = res.rows[0];
  return {
    id: String(r.id),
    cursor: String(r.cursor),
    lastSyncedAt: new Date(String(r.last_synced_at)),
    syncedCount: Number(r.synced_count)
  };
}

export async function reconcileGitHubIssueSnapshots(
  snapshots: GitHubIssueSnapshotInput[],
  endCursor: string
): Promise<ReconcileResult> {
  return transaction(async (client) => {
    let processed = 0;
    const now = new Date();

    for (const snap of snapshots) {
      const reg = await registerGitHubObjectInTransaction(client, {
        githubNodeId: snap.githubNodeId,
        kind: 'issue',
        coordinate: snap.coordinate,
        observedAt: now
      });

      const createdAt = new Date(snap.createdAt);
      const updatedAt = new Date(snap.updatedAt);
      const closedAt = snap.closedAt ? new Date(snap.closedAt) : null;
      const labelsJson = JSON.stringify(snap.labels ?? []);

      await client.query(
        `INSERT INTO tickets.github_issue_snapshots (
          github_object_id, repository_node_id, object_number, title, body, state,
          state_reason, author_login, labels, created_at, updated_at, closed_at, observed_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12, $13)`,
        [
          reg.object.id,
          snap.coordinate.repositoryNodeId,
          snap.coordinate.number,
          snap.title,
          snap.body ?? null,
          snap.state,
          snap.stateReason ?? null,
          snap.authorLogin ?? null,
          labelsJson,
          createdAt,
          updatedAt,
          closedAt,
          now
        ]
      );
      processed++;
    }

    await client.query(
      `INSERT INTO tickets.github_sync_cursors (id, cursor, last_synced_at, synced_count)
       VALUES ('issues', $1, $2, $3)
       ON CONFLICT (id) DO UPDATE SET
         cursor = EXCLUDED.cursor,
         last_synced_at = EXCLUDED.last_synced_at,
         synced_count = tickets.github_sync_cursors.synced_count + EXCLUDED.synced_count`,
      [endCursor, now, processed]
    );

    return { count: processed, cursor: endCursor };
  });
}

function extractClosingIssueNumbers(body?: string | null): number[] {
  if (!body) return [];
  const pattern = /(?:closes|closes#|fixes|fixes#)\s*#?(\d+)/gi;
  const numbers: number[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(body)) !== null) {
    const num = parseInt(match[1], 10);
    if (!isNaN(num) && !numbers.includes(num)) {
      numbers.push(num);
    }
  }
  return numbers;
}

export async function reconcileGitHubPRSnapshots(
  snapshots: GitHubPRSnapshotInput[],
  endCursor: string
): Promise<ReconcileResult> {
  return transaction(async (client) => {
    let processed = 0;
    const now = new Date();

    for (const snap of snapshots) {
      const reg = await registerGitHubObjectInTransaction(client, {
        githubNodeId: snap.githubNodeId,
        kind: 'pull_request',
        coordinate: snap.coordinate,
        observedAt: now
      });

      const createdAt = new Date(snap.createdAt);
      const updatedAt = new Date(snap.updatedAt);
      const closedAt = snap.closedAt ? new Date(snap.closedAt) : null;
      const mergedAt = snap.mergedAt ? new Date(snap.mergedAt) : null;
      const labelsJson = JSON.stringify(snap.labels ?? []);

      await client.query(
        `INSERT INTO tickets.github_pr_snapshots (
          github_object_id, repository_node_id, object_number, title, body, state,
          is_draft, head_ref, base_ref, author_login, labels, created_at, updated_at,
          closed_at, merged_at, merge_commit_sha, observed_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $13, $14, $15, $16, $17)`,
        [
          reg.object.id,
          snap.coordinate.repositoryNodeId,
          snap.coordinate.number,
          snap.title,
          snap.body ?? null,
          snap.state,
          snap.isDraft ?? false,
          snap.headRef,
          snap.baseRef,
          snap.authorLogin ?? null,
          labelsJson,
          createdAt,
          updatedAt,
          closedAt,
          mergedAt,
          snap.mergeCommitSha ?? null,
          now
        ]
      );

      // Extract closing references
      const closingNumbers = extractClosingIssueNumbers(snap.body);
      for (const issueNum of closingNumbers) {
        // Resolve target issue object if registered
        const targetQ = await client.query(
          `SELECT o.id FROM tickets.github_object_coordinates c
           JOIN tickets.github_objects o ON o.id = c.github_object_id
           WHERE c.repository_node_id = $1 AND c.object_number = $2 AND o.kind = 'issue'`,
          [snap.coordinate.repositoryNodeId, issueNum]
        );
        if (targetQ.rows[0]) {
          await recordGitHubRelationInTransaction(client, {
            fromObjectId: reg.object.id,
            toObjectId: String(targetQ.rows[0].id),
            kind: 'closes',
            source: 'pr_body_reconciler'
          });
        }
      }

      // Maintain pr_events compatibility projection
      await projectSnapshotToPREventsInTransaction(client, {
        repositoryNodeId: snap.coordinate.repositoryNodeId,
        number: snap.coordinate.number,
        title: snap.title,
        body: snap.body,
        state: snap.state,
        mergedAt: mergedAt,
        authorLogin: snap.authorLogin
      });

      processed++;
    }

    await client.query(
      `INSERT INTO tickets.github_sync_cursors (id, cursor, last_synced_at, synced_count)
       VALUES ('pull_requests', $1, $2, $3)
       ON CONFLICT (id) DO UPDATE SET
         cursor = EXCLUDED.cursor,
         last_synced_at = EXCLUDED.last_synced_at,
         synced_count = tickets.github_sync_cursors.synced_count + EXCLUDED.synced_count`,
      [endCursor, now, processed]
    );

    return { count: processed, cursor: endCursor };
  });
}

import type { PoolClient } from 'pg';

export interface GitHubPRSnapshotRecordInput {
  repositoryNodeId: string;
  number: number;
  title: string;
  body?: string | null;
  state: 'OPEN' | 'CLOSED' | 'MERGED';
  mergedAt?: Date | string | null;
  authorLogin?: string | null;
}

/**
 * Projects merged PR snapshot entries into tickets.pr_events table to maintain
 * backward compatibility for metrics, factory dashboard, and DORA event consumers.
 */
export async function projectSnapshotToPREventsInTransaction(
  client: PoolClient,
  pr: GitHubPRSnapshotRecordInput
): Promise<void> {
  if (pr.state !== 'MERGED' || !pr.mergedAt) {
    return;
  }

  const mergedAtDate = new Date(pr.mergedAt);
  const category = 'feat';
  const status = 'merged';

  await client.query(
    `INSERT INTO tickets.pr_events (pr_number, title, category, merged_at, merged_by, status)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (pr_number) DO UPDATE SET
       title = EXCLUDED.title,
       merged_at = EXCLUDED.merged_at,
       merged_by = COALESCE(EXCLUDED.merged_by, tickets.pr_events.merged_by),
       status = EXCLUDED.status`,
    [pr.number, pr.title, category, mergedAtDate, pr.authorLogin ?? null, status]
  );
}

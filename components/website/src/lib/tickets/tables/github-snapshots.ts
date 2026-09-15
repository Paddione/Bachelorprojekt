import type { Pool, PoolClient } from 'pg';

/** Additive, idempotent persistence for GitHub Issue/PR snapshot reconciliation and cursors. */
export async function applyGitHubSnapshotSchema(pool: Pool | PoolClient): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tickets.github_issue_snapshots (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      github_object_id UUID NOT NULL REFERENCES tickets.github_objects(id) ON DELETE CASCADE,
      repository_node_id TEXT NOT NULL,
      object_number INTEGER NOT NULL,
      title TEXT NOT NULL,
      body TEXT,
      state TEXT NOT NULL CHECK (state IN ('OPEN', 'CLOSED')),
      state_reason TEXT CHECK (state_reason IS NULL OR state_reason IN ('COMPLETED', 'NOT_PLANNED', 'REOPENED')),
      author_login TEXT,
      labels JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL,
      closed_at TIMESTAMPTZ,
      observed_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS github_issue_snapshots_object_idx ON tickets.github_issue_snapshots (github_object_id, observed_at DESC);
    CREATE INDEX IF NOT EXISTS github_issue_snapshots_repo_num_idx ON tickets.github_issue_snapshots (repository_node_id, object_number, observed_at DESC);

    CREATE TABLE IF NOT EXISTS tickets.github_pr_snapshots (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      github_object_id UUID NOT NULL REFERENCES tickets.github_objects(id) ON DELETE CASCADE,
      repository_node_id TEXT NOT NULL,
      object_number INTEGER NOT NULL,
      title TEXT NOT NULL,
      body TEXT,
      state TEXT NOT NULL CHECK (state IN ('OPEN', 'CLOSED', 'MERGED')),
      is_draft BOOLEAN NOT NULL DEFAULT false,
      head_ref TEXT NOT NULL,
      base_ref TEXT NOT NULL,
      author_login TEXT,
      labels JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL,
      closed_at TIMESTAMPTZ,
      merged_at TIMESTAMPTZ,
      merge_commit_sha TEXT,
      observed_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS github_pr_snapshots_object_idx ON tickets.github_pr_snapshots (github_object_id, observed_at DESC);
    CREATE INDEX IF NOT EXISTS github_pr_snapshots_repo_num_idx ON tickets.github_pr_snapshots (repository_node_id, object_number, observed_at DESC);

    CREATE TABLE IF NOT EXISTS tickets.github_sync_cursors (
      id TEXT PRIMARY KEY,
      cursor TEXT NOT NULL,
      last_synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      synced_count INTEGER NOT NULL DEFAULT 0
    );
  `);
}

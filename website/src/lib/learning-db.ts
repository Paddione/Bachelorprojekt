// Learning progress tracking — PostgreSQL DML layer.
// Tables are declared in k3d/website-schema.yaml (init + ensure).
// Does NOT contain DDL or schema initialization.

import { pool } from './website-db';
import guide from './agent-guide.generated.json';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface LearningProgressRow {
  id: string;
  keycloakUserId: string;
  brand: string;
  itemType: 'goal' | 'tool';
  itemId: string;
  status: 'todo' | 'in_progress' | 'done';
  note: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  updatedAt: Date;
}

export interface LearningSummary {
  done: number;
  inProgress: number;
  total: number;
  pct: number;
  lastActivity: Date | null;
}

export interface MemberLearningSummary {
  keycloakUserId: string;
  done: number;
  inProgress: number;
  total: number;
  pct: number;
  lastActivity: Date | null;
}

export interface OnboardingStateRow {
  id: string;
  keycloakUserId: string;
  brand: string;
  stepId: string;
  completedAt: Date;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers: Load canonical guide item IDs
// ─────────────────────────────────────────────────────────────────────────────

function loadGuideItems(): { id: string; type: 'goal' | 'tool' }[] {
  const items: { id: string; type: 'goal' | 'tool' }[] = [];
  if (guide.goals) {
    for (const g of guide.goals) {
      if (g.id) items.push({ id: g.id, type: 'goal' });
    }
  }
  if (guide.tools) {
    for (const t of guide.tools) {
      if (t.id) items.push({ id: t.id, type: 'tool' });
    }
  }
  return items;
}

const guideItemsCache = loadGuideItems();

function getCanonicalItemIds(type: 'goal' | 'tool'): Set<string> {
  return new Set(
    guideItemsCache
      .filter(item => item.type === type)
      .map(item => item.id)
  );
}

function getTotalGuideItems(): number {
  return guideItemsCache.length;
}

// ─────────────────────────────────────────────────────────────────────────────
// Learning Progress DML
// ─────────────────────────────────────────────────────────────────────────────

export async function getLearningProgress(
  keycloakUserId: string,
  brand: string
): Promise<LearningProgressRow[]> {
  const result = await pool.query(
    `SELECT 
       id,
       keycloak_user_id AS "keycloakUserId",
       brand,
       item_type AS "itemType",
       item_id AS "itemId",
       status,
       note,
       started_at AS "startedAt",
       completed_at AS "completedAt",
       updated_at AS "updatedAt"
     FROM learning_progress
     WHERE keycloak_user_id = $1 AND brand = $2
     ORDER BY updated_at DESC`,
    [keycloakUserId, brand]
  );
  return result.rows;
}

export async function upsertLearningItem(
  keycloakUserId: string,
  brand: string,
  itemType: 'goal' | 'tool',
  itemId: string,
  opts: { status?: 'todo' | 'in_progress' | 'done'; note?: string }
): Promise<LearningProgressRow> {
  // Validate itemId against canonical guide.
  const canonicalIds = getCanonicalItemIds(itemType);
  if (!canonicalIds.has(itemId)) {
    throw new Error(`Invalid ${itemType} id: ${itemId} not in agent-guide`);
  }

  const newStatus = opts.status || 'todo';
  const newNote = opts.note !== undefined ? opts.note : null;

  // Compute started_at and completed_at server-side.
  const now = new Date();
  const startedAtVal = newStatus === 'todo' ? null : now;
  const completedAtVal = newStatus === 'done' ? now : null;

  const result = await pool.query(
    `INSERT INTO learning_progress 
       (keycloak_user_id, brand, item_type, item_id, status, note, started_at, completed_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
     ON CONFLICT (keycloak_user_id, brand, item_type, item_id) DO UPDATE SET
       status = $5,
       note = COALESCE($6, learning_progress.note),
       started_at = COALESCE(learning_progress.started_at, $7),
       completed_at = $8,
       updated_at = now()
     RETURNING 
       id,
       keycloak_user_id AS "keycloakUserId",
       brand,
       item_type AS "itemType",
       item_id AS "itemId",
       status,
       note,
       started_at AS "startedAt",
       completed_at AS "completedAt",
       updated_at AS "updatedAt"`,
    [
      keycloakUserId,
      brand,
      itemType,
      itemId,
      newStatus,
      newNote,
      startedAtVal,
      completedAtVal,
    ]
  );
  return result.rows[0];
}

export async function getLearningSummary(
  keycloakUserId: string,
  brand: string
): Promise<LearningSummary> {
  const result = await pool.query(
    `SELECT 
       COUNT(CASE WHEN status = 'done' THEN 1 END)::int AS done,
       COUNT(CASE WHEN status = 'in_progress' THEN 1 END)::int AS in_progress,
       MAX(updated_at) AS last_activity
     FROM learning_progress
     WHERE keycloak_user_id = $1 AND brand = $2`,
    [keycloakUserId, brand]
  );

  const row = result.rows[0];
  const done = row.done || 0;
  const inProgress = row.in_progress || 0;
  const total = getTotalGuideItems();
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return {
    done,
    inProgress,
    total,
    pct,
    lastActivity: row.last_activity ? new Date(row.last_activity) : null,
  };
}

export async function listMembersLearningSummary(
  brand: string,
  opts: { offset?: number; limit?: number } = {}
): Promise<{ members: MemberLearningSummary[]; totalCount: number }> {
  const offset = opts.offset ?? 0;
  const limit = Math.min(opts.limit ?? 20, 100);

  // Count total unique users with learning_progress in this brand.
  const countResult = await pool.query(
    `SELECT COUNT(DISTINCT keycloak_user_id) AS total
     FROM learning_progress
     WHERE brand = $1`,
    [brand]
  );
  const totalCount = parseInt(countResult.rows[0]?.total || '0', 10);

  // Aggregate per user, with pagination.
  const result = await pool.query(
    `SELECT 
       keycloak_user_id AS "keycloakUserId",
       COUNT(CASE WHEN status = 'done' THEN 1 END)::int AS done,
       COUNT(CASE WHEN status = 'in_progress' THEN 1 END)::int AS in_progress,
       MAX(updated_at) AS last_activity
     FROM learning_progress
     WHERE brand = $1
     GROUP BY keycloak_user_id
     ORDER BY last_activity DESC NULLS LAST
     LIMIT $2 OFFSET $3`,
    [brand, limit, offset]
  );

  const total = getTotalGuideItems();
  const members = result.rows.map(row => ({
    keycloakUserId: row.keycloakUserId,
    done: row.done || 0,
    inProgress: row.in_progress || 0,
    total,
    pct: total > 0 ? Math.round(((row.done || 0) / total) * 100) : 0,
    lastActivity: row.last_activity ? new Date(row.last_activity) : null,
  }));

  return { members, totalCount };
}

// ─────────────────────────────────────────────────────────────────────────────
// Onboarding State DML
// ─────────────────────────────────────────────────────────────────────────────

export async function markOnboardingStep(
  keycloakUserId: string,
  brand: string,
  stepId: string
): Promise<OnboardingStateRow> {
  const result = await pool.query(
    `INSERT INTO onboarding_state (keycloak_user_id, brand, step_id, completed_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (keycloak_user_id, brand, step_id) DO UPDATE SET
       completed_at = now()
     RETURNING 
       id,
       keycloak_user_id AS "keycloakUserId",
       brand,
       step_id AS "stepId",
       completed_at AS "completedAt"`,
    [keycloakUserId, brand, stepId]
  );
  return result.rows[0];
}

export async function getOnboardingState(
  keycloakUserId: string,
  brand: string
): Promise<OnboardingStateRow[]> {
  const result = await pool.query(
    `SELECT 
       id,
       keycloak_user_id AS "keycloakUserId",
       brand,
       step_id AS "stepId",
       completed_at AS "completedAt"
     FROM onboarding_state
     WHERE keycloak_user_id = $1 AND brand = $2
     ORDER BY completed_at ASC`,
    [keycloakUserId, brand]
  );
  return result.rows;
}

export async function resetOnboarding(
  keycloakUserId: string,
  brand: string
): Promise<void> {
  await pool.query(
    `DELETE FROM onboarding_state
     WHERE keycloak_user_id = $1 AND brand = $2`,
    [keycloakUserId, brand]
  );
}

export async function isOnboardingStepComplete(
  keycloakUserId: string,
  brand: string,
  stepId: string
): Promise<boolean> {
  const result = await pool.query(
    `SELECT 1 FROM onboarding_state
     WHERE keycloak_user_id = $1 AND brand = $2 AND step_id = $3
     LIMIT 1`,
    [keycloakUserId, brand, stepId]
  );
  return result.rows.length > 0;
}

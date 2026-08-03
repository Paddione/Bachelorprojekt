// Software Factory Phase 3 — dashboard read helpers.
// Reads the existing tickets.v_factory_metrics + tickets.v_active_features views
// (FA-SF-04) and tickets.feature_flags via the PER-BRAND pool. Same-namespace
// only — never cross-namespace (korczewski cannot reach shared-db.workspace).
import { pool } from './website-db';

interface FactoryMetricRow {
  day: string;
  features_shipped: number;
  avg_cycle_time_h: number | null;
  escalations: number;
  total_features: number;
}

interface ActiveFeatureRow {
  external_id: string;
  title: string;
  priority: string;
  status: string;
  pipeline_slot: number | null;
}

interface FeatureFlagRow {
  brand: string;
  key: string;
  enabled: boolean;
  set_by: string | null;
}

/** Daily throughput / cycle-time / escalation KPIs (last 30d), newest day first. */
export async function listFactoryMetrics(): Promise<FactoryMetricRow[]> {
  const r = await pool.query(
    `SELECT to_char(day, 'YYYY-MM-DD') AS day,
            features_shipped, avg_cycle_time_h, escalations, total_features
       FROM tickets.v_factory_metrics`,
  );
  return r.rows as FactoryMetricRow[];
}

/** The dispatcher's working set — non-terminal features with touch data. */
export async function listActiveFeatures(): Promise<ActiveFeatureRow[]> {
  const r = await pool.query(
    `SELECT external_id, title, priority, status, pipeline_slot
       FROM tickets.v_active_features`,
  );
  return r.rows as ActiveFeatureRow[];
}

/** Dark-launched (enabled=false) feature flags for this brand. */
export async function listActiveFlags(brand: string): Promise<FeatureFlagRow[]> {
  const r = await pool.query(
    `SELECT brand, key, enabled, set_by
       FROM tickets.feature_flags
      WHERE brand = $1 AND enabled = false
      ORDER BY created_at DESC`,
    [brand],
  );
  return r.rows as FeatureFlagRow[];
}

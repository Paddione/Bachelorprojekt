import { pool, ensureSchemaOnce } from './website-db';

export async function initAgentPushSettingsTable(): Promise<void> {
  return ensureSchemaOnce('agent_push_settings', async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS agent_push_settings (
        source      TEXT PRIMARY KEY,
        enabled     BOOLEAN NOT NULL DEFAULT FALSE,
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    await pool.query(`
      INSERT INTO agent_push_settings (source, enabled) VALUES ('opencode', false), ('agy', false)
        ON CONFLICT (source) DO NOTHING;
    `);
  });
}

export async function getEnabled(source: 'opencode' | 'agy'): Promise<boolean> {
  await initAgentPushSettingsTable();
  const res = await pool.query(
    'SELECT enabled FROM agent_push_settings WHERE source = $1',
    [source]
  );
  return res.rows[0]?.enabled ?? false;
}

export async function getAll(): Promise<{ opencode: boolean; agy: boolean }> {
  await initAgentPushSettingsTable();
  const res = await pool.query('SELECT source, enabled FROM agent_push_settings');
  const result = { opencode: false, agy: false };
  for (const row of res.rows) {
    if (row.source === 'opencode') {
      result.opencode = row.enabled;
    } else if (row.source === 'agy') {
      result.agy = row.enabled;
    }
  }
  return result;
}

export async function setEnabled(source: 'opencode' | 'agy', enabled: boolean): Promise<void> {
  await initAgentPushSettingsTable();
  await pool.query(
    `INSERT INTO agent_push_settings (source, enabled, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (source) DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = now()`,
    [source, enabled]
  );
}

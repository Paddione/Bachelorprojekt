// website/src/lib/schema/coaching-migrate.ts
// Einmalige, idempotente Daten-Migration: coaching.ki_config -> tickets.provider_config
// (source='coaching') + Remap der FK coaching.sessions.ki_config_id auf die neuen IDs.
//
// Verwendet bewusst einfache Per-Row-Queries (keine korrelierten Subqueries), damit die
// Logik unter pg-mem testbar ist und das Verhalten in Prod-Postgres deckungsgleich bleibt.
// Manuell je Brand-DB ausführen (workspace UND workspace-korczewski) NACH
// 2026-06-14-provider-config-unify.sql und VOR Nutzung der neuen Coaching-UI.
// Mirror für reines SQL: scripts/migrations/2026-06-14-coaching-data-migrate.sql.

import type { PoolClient } from 'pg';

const INSERT_SQL = `INSERT INTO tickets.provider_config
  (brand, source, tier, priority, provider, model_id, base_url, enabled, is_active,
   display_name, api_key, api_endpoint, temperature, max_tokens, top_p, top_k,
   system_prompt, notes, thinking_mode, presence_penalty, frequency_penalty,
   safe_prompt, random_seed, organization_id, eu_endpoint, enabled_fields)
  VALUES ($1,'coaching','coaching',$2,$3,$4,$5,true,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
  RETURNING id`;

export async function migrateCoachingKiConfig(c: PoolClient): Promise<{ migrated: number; remapped: number }> {
  await c.query(`CREATE TABLE IF NOT EXISTS coaching.ki_config_id_map (old_id BIGINT PRIMARY KEY, new_id BIGINT NOT NULL)`);

  const { rows: legacy } = await c.query(`SELECT * FROM coaching.ki_config ORDER BY id`);
  let migrated = 0;
  for (const k of legacy) {
    const existing = await c.query(
      `SELECT id FROM tickets.provider_config WHERE source='coaching' AND brand=$1 AND provider=$2`,
      [k.brand, k.provider],
    );
    let newId: number;
    if (existing.rows.length) {
      newId = existing.rows[0].id as number;
    } else {
      const ins = await c.query(INSERT_SQL, [
        k.brand, k.id, k.provider, k.model_name ?? '', k.api_endpoint ?? null, k.is_active ?? false,
        k.display_name ?? k.provider, k.api_key ?? null, k.api_endpoint ?? null, k.temperature ?? null,
        k.max_tokens ?? null, k.top_p ?? null, k.top_k ?? null, k.system_prompt ?? null, k.notes ?? null,
        k.thinking_mode ?? false, k.presence_penalty ?? null, k.frequency_penalty ?? null,
        k.safe_prompt ?? false, k.random_seed ?? null, k.organization_id ?? null, k.eu_endpoint ?? false,
        k.enabled_fields != null ? JSON.stringify(k.enabled_fields) : null,
      ]);
      newId = ins.rows[0].id as number;
      migrated++;
    }
    await c.query(
      `INSERT INTO coaching.ki_config_id_map (old_id, new_id) VALUES ($1,$2) ON CONFLICT (old_id) DO NOTHING`,
      [k.id, newId],
    );
  }

  // Alte FK (-> coaching.ki_config) lösen. Postgres-Default-Name ist <table>_<col>_fkey
  // = sessions_ki_config_id_fkey (NICHT coaching_sessions_…). Dann Sessions remappen.
  await c.query(`ALTER TABLE coaching.sessions DROP CONSTRAINT IF EXISTS sessions_ki_config_id_fkey`);

  const { rows: maps } = await c.query(`SELECT old_id, new_id FROM coaching.ki_config_id_map`);
  const oldToNew = new Map<number, number>(maps.map((m: Record<string, unknown>) => [Number(m.old_id), Number(m.new_id)]));
  const newIds = new Set<number>(maps.map((m: Record<string, unknown>) => Number(m.new_id)));

  const { rows: sessions } = await c.query(`SELECT id, ki_config_id FROM coaching.sessions WHERE ki_config_id IS NOT NULL`);
  let remapped = 0;
  for (const s of sessions) {
    const cur = Number(s.ki_config_id);
    if (newIds.has(cur)) continue;          // schon migriert (zeigt auf neue ID)
    const target = oldToNew.get(cur);
    if (target !== undefined) {
      await c.query(`UPDATE coaching.sessions SET ki_config_id=$1 WHERE id=$2`, [target, s.id]);
      remapped++;
    }
  }

  // FK neu auf den vereinheitlichten Store setzen (gleicher Name, gleiches ON DELETE SET NULL).
  // Idempotent: der DROP oben entfernt sie vor dem erneuten Anlegen.
  await c.query(
    `ALTER TABLE coaching.sessions ADD CONSTRAINT sessions_ki_config_id_fkey
       FOREIGN KEY (ki_config_id) REFERENCES tickets.provider_config(id) ON DELETE SET NULL`,
  );

  return { migrated, remapped };
}

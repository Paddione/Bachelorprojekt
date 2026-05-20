// Idempotent: insert or update the custom_lmstudio row and set it as active.
// Usage:
//   LMSTUDIO_API_KEY=sk-lm-... node scripts/seed-lmstudio-ki-config.mjs [mentolder|korczewski]
//
// The script:
//   1. Deactivates all ki_config rows for the brand
//   2. Upserts the custom_lmstudio row with the provided key/endpoint/model
//   3. Sets is_active = true on that row

import pg from 'pg';

const { Pool } = pg;

const brand   = process.argv[2] ?? 'mentolder';
const apiKey  = process.env.LMSTUDIO_API_KEY;

if (!apiKey) {
  console.error('ERROR: set LMSTUDIO_API_KEY env var before running this script');
  process.exit(1);
}

const DATABASE_URL = process.env.SESSIONS_DATABASE_URL
  ?? 'postgresql://website:devwebsitedb@localhost:5432/website';

const pool = new Pool({ connectionString: DATABASE_URL });

async function run() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Deactivate all providers for this brand
    await client.query(
      `UPDATE coaching.ki_config SET is_active = false WHERE brand = $1`,
      [brand],
    );

    // 2. Upsert the LM Studio row
    await client.query(`
      INSERT INTO coaching.ki_config
        (brand, provider, display_name, api_endpoint, model_name, api_key,
         max_tokens, is_active, enabled_fields)
      VALUES
        ($1, 'custom_lmstudio', 'LM Studio (Qwen 2.5)',
         'http://100.102.71.114:1234/v1',
         'yemiao2745/qwen2.5-14b-instruct-uncensored',
         $2,
         800, true,
         '["apiKey","apiEndpoint","modelName","maxTokens","temperature","systemPrompt","notes"]')
      ON CONFLICT (brand, provider) DO UPDATE SET
        api_endpoint = EXCLUDED.api_endpoint,
        model_name   = EXCLUDED.model_name,
        api_key      = EXCLUDED.api_key,
        max_tokens   = EXCLUDED.max_tokens,
        is_active    = true,
        display_name = EXCLUDED.display_name
    `, [brand, apiKey]);

    await client.query('COMMIT');
    console.log(`✓ custom_lmstudio set as active provider for brand '${brand}'`);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(err => { console.error(err); process.exit(1); });

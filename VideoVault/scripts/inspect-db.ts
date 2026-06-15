import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as dotenv from 'dotenv';

dotenv.config({ path: 'env/.env-app.local' });

const { Pool } = pg;

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const res = await pool.query('SELECT id, filename, path, size FROM videos LIMIT 5');
    console.log(JSON.stringify(res.rows, null, 2));
  } finally {
    await pool.end();
  }
}

main();

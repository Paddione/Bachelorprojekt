import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import type { Config } from '../config';

export function makeDb(cfg: Config) {
  const pool = new Pool({ connectionString: cfg.dbUrl, max: 10 });
  return { pool, db: drizzle(pool) };
}
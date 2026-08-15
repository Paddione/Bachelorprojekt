import { afterAll } from 'vitest';

// Close the database pool after all tests in each file to prevent
// vitest from hanging on open handles.
afterAll(async () => {
  try {
    const { pool } = await import('../db');
    if (pool) {
      await pool.end();
    }
  } catch {
    // db module might not have been imported — nothing to close
  }
});

import { pool } from '../../../lib/db-pool';

export async function GET() {
  try {
    // Prüfen ob coaching_customers Tabelle existiert
    const exists = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'coaching_customers'
      ) as exists;
    `);

    if (!exists.rows[0]?.exists) {
      // Falls nicht, leere Daten zurückgeben
      return Response.json([]);
    }

    // Echte Daten aus DB
    const result = await pool.query(`
      SELECT
        cc.id,
        cc.name as customer_name,
        cc.profile_id,
        ps.*
      FROM coaching_customers cc
      LEFT JOIN coaching_profiles ps ON cc.profile_id = ps.id
      ORDER BY cc.created_at DESC
    `);

    return Response.json(result.rows);
  } catch (error) {
    console.error('Error fetching coaching sessions:', error);
    return Response.json([]);
  }
}

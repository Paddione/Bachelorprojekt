import { pool } from '../../../lib/db-pool';
import { getSession, isAdmin } from '../../../lib/auth';

export async function GET(request: Request) {
  // Auth prüfen — nur Admin darf auf diesen Endpunkt zugreifen
  const session = await getSession(request.headers.get('cookie'));
  
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify([]), {
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    });
  }

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

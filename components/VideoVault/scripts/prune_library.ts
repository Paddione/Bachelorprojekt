import fs from 'fs';
import pg from 'pg';
const { Pool } = pg;

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL not set. Run with DOTENV_CONFIG_PATH=env/.env-app.local');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    console.log('Connecting to DB...');
    // Verify connection
    await pool.query('SELECT 1');
    console.log('Connected.');

    // Init query to check column names
    const sample = await pool.query('SELECT * FROM videos LIMIT 1');
    if (sample.rows.length > 0) {
      console.log('Sample row keys:', Object.keys(sample.rows[0]));
    }

    // Fetch all paths
    console.log('Fetching video paths...');
    const res = await pool.query('SELECT * FROM videos');
    const videos = res.rows;
    console.log(`Total videos in DB: ${videos.length}`);

    const missingIds: string[] = [];

    for (const v of videos) {
      // Key names might be case sensitive or snake_case.
      // Common drizzle pattern: id, display_name or displayName?
      // We will check keys dynamically if needed, but 'path' is usually 'path'.
      // 'displayName' might be 'display_name'.

      const pathVal = v.path;
      const nameVal = v.display_name || v.displayName || v.filename; // fallback

      if (!pathVal) {
        console.warn('Video with no path:', v.id);
        continue;
      }

      if (!fs.existsSync(pathVal)) {
        missingIds.push(v.id);
        if (nameVal && nameVal.toLowerCase().includes('greyhound')) {
          console.log(`Marked for deletion (Greyhound): ${nameVal} at ${pathVal}`);
        }
      }
    }

    console.log(`Found ${missingIds.length} missing videos.`);

    if (missingIds.length > 0) {
      console.log('Deleting missing videos...');
      const deleteRes = await pool.query('DELETE FROM videos WHERE id = ANY($1)', [missingIds]);
      console.log(`Deleted ${deleteRes.rowCount} rows.`);
    } else {
      console.log('No cleanup needed.');
    }
  } catch (err) {
    console.error('Error during prune:', err);
  } finally {
    await pool.end();
  }
}

main();

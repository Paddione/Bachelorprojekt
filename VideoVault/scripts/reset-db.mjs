import { Client } from 'pg';
import dotenv from 'dotenv';
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env vars
// Assuming the script is run from the project root or we can resolve relative to the script
const envPath = path.resolve(__dirname, '../env/.env-app.local');
console.log(`Loading env from ${envPath}`);
dotenv.config({ path: envPath });

const dbUrl = process.env.DATABASE_URL;

if (!dbUrl) {
  console.error('DATABASE_URL not found in env/.env-app.local');
  process.exit(1);
}

const client = new Client({
  connectionString: dbUrl,
});

async function resetDb() {
  try {
    await client.connect();
    console.log('Connected to database.');

    console.log('Dropping public schema...');
    await client.query('DROP SCHEMA public CASCADE;');
    await client.query('CREATE SCHEMA public;');
    await client.query('GRANT ALL ON SCHEMA public TO public;');
    console.log('Public schema recreated.');

    await client.end();

    console.log('Running drizzle-kit push...');
    execSync('npx drizzle-kit push', {
      stdio: 'inherit',
      env: { ...process.env, DATABASE_URL: dbUrl },
    });

    console.log('Database reset and initialized successfully.');
  } catch (err) {
    console.error('Error resetting database:', err);
    if (client) await client.end().catch(() => {});
    process.exit(1);
  }
}

resetDb();

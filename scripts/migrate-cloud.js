const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

async function run() {
  const connectionString = process.env.DATABASE_URL;
  const client = connectionString
    ? new Client({
        connectionString,
        ssl: process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: false },
      })
    : new Client({
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432', 10),
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || 'postgres',
        database: process.env.DB_NAME || 'gebeyaos_branch',
      });

  await client.connect();
  console.log('Connected to PostgreSQL for cloud migration.');

  const migrationsDir = path.resolve(__dirname, '..', 'database', 'migrations');
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    console.log(`Applying ${file}...`);
    try {
      await client.query(sql);
      console.log(`  ✓ ${file}`);
    } catch (err) {
      // Idempotent migrations may warn on already-existing objects; log and continue
      console.warn(`  ! ${file}: ${err.message}`);
    }
  }

  await client.end();
  console.log('All migrations processed.');
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});

const { Client } = require('pg');
const fs = require('fs');
const sql = fs.readFileSync('database/migrations/009_tenant_applications.sql', 'utf8');

async function run(db) {
  const client = new Client({ connectionString: 'postgresql://postgres:postgres@localhost:5432/' + db });
  try {
    await client.connect();
    await client.query(sql);
    console.log('Migration 009 applied to ' + db);
  } catch (err) {
    console.error('Error on ' + db + ':', err.message);
  } finally {
    await client.end();
  }
}

async function main() {
  await run('gebeyaos_branch');
  await run('gebeyaos_test');
}

main();

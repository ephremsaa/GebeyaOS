const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

async function migrate() {
  const rootClient = new Client({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: 'postgres',
    database: 'postgres',
  });
  await rootClient.connect();
  await rootClient.query('DROP DATABASE IF EXISTS gebeyaos_test');
  await rootClient.query('CREATE DATABASE gebeyaos_test');
  await rootClient.end();

  const dbClient = new Client({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: 'postgres',
    database: 'gebeyaos_test',
  });
  await dbClient.connect();

  const files = [
    'database/migrations/001_initial_schema.sql',
    'database/migrations/002_auth_and_security.sql',
    'database/seeds/001_initial_seed.sql',
    'database/migrations/003_inventory_imports.sql',
    'database/migrations/004_pos_checkout_enhancements.sql',
    'database/migrations/005_purchasing_payables_and_returns.sql',
    'database/migrations/006_multi_tenant.sql',
    'database/migrations/007_auth_security_enhancements.sql',
    'database/migrations/008_offline_sync_and_credential_replication.sql',
  ];

  for (const f of files) {
    const fullPath = path.resolve(process.cwd(), f);
    const sql = fs.readFileSync(fullPath, 'utf8');
    await dbClient.query(sql);
    console.log('Applied:', f);
  }

  // Seed Maya Supermarket
  await dbClient.query(
    "INSERT INTO tenants (id, name, slug, status, plan, max_branches, max_terminals, max_users) " +
    "VALUES ('01900000-0000-7000-8000-000000000002', 'Maya Supermarket', 'maya', 'active', 'growth', 5, 10, 30) " +
    "ON CONFLICT (id) DO NOTHING"
  );
  console.log('Seeded Maya Supermarket (Tenant B)');

  await dbClient.end();
}

migrate()
  .then(() => {
    console.log('Migration complete!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  });


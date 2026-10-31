#!/usr/bin/env node
/**
 * GebeyaOS - Reset All Supermarket Accounts & Tenant Data
 * Clears all supermarket tenants, branches, users, products, sales, and applications,
 * while preserving system reference tables and platform admin credentials.
 */

const path = require('path');
const { Client } = require(path.resolve(process.cwd(), 'node_modules/pg'));

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/gebeyaos_branch';

async function resetSupermarkets() {
  console.log('Connecting to database:', DATABASE_URL);
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();

  try {
    await client.query('BEGIN');

    console.log('1. Clearing sync queues and tenant applications...');
    await client.query('DELETE FROM tenant_applications');
    await client.query('DELETE FROM sync_outbox');
    await client.query('DELETE FROM sync_inbox');
    await client.query('DELETE FROM sync_conflict_logs');
    await client.query('DELETE FROM sync_checkpoints');
    await client.query('DELETE FROM tenant_invite_links');
    await client.query('DELETE FROM tenant_support_access');
    await client.query('DELETE FROM branch_activation_codes');
    await client.query('DELETE FROM password_resets');

    console.log('2. Wiping all supermarket tenants and cascading to tenant tables...');
    // TRUNCATE tenants cascades to all tenant tables (branches, users, products, sales, etc.)
    await client.query('TRUNCATE TABLE tenants CASCADE');

    await client.query('COMMIT');
    console.log('✓ All supermarket tenant data successfully cleared!');

    // Verification queries
    const tenantsCount = await client.query('SELECT count(*) FROM tenants');
    const usersCount = await client.query('SELECT count(*) FROM users');
    const productsCount = await client.query('SELECT count(*) FROM products');
    const branchesCount = await client.query('SELECT count(*) FROM branches');
    const terminalsCount = await client.query('SELECT count(*) FROM terminals');
    const appsCount = await client.query('SELECT count(*) FROM tenant_applications');
    const adminsCount = await client.query('SELECT count(*) FROM platform_admins');
    const rolesCount = await client.query('SELECT count(*) FROM roles');

    console.log('\n--- Database State After Clean Reset ---');
    console.log('Supermarkets (Tenants)   :', tenantsCount.rows[0].count);
    console.log('Tenant Staff Users       :', usersCount.rows[0].count);
    console.log('Branches                 :', branchesCount.rows[0].count);
    console.log('Terminals                :', terminalsCount.rows[0].count);
    console.log('Products                 :', productsCount.rows[0].count);
    console.log('Supermarket Applications :', appsCount.rows[0].count);
    console.log('Platform Admins (Kept)   :', adminsCount.rows[0].count);
    console.log('System Roles (Kept)      :', rolesCount.rows[0].count);
    console.log('----------------------------------------\n');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error during supermarket reset:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

resetSupermarkets().catch((err) => {
  console.error(err);
  process.exit(1);
});

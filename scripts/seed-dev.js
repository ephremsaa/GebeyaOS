/**
 * GebeyaOS - Developer-Only Test Data Seeder
 * BLOCKED in production (NODE_ENV=production).
 * Seeds two distinct test supermarket companies for local development & manual testing:
 * 1. Kerod Supermarket (Local Ethiopian Staples: Teff, Tena Oil, Coffee, Milk)
 * 2. Maya Supermarket  (Imported Groceries: Cereals, Spreads, Italian Pasta, Chocolates)
 */

if (process.env.NODE_ENV === 'production') {
  console.error('CRITICAL: seed:dev cannot be executed in production environment (NODE_ENV=production). Aborting.');
  process.exit(1);
}

const { Client } = require('pg');
const bcrypt = require('bcryptjs');

const KEROD_TENANT_ID = '01900000-0000-7000-8000-000000000001';
const MAYA_TENANT_ID  = '01900000-0000-7000-8000-000000000002';

async function seed() {
  if (process.env.NODE_ENV === 'production') {
    console.error('CRITICAL: seed:dev cannot be executed in production environment (NODE_ENV=production). Aborting.');
    process.exit(1);
  }

  const dbConfig = {
    host: process.env.PGHOST || 'localhost',
    port: parseInt(process.env.PGPORT || '5432', 10),
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || 'postgres',
    database: process.env.PGDATABASE || 'gebeyaos_test',
  };

  const client = new Client(dbConfig);
  await client.connect();
  console.log(`Connected to database '${dbConfig.database}' on ${dbConfig.host}:${dbConfig.port}`);

  try {
    // -------------------------------------------------------------------------
    // 1. Ensure Tenant Records Exist
    // -------------------------------------------------------------------------
    await client.query(`
      INSERT INTO tenants (
        id, name, slug, status, plan, country, default_language,
        max_branches, max_terminals, max_users, owner_email, owner_phone, tin_number
      ) VALUES
      (
        '${KEROD_TENANT_ID}',
        'Kerod Supermarket',
        'kerod',
        'active',
        'growth',
        'ET',
        'am',
        5,
        10,
        30,
        'owner@kerodsupermarket.et',
        '+251 91 123 4567',
        '0098765432'
      ),
      (
        '${MAYA_TENANT_ID}',
        'Maya Supermarket',
        'maya',
        'active',
        'starter',
        'ET',
        'en',
        3,
        5,
        15,
        'owner@mayasupermarket.et',
        '+251 92 987 6543',
        '0012345678'
      )
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        slug = EXCLUDED.slug,
        status = EXCLUDED.status,
        plan = EXCLUDED.plan;
    `);
    console.log('✅ Dev Tenants registered: Kerod Supermarket & Maya Supermarket');

    // -------------------------------------------------------------------------
    // 2. Hash Credentials
    // -------------------------------------------------------------------------
    const defaultPasswordHash = bcrypt.hashSync('Password123!', 10);
    const pin1234Hash = bcrypt.hashSync('1234', 10);
    const pin5566Hash = bcrypt.hashSync('5566', 10);
    const pin4433Hash = bcrypt.hashSync('4433', 10);

    // -------------------------------------------------------------------------
    // 3. Seed Kerod Supermarket Data
    // -------------------------------------------------------------------------
    let kerodBoleRes = await client.query(
      `SELECT id FROM branches WHERE tenant_id = $1 AND code = 'BOLE-01'`,
      [KEROD_TENANT_ID]
    );
    let kerodBoleId = kerodBoleRes.rows[0]?.id;
    if (!kerodBoleId) {
      kerodBoleId = '018e0000-0000-7000-8000-000000000020';
      await client.query(`
        INSERT INTO branches (id, tenant_id, code, name, trade_name, tin_number, phone, city, subcity, is_hq)
        VALUES ('${kerodBoleId}', '${KEROD_TENANT_ID}', 'BOLE-01', 'Kerod Bole HQ & Megastore', 'Kerod Bole', '0098765432', '+251 11 661 0001', 'Addis Ababa', 'Bole', TRUE)
        ON CONFLICT (id) DO NOTHING;
      `);
    }

    let kerodCmcRes = await client.query(
      `SELECT id FROM branches WHERE tenant_id = $1 AND code = 'CMC-02'`,
      [KEROD_TENANT_ID]
    );
    let kerodCmcId = kerodCmcRes.rows[0]?.id;
    if (!kerodCmcId) {
      kerodCmcId = '01900000-0000-7000-8000-000000000012';
      await client.query(`
        INSERT INTO branches (id, tenant_id, code, name, trade_name, tin_number, phone, city, subcity, is_hq)
        VALUES ('${kerodCmcId}', '${KEROD_TENANT_ID}', 'CMC-02', 'Kerod CMC Branch', 'Kerod CMC', '0098765432', '+251 11 664 0002', 'Addis Ababa', 'Yeka', FALSE)
        ON CONFLICT (id) DO NOTHING;
      `);
    }

    // Terminals
    await client.query(`
      INSERT INTO terminals (id, tenant_id, branch_id, code, name, device_type)
      VALUES
      ('01900000-0000-7000-8000-000000000021', '${KEROD_TENANT_ID}', '${kerodBoleId}', 'KER-POS-01', 'Express Lane 1', 'POS_STATION')
      ON CONFLICT DO NOTHING;
    `);

    // Users
    const kerodAdminUser = '01900000-0000-7000-8000-000000000031';
    const kerodCashierUser = '01900000-0000-7000-8000-000000000032';
    const adminRoleId = '018e0000-0000-7000-8000-000000000001';
    const cashierRoleId = '018e0000-0000-7000-8000-000000000003';

    await client.query(`
      INSERT INTO users (id, tenant_id, username, full_name, email, phone, password_hash, pin_hash, role_id, default_branch_id)
      VALUES
      ('${kerodAdminUser}', '${KEROD_TENANT_ID}', 'kerod_admin', 'Kerod Administrator', 'admin@kerodsupermarket.et', '+251 91 100 0001', '${defaultPasswordHash}', '${pin1234Hash}', '${adminRoleId}', '${kerodBoleId}'),
      ('${kerodCashierUser}', '${KEROD_TENANT_ID}', 'kerod_cashier', 'Bethlehem Haile', 'cashier@kerodsupermarket.et', '+251 91 100 0002', '${defaultPasswordHash}', '${pin5566Hash}', '${cashierRoleId}', '${kerodBoleId}')
      ON CONFLICT (id) DO UPDATE SET
        password_hash = EXCLUDED.password_hash,
        pin_hash = EXCLUDED.pin_hash;

      INSERT INTO user_branch_assignments (user_id, branch_id, tenant_id) VALUES
      ('${kerodAdminUser}', '${kerodBoleId}', '${KEROD_TENANT_ID}'),
      ('${kerodAdminUser}', '${kerodCmcId}', '${KEROD_TENANT_ID}'),
      ('${kerodCashierUser}', '${kerodBoleId}', '${KEROD_TENANT_ID}')
      ON CONFLICT DO NOTHING;
    `);

    // Kerod Categories
    const kerodCatGrains = '01900000-0000-7000-8000-000000000041';
    const kerodCatCoffee = '01900000-0000-7000-8000-000000000042';
    const kerodCatDairy  = '01900000-0000-7000-8000-000000000043';

    await client.query(`
      INSERT INTO categories (id, tenant_id, code, name_en, name_am) VALUES
      ('${kerodCatGrains}', '${KEROD_TENANT_ID}', 'KER_GRAINS', 'Grains & Flours', 'እህል እና ዱቄት'),
      ('${kerodCatCoffee}', '${KEROD_TENANT_ID}', 'KER_COFFEE', 'Ethiopian Coffee', 'የኢትዮጵያ ቡና'),
      ('${kerodCatDairy}',  '${KEROD_TENANT_ID}', 'KER_DAIRY',  'Local Fresh Dairy', 'ትኩስ የወተት ተዋጽኦ')
      ON CONFLICT (id) DO NOTHING;
    `);

    // Kerod Products
    const kerodProd1 = '01900000-0000-7000-8000-000000000051';
    const kerodProd2 = '01900000-0000-7000-8000-000000000052';
    const kerodProd3 = '01900000-0000-7000-8000-000000000053';
    const kerodProd4 = '01900000-0000-7000-8000-000000000054';

    await client.query(`
      INSERT INTO products (id, tenant_id, sku, name_en, name_am, category_id, uom_code, base_price, cost_price, is_vat_applicable, vat_rate, is_active) VALUES
      ('${kerodProd1}', '${KEROD_TENANT_ID}', 'KER-TEF-001', 'Magna White Teff 25kg', 'ማኛ ነጭ ጤፍ 25 ኪ.ግ', '${kerodCatGrains}', 'KG', 3200.00, 2800.00, FALSE, 0.00, TRUE),
      ('${kerodProd2}', '${KEROD_TENANT_ID}', 'KER-OIL-002', 'Tena Sunflower Cooking Oil 5L', 'ጤና የሱፍ የምግብ ዘይት 5 ሊትር', '${kerodCatGrains}', 'L', 950.00, 810.00, TRUE, 0.15, TRUE),
      ('${kerodProd3}', '${KEROD_TENANT_ID}', 'KER-COF-003', 'Yirgacheffe Roast Coffee Beans 500g', 'ይርጋጨፌ የተቆላ ቡና 500ግ', '${kerodCatCoffee}', 'PACK', 650.00, 480.00, TRUE, 0.15, TRUE),
      ('${kerodProd4}', '${KEROD_TENANT_ID}', 'KER-MLK-004', 'Mama Fresh Pasteurized Milk 500ml', 'ማማ ትኩስ ወተት 500ሚ.ሊ', '${kerodCatDairy}', 'PACK', 75.00, 58.00, FALSE, 0.00, TRUE)
      ON CONFLICT (id) DO NOTHING;

      INSERT INTO product_barcodes (product_id, barcode, barcode_type, is_primary, tenant_id) VALUES
      ('${kerodProd1}', '200100100101', 'EAN13', TRUE, '${KEROD_TENANT_ID}'),
      ('${kerodProd2}', '200100100201', 'EAN13', TRUE, '${KEROD_TENANT_ID}'),
      ('${kerodProd3}', '200100100301', 'EAN13', TRUE, '${KEROD_TENANT_ID}'),
      ('${kerodProd4}', '200100100401', 'EAN13', TRUE, '${KEROD_TENANT_ID}')
      ON CONFLICT (tenant_id, barcode) DO NOTHING;

      INSERT INTO branch_product_overrides (branch_id, product_id, selling_price, is_vat_applicable, vat_rate, is_active, tenant_id) VALUES
      ('${kerodBoleId}', '${kerodProd1}', 3200.00, FALSE, 0.00, TRUE, '${KEROD_TENANT_ID}'),
      ('${kerodBoleId}', '${kerodProd2}', 950.00, TRUE, 0.15, TRUE, '${KEROD_TENANT_ID}'),
      ('${kerodBoleId}', '${kerodProd3}', 650.00, TRUE, 0.15, TRUE, '${KEROD_TENANT_ID}'),
      ('${kerodBoleId}', '${kerodProd4}', 75.00, FALSE, 0.00, TRUE, '${KEROD_TENANT_ID}')
      ON CONFLICT (branch_id, product_id) DO NOTHING;

      -- Stock ledger entries for Kerod
      INSERT INTO stock_ledger (branch_id, product_id, tenant_id, movement_type, quantity_change, unit_cost, balance_after, reference_type, reference_id)
      VALUES
      ('${kerodBoleId}', '${kerodProd1}', '${KEROD_TENANT_ID}', 'RECEIVE', 50, 2800.00, 50, 'INITIAL_SEED', '01900000-0000-7000-8000-000000000000'),
      ('${kerodBoleId}', '${kerodProd2}', '${KEROD_TENANT_ID}', 'RECEIVE', 120, 810.00, 120, 'INITIAL_SEED', '01900000-0000-7000-8000-000000000000'),
      ('${kerodBoleId}', '${kerodProd3}', '${KEROD_TENANT_ID}', 'RECEIVE', 80, 480.00, 80, 'INITIAL_SEED', '01900000-0000-7000-8000-000000000000'),
      ('${kerodBoleId}', '${kerodProd4}', '${KEROD_TENANT_ID}', 'RECEIVE', 200, 58.00, 200, 'INITIAL_SEED', '01900000-0000-7000-8000-000000000000')
      ON CONFLICT DO NOTHING;
    `);

    // -------------------------------------------------------------------------
    // 4. Seed Maya Supermarket Data
    // -------------------------------------------------------------------------
    let mayaSarbetRes = await client.query(
      `SELECT id FROM branches WHERE tenant_id = $1 AND code = 'SAR-01'`,
      [MAYA_TENANT_ID]
    );
    let mayaSarbetId = mayaSarbetRes.rows[0]?.id;
    if (!mayaSarbetId) {
      mayaSarbetId = '01900000-0000-7000-8000-000000000061';
      await client.query(`
        INSERT INTO branches (id, tenant_id, code, name, trade_name, tin_number, phone, city, subcity, is_hq)
        VALUES ('${mayaSarbetId}', '${MAYA_TENANT_ID}', 'SAR-01', 'Maya Supermarket - Sarbet Main', 'Maya Sarbet', '0012345678', '+251 11 371 0001', 'Addis Ababa', 'Kirkos', TRUE)
        ON CONFLICT (id) DO NOTHING;
      `);
    }

    // Terminals
    await client.query(`
      INSERT INTO terminals (id, tenant_id, branch_id, code, name, device_type)
      VALUES
      ('01900000-0000-7000-8000-000000000071', '${MAYA_TENANT_ID}', '${mayaSarbetId}', 'MAY-POS-01', 'Gourmet Lane 1', 'POS_STATION')
      ON CONFLICT DO NOTHING;
    `);

    // Users & Roles
    const mayaAdminUser   = '01900000-0000-7000-8000-000000000081';
    const mayaCashierUser = '01900000-0000-7000-8000-000000000082';
    const mayaAdminRoleId   = '01900000-0000-7000-8000-000000000088';
    const mayaCashierRoleId = '01900000-0000-7000-8000-000000000089';

    await client.query(`
      INSERT INTO roles (id, tenant_id, name, description, is_system, max_discount_percentage) VALUES
      ('${mayaAdminRoleId}', '${MAYA_TENANT_ID}', 'SUPER_ADMIN', 'Maya Super Administrator', TRUE, 100.00),
      ('${mayaCashierRoleId}', '${MAYA_TENANT_ID}', 'CASHIER', 'Maya Cashier', TRUE, 10.00)
      ON CONFLICT (id) DO NOTHING;

      INSERT INTO role_permissions (role_id, permission_id, tenant_id)
      SELECT '${mayaAdminRoleId}', id, '${MAYA_TENANT_ID}' FROM permissions
      ON CONFLICT DO NOTHING;

      INSERT INTO role_permissions (role_id, permission_id, tenant_id)
      SELECT '${mayaCashierRoleId}', id, '${MAYA_TENANT_ID}' FROM permissions
      WHERE id IN ('pos:shift:open', 'pos:shift:close', 'pos:sale:create', 'pos:sale:hold', 'catalog:product:view')
      ON CONFLICT DO NOTHING;

      INSERT INTO users (id, tenant_id, username, full_name, email, phone, password_hash, pin_hash, role_id, default_branch_id)
      VALUES
      ('${mayaAdminUser}', '${MAYA_TENANT_ID}', 'maya_admin', 'Maya Administrator', 'admin@mayasupermarket.et', '+251 92 200 0001', '${defaultPasswordHash}', '${pin1234Hash}', '${mayaAdminRoleId}', '${mayaSarbetId}'),
      ('${mayaCashierUser}', '${MAYA_TENANT_ID}', 'maya_cashier', 'Dawit Kebede', 'cashier@mayasupermarket.et', '+251 92 200 0002', '${defaultPasswordHash}', '${pin4433Hash}', '${mayaCashierRoleId}', '${mayaSarbetId}')
      ON CONFLICT (id) DO UPDATE SET
        password_hash = EXCLUDED.password_hash,
        pin_hash = EXCLUDED.pin_hash;

      INSERT INTO user_branch_assignments (user_id, branch_id, tenant_id) VALUES
      ('${mayaAdminUser}', '${mayaSarbetId}', '${MAYA_TENANT_ID}'),
      ('${mayaCashierUser}', '${mayaSarbetId}', '${MAYA_TENANT_ID}')
      ON CONFLICT DO NOTHING;
    `);

    // Maya Categories
    const mayaCatCereal  = '01900000-0000-7000-8000-000000000091';
    const mayaCatSpreads = '01900000-0000-7000-8000-000000000092';
    const mayaCatPasta   = '01900000-0000-7000-8000-000000000093';

    await client.query(`
      INSERT INTO categories (id, tenant_id, code, name_en, name_am) VALUES
      ('${mayaCatCereal}',  '${MAYA_TENANT_ID}', 'MAY_CEREAL',  'Breakfast Cereals', 'የቁርስ እህሎች'),
      ('${mayaCatSpreads}', '${MAYA_TENANT_ID}', 'MAY_SPREADS', 'Spreads & Hazelnut', 'የዳቦ መቀቢያዎች'),
      ('${mayaCatPasta}',   '${MAYA_TENANT_ID}', 'MAY_PASTA',   'Italian Pastas', 'ፓስታ እና ማካሮኒ')
      ON CONFLICT (id) DO NOTHING;
    `);

    // Maya Products
    const mayaProd1 = '01900000-0000-7000-8000-0000000000A1';
    const mayaProd2 = '01900000-0000-7000-8000-0000000000A2';
    const mayaProd3 = '01900000-0000-7000-8000-0000000000A3';
    const mayaProd4 = '01900000-0000-7000-8000-0000000000A4';

    await client.query(`
      INSERT INTO products (id, tenant_id, sku, name_en, name_am, category_id, uom_code, base_price, cost_price, is_vat_applicable, vat_rate, is_active) VALUES
      ('${mayaProd1}', '${MAYA_TENANT_ID}', 'MAY-CER-001', 'Kellogg''s Corn Flakes 500g', 'ኬሎግስ የቆሎ ፍሌክስ 500ግ', '${mayaCatCereal}', 'BOX', 480.00, 390.00, TRUE, 0.15, TRUE),
      ('${mayaProd2}', '${MAYA_TENANT_ID}', 'MAY-SPR-002', 'Nutella Hazelnut Spread 750g', 'ኑቴላ ቸኮሌት ቅባት 750ግ', '${mayaCatSpreads}', 'PCS', 850.00, 710.00, TRUE, 0.15, TRUE),
      ('${mayaProd3}', '${MAYA_TENANT_ID}', 'MAY-PAS-003', 'Barilla Spaghetti No. 5 500g', 'ባሪላ ስፓጌቲ ቁ. 5 500ግ', '${mayaCatPasta}', 'PACK', 220.00, 160.00, TRUE, 0.15, TRUE),
      ('${mayaProd4}', '${MAYA_TENANT_ID}', 'MAY-CHO-004', 'Lindt Excellence 70% Dark Chocolate 100g', 'ሊንድት ጥቁር ቸኮሌት 100ግ', '${mayaCatSpreads}', 'PCS', 380.00, 290.00, TRUE, 0.15, TRUE)
      ON CONFLICT (id) DO NOTHING;

      INSERT INTO product_barcodes (product_id, barcode, barcode_type, is_primary, tenant_id) VALUES
      ('${mayaProd1}', '200200100101', 'EAN13', TRUE, '${MAYA_TENANT_ID}'),
      ('${mayaProd2}', '200200100201', 'EAN13', TRUE, '${MAYA_TENANT_ID}'),
      ('${mayaProd3}', '200200100301', 'EAN13', TRUE, '${MAYA_TENANT_ID}'),
      ('${mayaProd4}', '200200100401', 'EAN13', TRUE, '${MAYA_TENANT_ID}')
      ON CONFLICT (tenant_id, barcode) DO NOTHING;

      INSERT INTO branch_product_overrides (branch_id, product_id, selling_price, is_vat_applicable, vat_rate, is_active, tenant_id) VALUES
      ('${mayaSarbetId}', '${mayaProd1}', 480.00, TRUE, 0.15, TRUE, '${MAYA_TENANT_ID}'),
      ('${mayaSarbetId}', '${mayaProd2}', 850.00, TRUE, 0.15, TRUE, '${MAYA_TENANT_ID}'),
      ('${mayaSarbetId}', '${mayaProd3}', 220.00, TRUE, 0.15, TRUE, '${MAYA_TENANT_ID}'),
      ('${mayaSarbetId}', '${mayaProd4}', 380.00, TRUE, 0.15, TRUE, '${MAYA_TENANT_ID}')
      ON CONFLICT (branch_id, product_id) DO NOTHING;

      -- Stock ledger entries for Maya
      INSERT INTO stock_ledger (branch_id, product_id, tenant_id, movement_type, quantity_change, unit_cost, balance_after, reference_type, reference_id)
      VALUES
      ('${mayaSarbetId}', '${mayaProd1}', '${MAYA_TENANT_ID}', 'RECEIVE', 60, 390.00, 60, 'INITIAL_SEED', '01900000-0000-7000-8000-000000000000'),
      ('${mayaSarbetId}', '${mayaProd2}', '${MAYA_TENANT_ID}', 'RECEIVE', 45, 710.00, 45, 'INITIAL_SEED', '01900000-0000-7000-8000-000000000000'),
      ('${mayaSarbetId}', '${mayaProd3}', '${MAYA_TENANT_ID}', 'RECEIVE', 150, 160.00, 150, 'INITIAL_SEED', '01900000-0000-7000-8000-000000000000'),
      ('${mayaSarbetId}', '${mayaProd4}', '${MAYA_TENANT_ID}', 'RECEIVE', 90, 290.00, 90, 'INITIAL_SEED', '01900000-0000-7000-8000-000000000000')
      ON CONFLICT DO NOTHING;
    `);

    console.log('\n[seed:dev] Development tenant seed completed successfully.');
  } catch (err) {
    console.error('Error in seed:dev:', err);
    throw err;
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  seed()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { seed };


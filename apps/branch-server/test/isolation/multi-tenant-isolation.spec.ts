import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Client } from 'pg';
import { ConflictResolver, PacketBuilder, SyncEvent } from '@gebeyaos/sync-protocol';
import { ProductsService } from '../../src/modules/products/products.service';
import { DatabaseService } from '../../src/common/database/database.service';
import { NotFoundException } from '@nestjs/common';

const KEROD_TENANT_ID = '01900000-0000-7000-8000-000000000001';
const MAYA_TENANT_ID = '01900000-0000-7000-8000-000000000002';

describe('Multi-Tenant Isolation Test Suite', () => {
  // =========================================================================
  // 1. DIRECT POSTGRESQL ROW-LEVEL SECURITY (RLS) TESTS
  // =========================================================================
  describe('Direct SQL Isolation under Postgres RLS', () => {
    let pgClient: Client | null = null;
    let isDbAvailable = false;

    beforeEach(async () => {
      try {
        const client = new Client({
          host: 'localhost',
          port: 5432,
          user: 'gebeyaos_app',
          password: 'CHANGE_IN_PRODUCTION',
          database: 'gebeyaos_test',
        });
        await client.connect();
        pgClient = client;
        isDbAvailable = true;
      } catch {
        isDbAvailable = false;
      }
    });

    it('guarantees zero data leakage when app.current_tenant is unset (fail-safe)', async () => {
      if (!isDbAvailable || !pgClient) return;

      // Fail-safe check: Without setting tenant context, all queries must return 0 rows
      const prodRes = await pgClient.query('SELECT count(*) FROM products');
      expect(parseInt(prodRes.rows[0].count, 10)).toBe(0);

      const saleRes = await pgClient.query('SELECT count(*) FROM sales');
      expect(parseInt(saleRes.rows[0].count, 10)).toBe(0);

      const userRes = await pgClient.query('SELECT count(*) FROM users');
      expect(parseInt(userRes.rows[0].count, 10)).toBe(0);

      const branchRes = await pgClient.query('SELECT count(*) FROM branches');
      expect(parseInt(branchRes.rows[0].count, 10)).toBe(0);

      await pgClient.end();
    });

    it('isolates Tenant A (Kerod) data from Tenant B (Maya) across read, update, delete, and insert', async () => {
      if (!isDbAvailable || !pgClient) return;

      // 1. Authenticate as Kerod Supermarket (Tenant A)
      await pgClient.query(`SELECT set_tenant_context('${KEROD_TENANT_ID}')`);
      
      const sharedSku = `ISO-OIL-${Date.now()}`;

      // Ensure Kerod has a category and product
      const kerodCat = await pgClient.query(`
        INSERT INTO categories (id, tenant_id, code, name_en, name_am)
        VALUES (uuid_generate_v7(), '${KEROD_TENANT_ID}', 'GROCERY', 'Grocery', 'ግሮሰሪ')
        ON CONFLICT (tenant_id, code) DO UPDATE SET name_en = 'Grocery'
        RETURNING id
      `);
      const kerodCatId = kerodCat.rows[0].id;

      await pgClient.query(`
        INSERT INTO products (
          id, tenant_id, category_id, sku, name_en, name_am, uom_code, base_price, cost_price
        ) VALUES (
          uuid_generate_v7(), '${KEROD_TENANT_ID}', '${kerodCatId}', '${sharedSku}', 'Kerod Sunflower Oil 5L', 'የሱፍ ዘይት', 'PCS', 1200.0, 1000.0
        )
      `);

      const kerodProds = await pgClient.query('SELECT id, sku, base_price FROM products WHERE sku = $1', [sharedSku]);
      expect(kerodProds.rows.length).toBeGreaterThan(0);
      const sampleKerodProduct = kerodProds.rows[0];

      // 2. Switch session context to Maya Supermarket (Tenant B)
      await pgClient.query(`SELECT set_tenant_context('${MAYA_TENANT_ID}')`);

      // Attempt 1: READ Tenant A's product by ID -> MUST return 0 rows under RLS
      const crossRead = await pgClient.query('SELECT * FROM products WHERE id = $1', [sampleKerodProduct.id]);
      expect(crossRead.rows).toHaveLength(0);

      // Attempt 2: UPDATE Tenant A's product -> MUST update 0 rows
      const crossUpdate = await pgClient.query(
        'UPDATE products SET base_price = 99999.00 WHERE id = $1',
        [sampleKerodProduct.id],
      );
      expect(crossUpdate.rowCount).toBe(0);

      // Attempt 3: DELETE Tenant A's product -> MUST delete 0 rows
      const crossDelete = await pgClient.query(
        'DELETE FROM products WHERE id = $1',
        [sampleKerodProduct.id],
      );
      expect(crossDelete.rowCount).toBe(0);

      // Attempt 4: INSERT product with Tenant A's tenant_id while in Tenant B session -> MUST fail RLS WITH CHECK
      let insertError: any = null;
      try {
        await pgClient.query(
          "INSERT INTO products (" +
          "  id, tenant_id, category_id, sku, name_en, name_am, uom_code, base_price, cost_price" +
          ") VALUES (" +
          `  uuid_generate_v7(), '${KEROD_TENANT_ID}', '${kerodCatId}', 'INJECT-01', 'Injected', 'ስርቆት', 'PCS', 10, 5` +
          ")"
        );
      } catch (err: any) {
        insertError = err;
      }
      expect(insertError).toBeDefined();
      expect(insertError.message).toMatch(/violates row-level security policy/i);

      // Attempt 5: Legitimate Tenant B insert with same SKU as Tenant A (proving composite uniqueness per-tenant)
      const mayaCat = await pgClient.query(`
        INSERT INTO categories (id, tenant_id, code, name_en, name_am)
        VALUES (uuid_generate_v7(), '${MAYA_TENANT_ID}', 'BAKERY', 'Bakery', 'ዳቦ ቤት')
        ON CONFLICT (tenant_id, code) DO UPDATE SET name_en = 'Bakery'
        RETURNING id
      `);
      const mayaCatId = mayaCat.rows[0].id;

      const mayaInsert = await pgClient.query(
        "INSERT INTO products (" +
        "  id, tenant_id, category_id, sku, name_en, name_am, uom_code, base_price, cost_price" +
        ") VALUES (" +
        `  uuid_generate_v7(), '${MAYA_TENANT_ID}', '${mayaCatId}', '${sampleKerodProduct.sku}', 'Maya Version', 'የማያ ስሪት', 'PCS', 55.0, 40.0` +
        ") RETURNING id, sku"
      );
      expect(mayaInsert.rows).toHaveLength(1);
      expect(mayaInsert.rows[0].sku).toBe(sampleKerodProduct.sku);

      // Attempt 6: Re-connect as Kerod (Tenant A) and verify original product price is pristine
      await pgClient.query(`SELECT set_tenant_context('${KEROD_TENANT_ID}')`);
      const verifyKerod = await pgClient.query('SELECT base_price FROM products WHERE id = $1', [sampleKerodProduct.id]);
      expect(parseFloat(verifyKerod.rows[0].base_price)).toBe(parseFloat(sampleKerodProduct.base_price));

      await pgClient.end();
    });

    it('verifies v_rls_coverage: all tenant tables have RLS enabled, forced, and active isolation policy', async () => {
      if (!isDbAvailable || !pgClient) return;

      const res = await pgClient.query('SELECT * FROM v_rls_coverage');
      expect(res.rows.length).toBeGreaterThanOrEqual(40);

      for (const row of res.rows) {
        expect(row.rls_enabled, `Table ${row.table_name} must have RLS enabled`).toBe(true);
        expect(row.rls_forced, `Table ${row.table_name} must have RLS forced`).toBe(true);
        expect(row.isolation_policy_count, `Table ${row.table_name} must have tenant_isolation policy`).toBe(1);
      }

      await pgClient.end();
    });
  });

  // =========================================================================
  // 2. SERVICE & ENDPOINT MULTI-TENANT ISOLATION TESTS
  // =========================================================================
  describe('Service Level Multi-Tenant Boundaries', () => {
    let mockDb: any;
    let productsService: ProductsService;

    beforeEach(() => {
      mockDb = {
        query: vi.fn(),
        withTransaction: vi.fn(async (cb) => cb(mockDb)),
      };
      productsService = new ProductsService(mockDb as unknown as DatabaseService);
    });

    it('ProductsService: throws NotFoundException when attempting to update another tenant product', async () => {
      // Under RLS, querying another tenant's product returns 0 rows
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await expect(
        productsService.updateProduct('product-of-tenant-a', { name_en: 'Hacked Name' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('ProductsService: throws NotFoundException when attempting to archive another tenant product', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await expect(
        productsService.archiveProduct('product-of-tenant-a'),
      ).rejects.toThrow(NotFoundException);
    });

    it('ProductsService: allows Tenant B to create product with same SKU as Tenant A (per-tenant uniqueness)', async () => {
      const tenantBProduct = {
        id: 'maya-prod-01',
        sku: 'OIL-SUN-5L',
        name_en: 'Maya Sunflower Oil 5L',
        name_am: 'የሱፍ ዘይት 5 ሊትር',
        category_id: 'cat-01',
        uom_code: 'L',
        base_price: 1200.0,
        cost_price: 1000.0,
        is_active: true,
      };

      mockDb.query.mockResolvedValueOnce({
        rowCount: 1,
        rows: [tenantBProduct],
      });

      const result = await productsService.createProduct({
        sku: 'OIL-SUN-5L',
        name_en: 'Maya Sunflower Oil 5L',
        name_am: 'የሱፍ ዘይት 5 ሊትር',
        category_id: 'cat-01',
        uom_code: 'L',
        base_price: 1200.0,
        cost_price: 1000.0,
      });

      expect(result.sku).toBe('OIL-SUN-5L');
      expect(result.id).toBe('maya-prod-01');
    });
  });

  // =========================================================================
  // 3. SYNC ISOLATION: WRONG-TENANT CREDENTIAL REJECTION
  // =========================================================================
  describe('Sync Authority & Tenant Verification', () => {
    it('rejects events when event.tenantId does not match authenticated branch tenant', () => {
      const event: SyncEvent = {
        id: 'event-001',
        tenantId: KEROD_TENANT_ID, // Belongs to Kerod
        sourceBranchId: 'branch-maya-01',
        aggregateType: 'SALE',
        aggregateId: 'sale-001',
        eventType: 'CREATED',
        payload: { receiptNumber: 'REC-001', grandTotal: 250 },
        idempotencyKey: 'BRANCH-MAYA:SALE:sale-001:CREATED',
        timestamp: new Date().toISOString(),
      };

      // Branch authenticated as Maya Supermarket
      const evalResult = ConflictResolver.evaluateBranchEvent(event, MAYA_TENANT_ID);

      expect(evalResult.accepted).toBe(false);
      expect(evalResult.policy).toBe('APPLIED_HQ');
      expect(evalResult.reason).toContain('Cross-tenant event rejected');
    });

    it('rejects events when payload.tenant_id does not match authenticated branch tenant', () => {
      const event: SyncEvent = {
        id: 'event-002',
        sourceBranchId: 'branch-maya-01',
        aggregateType: 'SALE',
        aggregateId: 'sale-002',
        eventType: 'CREATED',
        payload: {
          tenant_id: KEROD_TENANT_ID, // Spoofed tenant_id in payload
          receiptNumber: 'REC-002',
          grandTotal: 500,
        },
        idempotencyKey: 'BRANCH-MAYA:SALE:sale-002:CREATED',
        timestamp: new Date().toISOString(),
      };

      const evalResult = ConflictResolver.evaluateBranchEvent(event, MAYA_TENANT_ID);

      expect(evalResult.accepted).toBe(false);
      expect(evalResult.policy).toBe('APPLIED_HQ');
      expect(evalResult.reason).toContain('Cross-tenant event rejected');
    });

    it('accepts legitimate events matching authenticated branch tenant', () => {
      const event: SyncEvent = {
        id: 'event-003',
        tenantId: MAYA_TENANT_ID,
        sourceBranchId: 'branch-maya-01',
        aggregateType: 'SALE',
        aggregateId: 'sale-003',
        eventType: 'CREATED',
        payload: {
          tenant_id: MAYA_TENANT_ID,
          receiptNumber: 'REC-003',
          grandTotal: 100,
        },
        idempotencyKey: 'BRANCH-MAYA:SALE:sale-003:CREATED',
        timestamp: new Date().toISOString(),
      };

      const evalResult = ConflictResolver.evaluateBranchEvent(event, MAYA_TENANT_ID);

      expect(evalResult.accepted).toBe(true);
      expect(evalResult.policy).toBe('APPLIED_BRANCH');
    });
  });
});

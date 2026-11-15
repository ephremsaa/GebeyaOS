import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ExpiryAlertService } from '../../src/modules/inventory/expiry-alert.service';
import { getDatePlusOffset } from '@gebeyaos/shared-types';

describe('ExpiryAlertService', () => {
  let service: ExpiryAlertService;
  let mockDb: any;

  beforeEach(() => {
    mockDb = {
      query: vi.fn(),
    };
    service = new ExpiryAlertService(mockDb);
  });

  afterEach(() => {
    service.onModuleDestroy();
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('scans active batches and generates idempotent alerts across stages (EXPIRED, 7D, 30D, 90D)', async () => {
    const expiredDate = getDatePlusOffset({ days: -2 });
    const date7d = getDatePlusOffset({ days: 5 });
    const date30d = getDatePlusOffset({ days: 20 });
    const date90d = getDatePlusOffset({ days: 60 });
    const dateSafe = getDatePlusOffset({ days: 120 });

    const mockBatches = [
      {
        batch_id: 'b-exp',
        batch_number: 'B-EXP-01',
        product_id: 'p-1',
        current_quantity: 10,
        expiry_date: expiredDate,
        unit_cost: '25.00',
        branch_id: 'br-1',
        tenant_id: 'ten-1',
        name_en: 'Expired Milk',
        name_am: 'ጊዜው ያለፈበት ወተት',
        sku: 'MLK-01',
        uom_code: 'PCS',
        category_name: 'Dairy',
      },
      {
        batch_id: 'b-7d',
        batch_number: 'B-7D-01',
        product_id: 'p-2',
        current_quantity: 15,
        expiry_date: date7d,
        unit_cost: '30.00',
        branch_id: 'br-1',
        tenant_id: 'ten-1',
        name_en: 'Yogurt 7D',
        name_am: 'እርጎ',
        sku: 'YGT-01',
        uom_code: 'PCS',
        category_name: 'Dairy',
      },
      {
        batch_id: 'b-30d',
        batch_number: 'B-30D-01',
        product_id: 'p-3',
        current_quantity: 20,
        expiry_date: date30d,
        unit_cost: '50.00',
        branch_id: 'br-1',
        tenant_id: 'ten-1',
        name_en: 'Butter 30D',
        name_am: 'ቅቤ',
        sku: 'BTR-01',
        uom_code: 'PCS',
        category_name: 'Dairy',
      },
      {
        batch_id: 'b-90d',
        batch_number: 'B-90D-01',
        product_id: 'p-4',
        current_quantity: 50,
        expiry_date: date90d,
        unit_cost: '100.00',
        branch_id: 'br-1',
        tenant_id: 'ten-1',
        name_en: 'Cooking Oil 90D',
        name_am: 'የምግብ ዘይት',
        sku: 'OIL-01',
        uom_code: 'LITER',
        category_name: 'Grocery',
      },
      {
        batch_id: 'b-safe',
        batch_number: 'B-SAFE-01',
        product_id: 'p-5',
        current_quantity: 100,
        expiry_date: dateSafe,
        unit_cost: '40.00',
        branch_id: 'br-1',
        tenant_id: 'ten-1',
        name_en: 'Salt Safe',
        name_am: 'ጨው',
        sku: 'SLT-01',
        uom_code: 'KG',
        category_name: 'Grocery',
      },
    ];

    // Mock query logic
    mockDb.query.mockImplementation((sql: string, params: any[]) => {
      if (sql.includes('UPDATE notifications n')) {
        return Promise.resolve({ rows: [{ id: 'notif-depleted' }], rowCount: 1 });
      }
      if (sql.includes('SELECT') && sql.includes('FROM batches b')) {
        return Promise.resolve({ rows: mockBatches });
      }
      if (sql.includes('FROM notifications') && sql.includes('WHERE batch_id = $1')) {
        // b-30d already has a notification created (idempotency check)
        if (params[0] === 'b-30d') {
          return Promise.resolve({ rows: [{ id: 'notif-existing-30d' }] });
        }
        return Promise.resolve({ rows: [] });
      }
      if (sql.includes('INSERT INTO notifications')) {
        return Promise.resolve({ rowCount: 1 });
      }
      return Promise.resolve({ rows: [] });
    });

    const res = await service.scanAndGenerateAlerts('br-1');

    expect(res.scannedBatches).toBe(5);
    // b-exp (EXPIRED), b-7d (7D), b-90d (90D) -> 3 new alerts created (b-30d skipped due to idempotency, b-safe > 90d)
    expect(res.alertsCreated).toBe(3);
    expect(res.batchesResolved).toBe(1);

    // Verify insertion parameters for critical alert
    const insertCalls = mockDb.query.mock.calls.filter((c: any[]) =>
      c[0].includes('INSERT INTO notifications'),
    );
    expect(insertCalls.length).toBe(3);

    const expiredCall = insertCalls.find((c: any[]) => c[1][2] === 'EXPIRED');
    expect(expiredCall).toBeDefined();
    expect(expiredCall[1][3]).toBe('CRITICAL');
    expect(expiredCall[1][4]).toContain('Expired: Expired Milk');

    const weekCall = insertCalls.find((c: any[]) => c[1][2] === '7D');
    expect(weekCall).toBeDefined();
    expect(weekCall[1][3]).toBe('CRITICAL');
    expect(weekCall[1][4]).toContain('Expiring in');

    const ninetyDayCall = insertCalls.find((c: any[]) => c[1][2] === '90D');
    expect(ninetyDayCall).toBeDefined();
    expect(ninetyDayCall[1][3]).toBe('WARNING');
  });

  it('executes bootstrap scan on startup without crashing', async () => {
    mockDb.query.mockResolvedValue({ rows: [] });
    await expect(service.onApplicationBootstrap()).resolves.not.toThrow();
  });
});

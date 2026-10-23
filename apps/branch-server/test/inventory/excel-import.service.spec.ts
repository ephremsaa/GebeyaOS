import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ExcelImportService } from '../../src/modules/inventory/import/excel-import.service';
import { DatabaseService } from '../../src/common/database/database.service';
import * as ExcelJS from 'exceljs';

describe('ExcelImportService (Phase 2)', () => {
  let importService: ExcelImportService;
  let mockDb: any;

  beforeEach(() => {
    mockDb = {
      query: vi.fn(),
      withTransaction: vi.fn(async (cb: any) => cb(mockDb)),
    };
    importService = new ExcelImportService(mockDb as DatabaseService);
  });

  describe('Template Generation', () => {
    it('generates a valid .xlsx template buffer with 2 sheets and headers', async () => {
      const buffer = await importService.generateTemplate();
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(1000);

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer as any);

      expect(workbook.worksheets.length).toBe(2);
      expect(workbook.worksheets[0].name).toBe('Products_Template');
      expect(workbook.worksheets[1].name).toBe('Instructions');

      const headerRow = workbook.worksheets[0].getRow(1);
      expect(headerRow.getCell(1).value).toBe('Barcode *');
      expect(headerRow.getCell(2).value).toBe('SKU *');
      expect(headerRow.getCell(3).value).toBe('Product Name (EN) *');
    });
  });

  describe('Dry-run Validation', () => {
    it('validates rows, detects duplicates, and checks expiry dates', async () => {
      // Mock hash check and existing catalog queries
      mockDb.query
        .mockResolvedValueOnce({ rows: [] }) // hash check
        .mockResolvedValueOnce({ rows: [{ sku: 'EXIST-1', barcode: '111111' }] }); // catalog

      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Test');
      sheet.addRow([
        'Barcode',
        'SKU',
        'Name (EN)',
        'Category',
        'Unit',
        'Quantity',
        'Cost',
        'Selling Price',
        'Batch',
        'Expiry Date',
      ]);

      // Row 1: Valid
      sheet.addRow([
        '6001234567890',
        'MILK-1',
        'Fresh Milk 1L',
        'Dairy & Eggs',
        'PCS',
        50,
        80,
        100,
        'B1',
        '2028-12-31',
      ]);

      // Row 2: Past Expiry Date (Error)
      sheet.addRow([
        '6001234567891',
        'YOGURT-1',
        'Strawberry Yogurt',
        'Dairy & Eggs',
        'PCS',
        20,
        30,
        45,
        'B2',
        '2020-01-01',
      ]);

      // Row 3: Duplicate Barcode in same file (Error)
      sheet.addRow([
        '6001234567890', // duplicate of row 1
        'MILK-DUP',
        'Fresh Milk Copy',
        'Dairy & Eggs',
        'PCS',
        10,
        80,
        100,
        'B3',
        '2028-12-31',
      ]);

      const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
      const result = await importService.validateImportBuffer(buffer, 'branch-1');

      expect(result.totalRows).toBe(3);
      expect(result.rows[0].status).toBe('OK');
      expect(result.rows[1].status).toBe('ERROR');
      expect(result.rows[1].issues).toContain('Expiry date is in the past');
      expect(result.rows[2].status).toBe('ERROR');
      expect(result.rows[2].issues.some((i) => i.includes('Duplicate barcode'))).toBe(true);
    });
  });

  describe('Atomic Commit & Idempotency', () => {
    it('commits rows inside one transaction and posts append-only stock ledger entries', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [] }) // duplicate hash check
        .mockResolvedValueOnce({ rows: [] }) // insert import_batches
        .mockResolvedValueOnce({ rows: [{ id: 'cat-1', name_en: 'Dairy & Eggs' }] }) // categories
        .mockResolvedValueOnce({ rows: [{ code: 'PCS' }] }) // uom
        // Row 1: product lookup (new)
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] }) // insert product
        .mockResolvedValueOnce({ rows: [] }) // insert barcode
        .mockResolvedValueOnce({ rows: [] }) // insert batch
        .mockResolvedValueOnce({ rows: [{ balance_after: '0' }] }) // ledger balance query
        .mockResolvedValueOnce({ rows: [] }) // insert stock_ledger
        .mockResolvedValueOnce({ rows: [] }) // insert import_batch_rows
        .mockResolvedValueOnce({ rows: [] }) // update import_batches counts
        .mockResolvedValueOnce({ rows: [] }); // audit log

      const result = await importService.commitImport('branch-1', 'user-1', {
        fileHash: 'testhash123',
        fileName: 'opening_stock.xlsx',
        importMode: 'CREATE_OR_UPDATE',
        sourceType: 'OPENING_BALANCE',
        rows: [
          {
            rowNumber: 2,
            sku: 'TEFF-1KG',
            barcode: '6001122334455',
            nameEn: 'White Teff 1KG',
            category: 'Dairy & Eggs',
            unit: 'PCS',
            quantity: 100,
            costPrice: 60,
            sellingPrice: 85,
            batchNumber: 'BT-01',
            expiryDate: '2028-10-10',
            status: 'OK',
            issues: [],
          },
        ],
      });

      expect(result.createdCount).toBe(1);
      expect(result.totalQuantityAdded).toBe(100);
      expect(result.batchId).toBeDefined();

      // Verify append-only stock ledger insert was called
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO stock_ledger'),
        expect.arrayContaining([100, 100, 60, expect.any(String), expect.stringContaining('IMPORT_OPENING_BALANCE'), 'user-1']),
      );
    });

    it('rejects duplicate file upload if not confirmed', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'previous-batch-id' }] });

      await expect(
        importService.commitImport('branch-1', 'user-1', {
          fileHash: 'identicalhash',
          fileName: 'stock.xlsx',
          importMode: 'CREATE_OR_UPDATE',
          sourceType: 'OPENING_BALANCE',
          confirmDuplicate: false,
          rows: [
            {
              rowNumber: 2,
              sku: 'TEFF-1KG',
              barcode: '6001122334455',
              nameEn: 'White Teff 1KG',
              category: 'Dairy & Eggs',
              unit: 'PCS',
              quantity: 10,
              costPrice: 60,
              sellingPrice: 85,
              status: 'OK',
              issues: [],
            },
          ],
        }),
      ).rejects.toThrow(/identical spreadsheet file was already imported/);
    });
  });

  describe('Undo Import (Compensating Reversal)', () => {
    it('creates offsetting negative stock ledger movements when reversing an import', async () => {
      mockDb.query
        .mockResolvedValueOnce({
          rows: [{ id: 'batch-99', file_name: 'test.xlsx', status: 'COMPLETED', branch_id: 'branch-1' }],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'row-1',
              product_id: 'prod-1',
              batch_id_ref: 'batch-ref-1',
              stock_ledger_id: 'ledger-1',
              quantity_imported: '50.000',
              unit_cost: '20.0000',
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [{ balance_after: '50.000' }] }) // current balance query
        .mockResolvedValueOnce({ rows: [] }) // insert reverse stock_ledger
        .mockResolvedValueOnce({ rows: [] }) // update row reversal_ledger_id
        .mockResolvedValueOnce({ rows: [] }) // mark batch REVERTED
        .mockResolvedValueOnce({ rows: [] }); // audit log

      const res = await importService.undoImport('batch-99', 'manager-1', 'branch-1');

      expect(res.success).toBe(true);
      expect(res.revertedItemsCount).toBe(1);

      // Verify compensating negative stock_ledger movement (-50)
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO stock_ledger'),
        expect.arrayContaining([
          -50,
          0,
          '20.0000',
          'batch-99',
          expect.stringContaining('Compensating reversal'),
          'manager-1',
        ]),
      );
    });
  });
});

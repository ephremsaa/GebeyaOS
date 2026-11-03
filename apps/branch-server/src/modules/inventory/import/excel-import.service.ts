import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
  ForbiddenException,
  Logger,
  Optional,
} from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import * as crypto from 'crypto';
import { Readable } from 'stream';
import { DatabaseService } from '../../../common/database/database.service';
import { TenantContextService } from '../../../common/tenant/tenant-context.service';
import {
  ImportMode,
  ImportSourceType,
  ParsedImportRow,
  ImportValidationSummary,
  ImportCommitRequest,
  ImportCommitResult,
  ImportBatchSummary,
  generateUuidV7,
} from '@gebeyaos/shared-types';

const DEFAULT_TENANT_ID = '01900000-0000-7000-8000-000000000001';
const MAX_IMPORT_ROWS = 20000;
const PERISHABLE_CATEGORIES = new Set([
  'DAIRY & EGGS',
  'FRESH PRODUCE',
  'BAKERY & GRAINS',
  'MEAT & BUTCHERY',
  'PRODUCE',
  'DAIRY',
  'BAKERY',
  'BUTCHERY',
]);

@Injectable()
export class ExcelImportService {
  private readonly logger = new Logger(ExcelImportService.name);

  constructor(
    private readonly db: DatabaseService,
    @Optional() private readonly tenantContext?: TenantContextService,
  ) {}

  /**
   * 1. Generate Formatted Excel Template (.xlsx)
   */
  async generateTemplate(): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'GebeyaOS Supermarket';
    workbook.created = new Date();

    // Sheet 1: Products Import Template
    const sheet = workbook.addWorksheet('Products_Template', {
      views: [{ state: 'frozen', ySplit: 1 }],
    });

    sheet.columns = [
      { header: 'Barcode *', key: 'barcode', width: 18 },
      { header: 'SKU *', key: 'sku', width: 22 },
      { header: 'Product Name (EN) *', key: 'nameEn', width: 32 },
      { header: 'Product Name (AM)', key: 'nameAm', width: 28 },
      { header: 'Category *', key: 'category', width: 20 },
      { header: 'Unit *', key: 'unit', width: 12 },
      { header: 'Initial Quantity *', key: 'quantity', width: 18 },
      { header: 'Cost Price (ETB) *', key: 'costPrice', width: 18 },
      { header: 'Shelf Price (ETB) *', key: 'sellingPrice', width: 18 },
      { header: 'Batch Number', key: 'batchNumber', width: 16 },
      { header: 'Expiry Date (YYYY-MM-DD)', key: 'expiryDate', width: 24 },
      { header: 'VAT Applicable (YES/NO)', key: 'isVat', width: 22 },
    ];

    // Style Header Row
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF16A34A' }, // Gebeya Green
    };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
    headerRow.height = 26;

    // Add Example Rows
    sheet.addRow({
      barcode: '6001234567890',
      sku: 'MILK-ANCHOR-1L',
      nameEn: 'Anchor UHT Whole Milk 1L',
      nameAm: 'አንከር ወተት 1 ሊትር',
      category: 'Dairy & Eggs',
      unit: 'PCS',
      quantity: 50,
      costPrice: 85.0,
      sellingPrice: 110.0,
      batchNumber: 'B-2026-10',
      expiryDate: '2027-04-15',
      isVat: 'YES',
    });

    sheet.addRow({
      barcode: '6009876543210',
      sku: 'FLOUR-TEFF-MAGNA-5K',
      nameEn: 'Magna White Teff Flour 5KG',
      nameAm: 'የማኛ ጤፍ ዱቄት 5 ኪ.ግ',
      category: 'Bakery & Grains',
      unit: 'PCS',
      quantity: 25,
      costPrice: 520.0,
      sellingPrice: 680.0,
      batchNumber: 'TF-998',
      expiryDate: '2027-08-30',
      isVat: 'NO',
    });

    sheet.addRow({
      barcode: '6005544332211',
      sku: 'OIL-SUNFLOWER-3L',
      nameEn: 'Golden Star Sunflower Oil 3L',
      nameAm: 'የሱፍ ዘይት 3 ሊትር',
      category: 'Household',
      unit: 'PCS',
      quantity: 40,
      costPrice: 690.0,
      sellingPrice: 890.0,
      batchNumber: 'OL-2026-01',
      expiryDate: '2027-12-31',
      isVat: 'YES',
    });

    // Sheet 2: Bilingual Instructions
    const guideSheet = workbook.addWorksheet('Instructions');
    guideSheet.columns = [
      { header: 'Rule / መስፈርት', key: 'rule', width: 30 },
      { header: 'English Description', key: 'descEn', width: 45 },
      { header: 'የአማርኛ መመሪያ', key: 'descAm', width: 45 },
    ];

    const guideHeader = guideSheet.getRow(1);
    guideHeader.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    guideHeader.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1E293B' },
    };
    guideHeader.height = 24;

    guideSheet.addRow({
      rule: 'Mandatory Fields (*)',
      descEn: 'Barcode, SKU, Product Name, Category, Unit, Quantity, Cost, and Shelf Price are required.',
      descAm: 'ባርኮድ፣ ኤስኬዩ፣ የእቃ ስም፣ ምድብ፣ መለኪያ፣ ብዛት፣ የወጪ ዋጋ እና የመሸጫ ዋጋ የግዴታ ናቸው።',
    });
    guideSheet.addRow({
      rule: 'Perishable Expiry Date',
      descEn: 'For Dairy, Produce, and Meat, Expiry Date (YYYY-MM-DD) is mandatory and must be in the future.',
      descAm: 'ለወተት፣ አትክልትና ስጋ የሚያበቃበት ቀን (YYYY-MM-DD) የግዴታ ሲሆን ወደፊት መሆን አለበት።',
    });
    guideSheet.addRow({
      rule: 'Supported Units',
      descEn: 'Use standard codes: PCS, KG, G, L, ML, PACK, BOX, BUNDLE.',
      descAm: 'መደበኛ መለኪያዎችን ይጠቀሙ፡ ፍሬ (PCS)፣ ኪሎ (KG)፣ ግራም (G)፣ ሊትር (L) ወዘተ።',
    });
    guideSheet.addRow({
      rule: 'Security (Formula Sanitization)',
      descEn: 'Do not prepend values with =, +, -, or @ formulas.',
      descAm: 'የቀመር ምልክቶችን (=, +, -, @) በመጠቀም አይጀምሩ።',
    });

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  /**
   * Helper: Normalize Unit of Measure
   */
  private normalizeUnit(unitStr?: string): string {
    const u = (unitStr || '').trim().toUpperCase();
    if (u === 'KG' || u === 'KILOGRAM' || u === 'KGS') return 'KG';
    if (u === 'G' || u === 'GRAM' || u === 'GRAMS') return 'G';
    if (u === 'L' || u === 'LITER' || u === 'LITRE' || u === 'LITERS') return 'L';
    if (u === 'ML' || u === 'MILLILITER') return 'ML';
    if (u === 'PACK' || u === 'PACKAGE' || u === 'PCK' || u === 'PKT') return 'PACK';
    if (u === 'BOX' || u === 'CARTON' || u === 'CTN') return 'BOX';
    if (u === 'BUNDLE') return 'BUNDLE';
    return 'PCS'; // Piece / Pieces / etc.
  }

  /**
   * Helper: Parse VAT / Tax representation
   */
  private parseVatType(rawVat?: string): { isVat: boolean; vatRate: number } {
    const v = (rawVat || '').trim().toUpperCase();
    if (v.includes('0%') || v.includes('EXEMPT') || v === 'NO' || v === 'FALSE' || v === '0') {
      return { isVat: false, vatRate: 0.0 };
    }
    return { isVat: true, vatRate: 0.15 };
  }

  /**
   * Helper: Detect whether a given row contains header column titles
   */
  private detectHeaderRow(row: ExcelJS.Row): Record<string, number> | null {
    const values: string[] = [];
    row.eachCell((cell) => {
      values.push((cell.value || '').toString().toLowerCase().trim());
    });
    const joined = values.join(' ');
    const hasKeywords =
      (joined.includes('barcode') || joined.includes('item')) &&
      (joined.includes('sku') || joined.includes('code') || joined.includes('name') || joined.includes('price') || joined.includes('unit'));
    if (!hasKeywords) return null;

    const mapping: Record<string, number> = {};
    row.eachCell((cell, colNumber) => {
      const val = (cell.value || '').toString().toLowerCase().trim();
      if (val.includes('barcode') || val.includes('ባርኮድ')) mapping['barcode'] = colNumber;
      else if (val.includes('sku') || val.includes('product code') || val.includes('item id') || val.includes('ኤስኬዩ') || val === 'code') mapping['sku'] = colNumber;
      else if (val.includes('name (en)') || val.includes('name en') || val.includes('items') || val.includes('item name') || val.includes('description') || (val.includes('name') && !val.includes('am')) || val.includes('ስም'))
        mapping['nameEn'] = colNumber;
      else if (val.includes('name (am)') || val.includes('name am') || val.includes('አማርኛ'))
        mapping['nameAm'] = colNumber;
      else if (val.includes('cat') || val.includes('ምድብ') || val.includes('department')) mapping['category'] = colNumber;
      else if (val.includes('unit') || val.includes('base unit') || val.includes('uom') || val.includes('መለኪያ')) mapping['unit'] = colNumber;
      else if (val.includes('quant') || val.includes('qty') || val.includes('stock') || val.includes('ብዛት')) mapping['quantity'] = colNumber;
      else if (val.includes('cost') || val.includes('buy') || val.includes('የወጪ')) mapping['costPrice'] = colNumber;
      else if (val.includes('price') || val.includes('shelf') || val.includes('sell') || val.includes('ዋጋ') || val.includes('የመሸጫ'))
        mapping['sellingPrice'] = colNumber;
      else if (val.includes('batch') || val.includes('ባች')) mapping['batchNumber'] = colNumber;
      else if (val.includes('expir') || val.includes('ያበቃበት')) mapping['expiryDate'] = colNumber;
      else if (val.includes('tax') || val.includes('vat') || val.includes('ታክስ')) mapping['isVat'] = colNumber;
    });
    return mapping;
  }

  /**
   * 2. Dry-Run Validation of Uploaded Excel/CSV Buffer
   */
  async validateImportBuffer(
    buffer: Buffer,
    branchId: string,
  ): Promise<ImportValidationSummary> {
    const fileHash = crypto.createHash('sha256').update(buffer).digest('hex');

    // Check if file was previously imported
    const hashCheck = await this.db.query(
      `SELECT id, file_name, created_at, status FROM import_batches WHERE branch_id = $1 AND file_hash = $2 LIMIT 1`,
      [branchId, fileHash],
    );
    const duplicateFileWarning = hashCheck.rows.length > 0;

    // Load existing catalog barcodes and SKUs for collision/existence checking
    const existingProductsRes = await this.db.query(
      `SELECT p.id, p.sku, pb.barcode
       FROM products p
       LEFT JOIN product_barcodes pb ON pb.product_id = p.id`,
    );
    const existingBarcodes = new Set<string>();
    const existingSkus = new Set<string>();
    for (const r of existingProductsRes.rows) {
      if (r.barcode) existingBarcodes.add(r.barcode.trim());
      if (r.sku) existingSkus.add(r.sku.toUpperCase().trim());
    }

    const workbook = new ExcelJS.Workbook();
    const isZip = buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4B;

    if (isZip) {
      try {
        await workbook.xlsx.load(buffer as any);
      } catch (err: any) {
        throw new BadRequestException('Invalid or corrupted Excel spreadsheet (.xlsx): ' + err.message);
      }
    } else {
      try {
        const stream = Readable.from(buffer);
        await workbook.csv.read(stream);
      } catch (err: any) {
        throw new BadRequestException('Invalid or corrupted CSV file: ' + err.message);
      }
    }

    const sheet = workbook.worksheets[0];
    if (!sheet) {
      throw new BadRequestException('The workbook does not contain any sheets.');
    }

    let currentColMap: Record<string, number> = {};
    const parsedBySku = new Map<string, ParsedImportRow>();
    const seenBarcodesInFile = new Map<string, number>();
    let okCount = 0;
    let warningCount = 0;
    let errorCount = 0;

    const rowCount = Math.min(sheet.rowCount, MAX_IMPORT_ROWS);

    for (let r = 1; r <= rowCount; r++) {
      const row = sheet.getRow(r);
      if (row.actualCellCount === 0) continue;

      // Check if this row is a header row (either row 1 or a secondary section header)
      const detectedMap = this.detectHeaderRow(row);
      if (detectedMap && Object.keys(detectedMap).length >= 3) {
        currentColMap = detectedMap;
        continue;
      }

      if (Object.keys(currentColMap).length === 0) continue;

      const getVal = (field: string) => {
        const col = currentColMap[field];
        if (!col) return '';
        const raw = row.getCell(col).value;
        if (raw === null || raw === undefined) return '';
        if (typeof raw === 'object' && 'text' in raw) return (raw as any).text.trim();
        return raw.toString().trim();
      };

      let barcode = getVal('barcode');
      let sku = getVal('sku');
      let nameEn = getVal('nameEn');
      const nameAm = getVal('nameAm');
      const category = getVal('category') || 'General';
      const rawUnit = getVal('unit');
      const rawQty = getVal('quantity');
      const rawCost = getVal('costPrice');
      const rawSell = getVal('sellingPrice');
      const batchNumber = getVal('batchNumber') || undefined;
      const rawExpiry = getVal('expiryDate');
      const rawVat = getVal('isVat');

      // Skip spacer or empty rows
      if (!nameEn && !sku && !barcode) continue;
      if (nameEn.toLowerCase() === 'items' || sku.toLowerCase() === 'product code') continue;

      if (!sku) {
        sku = barcode || `SKU-${r.toString().padStart(4, '0')}`;
      }

      // Auto-assign in-store internal barcode if missing
      let isAutoBarcode = false;
      if (!barcode) {
        isAutoBarcode = true;
        const isNum = /^\d+$/.test(sku);
        if (isNum) {
          barcode = '200' + sku.padStart(9, '0') + '0';
        } else {
          barcode = 'INT-' + sku.toUpperCase();
        }
      }

      const unit = this.normalizeUnit(rawUnit);
      const quantity = parseFloat(rawQty) || 0;
      const costPrice = parseFloat(rawCost) || 0;
      const sellingPrice = parseFloat(rawSell) || 0;
      const { isVat } = this.parseVatType(rawVat);

      const issues: string[] = [];

      if (!nameEn) issues.push('Missing Product Name');

      let formattedExpiry: string | undefined = undefined;
      if (rawExpiry) {
        if (!isNaN(Number(rawExpiry)) && Number(rawExpiry) > 20000) {
          const excelDate = new Date((Number(rawExpiry) - (25567 + 2)) * 86400 * 1000);
          formattedExpiry = excelDate.toISOString().slice(0, 10);
        } else {
          formattedExpiry = rawExpiry.slice(0, 10);
        }

        if (formattedExpiry) {
          const expDate = new Date(formattedExpiry);
          if (!isNaN(expDate.getTime()) && expDate.getTime() < Date.now()) {
            issues.push('Expiry date is in the past');
          }
        }
      }

      if (!isAutoBarcode && barcode) {
        if (seenBarcodesInFile.has(barcode)) {
          const prevRow = seenBarcodesInFile.get(barcode)!;
          issues.push(`Duplicate barcode '${barcode}' in file (matches row ${prevRow})`);
        } else {
          seenBarcodesInFile.set(barcode, r);
        }
      }

      let status: 'OK' | 'WARNING' | 'ERROR' = 'OK';
      if (issues.length > 0) {
        status = 'ERROR';
      } else if (existingBarcodes.has(barcode) || existingSkus.has(sku.toUpperCase())) {
        status = 'WARNING';
        issues.push('Product already exists in catalog (will update price/cost/stock if selected)');
      }

      const skuKey = sku.toUpperCase();
      if (parsedBySku.has(skuKey)) {
        // Merge with existing row from earlier in the same file
        const existing = parsedBySku.get(skuKey)!;
        if (rawVat) existing.isVat = isVat;
        if (sellingPrice > 0 && existing.sellingPrice === 0) existing.sellingPrice = sellingPrice;
        if (barcode && (!existing.barcode || existing.barcode.startsWith('200') || existing.barcode.startsWith('INT-'))) {
          existing.barcode = barcode;
        }
        continue;
      }

      const parsedRow: ParsedImportRow = {
        rowNumber: r,
        sku: this.sanitizeCell(sku),
        barcode: this.sanitizeCell(barcode),
        nameEn: this.sanitizeCell(nameEn),
        nameAm: nameAm ? this.sanitizeCell(nameAm) : undefined,
        category: this.sanitizeCell(category),
        unit,
        quantity,
        costPrice,
        sellingPrice,
        batchNumber: batchNumber ? this.sanitizeCell(batchNumber) : undefined,
        expiryDate: formattedExpiry,
        isVat,
        status,
        issues,
      };

      parsedBySku.set(skuKey, parsedRow);

      if (status === 'OK') okCount++;
      else if (status === 'WARNING') warningCount++;
      else errorCount++;
    }

    const finalRows = Array.from(parsedBySku.values());

    return {
      totalRows: finalRows.length,
      okRows: okCount,
      warningRows: warningCount,
      errorRows: errorCount,
      duplicateFileWarning,
      fileHash,
      rows: finalRows,
    };
  }

  /**
   * 3. Commit Import in ONE Single Atomic Database Transaction
   */
  async commitImport(
    branchId: string,
    userId: string,
    req: ImportCommitRequest,
    tenantId?: string,
  ): Promise<ImportCommitResult> {
    if (!req.rows || req.rows.length === 0) {
      throw new BadRequestException('No rows provided to commit.');
    }

    const effectiveTenantId = tenantId || this.tenantContext?.getTenantId() || DEFAULT_TENANT_ID;
    const effectiveBranchId = branchId || '01a19309-1d43-7444-b260-5b2ffac3e40c';

    // Idempotency check: if duplicate hash and not confirmed, throw Conflict
    if (!req.confirmDuplicate) {
      const dup = await this.db.query(
        `SELECT id FROM import_batches WHERE branch_id = $1 AND file_hash = $2 AND status = 'COMPLETED' LIMIT 1`,
        [effectiveBranchId, req.fileHash],
      );
      if (dup?.rows?.length > 0) {
        throw new ConflictException(
          'This identical spreadsheet file was already imported. Please confirm duplicate import if you wish to proceed.',
        );
      }
    }

    return this.db.withTransaction(async (client) => {

      const batchId = generateUuidV7();
      let createdCount = 0;
      let updatedCount = 0;
      let skippedCount = 0;
      let failedCount = 0;
      let totalQtyAdded = 0;

      // 1. Create import_batches master record
      await client.query(
        `INSERT INTO import_batches (id, branch_id, user_id, file_name, file_hash, import_mode, source_type, supplier_id, total_rows, status, tenant_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'COMPLETED', $10)`,
        [
          batchId,
          effectiveBranchId,
          userId,
          req.fileName,
          req.fileHash,
          req.importMode,
          req.sourceType,
          req.supplierId || null,
          req.rows.length,
          effectiveTenantId,
        ],
      );

      // Pre-fetch Category & Unit mappings for this tenant
      const catRes = await client.query(
        `SELECT id, name_en FROM categories WHERE tenant_id = $1`,
        [effectiveTenantId],
      );
      const catMap = new Map<string, string>();
      for (const c of catRes.rows) catMap.set(c.name_en.toLowerCase().trim(), c.id);

      const uomRes = await client.query(`SELECT code FROM units_of_measure`);
      const validUoms = new Set<string>(uomRes.rows.map((u: any) => u.code));

      for (const row of req.rows) {
        if (row.status === 'ERROR') {
          failedCount++;
          continue;
        }

        // Find existing product by barcode or SKU in this tenant
        const prodCheck = await client.query(
          `SELECT p.id, p.sku, pb.id as barcode_id, pb.barcode
           FROM products p
           LEFT JOIN product_barcodes pb ON pb.product_id = p.id AND pb.tenant_id = p.tenant_id AND pb.barcode = $1
           WHERE p.tenant_id = $3 AND (pb.barcode = $1 OR UPPER(p.sku) = UPPER($2))
           LIMIT 1`,
          [row.barcode, row.sku, effectiveTenantId],
        );

        let productId: string;

        // Resolve or auto-create category for this tenant
        const catName = (row.category || 'General').trim();
        let categoryId: string | undefined = catMap.get(catName.toLowerCase());
        if (!categoryId) {
          const newCatId = generateUuidV7();
          const cleanCode =
            catName.toUpperCase().replace(/[^A-Z0-9]/g, '_').slice(0, 15) ||
            'CAT';
          const code = `${cleanCode}_${Date.now().toString().slice(-4)}`;
          const insCat = await client.query(
            `INSERT INTO categories (id, code, name_en, is_active, tenant_id)
             VALUES ($1, $2, $3, true, $4)
             ON CONFLICT (tenant_id, code) DO UPDATE SET name_en = EXCLUDED.name_en
             RETURNING id`,
            [newCatId, code, catName, effectiveTenantId],
          );
          categoryId = insCat.rows[0].id as string;
          catMap.set(catName.toLowerCase(), categoryId);
        }
        const resolvedCategoryId: string = categoryId;

        const isVat = row.isVat ?? true;
        const vatRate = isVat ? 0.15 : 0.0;
        const isWeighed = row.unit === 'KG' || row.unit === 'G';
        const uomCode = row.unit && validUoms.has(row.unit) ? row.unit : 'PCS';

        if (prodCheck.rows.length > 0) {
          // Existing Product
          productId = prodCheck.rows[0].id;

          if (req.importMode === 'NEW_ONLY') {
            skippedCount++;
            continue;
          }

          // Update Product details if CREATE_OR_UPDATE
          if (req.importMode === 'CREATE_OR_UPDATE') {
            await client.query(
              `UPDATE products
               SET name_en = $1,
                   name_am = COALESCE($2, name_am),
                   base_price = $3,
                   cost_price = $4,
                   is_vat_applicable = $5,
                   vat_rate = $6,
                   is_weighed = $7,
                   category_id = COALESCE($8, category_id),
                   updated_at = clock_timestamp()
               WHERE id = $9 AND tenant_id = $10`,
              [
                row.nameEn,
                row.nameAm || null,
                row.sellingPrice,
                row.costPrice,
                isVat,
                vatRate,
                isWeighed,
                resolvedCategoryId,
                productId,
                effectiveTenantId,
              ],
            );
            updatedCount++;
          }
        } else {
          // New Product
          if (req.importMode === 'ADD_STOCK_EXISTING') {
            skippedCount++;
            continue;
          }

          productId = generateUuidV7();

          await client.query(
            `INSERT INTO products (id, sku, name_en, name_am, category_id, uom_code, base_price, cost_price, is_vat_applicable, vat_rate, is_weighed, min_stock_level, tenant_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 10, $12)`,
            [
              productId,
              row.sku.toUpperCase(),
              row.nameEn,
              row.nameAm || null,
              resolvedCategoryId,
              uomCode,
              row.sellingPrice,
              row.costPrice,
              isVat,
              vatRate,
              isWeighed,
              effectiveTenantId,
            ],
          );

          // Insert primary barcode
          await client.query(
            `INSERT INTO product_barcodes (id, product_id, barcode, is_primary, pack_multiplier, tenant_id)
             VALUES ($1, $2, $3, TRUE, 1, $4)
             ON CONFLICT (tenant_id, barcode) DO NOTHING`,
            [generateUuidV7(), productId, row.barcode, effectiveTenantId],
          );
          createdCount++;
        }

        // Create Batch if perishable or batch specified
        let batchIdRef: string | null = null;
        if (row.expiryDate || row.batchNumber) {
          batchIdRef = generateUuidV7();
          const expDate = row.expiryDate ? new Date(row.expiryDate) : null;
          await client.query(
            `INSERT INTO batches (id, branch_id, product_id, batch_number, expiry_date, unit_cost, initial_quantity, current_quantity, tenant_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $7, $8)`,
            [
              batchIdRef,
              effectiveBranchId,
              productId,
              row.batchNumber || `BATCH-${Date.now()}`,
              expDate,
              row.costPrice,
              row.quantity,
              effectiveTenantId,
            ],
          );
        }

        // Add to append-only stock_ledger if quantity > 0
        let stockLedgerId: string | null = null;
        if (row.quantity > 0) {
          stockLedgerId = generateUuidV7();
          const reason =
            req.sourceType === 'OPENING_BALANCE'
              ? 'IMPORT_OPENING_BALANCE'
              : 'IMPORT_GOODS_RECEIVED';

          // Get current balance
          const balRes = await client.query(
            `SELECT balance_after FROM stock_ledger
             WHERE branch_id = $1 AND product_id = $2
             ORDER BY created_at DESC LIMIT 1`,
            [effectiveBranchId, productId],
          );
          const currentBal = balRes.rows.length > 0 ? parseFloat(balRes.rows[0].balance_after) : 0;
          const newBal = currentBal + row.quantity;

          await client.query(
            `INSERT INTO stock_ledger (id, branch_id, product_id, batch_id, movement_type, quantity_change, balance_after, unit_cost, reference_type, reference_id, notes, created_by, tenant_id)
             VALUES ($1, $2, $3, $4, 'PURCHASE_RECEIVE', $5, $6, $7, 'IMPORT_BATCH', $8, $9, $10, $11)`,
            [
              stockLedgerId,
              effectiveBranchId,
              productId,
              batchIdRef,
              row.quantity,
              newBal,
              row.costPrice,
              batchId,
              `Excel Import: ${req.fileName} (Row ${row.rowNumber}) - ${reason}`,
              userId,
              effectiveTenantId,
            ],
          );

          totalQtyAdded += row.quantity;
        }

        // Record import row detail
        await client.query(
          `INSERT INTO import_batch_rows (id, batch_id, row_number, sku, barcode, product_id, batch_id_ref, stock_ledger_id, quantity_imported, unit_cost, status, raw_data, tenant_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'OK', $11, $12)`,
          [
            generateUuidV7(),
            batchId,
            row.rowNumber,
            row.sku,
            row.barcode,
            productId,
            batchIdRef,
            stockLedgerId,
            row.quantity,
            row.costPrice,
            JSON.stringify(row),
            effectiveTenantId,
          ],
        );
      }

      // Update counts on master batch record
      await client.query(
        `UPDATE import_batches
         SET created_count = $1, updated_count = $2, skipped_count = $3, error_count = $4
         WHERE id = $5`,
        [createdCount, updatedCount, skippedCount, failedCount, batchId],
      );

      // Log audit entry
      await client.query(
        `INSERT INTO audit_logs (id, branch_id, user_id, action, entity_name, entity_id, details, tenant_id)
         VALUES ($1, $2, $3, 'INVENTORY_IMPORT_COMMITTED', 'import_batches', $4, $5, $6)`,
        [
          generateUuidV7(),
          effectiveBranchId,
          userId,
          batchId,
          JSON.stringify({
            fileName: req.fileName,
            createdCount,
            updatedCount,
            totalQtyAdded,
          }),
          effectiveTenantId,
        ],
      );

      return {
        batchId,
        fileName: req.fileName,
        importMode: req.importMode,
        sourceType: req.sourceType,
        totalRows: req.rows.length,
        createdCount,
        updatedCount,
        skippedCount,
        failedCount,
        totalQuantityAdded: totalQtyAdded,
      };
    });
  }

  /**
   * 4. Manager "Undo This Import" Reversal Workflow
   */
  async undoImport(batchId: string, managerId: string, branchId: string) {
    const batchRes = await this.db.query(
      `SELECT id, file_name, status, branch_id, tenant_id FROM import_batches WHERE id = $1`,
      [batchId],
    );
    if (batchRes.rows.length === 0) {
      throw new NotFoundException('Import batch not found.');
    }
    const batch = batchRes.rows[0];
    if (batch.status === 'REVERTED') {
      throw new BadRequestException('This import batch has already been reverted.');
    }

    return this.db.withTransaction(async (client) => {
      // Find all rows in batch that added stock
      const rowsRes = await client.query(
        `SELECT id, product_id, batch_id_ref, stock_ledger_id, quantity_imported, unit_cost
         FROM import_batch_rows
         WHERE batch_id = $1 AND stock_ledger_id IS NOT NULL AND quantity_imported > 0`,
        [batchId],
      );

      let revertedCount = 0;
      for (const row of rowsRes.rows) {
        const revLedgerId = generateUuidV7();

        // Query current balance
        const balRes = await client.query(
          `SELECT balance_after FROM stock_ledger
           WHERE branch_id = $1 AND product_id = $2
           ORDER BY created_at DESC LIMIT 1`,
          [batch.branch_id || branchId, row.product_id],
        );
        const curBal = balRes.rows.length > 0 ? parseFloat(balRes.rows[0].balance_after) : 0;
        const newBal = Math.max(0, curBal - parseFloat(row.quantity_imported));

        // Insert compensating reversing movement
        await client.query(
          `INSERT INTO stock_ledger (id, branch_id, product_id, batch_id, movement_type, quantity_change, balance_after, unit_cost, reference_type, reference_id, notes, created_by, tenant_id)
           VALUES ($1, $2, $3, $4, 'ADJUSTMENT', $5, $6, $7, 'IMPORT_REVERSAL', $8, $9, $10, $11)`,
          [
            revLedgerId,
            batch.branch_id || branchId,
            row.product_id,
            row.batch_id_ref,
            -parseFloat(row.quantity_imported),
            newBal,
            row.unit_cost,
            batchId,
            `Compensating reversal of import batch: ${batch.file_name}`,
            managerId,
            batch.tenant_id,
          ],
        );

        // Link reversal ledger id
        await client.query(
          `UPDATE import_batch_rows SET reversal_ledger_id = $1 WHERE id = $2`,
          [revLedgerId, row.id],
        );
        revertedCount++;
      }

      // Mark batch as REVERTED
      await client.query(
        `UPDATE import_batches
         SET status = 'REVERTED', reverted_at = clock_timestamp(), reverted_by = $1
         WHERE id = $2`,
        [managerId, batchId],
      );

      // Audit log
      await client.query(
        `INSERT INTO audit_logs (id, branch_id, user_id, action, entity_name, entity_id, details, tenant_id)
         VALUES ($1, $2, $3, 'INVENTORY_IMPORT_REVERTED', 'import_batches', $4, $5, $6)`,
        [
          generateUuidV7(),
          batch.branch_id || branchId,
          managerId,
          batchId,
          JSON.stringify({ revertedItemsCount: revertedCount }),
          batch.tenant_id,
        ],
      );

      return {
        success: true,
        batchId,
        revertedItemsCount: revertedCount,
        message: 'Import successfully reversed. Offsetting stock movements have been posted.',
      };
    });
  }

  /**
   * 5. Import History
   */
  async listImportHistory(branchId: string): Promise<ImportBatchSummary[]> {
    const res = await this.db.query(
      `SELECT ib.id, ib.file_name, ib.file_hash, ib.import_mode, ib.source_type,
              ib.total_rows, ib.created_count, ib.updated_count, ib.skipped_count,
              ib.error_count, ib.status, ib.created_at, ib.reverted_at,
              u.full_name as user_name, s.name as supplier_name
       FROM import_batches ib
       LEFT JOIN users u ON u.id = ib.user_id
       LEFT JOIN suppliers s ON s.id = ib.supplier_id
       WHERE ib.branch_id = $1
       ORDER BY ib.created_at DESC LIMIT 50`,
      [branchId],
    );

    return res.rows.map((r) => ({
      id: r.id,
      fileName: r.file_name,
      fileHash: r.file_hash,
      importMode: r.import_mode,
      sourceType: r.source_type,
      supplierName: r.supplier_name,
      totalRows: r.total_rows,
      createdCount: r.created_count,
      updatedCount: r.updated_count,
      skippedCount: r.skipped_count,
      errorCount: r.error_count,
      status: r.status,
      userName: r.user_name,
      createdAt: r.created_at,
      revertedAt: r.reverted_at,
    }));
  }

  /**
   * Helper: Prevent CSV / Excel formula injection
   */
  private sanitizeCell(str: string): string {
    if (!str) return '';
    const trimmed = str.trim();
    if (
      trimmed.startsWith('=') ||
      trimmed.startsWith('+') ||
      trimmed.startsWith('-') ||
      trimmed.startsWith('@')
    ) {
      return `'${trimmed}`;
    }
    return trimmed;
  }
}

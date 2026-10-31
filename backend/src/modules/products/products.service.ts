import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import { generateUuidV7 } from '../../common/utils/uuidv7';
import { BarcodeParserService } from './domain/barcode-parser.service';
import { PricingCalculatorService } from './domain/pricing-calculator.service';
import {
  CreateProductDto,
  UpdateProductDto,
  CreateBarcodeDto,
  SetBranchOverrideDto,
  PriceChangeDto,
  ProductQueryDto,
  CreateCategoryDto,
  BulkCategoryDto,
  BulkArchiveDto,
} from './dto/products.dto';
import { Product, ProductBarcode, BranchProductOverride, PriceChangeLog } from './domain/product.types';

export interface ScannedProductLookupResult {
  product: Product;
  scannedBarcode: string;
  isScaleBarcode: boolean;
  packMultiplier: number;
  quantity: number;
  effectiveUnitPrice: number;
  basePrice: number;
  isBranchOverride: boolean;
  isVatApplicable: boolean;
  vatRate: number;
  lineTotal: number;
  taxAmount: number;
  taxableSubtotal: number;
}

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);
  private readonly barcodeParser = new BarcodeParserService();
  private readonly pricingCalculator = new PricingCalculatorService();

  constructor(private readonly db: DatabaseService) {}

  /**
   * Creates a new product in the central catalog.
   */
  async createProduct(dto: CreateProductDto): Promise<Product> {
    const id = generateUuidV7();
    const costPrice = dto.cost_price ?? 0;
    const isVat = dto.is_vat_applicable ?? true;
    const vatRate = dto.vat_rate ?? 0.15;
    const isWeighed = dto.is_weighed ?? false;
    const minStock = dto.min_stock_level ?? 0;
    const allowDiscount = dto.allow_discount ?? true;

    try {
      const result = await this.db.query<Product>(
        `INSERT INTO products (
          id, sku, name_en, name_am, category_id, uom_code,
          base_price, cost_price, is_vat_applicable, vat_rate,
          is_weighed, scale_plu, min_stock_level, max_stock_level,
          allow_discount, is_active
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, TRUE)
        RETURNING *`,
        [
          id,
          dto.sku,
          dto.name_en,
          dto.name_am || null,
          dto.category_id,
          dto.uom_code,
          dto.base_price,
          costPrice,
          isVat,
          vatRate,
          isWeighed,
          dto.scale_plu || null,
          minStock,
          dto.max_stock_level || null,
          allowDiscount,
        ],
      );

      return result.rows[0];
    } catch (err: any) {
      if (err.code === '23505') {
        throw new ConflictException(`Product with SKU '${dto.sku}' already exists.`);
      }
      throw err;
    }
  }

  /**
   * Adds an additional barcode to a product (e.g. single item, pack of 6, carton of 24).
   */
  async addBarcode(productId: string, dto: CreateBarcodeDto): Promise<ProductBarcode> {
    const id = generateUuidV7();
    const barcodeType = dto.barcode_type || 'EAN13';
    const packMultiplier = dto.pack_multiplier || 1.0;
    const isPrimary = dto.is_primary || false;

    // Check product exists
    const prod = await this.db.query('SELECT id FROM products WHERE id = $1', [productId]);
    if (prod.rowCount === 0) {
      throw new NotFoundException(`Product with ID '${productId}' not found.`);
    }

    try {
      const result = await this.db.query<ProductBarcode>(
        `INSERT INTO product_barcodes (
          id, product_id, barcode, barcode_type, pack_multiplier, is_primary
        ) VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *`,
        [id, productId, dto.barcode, barcodeType, packMultiplier, isPrimary],
      );

      return result.rows[0];
    } catch (err: any) {
      if (err.code === '23505') {
        throw new ConflictException(`Barcode '${dto.barcode}' is already assigned to a product.`);
      }
      throw err;
    }
  }

  /**
   * Sets or updates branch-specific pricing, VAT overrides, and min stock levels.
   */
  async setBranchOverride(
    productId: string,
    branchId: string,
    dto: SetBranchOverrideDto,
  ): Promise<BranchProductOverride> {
    const id = generateUuidV7();
    const result = await this.db.query<BranchProductOverride>(
      `INSERT INTO branch_product_overrides (
        id, branch_id, product_id, selling_price, is_vat_applicable, vat_rate, min_stock_level, is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (branch_id, product_id) DO UPDATE SET
        selling_price = COALESCE(EXCLUDED.selling_price, branch_product_overrides.selling_price),
        is_vat_applicable = COALESCE(EXCLUDED.is_vat_applicable, branch_product_overrides.is_vat_applicable),
        vat_rate = COALESCE(EXCLUDED.vat_rate, branch_product_overrides.vat_rate),
        min_stock_level = COALESCE(EXCLUDED.min_stock_level, branch_product_overrides.min_stock_level),
        is_active = COALESCE(EXCLUDED.is_active, branch_product_overrides.is_active),
        updated_at = clock_timestamp()
      RETURNING *`,
      [
        id,
        branchId,
        productId,
        dto.selling_price ?? null,
        dto.is_vat_applicable ?? null,
        dto.vat_rate ?? null,
        dto.min_stock_level ?? null,
        dto.is_active ?? true,
      ],
    );

    return result.rows[0];
  }

  /**
   * Updates product price with mandatory reason and immutable price change audit log.
   */
  async updatePrice(productId: string, dto: PriceChangeDto): Promise<{ old_price: number; new_price: number }> {
    return this.db.withTransaction(async (client) => {
      let oldPrice: number;

      if (dto.branch_id) {
        // Branch price change
        const currentOverride = await client.query<{ selling_price: number }>(
          'SELECT selling_price FROM branch_product_overrides WHERE branch_id = $1 AND product_id = $2',
          [dto.branch_id, productId],
        );

        if (currentOverride.rowCount && currentOverride.rows[0].selling_price !== null) {
          oldPrice = Number(currentOverride.rows[0].selling_price);
        } else {
          // Fall back to master catalog base_price
          const prod = await client.query<{ base_price: number }>(
            'SELECT base_price FROM products WHERE id = $1',
            [productId],
          );
          if (prod.rowCount === 0) {
            throw new NotFoundException(`Product '${productId}' not found.`);
          }
          oldPrice = Number(prod.rows[0].base_price);
        }

        // Upsert branch override
        await client.query(
          `INSERT INTO branch_product_overrides (id, branch_id, product_id, selling_price)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (branch_id, product_id) DO UPDATE SET
             selling_price = EXCLUDED.selling_price,
             updated_at = clock_timestamp()`,
          [generateUuidV7(), dto.branch_id, productId, dto.new_price],
        );
      } else {
        // Master catalog base_price change
        const prod = await client.query<{ base_price: number }>(
          'SELECT base_price FROM products WHERE id = $1 FOR UPDATE',
          [productId],
        );
        if (prod.rowCount === 0) {
          throw new NotFoundException(`Product '${productId}' not found.`);
        }
        oldPrice = Number(prod.rows[0].base_price);

        await client.query('UPDATE products SET base_price = $1, updated_at = clock_timestamp() WHERE id = $2', [
          dto.new_price,
          productId,
        ]);
      }

      // Record immutable audit log
      await client.query(
        `INSERT INTO price_change_logs (id, product_id, branch_id, old_price, new_price, reason, changed_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          generateUuidV7(),
          productId,
          dto.branch_id || null,
          oldPrice,
          dto.new_price,
          dto.reason,
          dto.changed_by || null,
        ],
      );

      return { old_price: oldPrice, new_price: dto.new_price };
    });
  }

  /**
   * Barcode scanner resolution engine.
   * Handles both standard barcodes (with pack multipliers) and deli/butcher scale barcodes.
   */
  async lookupBarcode(branchId: string, rawBarcode: string): Promise<ScannedProductLookupResult> {
    const parsed = this.barcodeParser.parse(rawBarcode);

    if (parsed.isScaleBarcode && parsed.plu) {
      // Find product by scale PLU
      const query = `
        SELECT p.*, o.selling_price as override_price, o.is_vat_applicable as override_vat_applicable, o.vat_rate as override_vat_rate
        FROM products p
        LEFT JOIN branch_product_overrides o ON o.product_id = p.id AND o.branch_id = $1 AND o.is_active = TRUE
        WHERE (p.scale_plu = $2 OR p.scale_plu = $3) AND p.is_active = TRUE
      `;
      // Check both raw PLU (e.g. '00123') and trimmed integer PLU ('123')
      const pluInt = parseInt(parsed.plu, 10).toString();
      const res = await this.db.query(query, [branchId, parsed.plu, pluInt]);

      if (res.rowCount === 0) {
        throw new NotFoundException(`Scale product with PLU '${parsed.plu}' not found in catalog.`);
      }

      const row = res.rows[0];
      const basePrice = Number(row.base_price);
      const { effectivePrice, isBranchOverride, isVatApplicable, vatRate } =
        this.pricingCalculator.resolvePriceAndTax(
          basePrice,
          row.is_vat_applicable,
          Number(row.vat_rate),
          row.override_price !== null ? {
            selling_price: row.override_price,
            is_vat_applicable: row.override_vat_applicable,
            vat_rate: row.override_vat_rate,
          } : null,
        );

      let quantity = 1;
      if (parsed.embeddedQuantity !== undefined) {
        quantity = parsed.embeddedQuantity;
      } else if (parsed.embeddedPrice !== undefined && effectivePrice > 0) {
        quantity = Number((parsed.embeddedPrice / effectivePrice).toFixed(3));
      }

      const calc = this.pricingCalculator.calculateLineItem({
        quantity,
        unitPrice: effectivePrice,
        isVatApplicable,
        vatRate,
      });

      return {
        product: row,
        scannedBarcode: rawBarcode,
        isScaleBarcode: true,
        packMultiplier: 1.0,
        quantity: calc.quantity,
        effectiveUnitPrice: calc.unitPrice,
        basePrice,
        isBranchOverride,
        isVatApplicable,
        vatRate,
        lineTotal: calc.lineTotal,
        taxAmount: calc.taxAmount,
        taxableSubtotal: calc.taxableSubtotal,
      };
    }

    // Standard Barcode Lookup
    const standardQuery = `
      SELECT p.*, b.barcode, b.pack_multiplier,
             o.selling_price as override_price,
             o.is_vat_applicable as override_vat_applicable,
             o.vat_rate as override_vat_rate
      FROM product_barcodes b
      JOIN products p ON p.id = b.product_id
      LEFT JOIN branch_product_overrides o ON o.product_id = p.id AND o.branch_id = $1 AND o.is_active = TRUE
      WHERE b.barcode = $2 AND p.is_active = TRUE
    `;
    const res = await this.db.query(standardQuery, [branchId, rawBarcode]);

    if (res.rowCount === 0) {
      throw new NotFoundException(`Product with barcode '${rawBarcode}' not found.`);
    }

    const row = res.rows[0];
    const basePrice = Number(row.base_price);
    const packMultiplier = Number(row.pack_multiplier) || 1.0;

    const { effectivePrice: rawEffectivePrice, isBranchOverride, isVatApplicable, vatRate } =
      this.pricingCalculator.resolvePriceAndTax(
        basePrice,
        row.is_vat_applicable,
        Number(row.vat_rate),
        row.override_price !== null ? {
          selling_price: row.override_price,
          is_vat_applicable: row.override_vat_applicable,
          vat_rate: row.override_vat_rate,
        } : null,
      );

    // Apply pack multiplier to effective price (e.g., carton of 24)
    const effectiveUnitPrice = this.pricingCalculator.calculatePackPrice(rawEffectivePrice, packMultiplier);

    const calc = this.pricingCalculator.calculateLineItem({
      quantity: 1, // 1 pack or item
      unitPrice: effectiveUnitPrice,
      isVatApplicable,
      vatRate,
    });

    return {
      product: row,
      scannedBarcode: rawBarcode,
      isScaleBarcode: false,
      packMultiplier,
      quantity: 1,
      effectiveUnitPrice,
      basePrice,
      isBranchOverride,
      isVatApplicable,
      vatRate,
      lineTotal: calc.lineTotal,
      taxAmount: calc.taxAmount,
      taxableSubtotal: calc.taxableSubtotal,
    };
  }

  /**
   * Retrieves price change history for audit trails.
   */
  async getPriceHistory(productId: string, branchId?: string): Promise<PriceChangeLog[]> {
    let query = `SELECT * FROM price_change_logs WHERE product_id = $1`;
    const params: any[] = [productId];

    if (branchId) {
      query += ` AND (branch_id = $2 OR branch_id IS NULL)`;
      params.push(branchId);
    }
    query += ` ORDER BY created_at DESC`;

    const res = await this.db.query<PriceChangeLog>(query, params);
    return res.rows;
  }

  /**
   * Retrieves products with search, category filtering, status filtering, and stock on hand.
   */
  async getProducts(
    branchId: string,
    query: ProductQueryDto = {},
  ): Promise<{ total: number; rows: any[] }> {
    const whereClauses = ['1=1'];
    const params: any[] = [branchId];
    let idx = 2;

    if (query.active_only !== false) {
      whereClauses.push(`p.is_active = TRUE`);
    }

    if (query.category_id) {
      whereClauses.push(`p.category_id = $${idx++}`);
      params.push(query.category_id);
    }

    if (query.search) {
      whereClauses.push(`(p.name_en ILIKE $${idx} OR p.name_am ILIKE $${idx} OR p.sku ILIKE $${idx} OR EXISTS (
        SELECT 1 FROM product_barcodes pb WHERE pb.product_id = p.id AND pb.barcode ILIKE $${idx}
      ))`);
      params.push(`%${query.search}%`);
      idx++;
    }

    const whereSql = whereClauses.join(' AND ');

    let havingSql = '';
    if (query.low_stock_only) {
      havingSql = 'HAVING COALESCE(SUM(l.quantity_change), 0) <= p.min_stock_level';
    }

    const countQuery = `
      SELECT COUNT(*) as count FROM (
        SELECT p.id
        FROM products p
        LEFT JOIN stock_ledger l ON p.id = l.product_id AND l.branch_id = $1
        WHERE ${whereSql}
        GROUP BY p.id
        ${havingSql}
      ) as sub
    `;
    const countRes = await this.db.query<{ count: string }>(countQuery, params);
    const total = parseInt(countRes.rows[0]?.count || '0', 10);

    const limit = query.limit || 50;
    const offset = query.offset || 0;

    const dataQuery = `
      SELECT
        p.*,
        c.name_en as category_name,
        c.name_am as category_name_am,
        o.selling_price as override_price,
        o.is_vat_applicable as override_vat_applicable,
        o.vat_rate as override_vat_rate,
        COALESCE(SUM(l.quantity_change), 0) as stock_on_hand,
        COALESCE(ARRAY_AGG(DISTINCT b.barcode) FILTER (WHERE b.barcode IS NOT NULL), '{}') as barcodes
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN branch_product_overrides o ON o.product_id = p.id AND o.branch_id = $1 AND o.is_active = TRUE
      LEFT JOIN stock_ledger l ON p.id = l.product_id AND l.branch_id = $1
      LEFT JOIN product_barcodes b ON p.id = b.product_id
      WHERE ${whereSql}
      GROUP BY p.id, c.name_en, c.name_am, o.selling_price, o.is_vat_applicable, o.vat_rate
      ${havingSql}
      ORDER BY p.name_en ASC
      LIMIT $${idx++} OFFSET $${idx++}
    `;

    const dataRes = await this.db.query(dataQuery, [...params, limit, offset]);

    return { total, rows: dataRes.rows };
  }

  /**
   * Checks whether a barcode is already registered in the catalog.
   */
  async checkBarcode(barcode: string): Promise<{ exists: boolean; product: any | null }> {
    const res = await this.db.query(
      `SELECT p.id, p.sku, p.name_en, p.name_am, b.pack_multiplier
       FROM product_barcodes b
       JOIN products p ON p.id = b.product_id
       WHERE b.barcode = $1
       LIMIT 1`,
      [barcode.trim()],
    );

    if (res.rowCount === 0) {
      return { exists: false, product: null };
    }
    return { exists: true, product: res.rows[0] };
  }

  /**
   * Retrieves categories for dropdowns and management.
   */
  async getCategories(): Promise<any[]> {
    const res = await this.db.query(
      `SELECT c.*, COUNT(p.id) as product_count
       FROM categories c
       LEFT JOIN products p ON p.category_id = c.id AND p.is_active = TRUE
       GROUP BY c.id
       ORDER BY c.name_en ASC`,
    );
    return res.rows;
  }

  /**
   * Creates a new category.
   */
  async createCategory(dto: CreateCategoryDto): Promise<any> {
    const id = generateUuidV7();
    const res = await this.db.query(
      `INSERT INTO categories (id, code, name_en, name_am, parent_id, is_active)
       VALUES ($1, $2, $3, $4, $5, TRUE)
       RETURNING *`,
      [id, dto.code, dto.name_en, dto.name_am || null, dto.parent_id || null],
    );

    // Sync outbox
    await this.recordOutboxEvent('CATEGORY', id, 'INSERT', `cat_create_${id}`, {
      event: 'CATEGORY_CREATED',
      ...res.rows[0],
    });

    return res.rows[0];
  }

  /**
   * Retrieves units of measure for dropdowns.
   */
  async getUoms(): Promise<any[]> {
    const res = await this.db.query(
      `SELECT code, name_en, name_am, allow_fractions FROM units_of_measure ORDER BY code ASC`,
    );
    return res.rows;
  }

  /**
   * Updates an existing product and logs outbox event.
   */
  async updateProduct(
    id: string,
    dto: UpdateProductDto,
    branchId?: string,
  ): Promise<{ product: Product; stockWarning?: string }> {
    const fields: string[] = [];
    const params: any[] = [id];
    let idx = 2;

    const updatable: Array<keyof UpdateProductDto> = [
      'sku', 'name_en', 'name_am', 'category_id', 'uom_code',
      'base_price', 'cost_price', 'is_vat_applicable', 'vat_rate',
      'is_weighed', 'scale_plu', 'min_stock_level', 'max_stock_level',
      'allow_discount', 'is_active',
    ];

    for (const key of updatable) {
      if (dto[key] !== undefined) {
        fields.push(`${key} = $${idx++}`);
        params.push(dto[key]);
      }
    }

    let stockWarning: string | undefined;
    if (dto.is_active === false && branchId) {
      const stockRes = await this.db.query<{ stock: string }>(
        `SELECT COALESCE(SUM(quantity_change), 0) as stock FROM stock_ledger WHERE product_id = $1 AND branch_id = $2`,
        [id, branchId],
      );
      const stockOnHand = parseFloat(stockRes.rows[0]?.stock || '0');
      if (stockOnHand > 0) {
        stockWarning = `Product has ${stockOnHand} units in stock. Archiving will hide it from the POS register while stock remains.`;
      }
    }

    let updatedProduct: Product;
    if (fields.length > 0) {
      const query = `
        UPDATE products
        SET ${fields.join(', ')}, updated_at = clock_timestamp()
        WHERE id = $1
        RETURNING *
      `;
      const res = await this.db.query<Product>(query, params);
      if (res.rowCount === 0) {
        throw new NotFoundException(`Product '${id}' not found.`);
      }
      updatedProduct = res.rows[0];
    } else {
      const res = await this.db.query<Product>(`SELECT * FROM products WHERE id = $1`, [id]);
      if (res.rowCount === 0) throw new NotFoundException(`Product '${id}' not found.`);
      updatedProduct = res.rows[0];
    }

    if (dto.barcode) {
      await this.db.query(
        `INSERT INTO product_barcodes (id, product_id, barcode, barcode_type, pack_multiplier, is_primary)
         VALUES ($1, $2, $3, 'CODE128', 1.0, true)
         ON CONFLICT (barcode) DO NOTHING`,
        [generateUuidV7(), id, dto.barcode.trim()],
      );
    }

    // Sync outbox
    await this.recordOutboxEvent('PRODUCT', id, 'UPDATE', `prod_update_${id}_${Date.now()}`, {
      event: dto.is_active === false ? 'PRODUCT_ARCHIVED' : 'PRODUCT_UPDATED',
      ...updatedProduct,
    });

    return { product: updatedProduct, stockWarning };
  }

  /**
   * Archives a product (soft delete) and verifies stock on hand.
   */
  async archiveProduct(
    id: string,
    branchId?: string,
  ): Promise<{ product: Product; stockOnHand: number; warning?: string }> {
    let stockOnHand = 0;
    let warning: string | undefined;

    if (branchId) {
      const stockRes = await this.db.query<{ stock: string }>(
        `SELECT COALESCE(SUM(quantity_change), 0) as stock FROM stock_ledger WHERE product_id = $1 AND branch_id = $2`,
        [id, branchId],
      );
      stockOnHand = parseFloat(stockRes.rows[0]?.stock || '0');
      if (stockOnHand > 0) {
        warning = `Product has ${stockOnHand} units in stock. Archiving will hide it from the POS register while stock remains.`;
      }
    }

    const res = await this.db.query<Product>(
      `UPDATE products SET is_active = FALSE, updated_at = clock_timestamp() WHERE id = $1 RETURNING *`,
      [id],
    );
    if (res.rowCount === 0) {
      throw new NotFoundException(`Product '${id}' not found.`);
    }

    await this.recordOutboxEvent('PRODUCT', id, 'UPDATE', `prod_archive_${id}`, {
      event: 'PRODUCT_ARCHIVED',
      product_id: id,
    });

    return { product: res.rows[0], stockOnHand, warning };
  }

  /**
   * Bulk updates category for multiple products.
   */
  async bulkUpdateCategory(productIds: string[], categoryId: string): Promise<{ updatedCount: number }> {
    const res = await this.db.query(
      `UPDATE products SET category_id = $1, updated_at = clock_timestamp() WHERE id = ANY($2::uuid[])`,
      [categoryId, productIds],
    );

    for (const pid of productIds) {
      await this.recordOutboxEvent('PRODUCT', pid, 'UPDATE', `prod_bulk_cat_${pid}_${Date.now()}`, {
        event: 'PRODUCT_UPDATED',
        product_id: pid,
        category_id: categoryId,
      });
    }

    return { updatedCount: res.rowCount || 0 };
  }

  /**
   * Bulk archives or activates multiple products.
   */
  async bulkArchive(productIds: string[], archive: boolean): Promise<{ updatedCount: number }> {
    const isActive = !archive;
    const res = await this.db.query(
      `UPDATE products SET is_active = $1, updated_at = clock_timestamp() WHERE id = ANY($2::uuid[])`,
      [isActive, productIds],
    );

    for (const pid of productIds) {
      await this.recordOutboxEvent('PRODUCT', pid, 'UPDATE', `prod_bulk_arch_${pid}_${Date.now()}`, {
        event: archive ? 'PRODUCT_ARCHIVED' : 'PRODUCT_ACTIVATED',
        product_id: pid,
        is_active: isActive,
      });
    }

    return { updatedCount: res.rowCount || 0 };
  }

  /**
   * Helper to record outbox events for sync.
   */
  async recordOutboxEvent(
    entityType: string,
    entityId: string,
    operation: string,
    idempotencyKey: string,
    payload: any,
  ) {
    try {
      await this.db.query(
        `INSERT INTO sync_outbox (id, branch_id, entity_type, entity_id, operation, idempotency_key, payload, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'PENDING')
         ON CONFLICT (idempotency_key) DO NOTHING`,
        [
          generateUuidV7(),
          '018e0000-0000-7000-8000-000000000020',
          entityType,
          entityId,
          operation,
          idempotencyKey,
          JSON.stringify(payload),
        ],
      );
    } catch (err) {
      this.logger.warn(`Failed to enqueue outbox event for ${entityType} ${entityId}: ${err}`);
    }
  }
}


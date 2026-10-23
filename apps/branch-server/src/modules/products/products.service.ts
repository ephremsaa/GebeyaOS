import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import {
  Product,
  ProductBarcode,
  BranchProductOverride,
  PriceChangeLog,
  PricingCalculator,
  BarcodeParser,
  generateUuidV7,
} from '@gebeyaos/shared-types';
import { DatabaseService } from '../../common/database/database.service';
import {
  CreateProductDto,
  CreateBarcodeDto,
  SetBranchOverrideDto,
  PriceChangeDto,
  UpdateProductDto,
  ProductQueryDto,
} from './dto/products.dto';

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
   * Adds an additional barcode to a product with pack multiplier support.
   */
  async addBarcode(productId: string, dto: CreateBarcodeDto): Promise<ProductBarcode> {
    const id = generateUuidV7();
    const barcodeType = dto.barcode_type || 'EAN13';
    const packMultiplier = dto.pack_multiplier || 1.0;
    const isPrimary = dto.is_primary || false;

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
          const prod = await client.query<{ base_price: number }>(
            'SELECT base_price FROM products WHERE id = $1',
            [productId],
          );
          if (prod.rowCount === 0) {
            throw new NotFoundException(`Product '${productId}' not found.`);
          }
          oldPrice = Number(prod.rows[0].base_price);
        }

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
   * Handles standard barcodes (with pack multipliers) and deli/butcher scale barcodes.
   */
  async lookupBarcode(branchId: string, rawBarcode: string): Promise<ScannedProductLookupResult> {
    const parsed = BarcodeParser.parse(rawBarcode);

    if (parsed.isScaleBarcode && parsed.plu) {
      const query = `
        SELECT p.*, o.selling_price as override_price, o.is_vat_applicable as override_vat_applicable, o.vat_rate as override_vat_rate
        FROM products p
        LEFT JOIN branch_product_overrides o ON o.product_id = p.id AND o.branch_id = $1 AND o.is_active = TRUE
        WHERE (p.scale_plu = $2 OR p.scale_plu = $3) AND p.is_active = TRUE
      `;
      const pluInt = parseInt(parsed.plu, 10).toString();
      const res = await this.db.query(query, [branchId, parsed.plu, pluInt]);

      if (res.rowCount === 0) {
        throw new NotFoundException(`Scale product with PLU '${parsed.plu}' not found in catalog.`);
      }

      const row = res.rows[0];
      const basePrice = Number(row.base_price);
      const { effectivePrice, isBranchOverride, isVatApplicable, vatRate } =
        PricingCalculator.resolvePriceAndTax(
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

      const calc = PricingCalculator.calculateLineItem({
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
      PricingCalculator.resolvePriceAndTax(
        basePrice,
        row.is_vat_applicable,
        Number(row.vat_rate),
        row.override_price !== null ? {
          selling_price: row.override_price,
          is_vat_applicable: row.override_vat_applicable,
          vat_rate: row.override_vat_rate,
        } : null,
      );

    const effectiveUnitPrice = PricingCalculator.calculatePackPrice(rawEffectivePrice, packMultiplier);

    const calc = PricingCalculator.calculateLineItem({
      quantity: 1,
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
   * Retrieves price change audit history.
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
   * Retrieves products with search, category filtering, stock on hand, and primary barcodes.
   */
  async getProducts(
    branchId: string,
    query: ProductQueryDto,
  ): Promise<{ total: number; rows: any[] }> {
    let whereClauses = ['1=1'];
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
        COALESCE(SUM(l.quantity_change), 0) as stock_on_hand,
        COALESCE(ARRAY_AGG(DISTINCT b.barcode) FILTER (WHERE b.barcode IS NOT NULL), '{}') as barcodes
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN stock_ledger l ON p.id = l.product_id AND l.branch_id = $1
      LEFT JOIN product_barcodes b ON p.id = b.product_id
      WHERE ${whereSql}
      GROUP BY p.id, c.name_en, c.name_am
      ${havingSql}
      ORDER BY p.name_en ASC
      LIMIT $${idx++} OFFSET $${idx++}
    `;

    const dataRes = await this.db.query(dataQuery, [...params, limit, offset]);

    return { total, rows: dataRes.rows };
  }

  /**
   * Retrieves categories for dropdowns.
   */
  async getCategories(): Promise<any[]> {
    const res = await this.db.query(
      `SELECT id, code, name_en, name_am FROM categories ORDER BY sort_order ASC, name_en ASC`,
    );
    return res.rows;
  }

  /**
   * Retrieves units of measure for dropdowns.
   */
  async getUoms(): Promise<any[]> {
    const res = await this.db.query(
      `SELECT code, name_en, name_am, is_fractional FROM units_of_measure ORDER BY code ASC`,
    );
    return res.rows;
  }

  /**
   * Updates an existing product.
   */
  async updateProduct(id: string, dto: UpdateProductDto): Promise<Product> {
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

    if (fields.length === 0) {
      const res = await this.db.query<Product>(`SELECT * FROM products WHERE id = $1`, [id]);
      if (res.rows.length === 0) throw new NotFoundException(`Product ${id} not found`);
      return res.rows[0];
    }

    const query = `
      UPDATE products
      SET ${fields.join(', ')}, updated_at = clock_timestamp()
      WHERE id = $1
      RETURNING *
    `;

    const res = await this.db.query<Product>(query, params);
    if (res.rows.length === 0) {
      throw new NotFoundException(`Product ${id} not found`);
    }
    return res.rows[0];
  }

  /**
   * Calculates intelligent reorder suggestions based on stock on hand and daily sales rate.
   */
  async getReorderSuggestions(branchId: string): Promise<any[]> {
    const query = `
      SELECT
        p.id,
        p.sku,
        p.name_en,
        p.name_am,
        p.category_id,
        c.name_en as category_name,
        p.uom_code,
        p.cost_price,
        p.base_price,
        p.min_stock_level,
        p.max_stock_level,
        COALESCE(SUM(l.quantity_change), 0) as stock_on_hand,
        COALESCE(sales_velocity.daily_rate, 0) as daily_sales_rate
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN stock_ledger l ON p.id = l.product_id AND l.branch_id = $1
      LEFT JOIN (
        SELECT product_id, ROUND(ABS(SUM(quantity_change)) / 30.0, 2) as daily_rate
        FROM stock_ledger
        WHERE branch_id = $1
          AND movement_type = 'SALE'
          AND created_at >= NOW() - INTERVAL '30 days'
        GROUP BY product_id
      ) sales_velocity ON p.id = sales_velocity.product_id
      WHERE p.is_active = TRUE
      GROUP BY p.id, c.name_en, sales_velocity.daily_rate
      HAVING COALESCE(SUM(l.quantity_change), 0) <= p.min_stock_level
      ORDER BY (p.min_stock_level - COALESCE(SUM(l.quantity_change), 0)) DESC
    `;

    const res = await this.db.query(query, [branchId]);
    return res.rows.map((r: any) => {
      const stockOnHand = parseFloat(r.stock_on_hand);
      const minStock = parseFloat(r.min_stock_level);
      const maxStock = r.max_stock_level ? parseFloat(r.max_stock_level) : minStock * 2;
      const dailyRate = parseFloat(r.daily_sales_rate);

      // suggested quantity = maxStock - stockOnHand, minimum 5 units
      const suggestedQty = Math.max(Math.ceil(maxStock - stockOnHand), 5);
      const daysRemaining = dailyRate > 0 ? Math.round(stockOnHand / dailyRate) : 999;

      return {
        id: r.id,
        sku: r.sku,
        nameEn: r.name_en,
        nameAm: r.name_am,
        categoryName: r.category_name,
        uomCode: r.uom_code,
        costPrice: parseFloat(r.cost_price),
        basePrice: parseFloat(r.base_price),
        minStockLevel: minStock,
        maxStockLevel: maxStock,
        stockOnHand,
        dailySalesRate: dailyRate,
        daysRemaining: Math.max(0, daysRemaining),
        suggestedReorderQuantity: suggestedQty,
        estimatedCost: Number((suggestedQty * parseFloat(r.cost_price)).toFixed(2)),
      };
    });
  }
}

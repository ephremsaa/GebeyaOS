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
}

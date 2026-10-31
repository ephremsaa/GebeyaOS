import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import * as crypto from 'crypto';
import { DatabaseService } from '../../common/database/database.service';
import { createZipArchive, formatToCsv, ZipFileInput } from '../../common/utils/zip-archive';

export interface TenantExportResult {
  filename: string;
  buffer: Buffer;
  mimeType: string;
  manifest: {
    tenantId: string;
    tenantName: string;
    tenantSlug: string;
    exportedAt: string;
    recordCounts: Record<string, number>;
  };
}

@Injectable()
export class TenantExportService {
  private readonly logger = new Logger(TenantExportService.name);

  constructor(private readonly db: DatabaseService) {}

  /**
   * Generates a comprehensive ZIP archive containing individual CSVs and
   * an Excel workbook representing all data for the specified tenant.
   */
  async exportTenantData(tenantId: string): Promise<TenantExportResult> {
    // 1. Fetch tenant information
    const tenantRes = await this.db.query(
      `SELECT id, name, slug, status, plan, country, default_language,
              vat_settings, max_branches, max_terminals, max_users,
              owner_email, owner_phone, tin_number, created_at
       FROM tenants
       WHERE id = $1`,
      [tenantId],
    );

    if (tenantRes.rows.length === 0) {
      throw new NotFoundException(`Tenant with ID '${tenantId}' not found`);
    }

    const tenant = tenantRes.rows[0];

    // 2. Fetch all tenant-scoped entities
    const [
      branches,
      terminals,
      users,
      roles,
      categories,
      products,
      productPrices,
      productBarcodes,
      batches,
      stockLedger,
      sales,
      saleItems,
      salePayments,
      shifts,
      suppliers,
      purchaseOrders,
      purchaseOrderItems,
      systemSettings,
    ] = await Promise.all([
      this.db.query(
        `SELECT id, code, name, is_hq, city, subcity, phone, is_active, created_at
         FROM branches WHERE tenant_id = $1 ORDER BY created_at ASC`,
        [tenantId],
      ),
      this.db.query(
        `SELECT id, branch_id, code, name, device_type, ip_address, is_active, created_at
         FROM terminals WHERE tenant_id = $1 ORDER BY created_at ASC`,
        [tenantId],
      ),
      this.db.query(
        `SELECT id, username, full_name, email, phone, role_id, is_active, created_at
         FROM users WHERE tenant_id = $1 ORDER BY created_at ASC`,
        [tenantId],
      ),
      this.db.query(
        `SELECT id, name, description, is_system, max_discount_percentage, created_at
         FROM roles WHERE tenant_id = $1 ORDER BY name ASC`,
        [tenantId],
      ),
      this.db.query(
        `SELECT id, code, name_en, name_am, is_active, created_at
         FROM categories WHERE tenant_id = $1 ORDER BY name_en ASC`,
        [tenantId],
      ),
      this.db.query(
        `SELECT id, sku, name_en, name_am, category_id, uom_code, base_price, cost_price, vat_rate, is_active, created_at
         FROM products WHERE tenant_id = $1 ORDER BY sku ASC`,
        [tenantId],
      ),
      this.db.query(
        `SELECT id, product_id, branch_id, selling_price, vat_rate, is_active, updated_at
         FROM branch_product_overrides WHERE tenant_id = $1`,
        [tenantId],
      ),
      this.db.query(
        `SELECT id, product_id, barcode, barcode_type, is_primary, created_at
         FROM product_barcodes WHERE tenant_id = $1`,
        [tenantId],
      ),
      this.db.query(
        `SELECT id, product_id, branch_id, batch_number, expiry_date, current_quantity, created_at
         FROM batches WHERE tenant_id = $1 ORDER BY expiry_date ASC NULLS LAST`,
        [tenantId],
      ),
      this.db.query(
        `SELECT id, branch_id, product_id, batch_id, movement_type, quantity_change, unit_cost, balance_after, reference_type, created_at
         FROM stock_ledger WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 5000`,
        [tenantId],
      ),
      this.db.query(
        `SELECT id, branch_id, terminal_id, cashier_id, receipt_number, subtotal, tax_total, grand_total, payment_status, created_at
         FROM sales WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 5000`,
        [tenantId],
      ),
      this.db.query(
        `SELECT id, sale_id, product_id, item_name_snapshot, quantity, unit_price, line_total, tax_amount
         FROM sale_items WHERE tenant_id = $1 LIMIT 10000`,
        [tenantId],
      ),
      this.db.query(
        `SELECT id, sale_id, payment_method, amount, provider_reference, created_at
         FROM sale_payments WHERE tenant_id = $1`,
        [tenantId],
      ),
      this.db.query(
        `SELECT id, branch_id, terminal_id, cashier_id, shift_number, opening_cash_float, closing_cash_counted, status, opened_at, closed_at
         FROM shifts WHERE tenant_id = $1 ORDER BY opened_at DESC LIMIT 1000`,
        [tenantId],
      ),
      this.db.query(
        `SELECT id, code, name, tin_number, contact_person, phone, email, is_active, created_at
         FROM suppliers WHERE tenant_id = $1 ORDER BY name ASC`,
        [tenantId],
      ),
      this.db.query(
        `SELECT id, branch_id, order_number, supplier_id, status, subtotal, tax_total, grand_total, created_at
         FROM purchase_orders WHERE tenant_id = $1 ORDER BY created_at DESC`,
        [tenantId],
      ),
      this.db.query(
        `SELECT id, purchase_order_id, product_id, ordered_quantity, unit_cost, total_cost
         FROM purchase_order_items WHERE tenant_id = $1`,
        [tenantId],
      ),
      this.db.query(
        `SELECT key, value, updated_at
         FROM system_settings WHERE tenant_id = $1`,
        [tenantId],
      ),
    ]);

    const recordCounts: Record<string, number> = {
      tenants: 1,
      branches: branches.rows.length,
      terminals: terminals.rows.length,
      users: users.rows.length,
      roles: roles.rows.length,
      categories: categories.rows.length,
      products: products.rows.length,
      branch_product_overrides: productPrices.rows.length,
      product_barcodes: productBarcodes.rows.length,
      batches: batches.rows.length,
      stock_ledger: stockLedger.rows.length,
      sales: sales.rows.length,
      sale_items: saleItems.rows.length,
      sale_payments: salePayments.rows.length,
      shifts: shifts.rows.length,
      suppliers: suppliers.rows.length,
      purchase_orders: purchaseOrders.rows.length,
      purchase_order_items: purchaseOrderItems.rows.length,
      system_settings: systemSettings.rows.length,
    };

    const exportedAt = new Date().toISOString();

    // 3. Generate Excel Workbook
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'GebeyaOS Platform Control Plane';
    workbook.created = new Date();

    // Sheet 1: Summary
    const summarySheet = workbook.addWorksheet('Overview');
    summarySheet.columns = [
      { header: 'Property', key: 'prop', width: 25 },
      { header: 'Value', key: 'val', width: 45 },
    ];
    summarySheet.addRow({ prop: 'Tenant Name', val: tenant.name });
    summarySheet.addRow({ prop: 'Tenant Slug', val: tenant.slug });
    summarySheet.addRow({ prop: 'Tenant ID', val: tenant.id });
    summarySheet.addRow({ prop: 'Plan', val: tenant.plan });
    summarySheet.addRow({ prop: 'Status', val: tenant.status });
    summarySheet.addRow({ prop: 'Country', val: tenant.country });
    summarySheet.addRow({ prop: 'Language', val: tenant.default_language });
    summarySheet.addRow({ prop: 'TIN Number', val: tenant.tin_number || 'N/A' });
    summarySheet.addRow({ prop: 'Export Date', val: exportedAt });
    summarySheet.addRow({ prop: 'Total Branches', val: branches.rows.length });
    summarySheet.addRow({ prop: 'Total Terminals', val: terminals.rows.length });
    summarySheet.addRow({ prop: 'Total Products', val: products.rows.length });
    summarySheet.addRow({ prop: 'Total Sales Recorded', val: sales.rows.length });

    // Sheet 2: Branches
    const branchesSheet = workbook.addWorksheet('Branches');
    branchesSheet.columns = [
      { header: 'Branch Code', key: 'code', width: 15 },
      { header: 'Branch Name', key: 'name', width: 30 },
      { header: 'HQ', key: 'is_hq', width: 10 },
      { header: 'City', key: 'city', width: 20 },
      { header: 'Subcity', key: 'subcity', width: 20 },
      { header: 'Phone', key: 'phone', width: 20 },
      { header: 'Active', key: 'is_active', width: 10 },
    ];
    for (const b of branches.rows) {
      branchesSheet.addRow(b);
    }

    // Sheet 3: Product Catalog
    const productsSheet = workbook.addWorksheet('Product Catalog');
    productsSheet.columns = [
      { header: 'SKU', key: 'sku', width: 18 },
      { header: 'Name (EN)', key: 'name_en', width: 32 },
      { header: 'Name (AM)', key: 'name_am', width: 32 },
      { header: 'Unit', key: 'uom_code', width: 10 },
      { header: 'Price (ETB)', key: 'base_price', width: 15 },
      { header: 'VAT Rate', key: 'vat_rate', width: 12 },
      { header: 'Active', key: 'is_active', width: 10 },
    ];
    for (const p of products.rows) {
      productsSheet.addRow(p);
    }

    // Sheet 4: Sales
    const salesSheet = workbook.addWorksheet('Recent Sales');
    salesSheet.columns = [
      { header: 'Receipt #', key: 'receipt_number', width: 25 },
      { header: 'Date', key: 'created_at', width: 22 },
      { header: 'Subtotal (ETB)', key: 'subtotal', width: 15 },
      { header: 'Tax (ETB)', key: 'tax_total', width: 12 },
      { header: 'Total (ETB)', key: 'grand_total', width: 15 },
      { header: 'Payment Status', key: 'payment_status', width: 15 },
    ];
    for (const s of sales.rows) {
      salesSheet.addRow(s);
    }

    const excelBuffer = await workbook.xlsx.writeBuffer();

    // 4. Build CSVs
    const files: ZipFileInput[] = [
      {
        name: 'manifest.json',
        data: JSON.stringify(
          {
            version: '1.0',
            system: 'GebeyaOS Multi-Tenant Supermarket Engine',
            tenant: {
              id: tenant.id,
              name: tenant.name,
              slug: tenant.slug,
              plan: tenant.plan,
              country: tenant.country,
            },
            exportedAt,
            recordCounts,
          },
          null,
          2,
        ),
      },
      {
        name: `${tenant.slug}_master_export.xlsx`,
        data: Buffer.from(excelBuffer),
      },
      { name: 'csv/tenants.csv', data: formatToCsv([tenant]) },
      { name: 'csv/branches.csv', data: formatToCsv(branches.rows) },
      { name: 'csv/terminals.csv', data: formatToCsv(terminals.rows) },
      { name: 'csv/users.csv', data: formatToCsv(users.rows) },
      { name: 'csv/roles.csv', data: formatToCsv(roles.rows) },
      { name: 'csv/categories.csv', data: formatToCsv(categories.rows) },
      { name: 'csv/products.csv', data: formatToCsv(products.rows) },
      { name: 'csv/branch_product_overrides.csv', data: formatToCsv(productPrices.rows) },
      { name: 'csv/product_barcodes.csv', data: formatToCsv(productBarcodes.rows) },
      { name: 'csv/batches.csv', data: formatToCsv(batches.rows) },
      { name: 'csv/stock_ledger.csv', data: formatToCsv(stockLedger.rows) },
      { name: 'csv/sales.csv', data: formatToCsv(sales.rows) },
      { name: 'csv/sale_items.csv', data: formatToCsv(saleItems.rows) },
      { name: 'csv/sale_payments.csv', data: formatToCsv(salePayments.rows) },
      { name: 'csv/shifts.csv', data: formatToCsv(shifts.rows) },
      { name: 'csv/suppliers.csv', data: formatToCsv(suppliers.rows) },
      { name: 'csv/purchase_orders.csv', data: formatToCsv(purchaseOrders.rows) },
      { name: 'csv/purchase_order_items.csv', data: formatToCsv(purchaseOrderItems.rows) },
      { name: 'csv/system_settings.csv', data: formatToCsv(systemSettings.rows) },
    ];

    // 5. Assemble ZIP archive
    const zipBuffer = createZipArchive(files);
    const dateSlug = exportedAt.slice(0, 10);
    const filename = `${tenant.slug}-backup-${dateSlug}.zip`;

    this.logger.log(
      `Exported tenant '${tenant.name}' (${tenant.id}): ${zipBuffer.length} bytes, ${files.length} archive entries`,
    );

    return {
      filename,
      buffer: zipBuffer,
      mimeType: 'application/zip',
      manifest: {
        tenantId: tenant.id,
        tenantName: tenant.name,
        tenantSlug: tenant.slug,
        exportedAt,
        recordCounts,
      },
    };
  }
}

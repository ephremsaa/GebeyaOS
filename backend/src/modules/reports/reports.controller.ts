import {
  Controller,
  Get,
  Query,
  Param,
  Res,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { ReportsService } from './reports.service';
import { ReportFilterDto } from './dto/reports.dto';

@Controller('api/reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('sales')
  async getSalesSummary(
    @Query() filter: ReportFilterDto,
    @Res() res: Response,
  ) {
    const data = await this.reportsService.getSalesSummary(filter);

    if (filter.format === 'csv') {
      const headers = ['Metric', 'Amount (ETB)'];
      const rows = [
        ['Total Transactions', data.total_transactions],
        ['Gross Sales Subtotal', data.gross_subtotal],
        ['Total Discounts', data.total_discounts],
        ['Taxable Sales (15%)', data.taxable_subtotal_15],
        ['VAT 15% Collected', data.vat_15_collected],
        ['Tax Exempt Sales', data.tax_exempt_subtotal],
        ['Net Sales Revenue', data.net_sales_revenue],
      ];
      const csv = this.reportsService.generateCsv(headers, rows);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="sales-summary.csv"',
      );
      return res.status(HttpStatus.OK).send(csv);
    }

    return res.status(HttpStatus.OK).json(data);
  }

  @Get('profit-margin')
  async getProfitMargin(
    @Query() filter: ReportFilterDto,
    @Res() res: Response,
  ) {
    const data = await this.reportsService.getProfitAndMarginReport(filter);

    if (filter.format === 'csv') {
      const headers = [
        'Category',
        'SKU',
        'Product Name',
        'Quantity Sold',
        'Revenue',
        'COGS',
        'Gross Profit',
        'Margin %',
      ];
      const rows = data.product_breakdown.map((i) => [
        i.category_name,
        i.sku,
        i.product_name,
        i.quantity_sold,
        i.revenue,
        i.cogs,
        i.gross_profit,
        i.margin_percentage,
      ]);
      const csv = this.reportsService.generateCsv(headers, rows);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="profit-margin.csv"',
      );
      return res.status(HttpStatus.OK).send(csv);
    }

    return res.status(HttpStatus.OK).json(data);
  }

  @Get('stock-valuation')
  async getStockValuation(
    @Query('branch_id') branchId: string,
    @Query('format') format: string,
    @Res() res: Response,
  ) {
    const data = await this.reportsService.getStockValuationReport(branchId);

    if (format === 'csv') {
      const headers = [
        'Branch',
        'Category',
        'SKU',
        'Product Name',
        'UOM',
        'On Hand',
        'Cost Valuation',
        'Retail Valuation',
        'Potential Margin',
      ];
      const rows = data.items.map((i) => [
        i.branch_name,
        i.category,
        i.sku,
        i.product_name,
        i.uom,
        i.on_hand,
        i.valuation_at_cost,
        i.potential_retail_value,
        i.potential_gross_margin,
      ]);
      const csv = this.reportsService.generateCsv(headers, rows);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="stock-valuation.csv"',
      );
      return res.status(HttpStatus.OK).send(csv);
    }

    return res.status(HttpStatus.OK).json(data);
  }

  @Get('cashier-performance')
  async getCashierPerformance(
    @Query() filter: ReportFilterDto,
    @Res() res: Response,
  ) {
    const data = await this.reportsService.getCashierPerformanceReport(filter);
    return res.status(HttpStatus.OK).json(data);
  }

  @Get('hq-dashboard')
  async getConsolidatedDashboard() {
    return this.reportsService.getConsolidatedHqDashboard();
  }
}

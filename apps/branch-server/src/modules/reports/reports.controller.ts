import {
  Controller,
  Get,
  Query,
  Headers,
} from '@nestjs/common';
import { ReportsService } from './reports.service';
import { DateRangeQueryDto, ExpiringStockQueryDto } from './reports.dto';

@Controller(['reports', 'api/reports'])
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('summary')
  async getComprehensiveReport(
    @Query() query: DateRangeQueryDto,
    @Headers('x-branch-id') branchIdHeader?: string,
  ) {
    const branchId = query.branchId || branchIdHeader || process.env.BRANCH_ID || '00000000-0000-0000-0000-000000000001';
    return this.reportsService.getComprehensiveReport(
      branchId,
      query.startDate,
      query.endDate,
      query.period,
    );
  }

  @Get('sales/daily')
  async getDailySalesReport(
    @Query() query: DateRangeQueryDto,
    @Headers('x-branch-id') branchIdHeader?: string,
  ) {
    const branchId = query.branchId || branchIdHeader || process.env.BRANCH_ID || '00000000-0000-0000-0000-000000000001';
    return this.reportsService.getDailySalesReport(
      branchId,
      query.startDate,
      query.endDate,
      query.period,
    );
  }

  @Get('profitability')
  async getProductProfitabilityReport(
    @Query() query: DateRangeQueryDto,
    @Headers('x-branch-id') branchIdHeader?: string,
  ) {
    const branchId = query.branchId || branchIdHeader || process.env.BRANCH_ID || '00000000-0000-0000-0000-000000000001';
    return this.reportsService.getProductProfitabilityReport(
      branchId,
      query.startDate,
      query.endDate,
      query.period,
    );
  }

  @Get('inventory/valuation')
  async getStockValuationReport(
    @Query() query: DateRangeQueryDto,
    @Headers('x-branch-id') branchIdHeader?: string,
  ) {
    const branchId = query.branchId || branchIdHeader || process.env.BRANCH_ID || '00000000-0000-0000-0000-000000000001';
    return this.reportsService.getStockValuationReport(branchId);
  }

  @Get('inventory/expiring')
  async getExpiringStockReport(
    @Query() query: ExpiringStockQueryDto,
    @Headers('x-branch-id') branchIdHeader?: string,
  ) {
    const branchId = query.branchId || branchIdHeader || process.env.BRANCH_ID || '00000000-0000-0000-0000-000000000001';
    return this.reportsService.getExpiringStockReport(
      branchId,
      query.days ?? 30,
    );
  }

  @Get('cashiers')
  async getCashierPerformanceReport(
    @Query() query: DateRangeQueryDto,
    @Headers('x-branch-id') branchIdHeader?: string,
  ) {
    const branchId = query.branchId || branchIdHeader || process.env.BRANCH_ID || '00000000-0000-0000-0000-000000000001';
    return this.reportsService.getCashierPerformanceReport(
      branchId,
      query.startDate,
      query.endDate,
      query.period,
    );
  }

  @Get('branches/freshness')
  async getBranchSyncFreshness() {
    return this.reportsService.getBranchSyncFreshness();
  }
}

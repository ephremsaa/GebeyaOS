import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Patch,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ProductsService, ScannedProductLookupResult } from './products.service';
import {
  CreateProductDto,
  CreateBarcodeDto,
  SetBranchOverrideDto,
  PriceChangeDto,
} from './dto/products.dto';

@Controller('api/products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createProduct(@Body() dto: CreateProductDto) {
    return this.productsService.createProduct(dto);
  }

  @Post(':id/barcodes')
  @HttpCode(HttpStatus.CREATED)
  async addBarcode(
    @Param('id') productId: string,
    @Body() dto: CreateBarcodeDto,
  ) {
    return this.productsService.addBarcode(productId, dto);
  }

  @Post(':id/branch-overrides/:branchId')
  @HttpCode(HttpStatus.OK)
  async setBranchOverride(
    @Param('id') productId: string,
    @Param('branchId') branchId: string,
    @Body() dto: SetBranchOverrideDto,
  ) {
    return this.productsService.setBranchOverride(productId, branchId, dto);
  }

  @Post(':id/price-changes')
  @HttpCode(HttpStatus.OK)
  async updatePrice(
    @Param('id') productId: string,
    @Body() dto: PriceChangeDto,
  ) {
    return this.productsService.updatePrice(productId, dto);
  }

  @Get('scan')
  async scanBarcode(
    @Query('branch_id') branchId: string,
    @Query('barcode') barcode: string,
  ): Promise<ScannedProductLookupResult> {
    return this.productsService.lookupBarcode(branchId, barcode);
  }

  @Get(':id/price-history')
  async getPriceHistory(
    @Param('id') productId: string,
    @Query('branch_id') branchId?: string,
  ) {
    return this.productsService.getPriceHistory(productId, branchId);
  }
}

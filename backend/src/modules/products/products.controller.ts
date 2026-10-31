import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  Headers,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ProductsService, ScannedProductLookupResult } from './products.service';
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

@Controller('api/products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  async getProducts(
    @Query() query: ProductQueryDto,
    @Headers('x-branch-id') branchIdHeader?: string,
  ) {
    const branchId = branchIdHeader || '018e0000-0000-7000-8000-000000000020';
    return this.productsService.getProducts(branchId, query);
  }

  @Get('categories')
  async getCategories() {
    return this.productsService.getCategories();
  }

  @Post('categories')
  @HttpCode(HttpStatus.CREATED)
  async createCategory(@Body() dto: CreateCategoryDto) {
    return this.productsService.createCategory(dto);
  }

  @Get('uoms')
  async getUoms() {
    return this.productsService.getUoms();
  }

  @Get('check-barcode')
  async checkBarcode(@Query('barcode') barcode: string) {
    return this.productsService.checkBarcode(barcode || '');
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createProduct(@Body() dto: CreateProductDto) {
    return this.productsService.createProduct(dto);
  }

  @Put(':id')
  @HttpCode(HttpStatus.OK)
  async updateProduct(
    @Param('id') productId: string,
    @Body() dto: UpdateProductDto,
    @Headers('x-branch-id') branchIdHeader?: string,
  ) {
    const branchId = branchIdHeader || '018e0000-0000-7000-8000-000000000020';
    return this.productsService.updateProduct(productId, dto, branchId);
  }

  @Post(':id/archive')
  @HttpCode(HttpStatus.OK)
  async archiveProduct(
    @Param('id') productId: string,
    @Headers('x-branch-id') branchIdHeader?: string,
  ) {
    const branchId = branchIdHeader || '018e0000-0000-7000-8000-000000000020';
    return this.productsService.archiveProduct(productId, branchId);
  }

  @Post('bulk-category')
  @HttpCode(HttpStatus.OK)
  async bulkUpdateCategory(@Body() dto: BulkCategoryDto) {
    return this.productsService.bulkUpdateCategory(dto.product_ids, dto.category_id);
  }

  @Post('bulk-archive')
  @HttpCode(HttpStatus.OK)
  async bulkArchive(@Body() dto: BulkArchiveDto) {
    return this.productsService.bulkArchive(dto.product_ids, dto.archive);
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

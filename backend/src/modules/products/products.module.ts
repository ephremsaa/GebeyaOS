import { Module } from '@nestjs/common';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { BarcodeParserService } from './domain/barcode-parser.service';
import { PricingCalculatorService } from './domain/pricing-calculator.service';

@Module({
  controllers: [ProductsController],
  providers: [ProductsService, BarcodeParserService, PricingCalculatorService],
  exports: [ProductsService, BarcodeParserService, PricingCalculatorService],
})
export class ProductsModule {}

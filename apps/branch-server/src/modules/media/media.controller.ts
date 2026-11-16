import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Headers,
  UseInterceptors,
  UploadedFile,
  Res,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { MediaService, PhotoSize } from './media.service';

@Controller(['media', 'api/media'])
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Post('products/:productId/photo')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('photo', { limits: { fileSize: 10 * 1024 * 1024 } }))
  async uploadProductPhoto(
    @Param('productId') productId: string,
    @UploadedFile() file: any,
    @Headers('x-tenant-id') tenantIdHeader?: string,
    @Headers('x-user-id') userIdHeader?: string,
  ) {
    if (!file || !file.buffer) {
      throw new BadRequestException('No photo file uploaded');
    }

    const tenantId = tenantIdHeader || process.env.TENANT_ID || '01900000-0000-7000-8000-000000000001';
    return this.mediaService.processAndSaveProductPhoto(tenantId, productId, file.buffer, userIdHeader);
  }

  @Get('products/:productId/:size')
  async getProductPhoto(
    @Param('productId') productId: string,
    @Param('size') size: string,
    @Headers('x-tenant-id') tenantIdHeader: string | undefined,
    @Res() res: Response,
  ) {
    const tenantId = tenantIdHeader || process.env.TENANT_ID || '01900000-0000-7000-8000-000000000001';
    const targetSize: PhotoSize = size === 'thumb' || size === 'full' ? size : 'card';

    const photo = await this.mediaService.getProductPhotoFile(tenantId, productId, targetSize);

    res.setHeader('Content-Type', 'image/webp');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('ETag', photo.etag);
    res.setHeader('Content-Length', photo.size);

    return res.sendFile(photo.filePath);
  }

  @Delete('products/:productId/photo')
  @HttpCode(HttpStatus.OK)
  async deleteProductPhoto(
    @Param('productId') productId: string,
    @Headers('x-tenant-id') tenantIdHeader?: string,
  ) {
    const tenantId = tenantIdHeader || process.env.TENANT_ID || '01900000-0000-7000-8000-000000000001';
    const success = await this.mediaService.deleteProductPhoto(tenantId, productId);
    return { success };
  }

  @Post('products/bulk-zip')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('zip', { limits: { fileSize: 50 * 1024 * 1024 } }))
  async importBulkZip(
    @UploadedFile() file: any,
    @Headers('x-tenant-id') tenantIdHeader?: string,
    @Headers('x-user-id') userIdHeader?: string,
  ) {
    if (!file || !file.buffer) {
      throw new BadRequestException('No ZIP archive uploaded');
    }

    const tenantId = tenantIdHeader || process.env.TENANT_ID || '01900000-0000-7000-8000-000000000001';
    return this.mediaService.importProductPhotosZip(tenantId, file.buffer, userIdHeader);
  }

  @Get('storage-stats')
  async getStorageStats(@Headers('x-tenant-id') tenantIdHeader?: string) {
    const tenantId = tenantIdHeader || process.env.TENANT_ID || '01900000-0000-7000-8000-000000000001';
    return this.mediaService.getStorageStats(tenantId);
  }
}

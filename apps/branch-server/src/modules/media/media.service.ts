import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import sharp from 'sharp';
import AdmZip from 'adm-zip';
import { DatabaseService } from '../../common/database/database.service';

export interface ZipImportResult {
  totalInZip: number;
  matchedCount: number;
  unmatchedCount: number;
  unmatchedFiles: string[];
  errors: string[];
}

export type PhotoSize = 'thumb' | 'card' | 'full';

const SIZES: Record<PhotoSize, { width: number; height: number; quality: number }> = {
  thumb: { width: 160, height: 160, quality: 80 },
  card: { width: 480, height: 480, quality: 82 },
  full: { width: 1024, height: 1024, quality: 85 },
};

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);
  private readonly baseMediaDir = path.resolve(process.cwd(), 'data', 'media');

  constructor(private readonly db: DatabaseService) {
    if (!fs.existsSync(this.baseMediaDir)) {
      fs.mkdirSync(this.baseMediaDir, { recursive: true });
    }
  }

  private getTenantDir(tenantId: string): string {
    const dir = path.join(this.baseMediaDir, tenantId, 'products');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  /**
   * Magic bytes header validation: strictly enforces JPEG, PNG, or WebP.
   * Explicitly rejects SVGs (script execution vulnerability) and executable headers (MZ, ELF).
   */
  validateMagicBytes(buffer: Buffer): { valid: boolean; format: 'jpeg' | 'png' | 'webp' | null; error?: string } {
    if (!buffer || buffer.length < 12) {
      return { valid: false, format: null, error: 'File is empty or truncated' };
    }

    // Windows EXE (MZ)
    if (buffer[0] === 0x4D && buffer[1] === 0x5A) {
      return { valid: false, format: null, error: 'Executable files are prohibited' };
    }
    // Linux ELF
    if (buffer[0] === 0x7F && buffer[1] === 0x45 && buffer[2] === 0x4C && buffer[3] === 0x46) {
      return { valid: false, format: null, error: 'Executable binaries are prohibited' };
    }

    // Reject SVG
    const headerStr = buffer.slice(0, 200).toString('utf8').toLowerCase();
    if (headerStr.includes('<svg') || headerStr.includes('<?xml')) {
      return { valid: false, format: null, error: 'SVG images are not supported for product security' };
    }

    // JPEG
    if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
      return { valid: true, format: 'jpeg' };
    }

    // PNG
    if (
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4E &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0D &&
      buffer[5] === 0x0A &&
      buffer[6] === 0x1A &&
      buffer[7] === 0x0A
    ) {
      return { valid: true, format: 'png' };
    }

    // WebP
    if (
      buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
      buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50
    ) {
      return { valid: true, format: 'webp' };
    }

    return {
      valid: false,
      format: null,
      error: 'Invalid image format. Only JPEG, PNG, and WebP are permitted.',
    };
  }

  /**
   * Processes a product photo:
   * - Validates magic bytes
   * - Strips EXIF metadata
   * - Computes SHA-256 for deduplication
   * - Generates 3 WebP sizes (160px thumb, 480px card, 1024px full)
   * - Updates database record
   */
  async processAndSaveProductPhoto(
    tenantId: string,
    productId: string,
    fileBuffer: Buffer,
    uploadedBy?: string,
  ): Promise<{ photoPath: string; photoHash: string; photoSize: number }> {
    const val = this.validateMagicBytes(fileBuffer);
    if (!val.valid) {
      throw new BadRequestException(val.error);
    }

    const tenantDir = this.getTenantDir(tenantId);
    const photoHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

    // Generate each size if not already cached
    for (const [sizeName, cfg] of Object.entries(SIZES)) {
      const targetPath = path.join(tenantDir, `${photoHash}_${sizeName}.webp`);
      if (!fs.existsSync(targetPath)) {
        await sharp(fileBuffer)
          .rotate() // auto-orient from EXIF if needed before stripping
          .resize({
            width: cfg.width,
            height: cfg.height,
            fit: 'cover',
            position: 'centre',
          })
          .webp({ quality: cfg.quality })
          .toFile(targetPath);
      }
    }

    const cardPath = path.join(tenantDir, `${photoHash}_card.webp`);
    const cardStats = fs.existsSync(cardPath) ? fs.statSync(cardPath) : null;
    const photoSize = cardStats ? cardStats.size : fileBuffer.length;

    // Relative web URL served by branch-server
    const photoPath = `/api/media/products/${productId}/card`;

    await this.db.query(
      `UPDATE products
       SET photo_path = $1,
           photo_hash = $2,
           photo_size = $3,
           photo_width = 480,
           photo_height = 480,
           photo_uploaded_by = $4,
           photo_updated_at = NOW(),
           updated_at = NOW()
       WHERE id = $5`,
      [photoPath, photoHash, photoSize, uploadedBy || null, productId],
    );

    return { photoPath, photoHash, photoSize };
  }

  /**
   * Retrieves product photo file path and ETag for streaming response.
   */
  async getProductPhotoFile(
    tenantId: string,
    productId: string,
    size: PhotoSize = 'card',
  ): Promise<{ filePath: string; etag: string; size: number }> {
    const res = await this.db.query<any>(
      `SELECT photo_hash FROM products WHERE id = $1 LIMIT 1`,
      [productId],
    );

    if (res.rows.length === 0 || !res.rows[0].photo_hash) {
      throw new NotFoundException(`No photo found for product ${productId}`);
    }

    const photoHash = res.rows[0].photo_hash;
    const tenantDir = this.getTenantDir(tenantId);
    const filePath = path.join(tenantDir, `${photoHash}_${size}.webp`);

    if (!fs.existsSync(filePath)) {
      // Fallback to card size if specific size missing
      const fallbackPath = path.join(tenantDir, `${photoHash}_card.webp`);
      if (fs.existsSync(fallbackPath)) {
        const stats = fs.statSync(fallbackPath);
        return { filePath: fallbackPath, etag: `"${photoHash}-card"`, size: stats.size };
      }
      throw new NotFoundException(`Photo file missing from disk`);
    }

    const stats = fs.statSync(filePath);
    return { filePath, etag: `"${photoHash}-${size}"`, size: stats.size };
  }

  /**
   * Removes a product photo from the database.
   */
  async deleteProductPhoto(tenantId: string, productId: string): Promise<boolean> {
    const res = await this.db.query<any>(
      `SELECT photo_hash FROM products WHERE id = $1 LIMIT 1`,
      [productId],
    );

    if (res.rows.length === 0) {
      throw new NotFoundException(`Product ${productId} not found`);
    }

    const photoHash = res.rows[0].photo_hash;

    await this.db.query(
      `UPDATE products
       SET photo_path = NULL,
           photo_hash = NULL,
           photo_size = NULL,
           photo_width = NULL,
           photo_height = NULL,
           photo_updated_at = NOW(),
           updated_at = NOW()
       WHERE id = $1`,
      [productId],
    );

    // If no other product is using this photoHash, we could clean up files
    if (photoHash) {
      const otherUsage = await this.db.query(
        `SELECT id FROM products WHERE photo_hash = $1 LIMIT 1`,
        [photoHash],
      );
      if (otherUsage.rows.length === 0) {
        const tenantDir = this.getTenantDir(tenantId);
        for (const s of ['thumb', 'card', 'full']) {
          const p = path.join(tenantDir, `${photoHash}_${s}.webp`);
          if (fs.existsSync(p)) {
            try {
              fs.unlinkSync(p);
            } catch {}
          }
        }
      }
    }

    return true;
  }

  /**
   * Bulk ZIP import: matches image files by {barcode}.{ext} or {sku}.{ext}
   */
  async importProductPhotosZip(
    tenantId: string,
    zipBuffer: Buffer,
    uploadedBy?: string,
  ): Promise<ZipImportResult> {
    const zip = new AdmZip(zipBuffer);
    const zipEntries = zip.getEntries();

    let totalInZip = 0;
    let matchedCount = 0;
    const unmatchedFiles: string[] = [];
    const errors: string[] = [];

    // Query active products with barcode and SKU
    const prodRes = await this.db.query<any>(
      `SELECT p.id, p.barcode, p.sku, p.name_en FROM products p WHERE p.is_active = TRUE`,
    );

    const barcodeMap = new Map<string, string>();
    const skuMap = new Map<string, string>();

    for (const p of prodRes.rows) {
      if (p.barcode) barcodeMap.set(p.barcode.trim().toLowerCase(), p.id);
      if (p.sku) skuMap.set(p.sku.trim().toLowerCase(), p.id);
    }

    for (const entry of zipEntries) {
      if (entry.isDirectory) continue;

      const fileName = entry.name;
      // Skip hidden files, system files, OSX __MACOSX
      if (fileName.startsWith('.') || fileName.startsWith('__MACOSX')) continue;

      totalInZip++;
      const baseName = path.parse(fileName).name.trim().toLowerCase();
      const fileData = entry.getData();

      const matchedProductId = barcodeMap.get(baseName) || skuMap.get(baseName);

      if (!matchedProductId) {
        unmatchedFiles.push(fileName);
        continue;
      }

      try {
        await this.processAndSaveProductPhoto(tenantId, matchedProductId, fileData, uploadedBy);
        matchedCount++;
      } catch (err: any) {
        errors.push(`${fileName}: ${err.message}`);
      }
    }

    return {
      totalInZip,
      matchedCount,
      unmatchedCount: unmatchedFiles.length,
      unmatchedFiles,
      errors,
    };
  }

  /**
   * Storage stats for Settings > Data: files count and size in MB.
   */
  async getStorageStats(tenantId: string): Promise<{ fileCount: number; totalBytes: number; totalMb: string; formatted: string }> {
    const tenantDir = this.getTenantDir(tenantId);
    let fileCount = 0;
    let totalBytes = 0;

    if (fs.existsSync(tenantDir)) {
      const files = fs.readdirSync(tenantDir);
      for (const file of files) {
        const filePath = path.join(tenantDir, file);
        try {
          const stats = fs.statSync(filePath);
          if (stats.isFile()) {
            fileCount++;
            totalBytes += stats.size;
          }
        } catch {}
      }
    }

    const totalMb = (totalBytes / (1024 * 1024)).toFixed(2);
    return {
      fileCount,
      totalBytes,
      totalMb,
      formatted: `${fileCount} files (${totalMb} MB)`,
    };
  }
}

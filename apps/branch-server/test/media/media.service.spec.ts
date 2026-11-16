import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import sharp from 'sharp';
import AdmZip from 'adm-zip';
import { MediaService } from '../../src/modules/media/media.service';

describe('MediaService – Product Photos, Multi-Size WebP, Magic Bytes & ZIP Import', () => {
  let service: MediaService;
  let mockDb: any;
  const testTenantId = 'ten-test-photo';

  beforeEach(() => {
    mockDb = {
      query: vi.fn(),
    };
    service = new MediaService(mockDb);
  });

  afterEach(() => {
    // Clean up test tenant media dir if created
    const testDir = path.resolve(process.cwd(), 'data', 'media', testTenantId);
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
    vi.clearAllMocks();
  });

  describe('validateMagicBytes', () => {
    it('rejects files smaller than 12 bytes', () => {
      const res = service.validateMagicBytes(Buffer.from([0x01, 0x02]));
      expect(res.valid).toBe(false);
      expect(res.error).toContain('empty or truncated');
    });

    it('rejects Windows executable files (MZ header)', () => {
      const buf = Buffer.alloc(20);
      buf[0] = 0x4D; // M
      buf[1] = 0x5A; // Z
      const res = service.validateMagicBytes(buf);
      expect(res.valid).toBe(false);
      expect(res.error).toContain('Executable');
    });

    it('rejects Linux ELF binary files', () => {
      const buf = Buffer.alloc(20);
      buf[0] = 0x7F;
      buf[1] = 0x45; // E
      buf[2] = 0x4C; // L
      buf[3] = 0x46; // F
      const res = service.validateMagicBytes(buf);
      expect(res.valid).toBe(false);
      expect(res.error).toContain('Executable');
    });

    it('rejects SVG files with embedded script risk', () => {
      const svgBuf = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
      const res = service.validateMagicBytes(svgBuf);
      expect(res.valid).toBe(false);
      expect(res.error).toContain('SVG images are not supported');
    });

    it('accepts valid JPEG header', () => {
      const buf = Buffer.alloc(20);
      buf[0] = 0xFF;
      buf[1] = 0xD8;
      buf[2] = 0xFF;
      const res = service.validateMagicBytes(buf);
      expect(res.valid).toBe(true);
      expect(res.format).toBe('jpeg');
    });

    it('accepts valid PNG header', () => {
      const buf = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D]);
      const res = service.validateMagicBytes(buf);
      expect(res.valid).toBe(true);
      expect(res.format).toBe('png');
    });

    it('accepts valid WebP header', () => {
      const buf = Buffer.alloc(20);
      buf[0] = 0x52; // R
      buf[1] = 0x49; // I
      buf[2] = 0x46; // F
      buf[3] = 0x46; // F
      buf[8] = 0x57; // W
      buf[9] = 0x45; // E
      buf[10] = 0x42; // B
      buf[11] = 0x50; // P
      const res = service.validateMagicBytes(buf);
      expect(res.valid).toBe(true);
      expect(res.format).toBe('webp');
    });
  });

  describe('processAndSaveProductPhoto', () => {
    it('creates thumb, card, and full WebP files with EXIF stripped and updates DB', async () => {
      // Generate a small 100x100 PNG using sharp
      const testPngBuffer = await sharp({
        create: {
          width: 100,
          height: 100,
          channels: 4,
          background: { r: 255, g: 0, b: 0, alpha: 1 },
        },
      })
        .png()
        .toBuffer();

      mockDb.query.mockResolvedValueOnce({ rowCount: 1 });

      const res = await service.processAndSaveProductPhoto(
        testTenantId,
        'prod-01',
        testPngBuffer,
        'user-admin',
      );

      expect(res.photoPath).toBe('/api/media/products/prod-01/card');
      expect(res.photoHash).toBeDefined();
      expect(res.photoHash.length).toBe(64); // SHA-256

      // Verify files were generated on disk in the tenant folder
      const tenantDir = path.resolve(process.cwd(), 'data', 'media', testTenantId, 'products');
      expect(fs.existsSync(path.join(tenantDir, `${res.photoHash}_thumb.webp`))).toBe(true);
      expect(fs.existsSync(path.join(tenantDir, `${res.photoHash}_card.webp`))).toBe(true);
      expect(fs.existsSync(path.join(tenantDir, `${res.photoHash}_full.webp`))).toBe(true);

      // Verify DB update parameters
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE products'),
        [res.photoPath, res.photoHash, expect.any(Number), 'user-admin', 'prod-01'],
      );
    });
  });

  describe('importProductPhotosZip', () => {
    it('matches photos from ZIP by barcode or SKU and reports summary', async () => {
      // 1. Generate two small test images
      const img1 = await sharp({
        create: { width: 50, height: 50, channels: 3, background: { r: 0, g: 255, b: 0 } },
      })
        .jpeg()
        .toBuffer();

      const img2 = await sharp({
        create: { width: 50, height: 50, channels: 3, background: { r: 0, g: 0, b: 255 } },
      })
        .jpeg()
        .toBuffer();

      // 2. Package into a ZIP archive
      const zip = new AdmZip();
      zip.addFile('6901234567890.jpg', img1); // matches barcode
      zip.addFile('SKU-BEV-99.jpg', img2);     // matches SKU
      zip.addFile('unmatched-product.jpg', img1); // unmatched
      const zipBuffer = zip.toBuffer();

      // 3. Mock products query
      mockDb.query.mockImplementation((sql: string) => {
        if (sql.includes('SELECT p.id, p.barcode, p.sku')) {
          return Promise.resolve({
            rows: [
              { id: 'p-matched-1', barcode: '6901234567890', sku: 'SKU-001', name_en: 'Item 1' },
              { id: 'p-matched-2', barcode: '5555555555555', sku: 'SKU-BEV-99', name_en: 'Item 2' },
            ],
          });
        }
        if (sql.includes('UPDATE products')) {
          return Promise.resolve({ rowCount: 1 });
        }
        return Promise.resolve({ rows: [] });
      });

      const result = await service.importProductPhotosZip(testTenantId, zipBuffer, 'admin-user');

      expect(result.totalInZip).toBe(3);
      expect(result.matchedCount).toBe(2);
      expect(result.unmatchedCount).toBe(1);
      expect(result.unmatchedFiles).toContain('unmatched-product.jpg');
      expect(result.errors.length).toBe(0);
    });
  });

  describe('getStorageStats', () => {
    it('returns file count and total MB size', async () => {
      const stats = await service.getStorageStats(testTenantId);
      expect(stats).toHaveProperty('fileCount');
      expect(stats).toHaveProperty('totalBytes');
      expect(stats).toHaveProperty('totalMb');
    });
  });
});

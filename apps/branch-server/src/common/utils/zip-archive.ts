import * as zlib from 'zlib';

export interface ZipFileInput {
  name: string;
  data: Buffer | string;
}

/**
 * Creates a standard RFC 1951 / PKZIP compliant ZIP archive buffer
 * using Node's native zlib deflate and CRC-32 capabilities.
 */
export function createZipArchive(files: ZipFileInput[]): Buffer {
  const localHeaders: Buffer[] = [];
  const centralHeaders: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    const filenameBuf = Buffer.from(file.name, 'utf8');
    const rawData = Buffer.isBuffer(file.data)
      ? file.data
      : Buffer.from(file.data, 'utf8');

    const crc = (zlib as any).crc32 ? (zlib as any).crc32(rawData) : calculateCrc32(rawData);
    const compressed = zlib.deflateRawSync(rawData);

    // Local Header (30 bytes + name + extra)
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); // Local file header signature
    lh.writeUInt16LE(20, 4);         // Version needed to extract (2.0)
    lh.writeUInt16LE(0, 6);          // General purpose bit flag
    lh.writeUInt16LE(8, 8);          // Compression method: 8 = Deflate
    lh.writeUInt16LE(0, 10);         // Last mod file time
    lh.writeUInt16LE(0, 12);         // Last mod file date
    lh.writeUInt32LE(crc, 14);       // CRC-32
    lh.writeUInt32LE(compressed.length, 18); // Compressed size
    lh.writeUInt32LE(rawData.length, 22);    // Uncompressed size
    lh.writeUInt16LE(filenameBuf.length, 26); // File name length
    lh.writeUInt16LE(0, 28);                  // Extra field length

    const localRecord = Buffer.concat([lh, filenameBuf, compressed]);
    localHeaders.push(localRecord);

    // Central Directory Header (46 bytes + name)
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); // Central directory file header signature
    ch.writeUInt16LE(20, 4);         // Version made by (2.0)
    ch.writeUInt16LE(20, 6);         // Version needed to extract (2.0)
    ch.writeUInt16LE(0, 8);          // General purpose bit flag
    ch.writeUInt16LE(8, 10);         // Compression method: 8 = Deflate
    ch.writeUInt16LE(0, 12);         // Last mod file time
    ch.writeUInt16LE(0, 14);         // Last mod file date
    ch.writeUInt32LE(crc, 16);       // CRC-32
    ch.writeUInt32LE(compressed.length, 20); // Compressed size
    ch.writeUInt32LE(rawData.length, 24);    // Uncompressed size
    ch.writeUInt16LE(filenameBuf.length, 28); // File name length
    ch.writeUInt16LE(0, 30);         // Extra field length
    ch.writeUInt16LE(0, 32);         // File comment length
    ch.writeUInt16LE(0, 34);         // Disk number start
    ch.writeUInt16LE(0, 36);         // Internal file attributes
    ch.writeUInt32LE(0, 38);         // External file attributes
    ch.writeUInt32LE(offset, 42);    // Relative offset of local header

    centralHeaders.push(Buffer.concat([ch, filenameBuf]));
    offset += localRecord.length;
  }

  const centralDir = Buffer.concat(centralHeaders);

  // End of Central Directory Record (22 bytes)
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // End of central dir signature
  eocd.writeUInt16LE(0, 4);          // Number of this disk
  eocd.writeUInt16LE(0, 6);          // Disk where central directory starts
  eocd.writeUInt16LE(files.length, 8);      // Total entries in central directory on this disk
  eocd.writeUInt16LE(files.length, 10);     // Total entries in central directory
  eocd.writeUInt32LE(centralDir.length, 12); // Size of central directory
  eocd.writeUInt32LE(offset, 16);            // Offset of start of central directory
  eocd.writeUInt16LE(0, 20);                 // Comment length

  return Buffer.concat([...localHeaders, centralDir, eocd]);
}

/**
 * Fallback CRC-32 implementation if native zlib.crc32 is absent.
 */
function calculateCrc32(buf: Buffer): number {
  let crc = -1;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ -1) >>> 0;
}

/**
 * Converts an array of objects to an RFC-4180 compliant CSV string.
 */
export function formatToCsv(rows: Record<string, any>[], columnOrder?: string[]): string {
  if (!rows || rows.length === 0) {
    if (columnOrder && columnOrder.length > 0) {
      return columnOrder.join(',') + '\r\n';
    }
    return '';
  }

  const columns = columnOrder && columnOrder.length > 0
    ? columnOrder
    : Object.keys(rows[0]);

  const escapeField = (val: any): string => {
    if (val === null || val === undefined) {
      return '';
    }
    if (val instanceof Date) {
      return `"${val.toISOString()}"`;
    }
    if (typeof val === 'object') {
      const json = JSON.stringify(val);
      return `"${json.replace(/"/g, '""')}"`;
    }
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const headerLine = columns.map(escapeField).join(',');
  const lines = rows.map((row) =>
    columns.map((col) => escapeField(row[col])).join(','),
  );

  return [headerLine, ...lines].join('\r\n') + '\r\n';
}


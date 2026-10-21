import { randomBytes } from 'crypto';

/**
 * UUIDv7 generator compliant with RFC 9562.
 * Generates a monotonically ordered, time-based UUID with millisecond precision.
 */
export function generateUuidV7(timestampMs?: number): string {
  const time = timestampMs ?? Date.now();

  // 48 bits of unix timestamp in ms
  const timeHex = time.toString(16).padStart(12, '0');

  // Random bytes for the rest
  const rand = randomBytes(10);

  // Version 7 in high 4 bits of octet 6
  rand[0] = (rand[0] & 0x0f) | 0x70;

  // Variant 2 (RFC 4122/9562) in high 2 bits of octet 8
  rand[2] = (rand[2] & 0x3f) | 0x80;

  const randHex = rand.toString('hex');

  // Format: 8-4-4-4-12
  return [
    timeHex.substring(0, 8),
    timeHex.substring(8, 12),
    randHex.substring(0, 4),
    randHex.substring(4, 8),
    randHex.substring(8, 20),
  ].join('-');
}

function getRandomBytes(length: number): Uint8Array {
  if (typeof globalThis !== 'undefined' && globalThis.crypto && typeof globalThis.crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(length);
    globalThis.crypto.getRandomValues(bytes);
    return bytes;
  }
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    bytes[i] = Math.floor(Math.random() * 256);
  }
  return bytes;
}

export function generateUuidV7(timestampMs?: number): string {
  const time = timestampMs ?? Date.now();
  const timeHex = time.toString(16).padStart(12, '0');
  const rand = getRandomBytes(10);

  // Version 7 in high 4 bits of octet 6
  rand[0] = (rand[0] & 0x0f) | 0x70;
  // Variant 2 (RFC 4122/9562) in high 2 bits of octet 8
  rand[2] = (rand[2] & 0x3f) | 0x80;

  const randHex = Array.from(rand)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return [
    timeHex.substring(0, 8),
    timeHex.substring(8, 12),
    randHex.substring(0, 4),
    randHex.substring(4, 8),
    randHex.substring(8, 20),
  ].join('-');
}

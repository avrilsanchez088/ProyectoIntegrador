import { randomBytes } from 'node:crypto';

/**
 * UUID v7 generator.
 * V7 is time-ordered (sortable, index-friendly) — better than v4 for DB primary keys.
 *
 * Format: 48 bits unix ms timestamp + 12 bits random + 6 bits version + 62 bits random
 */
export function uuidv7(): string {
  const ms = BigInt(Date.now());
  const msHex = ms.toString(16).padStart(12, '0');

  const rand = randomBytes(10);
  // Set version (7) and variant (10xx) bits
  rand[0] = ((rand[0] ?? 0) & 0x0f) | 0x70;
  rand[2] = ((rand[2] ?? 0) & 0x3f) | 0x80;

  const hex = msHex + Array.from(rand, (b) => b.toString(16).padStart(2, '0')).join('');

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/**
 * Validates a string is a UUID (any version).
 */
export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

import { describe, expect, it } from 'vitest';
import { isUuid, uuidv7 } from './ids';

describe('uuidv7', () => {
  it('returns a valid UUID string', () => {
    const id = uuidv7();
    expect(isUuid(id)).toBe(true);
  });

  it('returns unique IDs across calls', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => uuidv7()));
    expect(ids.size).toBe(1000);
  });

  it('IDs are time-ordered (newer > older)', async () => {
    const a = uuidv7();
    await new Promise((r) => setTimeout(r, 5));
    const b = uuidv7();
    expect(b > a).toBe(true);
  });

  it('embeds the version 7 in the right position', () => {
    const id = uuidv7();
    // Format: xxxxxxxx-xxxx-Mxxx-Nxxx-xxxxxxxxxxxx
    // M (position 14) must be '7' for v7
    expect(id[14]).toBe('7');
  });
});

describe('isUuid', () => {
  it('accepts valid UUIDs', () => {
    expect(isUuid('019231d6-4f5e-7c12-9d4a-8b3f5c2e1a0b')).toBe(true);
  });

  it('rejects garbage', () => {
    expect(isUuid('not-a-uuid')).toBe(false);
    expect(isUuid('')).toBe(false);
    expect(isUuid('019231d6-4f5e-7c12-9d4a-8b3f5c2e1a0')).toBe(false); // missing char
  });
});

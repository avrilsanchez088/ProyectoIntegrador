import { describe, expect, it } from 'vitest';
import { parseSharedEnv } from './env';

describe('parseSharedEnv', () => {
  const validEnv = {
    NODE_ENV: 'development',
    APP_MODE: 'demo',
    DATABASE_URL: 'postgres://impacto:pass@localhost:5433/impacto',
    REDIS_URL: 'redis://default:pass@localhost:6380',
    BETTER_AUTH_SECRET: 'a'.repeat(32),
    BETTER_AUTH_URL: 'http://localhost:3100',
    PUBLIC_WEB_URL: 'http://localhost:3100',
    PUBLIC_API_URL: 'http://localhost:3101',
  };

  it('accepts valid env', () => {
    const result = parseSharedEnv(validEnv);
    expect(result.NODE_ENV).toBe('development');
    expect(result.APP_MODE).toBe('demo');
  });

  it('uses defaults when optional vars missing', () => {
    const { NODE_ENV, APP_MODE, ...withoutDefaults } = validEnv;
    const result = parseSharedEnv(withoutDefaults);
    expect(result.NODE_ENV).toBe('development');
    expect(result.APP_MODE).toBe('demo');
  });

  it('rejects when DATABASE_URL is missing', () => {
    const { DATABASE_URL, ...broken } = validEnv;
    expect(() => parseSharedEnv(broken)).toThrow();
  });

  it('rejects when DATABASE_URL is not a URL', () => {
    expect(() => parseSharedEnv({ ...validEnv, DATABASE_URL: 'not a url' })).toThrow();
  });

  it('rejects when BETTER_AUTH_SECRET is too short', () => {
    expect(() => parseSharedEnv({ ...validEnv, BETTER_AUTH_SECRET: 'short' })).toThrow();
  });

  it('rejects invalid APP_MODE', () => {
    expect(() => parseSharedEnv({ ...validEnv, APP_MODE: 'invalid' })).toThrow();
  });
});

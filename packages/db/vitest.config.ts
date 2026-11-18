import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'vitest/config';

// Carga DATABASE_URL desde el .env raíz del monorepo.
loadEnv({ path: resolve(__dirname, '../../.env') });

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});

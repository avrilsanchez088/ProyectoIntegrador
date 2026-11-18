import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'vitest/config';

// Cargamos .env desde la raíz del monorepo antes de que vitest evalúe los imports
// (env.ts hace validación strict al cargar y necesita las vars).
loadEnv({ path: resolve(__dirname, '../../.env') });

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});

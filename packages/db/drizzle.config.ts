import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/schema/index.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      'postgres://impacto:impacto_dev_password_change_me@localhost:5433/impacto',
  },
  verbose: true,
  strict: true,
});

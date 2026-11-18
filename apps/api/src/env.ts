import { sharedEnvSchema } from '@impacto/shared/env';
import { z } from 'zod';

/**
 * API-specific env. Extends the shared schema with stuff only the API needs.
 */
export const apiEnvSchema = sharedEnvSchema.extend({
  PORT: z.coerce.number().int().positive().default(3101),

  // OAuth providers (optional in dev)
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  FACEBOOK_CLIENT_ID: z.string().optional(),
  FACEBOOK_CLIENT_SECRET: z.string().optional(),

  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('debug'),

  // Email verification gate. Default off para dev (Mailhog captura igual).
  // En prod auth.ts asume 'true' si la var no esta seteada (fail-closed).
  REQUIRE_EMAIL_VERIFICATION: z.enum(['true', 'false']).optional(),

  // Channex white-label — credenciales propias de Impacto (no del tenant).
  CHANNEX_API_KEY: z.string().min(1, 'CHANNEX_API_KEY es requerida'),
  CHANNEX_BASE_URL: z.string().url().default('https://staging.channex.io/api/v1'),
  CHANNEX_WEBHOOK_SECRET: z.string().optional(),
});

export type ApiEnv = z.infer<typeof apiEnvSchema>;

export const env = apiEnvSchema.parse(process.env);

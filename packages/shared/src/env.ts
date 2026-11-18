import { z } from 'zod';

/**
 * Environment variables shared across apps.
 * Validated at boot. If any required var is missing or invalid, throws and
 * the app exits — better fail fast than misbehave silently.
 */
export const sharedEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_MODE: z.enum(['demo', 'real']).default('demo'),

  // Database
  DATABASE_URL: z.string().url(),

  // DB connection que usa la app en runtime (rol no-superuser, RLS aplica).
  // En tests/migrations se usa DATABASE_URL (superuser) para crear/dropear tablas.
  // Si APP_DATABASE_URL no está set, fallback a DATABASE_URL (dev sin RLS, no recomendado).
  APP_DATABASE_URL: z.string().url().optional(),

  // Redis
  REDIS_URL: z.string().url(),

  // Auth
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.string().url(),

  // Public URLs
  PUBLIC_WEB_URL: z.string().url(),
  PUBLIC_API_URL: z.string().url(),

  // S3 / MinIO (storage de fotos). Opcional para tests; requerido en
  // runtime cuando se usa el endpoint de upload.
  S3_ENDPOINT: z.string().url().optional(),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().default('us-east-1'),
  // URL publica desde donde los browsers acceden al bucket. En dev =
  // S3_ENDPOINT (MinIO). En prod = dominio del CDN (R2 custom domain).
  S3_PUBLIC_URL: z.string().url().optional(),

  // SMTP (dev = Mailhog, prod = Resend SMTP relay o similar).
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().email().optional(),
  RESEND_API_KEY: z.string().optional(),
});

export type SharedEnv = z.infer<typeof sharedEnvSchema>;

/**
 * Parses the env from process.env (Node) or import.meta.env (Next.js).
 * @throws ZodError if validation fails — let it bubble up to crash boot.
 */
export function parseSharedEnv(
  env: NodeJS.ProcessEnv | Record<string, string | undefined>,
): SharedEnv {
  return sharedEnvSchema.parse(env);
}

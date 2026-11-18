import pino from 'pino';
import { env } from './env.js';

/**
 * Estructured logger. JSON in prod, pretty colored in dev.
 */
export const logger = pino({
  level: env.LOG_LEVEL,
  transport:
    env.NODE_ENV === 'development'
      ? {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
        }
      : undefined,
  base: { app: 'impacto-api' },
});

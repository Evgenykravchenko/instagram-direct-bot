import { z } from 'zod';

const booleanFromString = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  INSTAGRAM_ACCESS_TOKEN: z.string().min(20),
  INSTAGRAM_ACCOUNT_ID: z.string().regex(/^\d+$/),
  INSTAGRAM_APP_SECRET: z.string().min(16),
  INSTAGRAM_VERIFY_TOKEN: z.string().min(16),
  META_GRAPH_VERSION: z
    .string()
    .regex(/^v\d+\.\d+$/)
    .default('v23.0'),
  BOTCRM_URL: z.string().url().default('http://localhost:4100/api/v1'),
  BOTCRM_CONTENT_TOKEN: z.string().min(40),
  CONTENT_CACHE_TTL_SECONDS: z.coerce.number().int().min(5).max(3600).default(60),
  YANDEX_DISK_TOKEN: z.string().min(20),
  MEDIA_POLL_INTERVAL_SECONDS: z.coerce.number().int().min(5).max(3600).default(20),
  MEDIA_BATCH_SIZE: z.coerce.number().int().min(1).max(10).default(3),
  DATABASE_URL: z.string().url(),
  DATABASE_SSL: booleanFromString,
  EVENT_POLL_INTERVAL_MS: z.coerce.number().int().min(100).max(30_000).default(500),
  EVENT_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(20).default(8),
  EVENT_LOCK_TIMEOUT_SECONDS: z.coerce.number().int().min(30).max(3600).default(300),
  HTTP_HOST: z.string().default('0.0.0.0'),
  HTTP_PORT: z.coerce.number().int().min(1024).max(65535).default(8091),
  WEBHOOK_PATH: z
    .string()
    .regex(/^\/[a-zA-Z0-9/_-]*$/)
    .default('/webhook'),
  WEBHOOK_BODY_LIMIT_BYTES: z.coerce
    .number()
    .int()
    .min(1024)
    .max(5 * 1024 * 1024)
    .default(1024 * 1024),
});

export type AppConfig = z.infer<typeof schema>;

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): AppConfig {
  return schema.parse(environment);
}

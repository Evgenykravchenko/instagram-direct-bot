import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config/env.js';

const valid = {
  NODE_ENV: 'test',
  INSTAGRAM_ACCESS_TOKEN: 'a'.repeat(24),
  INSTAGRAM_ACCOUNT_ID: '123456789',
  INSTAGRAM_APP_SECRET: 's'.repeat(20),
  INSTAGRAM_VERIFY_TOKEN: 'v'.repeat(20),
  DIRECTUS_TOKEN: 'd'.repeat(24),
  YANDEX_DISK_TOKEN: 'y'.repeat(24),
  DATABASE_URL: 'postgresql://user:password@localhost:5434/database',
};

describe('loadConfig', () => {
  it('applies safe defaults', () => {
    const config = loadConfig(valid);
    expect(config.CONTENT_BOT_KEY).toBe('instagram-direct-bot');
    expect(config.WEBHOOK_PATH).toBe('/webhook');
    expect(config.DATABASE_SSL).toBe(false);
  });

  it('rejects invalid account identifiers', () => {
    expect(() => loadConfig({ ...valid, INSTAGRAM_ACCOUNT_ID: 'not-a-number' })).toThrow();
  });
});

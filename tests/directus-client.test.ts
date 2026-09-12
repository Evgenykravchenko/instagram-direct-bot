import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Logger } from '../src/config/logger.js';
import { DirectusClient } from '../src/services/directus-client.js';

afterEach(() => vi.unstubAllGlobals());

describe('DirectusClient', () => {
  it('scopes keyword queries by CONTENT_BOT_KEY', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [{ id: 1, phrase: 'гайд', match_mode: 'exact', priority: 10, response: 2 }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const client = new DirectusClient(
      'https://cms.example.test',
      'secret-token',
      'instagram-direct-bot',
      { warn: vi.fn() } as unknown as Logger,
    );

    await client.getRules();

    const url = String(fetchMock.mock.calls[0]?.[0]);
    expect(url).toContain('filter%5Bbot%5D%5Bkey%5D%5B_eq%5D=instagram-direct-bot');
  });
});

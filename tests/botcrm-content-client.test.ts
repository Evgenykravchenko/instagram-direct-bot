import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Logger } from '../src/config/logger.js';
import { BotCrmContentClient } from '../src/services/botcrm-content-client.js';

afterEach(() => vi.unstubAllGlobals());

describe('BotCrmContentClient', () => {
  it('uses the isolated BotCRM runtime API and maps keyword rules', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify([
            { id: 1, phrase: 'гайд', match_mode: 'exact', priority: 10, response: 2 },
          ]),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);
    const token = `bcr_${'x'.repeat(43)}`;
    const client = new BotCrmContentClient('https://crm.example.test/api/v1', token, {
      warn: vi.fn(),
    } as unknown as Logger);

    const rules = await client.getRules();

    expect(rules[0]).toEqual({
      id: 1,
      phrase: 'гайд',
      matchMode: 'exact',
      priority: 10,
      responseId: 2,
    });
    const request = fetchMock.mock.calls[0];
    expect(new URL(String(request?.[0])).pathname).toBe('/api/v1/bot-content/rules');
    expect(
      new Headers((request?.[1] as RequestInit | undefined)?.headers).get('authorization'),
    ).toBe(`Bearer ${token}`);
  });
});

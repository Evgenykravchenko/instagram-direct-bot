import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Logger } from '../src/config/logger.js';
import { InstagramClient } from '../src/instagram/client.js';
import type { MetaApiError } from '../src/instagram/client.js';

afterEach(() => vi.unstubAllGlobals());

function client(): InstagramClient {
  return new InstagramClient('v23.0', '123', 'access-token', {
    warn: vi.fn(),
  } as unknown as Logger);
}

describe('InstagramClient', () => {
  it('uses the Instagram Login endpoint and bearer authorization', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ recipient_id: '42', message_id: 'm1' }), { status: 200 }),
      );
    vi.stubGlobal('fetch', fetchMock);

    await client().send('42', { type: 'text', text: 'Привет' });

    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      'https://graph.instagram.com/v23.0/123/messages',
    );
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.headers).toMatchObject({ Authorization: 'Bearer access-token' });
    expect(typeof init.body).toBe('string');
    expect(JSON.parse(init.body as string)).toEqual({
      recipient: { id: '42' },
      message: { text: 'Привет' },
    });
  });

  it('uploads a reusable attachment from a URL', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ attachment_id: 'asset-1' }), { status: 200 }),
      );
    vi.stubGlobal('fetch', fetchMock);

    await expect(client().uploadReusableMedia('photo', 'https://download.test/file')).resolves.toBe(
      'asset-1',
    );
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      'https://graph.instagram.com/v23.0/123/message_attachments',
    );
  });

  it('marks rate limits as retryable without leaking tokens', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { message: 'Slow down', code: 4 } }), {
          status: 429,
        }),
      ),
    );

    await expect(client().send('42', { type: 'text', text: 'Привет' })).rejects.toMatchObject({
      status: 429,
      code: 4,
      retryable: true,
    } satisfies Partial<MetaApiError>);
  });
});

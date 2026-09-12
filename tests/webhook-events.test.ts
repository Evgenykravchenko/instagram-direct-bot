import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { extractIncomingEvents, verifySignature } from '../src/instagram/webhook-events.js';

describe('webhook events', () => {
  it('verifies Meta HMAC signatures', () => {
    const body = Buffer.from('{"ok":true}');
    const signature = `sha256=${createHmac('sha256', 'secret').update(body).digest('hex')}`;
    expect(verifySignature(body, signature, 'secret')).toBe(true);
    expect(verifySignature(body, signature, 'wrong-secret')).toBe(false);
  });

  it('extracts text and postback commands and ignores echoes', () => {
    const events = extractIncomingEvents(
      {
        entry: [
          {
            messaging: [
              { sender: { id: '42' }, timestamp: 1, message: { mid: 'm1', text: 'гайд' } },
              { sender: { id: '42' }, timestamp: 2, postback: { mid: 'm2', payload: 'цена' } },
              { sender: { id: '42' }, message: { text: 'echo', is_echo: true } },
            ],
          },
        ],
      },
      '100',
    );
    expect(events.map((event) => event.inputText)).toEqual(['гайд', 'цена']);
    expect(events.map((event) => event.eventId)).toEqual(['m1', 'm2']);
  });
});

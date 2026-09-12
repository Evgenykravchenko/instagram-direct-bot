import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { IncomingEvent } from '../domain/types.js';

interface MessagingEvent {
  sender?: { id?: string };
  recipient?: { id?: string };
  timestamp?: number;
  message?: {
    mid?: string;
    text?: string;
    is_echo?: boolean;
    quick_reply?: { payload?: string };
  };
  postback?: { mid?: string; title?: string; payload?: string };
}

interface WebhookBody {
  object?: string;
  entry?: Array<{ messaging?: MessagingEvent[] }>;
}

export function verifySignature(
  rawBody: Buffer,
  signature: string | undefined,
  secret: string,
): boolean {
  if (!signature?.startsWith('sha256=')) return false;
  const supplied = Buffer.from(signature.slice(7), 'hex');
  const expected = createHmac('sha256', secret).update(rawBody).digest();
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export function extractIncomingEvents(body: unknown, ownAccountId: string): IncomingEvent[] {
  const webhook = body as WebhookBody;
  if (!Array.isArray(webhook.entry)) return [];
  const events: IncomingEvent[] = [];

  for (const entry of webhook.entry) {
    for (const event of entry.messaging ?? []) {
      const senderId = event.sender?.id;
      if (!senderId || senderId === ownAccountId || event.message?.is_echo) continue;
      const input =
        event.message?.quick_reply?.payload ??
        event.postback?.payload ??
        event.message?.text ??
        event.postback?.title;
      if (!input?.trim()) continue;
      const timestamp = event.timestamp ?? Date.now();
      const rawId = event.message?.mid ?? event.postback?.mid;
      events.push({
        eventId: rawId ?? stableEventId(senderId, timestamp, input),
        senderId,
        inputText: input.slice(0, 2_000),
        receivedAt: new Date(timestamp),
      });
    }
  }
  return events;
}

function stableEventId(senderId: string, timestamp: number, input: string): string {
  return createHash('sha256').update(`${senderId}:${timestamp}:${input}`).digest('hex');
}

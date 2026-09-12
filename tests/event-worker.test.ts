import { describe, expect, it, vi } from 'vitest';
import type { Logger } from '../src/config/logger.js';
import type { OutboundMessage, QueuedEvent } from '../src/domain/types.js';
import { MetaApiError } from '../src/instagram/client.js';
import type { EventRepository } from '../src/repositories/contracts.js';
import { EventWorker } from '../src/services/event-worker.js';

function repository(event: QueuedEvent): EventRepository {
  return {
    migrate: vi.fn(),
    enqueue: vi.fn(),
    claimNext: vi.fn().mockResolvedValue(event),
    saveSnapshot: vi.fn(),
    advance: vi.fn(),
    complete: vi.fn(),
    retry: vi.fn(),
    deadLetter: vi.fn(),
    ping: vi.fn(),
    close: vi.fn(),
  };
}

const event: QueuedEvent = {
  eventId: 'm1',
  senderId: '42',
  inputText: 'гайд',
  attempts: 1,
  snapshot: null,
  deliveryCursor: 0,
  receivedAt: new Date(),
};
const messages: OutboundMessage[] = [
  { type: 'text', text: 'Один' },
  { type: 'text', text: 'Два' },
];

describe('EventWorker', () => {
  it('snapshots content and advances after every delivered message', async () => {
    const store = repository(event);
    const content = { resolve: vi.fn().mockResolvedValue(messages) };
    const instagram = { send: vi.fn().mockResolvedValue(undefined) };
    const worker = new EventWorker(store, content as never, instagram as never, 500, 8, 300, {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as unknown as Logger);

    await worker.tick();

    // Repository methods are Vitest mocks in this unit-test fixture.
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(store.saveSnapshot).toHaveBeenCalledWith('m1', messages);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(store.advance).toHaveBeenNthCalledWith(1, 'm1', 1);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(store.advance).toHaveBeenNthCalledWith(2, 'm1', 2);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(store.complete).toHaveBeenCalledWith('m1');
  });

  it('retries temporary Meta errors', async () => {
    const store = repository(event);
    const worker = new EventWorker(
      store,
      { resolve: vi.fn().mockResolvedValue(messages) } as never,
      {
        send: vi.fn().mockRejectedValue(new MetaApiError('rate limited', 429, 4, true)),
      } as never,
      500,
      8,
      300,
      { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as Logger,
    );

    await worker.tick();
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(store.retry).toHaveBeenCalled();
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(store.deadLetter).not.toHaveBeenCalled();
  });
});

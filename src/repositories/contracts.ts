import type { IncomingEvent, OutboundMessage, QueuedEvent } from '../domain/types.js';

export interface EventRepository {
  migrate(): Promise<void>;
  enqueue(events: IncomingEvent[]): Promise<number>;
  claimNext(lockTimeoutSeconds: number): Promise<QueuedEvent | null>;
  saveSnapshot(eventId: string, messages: OutboundMessage[]): Promise<void>;
  advance(eventId: string, cursor: number): Promise<void>;
  complete(eventId: string): Promise<void>;
  retry(eventId: string, delaySeconds: number, error: unknown): Promise<void>;
  deadLetter(eventId: string, error: unknown): Promise<void>;
  ping(): Promise<void>;
  close(): Promise<void>;
}

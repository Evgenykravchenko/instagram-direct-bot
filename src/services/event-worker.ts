import type { Logger } from '../config/logger.js';
import { MetaApiError, type InstagramClient } from '../instagram/client.js';
import type { EventRepository } from '../repositories/contracts.js';
import type { ContentService } from './content-service.js';

export class EventWorker {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly repository: EventRepository,
    private readonly content: ContentService,
    private readonly instagram: InstagramClient,
    private readonly pollIntervalMs: number,
    private readonly maxAttempts: number,
    private readonly lockTimeoutSeconds: number,
    private readonly logger: Logger,
  ) {}

  start(): void {
    this.timer = setInterval(() => void this.tick(), this.pollIntervalMs);
    this.timer.unref();
    void this.tick();
    this.logger.info({ pollIntervalMs: this.pollIntervalMs }, 'Event worker started');
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const event = await this.repository.claimNext(this.lockTimeoutSeconds);
      if (!event) return;
      try {
        const messages = event.snapshot ?? (await this.content.resolve(event.inputText));
        if (!event.snapshot) await this.repository.saveSnapshot(event.eventId, messages);
        for (let index = event.deliveryCursor; index < messages.length; index += 1) {
          const message = messages[index];
          if (!message) continue;
          await this.instagram.send(event.senderId, message);
          await this.repository.advance(event.eventId, index + 1);
        }
        await this.repository.complete(event.eventId);
        this.logger.info(
          { eventId: event.eventId, senderId: event.senderId, messages: messages.length },
          'Instagram response delivered',
        );
      } catch (error) {
        if (isRetryable(error) && event.attempts < this.maxAttempts) {
          const delaySeconds = retryDelay(event.attempts);
          await this.repository.retry(event.eventId, delaySeconds, error);
          this.logger.warn(
            { err: error, eventId: event.eventId, delaySeconds },
            'Instagram event scheduled for retry',
          );
        } else {
          await this.repository.deadLetter(event.eventId, error);
          this.logger.error(
            { err: error, eventId: event.eventId },
            'Instagram event dead-lettered',
          );
        }
      }
    } catch (error) {
      this.logger.error({ err: error }, 'Event worker tick failed');
    } finally {
      this.running = false;
    }
  }
}

function isRetryable(error: unknown): boolean {
  return error instanceof MetaApiError ? error.retryable : true;
}

function retryDelay(attempt: number): number {
  return Math.min(300, 2 ** Math.min(attempt, 8));
}

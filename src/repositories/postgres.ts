import pg from 'pg';
import type { Logger } from '../config/logger.js';
import type { IncomingEvent, OutboundMessage, QueuedEvent } from '../domain/types.js';
import type { EventRepository } from './contracts.js';

const { Pool } = pg;

interface EventRow {
  event_id: string;
  sender_id: string;
  input_text: string;
  attempts: number;
  outbound_snapshot: OutboundMessage[] | null;
  delivery_cursor: number;
  received_at: Date;
}

export class PostgresEventRepository implements EventRepository {
  private readonly pool: pg.Pool;

  constructor(databaseUrl: string, ssl: boolean, logger: Logger) {
    this.pool = new Pool({
      connectionString: databaseUrl,
      max: 5,
      ssl: ssl ? { rejectUnauthorized: true } : false,
    });
    this.pool.on('error', (error) => logger.error({ err: error }, 'PostgreSQL pool error'));
  }

  async migrate(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS instagram_events (
        event_id TEXT PRIMARY KEY,
        sender_id TEXT NOT NULL,
        input_text TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'queued'
          CHECK (status IN ('queued', 'processing', 'sent', 'ignored', 'dead')),
        attempts INTEGER NOT NULL DEFAULT 0,
        next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        locked_at TIMESTAMPTZ,
        outbound_snapshot JSONB,
        delivery_cursor INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        received_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        completed_at TIMESTAMPTZ
      );

      CREATE INDEX IF NOT EXISTS instagram_events_queue_idx
        ON instagram_events (status, next_attempt_at, received_at);
    `);
  }

  async enqueue(events: IncomingEvent[]): Promise<number> {
    if (events.length === 0) return 0;
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      let inserted = 0;
      for (const event of events) {
        const result = await client.query(
          `INSERT INTO instagram_events (event_id, sender_id, input_text, received_at)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (event_id) DO NOTHING`,
          [event.eventId, event.senderId, event.inputText, event.receivedAt],
        );
        inserted += result.rowCount ?? 0;
      }
      await client.query('COMMIT');
      return inserted;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async claimNext(lockTimeoutSeconds: number): Promise<QueuedEvent | null> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE instagram_events
         SET status = 'queued', locked_at = NULL, next_attempt_at = NOW()
         WHERE status = 'processing'
           AND locked_at < NOW() - ($1 * INTERVAL '1 second')`,
        [lockTimeoutSeconds],
      );
      const result = await client.query<EventRow>(`
        UPDATE instagram_events
        SET status = 'processing', attempts = attempts + 1, locked_at = NOW()
        WHERE event_id = (
          SELECT event_id FROM instagram_events
          WHERE status = 'queued' AND next_attempt_at <= NOW()
          ORDER BY received_at, event_id
          FOR UPDATE SKIP LOCKED
          LIMIT 1
        )
        RETURNING event_id, sender_id, input_text, attempts, outbound_snapshot,
                  delivery_cursor, received_at
      `);
      await client.query('COMMIT');
      const row = result.rows[0];
      return row ? mapEvent(row) : null;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async saveSnapshot(eventId: string, messages: OutboundMessage[]): Promise<void> {
    await this.pool.query(
      `UPDATE instagram_events
       SET outbound_snapshot = COALESCE(outbound_snapshot, $2::jsonb)
       WHERE event_id = $1`,
      [eventId, JSON.stringify(messages)],
    );
  }

  async advance(eventId: string, cursor: number): Promise<void> {
    await this.pool.query(`UPDATE instagram_events SET delivery_cursor = $2 WHERE event_id = $1`, [
      eventId,
      cursor,
    ]);
  }

  async complete(eventId: string): Promise<void> {
    await this.pool.query(
      `UPDATE instagram_events
       SET status = CASE
         WHEN jsonb_array_length(COALESCE(outbound_snapshot, '[]'::jsonb)) = 0
           THEN 'ignored'
         ELSE 'sent'
       END,
       locked_at = NULL, last_error = NULL, completed_at = NOW()
       WHERE event_id = $1`,
      [eventId],
    );
  }

  async retry(eventId: string, delaySeconds: number, error: unknown): Promise<void> {
    await this.pool.query(
      `UPDATE instagram_events
       SET status = 'queued', locked_at = NULL,
           next_attempt_at = NOW() + ($2 * INTERVAL '1 second'), last_error = $3
       WHERE event_id = $1`,
      [eventId, delaySeconds, errorMessage(error)],
    );
  }

  async deadLetter(eventId: string, error: unknown): Promise<void> {
    await this.pool.query(
      `UPDATE instagram_events
       SET status = 'dead', locked_at = NULL, last_error = $2, completed_at = NOW()
       WHERE event_id = $1`,
      [eventId, errorMessage(error)],
    );
  }

  async ping(): Promise<void> {
    await this.pool.query('SELECT 1');
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

function mapEvent(row: EventRow): QueuedEvent {
  return {
    eventId: row.event_id,
    senderId: row.sender_id,
    inputText: row.input_text,
    attempts: row.attempts,
    snapshot: row.outbound_snapshot,
    deliveryCursor: row.delivery_cursor,
    receivedAt: row.received_at,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 2_000) : String(error).slice(0, 2_000);
}

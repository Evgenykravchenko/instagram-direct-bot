import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { Logger } from '../config/logger.js';
import { extractIncomingEvents, verifySignature } from '../instagram/webhook-events.js';
import type { EventRepository } from '../repositories/contracts.js';

interface WebhookServerOptions {
  host: string;
  port: number;
  webhookPath: string;
  bodyLimitBytes: number;
  verifyToken: string;
  appSecret: string;
  ownAccountId: string;
  repository: EventRepository;
  logger: Logger;
}

export class WebhookServer {
  private server: Server | null = null;

  constructor(private readonly options: WebhookServerOptions) {}

  async start(): Promise<void> {
    this.server = createServer((request, response) => {
      void this.route(request, response).catch((error: unknown) => {
        this.options.logger.error({ err: error }, 'Unhandled HTTP request error');
        if (!response.headersSent) send(response, 500, 'Internal Server Error');
        else response.destroy();
      });
    });
    await new Promise<void>((resolve, reject) => {
      this.server?.once('error', reject);
      this.server?.listen(this.options.port, this.options.host, () => resolve());
    });
    this.options.logger.info(
      { host: this.options.host, port: this.options.port, path: this.options.webhookPath },
      'Webhook server started',
    );
  }

  async stop(): Promise<void> {
    const server = this.server;
    if (!server) return;
    this.server = null;
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }

  private async route(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const url = new URL(request.url ?? '/', 'http://localhost');
    if (request.method === 'GET' && url.pathname === '/health') {
      try {
        await this.options.repository.ping();
        sendJson(response, 200, { status: 'ok' });
      } catch {
        sendJson(response, 503, { status: 'unavailable' });
      }
      return;
    }

    if (url.pathname !== this.options.webhookPath) {
      send(response, 404, 'Not Found');
      return;
    }

    if (request.method === 'GET') {
      const mode = url.searchParams.get('hub.mode');
      const token = url.searchParams.get('hub.verify_token');
      const challenge = url.searchParams.get('hub.challenge');
      if (mode === 'subscribe' && token === this.options.verifyToken && challenge) {
        send(response, 200, challenge);
      } else {
        send(response, 403, 'Forbidden');
      }
      return;
    }

    if (request.method !== 'POST') {
      response.setHeader('Allow', 'GET, POST');
      send(response, 405, 'Method Not Allowed');
      return;
    }

    let rawBody: Buffer;
    try {
      rawBody = await readBody(request, this.options.bodyLimitBytes);
    } catch (error) {
      send(response, error instanceof BodyTooLargeError ? 413 : 400, 'Invalid request body');
      return;
    }
    const signature = request.headers['x-hub-signature-256'];
    if (
      !verifySignature(
        rawBody,
        Array.isArray(signature) ? signature[0] : signature,
        this.options.appSecret,
      )
    ) {
      send(response, 401, 'Invalid signature');
      return;
    }

    let payload: unknown;
    try {
      payload = JSON.parse(rawBody.toString('utf8')) as unknown;
    } catch {
      send(response, 400, 'Invalid JSON');
      return;
    }
    const events = extractIncomingEvents(payload, this.options.ownAccountId);
    try {
      const inserted = await this.options.repository.enqueue(events);
      this.options.logger.debug({ received: events.length, inserted }, 'Webhook persisted');
      send(response, 200, 'EVENT_RECEIVED');
    } catch (error) {
      this.options.logger.error({ err: error }, 'Webhook persistence failed');
      send(response, 503, 'Try again later');
    }
  }
}

class BodyTooLargeError extends Error {}

async function readBody(request: IncomingMessage, limit: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
    size += buffer.length;
    if (size > limit) throw new BodyTooLargeError();
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

function send(response: ServerResponse, status: number, body: string): void {
  response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
  response.end(body);
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

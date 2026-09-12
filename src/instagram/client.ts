import type { Logger } from '../config/logger.js';
import type { MediaKind, OutboundMessage } from '../domain/types.js';

interface MetaErrorBody {
  error?: { message?: string; code?: number; error_subcode?: number; type?: string };
}

interface AttachmentUploadResponse {
  attachment_id?: string;
}

export class MetaApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: number | undefined,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'MetaApiError';
  }
}

export class InstagramClient {
  private readonly root: URL;

  constructor(
    graphVersion: string,
    private readonly accountId: string,
    private readonly accessToken: string,
    private readonly logger: Logger,
  ) {
    this.root = new URL(`https://graph.instagram.com/${graphVersion}/${accountId}/`);
  }

  async send(recipientId: string, message: OutboundMessage): Promise<void> {
    switch (message.type) {
      case 'text':
        await this.sendPayload(recipientId, { text: message.text });
        return;
      case 'media':
        await this.sendPayload(recipientId, {
          attachment: {
            type: mediaType(message.kind),
            payload: { attachment_id: message.attachmentId },
          },
        });
        if (message.caption) await this.sendPayload(recipientId, { text: message.caption });
        return;
      case 'buttons':
        await this.sendPayload(recipientId, {
          attachment: {
            type: 'template',
            payload: {
              template_type: 'button',
              text: message.text,
              buttons: message.buttons.map((button) =>
                button.type === 'web_url'
                  ? { type: 'web_url', title: button.title, url: button.url }
                  : { type: 'postback', title: button.title, payload: button.payload },
              ),
            },
          },
        });
    }
  }

  async uploadReusableMedia(kind: MediaKind, url: string): Promise<string> {
    const response = await this.request<AttachmentUploadResponse>('message_attachments', {
      method: 'POST',
      body: JSON.stringify({
        message: {
          attachment: {
            type: mediaType(kind),
            payload: { url, is_reusable: true },
          },
        },
      }),
    });
    if (!response.attachment_id) throw new Error('Meta did not return attachment_id');
    return response.attachment_id;
  }

  private async sendPayload(recipientId: string, message: unknown): Promise<void> {
    await this.request('messages', {
      method: 'POST',
      body: JSON.stringify({ recipient: { id: recipientId }, message }),
    });
  }

  private async request<T = unknown>(path: string, init: RequestInit): Promise<T> {
    let response: Response;
    try {
      response = await fetch(new URL(path, this.root), {
        ...init,
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(30_000),
      });
    } catch (error) {
      throw new MetaApiError(
        error instanceof Error ? error.message : 'Meta network request failed',
        0,
        undefined,
        true,
      );
    }

    const body = (await response.json().catch(() => ({}))) as MetaErrorBody & T;
    if (!response.ok) {
      const retryable =
        response.status === 408 || response.status === 429 || response.status >= 500;
      this.logger.warn(
        { status: response.status, code: body.error?.code, path },
        'Meta API request failed',
      );
      throw new MetaApiError(
        body.error?.message ?? `Meta API request failed: ${response.status}`,
        response.status,
        body.error?.code,
        retryable,
      );
    }
    return body;
  }
}

function mediaType(kind: MediaKind): string {
  return kind === 'photo' ? 'image' : kind;
}

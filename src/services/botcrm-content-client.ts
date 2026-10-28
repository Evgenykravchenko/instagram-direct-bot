import type { Logger } from '../config/logger.js';
import type {
  ContentBlock,
  ContentButton,
  KeywordRule,
  ManagedResponse,
  MediaAsset,
} from '../domain/types.js';

interface RuntimeRule {
  id: number;
  phrase: string;
  match_mode: KeywordRule['matchMode'];
  priority: number;
  response: number;
}

interface RuntimeSettings {
  unknown_message: string | null;
  fallback_response: number | null;
}

interface RuntimeMedia {
  id: number;
  name: string;
  kind: MediaAsset['kind'];
  yandex_path: string;
  status: string;
  delivery?: { external_reference?: string | null } | null;
}

interface RuntimeResponse {
  response: { id: number; fallback_text: string | null };
  blocks: Array<{
    kind: ContentBlock['kind'];
    body: string | null;
    send_separately: boolean;
    media: RuntimeMedia | null;
  }>;
  buttons: Array<{
    label: string;
    action: ContentButton['action'];
    target: string;
    row_number: number;
    sort: number;
  }>;
}

export class BotCrmContentClient {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
    private readonly logger: Logger,
  ) {}

  async getRules(): Promise<KeywordRule[]> {
    const rules = await this.request<RuntimeRule[]>('bot-content/rules');
    return rules.map((item) => ({
      id: item.id,
      phrase: item.phrase,
      matchMode: item.match_mode,
      priority: item.priority,
      responseId: item.response,
    }));
  }

  async getSettings(): Promise<{ unknownMessage: string; fallbackResponseId: number | null }> {
    const settings = await this.request<RuntimeSettings>('bot-content/settings');
    return {
      unknownMessage: settings.unknown_message ?? '',
      fallbackResponseId: settings.fallback_response,
    };
  }

  async getResponse(responseId: number): Promise<ManagedResponse | null> {
    const item = await this.request<RuntimeResponse | null>(`bot-content/responses/${responseId}`);
    if (!item) return null;
    return {
      id: item.response.id,
      fallbackText: item.response.fallback_text,
      blocks: item.blocks.map((block) => ({
        kind: block.kind,
        body: block.body,
        sendSeparately: block.send_separately,
        media: block.media
          ? {
              id: block.media.id,
              name: block.media.name,
              status: block.media.status,
              reference: block.media.delivery?.external_reference ?? null,
            }
          : null,
      })),
      buttons: item.buttons.map((button) => ({
        label: button.label,
        action: button.action,
        target: button.target,
        row: button.row_number,
        sort: button.sort,
      })),
    };
  }

  async findQueuedMedia(limit: number): Promise<MediaAsset[]> {
    const query = new URLSearchParams({ limit: String(limit) });
    const items = await this.request<RuntimeMedia[]>(`bot-content/media/queued?${query.toString()}`);
    return items.map((item) => ({ id: item.id, name: item.name, kind: item.kind, yandexPath: item.yandex_path }));
  }

  async markMediaProcessing(id: number): Promise<void> {
    await this.updateMedia(id, { status: 'processing', error_message: null });
  }

  async markMediaReady(id: number, reference: string): Promise<void> {
    await this.request(`bot-content/media/${id}/delivery`, {
      method: 'POST',
      body: JSON.stringify({ externalReference: reference }),
    });
  }

  async markMediaError(id: number, error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    await this.updateMedia(id, { status: 'error', error_message: message.slice(0, 2_000) });
  }

  private async updateMedia(id: number, changes: Record<string, unknown>): Promise<void> {
    await this.request(`bot-content/media/${id}`, { method: 'PATCH', body: JSON.stringify(changes) });
  }

  private async request<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(new URL(path, `${this.baseUrl.replace(/\/+$/, '')}/`), {
      ...init,
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
        ...init.headers,
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      const body = await response.text();
      this.logger.warn({ status: response.status, path }, 'BotCRM content request failed');
      throw new Error(`BotCRM content request failed: ${response.status} ${body.slice(0, 300)}`);
    }
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }
}

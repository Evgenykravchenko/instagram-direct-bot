import type { Logger } from '../config/logger.js';
import type {
  ContentBlock,
  ContentButton,
  KeywordRule,
  ManagedResponse,
  MediaAsset,
} from '../domain/types.js';

interface Envelope<T> {
  data: T;
}

interface DirectusKeyword {
  id: number;
  phrase: string;
  match_mode: KeywordRule['matchMode'];
  priority: number;
  response: number | { id: number };
}

interface DirectusResponse {
  id: number;
  fallback_text: string | null;
}

interface DirectusBlock {
  kind: ContentBlock['kind'];
  body: string | null;
  send_separately: boolean;
  media: { id: number; name: string; status: string } | null;
}

interface DirectusButton {
  label: string;
  action: ContentButton['action'];
  target: string;
  row_number: number;
  sort: number;
}

interface DirectusSettings {
  unknown_message: string;
  fallback_response: number | { id: number } | null;
}

interface DirectusDelivery {
  id?: number;
  media: number | { id: number };
  external_reference: string | null;
  status: string;
}

interface DirectusMedia {
  id: number;
  name: string;
  kind: MediaAsset['kind'];
  yandex_path: string;
}

export class DirectusClient {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
    private readonly botKey: string,
    private readonly logger: Logger,
  ) {}

  async getRules(): Promise<KeywordRule[]> {
    const query = new URLSearchParams({
      'filter[bot][key][_eq]': this.botKey,
      'filter[enabled][_eq]': 'true',
      'filter[response][status][_eq]': 'published',
      fields: 'id,phrase,match_mode,priority,response.id',
      sort: '-priority,id',
      limit: '-1',
    });
    const result = await this.request<Envelope<DirectusKeyword[]>>(
      `/items/keywords?${query.toString()}`,
    );
    return result.data.map((item) => ({
      id: item.id,
      phrase: item.phrase,
      matchMode: item.match_mode,
      priority: item.priority,
      responseId: idOf(item.response),
    }));
  }

  async getSettings(): Promise<{ unknownMessage: string; fallbackResponseId: number | null }> {
    const query = new URLSearchParams({
      'filter[bot][key][_eq]': this.botKey,
      fields: 'unknown_message,fallback_response.id',
      limit: '1',
    });
    const result = await this.request<Envelope<DirectusSettings[]>>(
      `/items/bot_settings?${query.toString()}`,
    );
    const settings = result.data[0];
    return {
      unknownMessage: settings?.unknown_message ?? 'Не удалось подобрать ответ. Попробуйте иначе.',
      fallbackResponseId: settings?.fallback_response ? idOf(settings.fallback_response) : null,
    };
  }

  async getResponse(responseId: number): Promise<ManagedResponse | null> {
    const responseQuery = new URLSearchParams({
      'filter[id][_eq]': String(responseId),
      'filter[status][_eq]': 'published',
      'filter[bot][key][_eq]': this.botKey,
      fields: 'id,fallback_text',
      limit: '1',
    });
    const response = await this.request<Envelope<DirectusResponse[]>>(
      `/items/responses?${responseQuery.toString()}`,
    );
    const item = response.data[0];
    if (!item) return null;

    const blockQuery = new URLSearchParams({
      'filter[response][_eq]': String(item.id),
      'filter[enabled][_eq]': 'true',
      'filter[_or][0][media][_null]': 'true',
      'filter[_or][1][media][bot][key][_eq]': this.botKey,
      fields: 'kind,body,send_separately,media.id,media.name,media.status',
      sort: 'sort,id',
      limit: '-1',
    });
    const buttonQuery = new URLSearchParams({
      'filter[response][_eq]': String(item.id),
      'filter[enabled][_eq]': 'true',
      fields: 'label,action,target,row_number,sort',
      sort: 'row_number,sort,id',
      limit: '-1',
    });
    const [blocksResult, buttonsResult] = await Promise.all([
      this.request<Envelope<DirectusBlock[]>>(`/items/response_blocks?${blockQuery.toString()}`),
      this.request<Envelope<DirectusButton[]>>(`/items/response_buttons?${buttonQuery.toString()}`),
    ]);
    const mediaIds = blocksResult.data
      .flatMap((block) => (block.media ? [block.media.id] : []))
      .filter((id, index, all) => all.indexOf(id) === index);
    const references = await this.getInstagramReferences(mediaIds);

    return {
      id: item.id,
      fallbackText: item.fallback_text,
      blocks: blocksResult.data.map((block) => ({
        kind: block.kind,
        body: block.body,
        sendSeparately: block.send_separately,
        media: block.media
          ? {
              id: block.media.id,
              name: block.media.name,
              status: block.media.status,
              reference: references.get(block.media.id) ?? null,
            }
          : null,
      })),
      buttons: buttonsResult.data.map((button) => ({
        label: button.label,
        action: button.action,
        target: button.target,
        row: button.row_number,
        sort: button.sort,
      })),
    };
  }

  async findQueuedMedia(limit: number): Promise<MediaAsset[]> {
    const query = new URLSearchParams({
      'filter[bot][key][_eq]': this.botKey,
      'filter[status][_eq]': 'queued',
      fields: 'id,name,kind,yandex_path',
      sort: 'id',
      limit: String(limit),
    });
    const result = await this.request<Envelope<DirectusMedia[]>>(
      `/items/media_assets?${query.toString()}`,
    );
    const expiredQuery = new URLSearchParams({
      'filter[platform][_eq]': 'instagram',
      'filter[status][_eq]': 'ready',
      'filter[expires_at][_lte]': new Date().toISOString(),
      'filter[media][bot][key][_eq]': this.botKey,
      fields: 'media.id,media.name,media.kind,media.yandex_path',
      sort: 'expires_at',
      limit: String(limit),
    });
    const expired = await this.request<Envelope<Array<{ media: DirectusMedia }>>>(
      `/items/media_deliveries?${expiredQuery.toString()}`,
    );
    const candidates = [...result.data, ...expired.data.map((item) => item.media)].filter(
      (item, index, all) => all.findIndex((candidate) => candidate.id === item.id) === index,
    );
    return candidates.slice(0, limit).map((item) => ({
      id: item.id,
      name: item.name,
      kind: item.kind,
      yandexPath: item.yandex_path,
    }));
  }

  async markMediaProcessing(id: number): Promise<void> {
    await this.request(`/items/media_assets/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'processing', error_message: null }),
    });
  }

  async markMediaReady(id: number, reference: string): Promise<void> {
    const existing = await this.getDelivery(id);
    const payload = {
      media: id,
      platform: 'instagram',
      status: 'ready',
      external_reference: reference,
      error_message: null,
      prepared_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 80 * 24 * 60 * 60 * 1_000).toISOString(),
    };
    if (existing) {
      await this.request(`/items/media_deliveries/${existing}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
    } else {
      await this.request('/items/media_deliveries', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    }
    await this.request(`/items/media_assets/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'ready', error_message: null }),
    });
  }

  async markMediaError(id: number, error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    await this.request(`/items/media_assets/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'error', error_message: message.slice(0, 2_000) }),
    });
  }

  private async getInstagramReferences(mediaIds: number[]): Promise<Map<number, string>> {
    if (mediaIds.length === 0) return new Map();
    const query = new URLSearchParams({
      'filter[media][_in]': mediaIds.join(','),
      'filter[platform][_eq]': 'instagram',
      'filter[status][_eq]': 'ready',
      'filter[expires_at][_gt]': new Date().toISOString(),
      fields: 'media.id,external_reference,status',
      limit: '-1',
    });
    const result = await this.request<Envelope<DirectusDelivery[]>>(
      `/items/media_deliveries?${query.toString()}`,
    );
    return new Map(
      result.data.flatMap((item) => {
        const id = idOf(item.media);
        return item.external_reference ? [[id, item.external_reference] as const] : [];
      }),
    );
  }

  private async getDelivery(mediaId: number): Promise<number | null> {
    const query = new URLSearchParams({
      'filter[media][_eq]': String(mediaId),
      'filter[platform][_eq]': 'instagram',
      fields: 'id',
      limit: '1',
    });
    const result = await this.request<Envelope<Array<{ id: number }>>>(
      `/items/media_deliveries?${query.toString()}`,
    );
    return result.data[0]?.id ?? null;
  }

  private async request<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(new URL(path, this.baseUrl), {
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
      this.logger.warn({ status: response.status, path }, 'Directus request failed');
      throw new Error(`Directus request failed: ${response.status} ${body.slice(0, 300)}`);
    }
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }
}

function idOf(value: number | { id: number }): number {
  return typeof value === 'number' ? value : value.id;
}

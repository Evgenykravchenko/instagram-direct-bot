import type { Logger } from '../config/logger.js';
import { findMatchingRule } from '../domain/matcher.js';
import { renderResponse } from '../domain/render-response.js';
import type { KeywordRule, OutboundMessage } from '../domain/types.js';
import type { BotCrmContentClient } from './botcrm-content-client.js';

interface CacheState {
  rules: KeywordRule[];
  unknownMessage: string;
  fallbackResponseId: number | null;
  expiresAt: number;
}

export class ContentService {
  private cache: CacheState | null = null;

  constructor(
    private readonly contentClient: BotCrmContentClient,
    private readonly ttlMs: number,
    private readonly logger: Logger,
  ) {}

  async resolve(input: string): Promise<OutboundMessage[]> {
    const cache = await this.getCache();
    const rule = findMatchingRule(input, cache.rules);
    const responseId = rule?.responseId ?? cache.fallbackResponseId;
    if (!responseId)
      return cache.unknownMessage.trim() ? [{ type: 'text', text: cache.unknownMessage }] : [];

    const response = await this.contentClient.getResponse(responseId);
    if (!response) {
      this.logger.warn({ responseId }, 'Published response is unavailable');
      return cache.unknownMessage.trim() ? [{ type: 'text', text: cache.unknownMessage }] : [];
    }
    const messages = renderResponse(response);
    return messages.length > 0
      ? messages
      : cache.unknownMessage.trim()
        ? [{ type: 'text', text: cache.unknownMessage }]
        : [];
  }

  private async getCache(): Promise<CacheState> {
    if (this.cache && this.cache.expiresAt > Date.now()) return this.cache;
    try {
      const [rules, settings] = await Promise.all([
        this.contentClient.getRules(),
        this.contentClient.getSettings(),
      ]);
      this.cache = { ...settings, rules, expiresAt: Date.now() + this.ttlMs };
      this.logger.debug({ count: rules.length }, 'Keyword rules cache refreshed');
      return this.cache;
    } catch (error) {
      if (this.cache) {
        this.logger.warn({ err: error }, 'BotCRM content API unavailable; using stale content cache');
        return this.cache;
      }
      throw error;
    }
  }
}

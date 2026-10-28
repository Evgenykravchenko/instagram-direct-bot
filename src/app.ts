import type { AppConfig } from './config/env.js';
import type { Logger } from './config/logger.js';
import { WebhookServer } from './http/server.js';
import { InstagramClient } from './instagram/client.js';
import { PostgresEventRepository } from './repositories/postgres.js';
import { BotCrmContentClient } from './services/botcrm-content-client.js';
import { ContentService } from './services/content-service.js';
import { EventWorker } from './services/event-worker.js';
import { MediaWorker } from './services/media-worker.js';
import { YandexDiskClient } from './services/yandex-disk-client.js';

export class Application {
  private readonly repository: PostgresEventRepository;
  private readonly webhookServer: WebhookServer;
  private readonly eventWorker: EventWorker;
  private readonly mediaWorker: MediaWorker;

  constructor(config: AppConfig, logger: Logger) {
    this.repository = new PostgresEventRepository(config.DATABASE_URL, config.DATABASE_SSL, logger);
    const contentClient = new BotCrmContentClient(config.BOTCRM_URL, config.BOTCRM_CONTENT_TOKEN, logger);
    const instagram = new InstagramClient(
      config.META_GRAPH_VERSION,
      config.INSTAGRAM_ACCOUNT_ID,
      config.INSTAGRAM_ACCESS_TOKEN,
      logger,
    );
    const content = new ContentService(contentClient, config.CONTENT_CACHE_TTL_SECONDS * 1_000, logger);
    this.eventWorker = new EventWorker(
      this.repository,
      content,
      instagram,
      config.EVENT_POLL_INTERVAL_MS,
      config.EVENT_MAX_ATTEMPTS,
      config.EVENT_LOCK_TIMEOUT_SECONDS,
      logger,
    );
    this.mediaWorker = new MediaWorker(
      contentClient,
      new YandexDiskClient(config.YANDEX_DISK_TOKEN),
      instagram,
      config.MEDIA_BATCH_SIZE,
      config.MEDIA_POLL_INTERVAL_SECONDS * 1_000,
      logger,
    );
    this.webhookServer = new WebhookServer({
      host: config.HTTP_HOST,
      port: config.HTTP_PORT,
      webhookPath: config.WEBHOOK_PATH,
      bodyLimitBytes: config.WEBHOOK_BODY_LIMIT_BYTES,
      verifyToken: config.INSTAGRAM_VERIFY_TOKEN,
      appSecret: config.INSTAGRAM_APP_SECRET,
      ownAccountId: config.INSTAGRAM_ACCOUNT_ID,
      repository: this.repository,
      logger,
    });
  }

  async start(): Promise<void> {
    await this.repository.migrate();
    await this.webhookServer.start();
    this.eventWorker.start();
    this.mediaWorker.start();
  }

  async stop(): Promise<void> {
    this.eventWorker.stop();
    this.mediaWorker.stop();
    await this.webhookServer.stop();
    await this.repository.close();
  }
}

import type { Logger } from '../config/logger.js';
import type { InstagramClient } from '../instagram/client.js';
import type { DirectusClient } from './directus-client.js';
import type { YandexDiskClient } from './yandex-disk-client.js';

export class MediaWorker {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly directus: DirectusClient,
    private readonly yandexDisk: YandexDiskClient,
    private readonly instagram: InstagramClient,
    private readonly batchSize: number,
    private readonly intervalMs: number,
    private readonly logger: Logger,
  ) {}

  start(): void {
    this.timer = setInterval(() => void this.tick(), this.intervalMs);
    this.timer.unref();
    void this.tick();
    this.logger.info({ intervalMs: this.intervalMs }, 'Media worker started');
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const assets = await this.directus.findQueuedMedia(this.batchSize);
      for (const asset of assets) {
        try {
          if (asset.kind === 'document') {
            throw new Error('Instagram Direct does not support document attachments');
          }
          await this.directus.markMediaProcessing(asset.id);
          const downloadUrl = await this.yandexDisk.getDownloadUrl(asset.yandexPath);
          const reference = await this.instagram.uploadReusableMedia(asset.kind, downloadUrl);
          await this.directus.markMediaReady(asset.id, reference);
          this.logger.info({ mediaId: asset.id, kind: asset.kind }, 'Media prepared');
        } catch (error) {
          await this.directus.markMediaError(asset.id, error).catch((markError: unknown) => {
            this.logger.error(
              { err: markError, mediaId: asset.id },
              'Failed to persist media error',
            );
          });
          this.logger.error({ err: error, mediaId: asset.id }, 'Media preparation failed');
        }
      }
    } catch (error) {
      this.logger.error({ err: error }, 'Media worker tick failed');
    } finally {
      this.running = false;
    }
  }
}

export class YandexDiskClient {
  constructor(private readonly token: string) {}

  async getDownloadUrl(path: string): Promise<string> {
    const query = new URLSearchParams({ path });
    const response = await fetch(
      `https://cloud-api.yandex.net/v1/disk/resources/download?${query.toString()}`,
      {
        headers: { Authorization: `OAuth ${this.token}` },
        signal: AbortSignal.timeout(30_000),
      },
    );
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Yandex Disk request failed: ${response.status} ${body.slice(0, 300)}`);
    }
    const payload = (await response.json()) as { href?: string };
    if (!payload.href) throw new Error('Yandex Disk did not return a download URL');
    return payload.href;
  }
}

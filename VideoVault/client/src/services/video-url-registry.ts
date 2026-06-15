export class VideoUrlRegistry {
  private static idToObjectUrl = new Map<string, string>();

  static register(videoId: string, file: File): string {
    const existing = this.idToObjectUrl.get(videoId);
    if (existing) {
      try {
        URL.revokeObjectURL(existing);
      } catch (_e) {
        // ignore
      }
    }
    const objectUrl = URL.createObjectURL(file);
    this.idToObjectUrl.set(videoId, objectUrl);
    return objectUrl;
  }

  static get(videoId: string): string | undefined {
    return this.idToObjectUrl.get(videoId);
  }

  static revoke(videoId: string): void {
    const existing = this.idToObjectUrl.get(videoId);
    if (existing) {
      try {
        URL.revokeObjectURL(existing);
      } catch (_e) {
        // ignore
      }
      this.idToObjectUrl.delete(videoId);
    }
  }

  static revokeAll(): void {
    this.idToObjectUrl.forEach((url, id) => {
      try {
        URL.revokeObjectURL(url);
      } catch (_e) {
        // ignore
      }
      this.idToObjectUrl.delete(id);
    });
  }
}

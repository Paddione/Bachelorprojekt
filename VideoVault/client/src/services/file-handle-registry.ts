export class FileHandleRegistry {
  private static idToHandle = new Map<string, FileSystemFileHandle>();

  static register(videoId: string, handle: FileSystemFileHandle): void {
    this.idToHandle.set(videoId, handle);
  }

  static get(videoId: string): FileSystemFileHandle | undefined {
    return this.idToHandle.get(videoId);
  }

  static revoke(videoId: string): void {
    this.idToHandle.delete(videoId);
  }

  static clear(): void {
    this.idToHandle.clear();
  }
}

export class DirectoryHandleRegistry {
  private static rootKeyToHandle = new Map<string, FileSystemDirectoryHandle>();
  private static videoIdToDir = new Map<
    string,
    { parent: FileSystemDirectoryHandle; rootKey: string }
  >();
  private static lastRootKey: string | null = null;

  static registerRoot(rootKey: string, handle: FileSystemDirectoryHandle): void {
    this.rootKeyToHandle.set(rootKey, handle);
    this.lastRootKey = rootKey;
  }

  static getRoot(rootKey: string): FileSystemDirectoryHandle | undefined {
    return this.rootKeyToHandle.get(rootKey);
  }

  static getDefaultRoot(): { rootKey: string; handle: FileSystemDirectoryHandle } | null {
    if (!this.lastRootKey) return null;
    const handle = this.rootKeyToHandle.get(this.lastRootKey);
    if (!handle) return null;
    return { rootKey: this.lastRootKey, handle };
  }

  static listRoots(): Array<{ rootKey: string; name: string }> {
    return Array.from(this.rootKeyToHandle.entries()).map(([key, handle]) => ({
      rootKey: key,
      name: (handle as any).name || key,
    }));
  }

  static registerParentForFile(
    videoId: string,
    parent: FileSystemDirectoryHandle,
    rootKey: string,
  ): void {
    this.videoIdToDir.set(videoId, { parent, rootKey });
  }

  static getParentForFile(
    videoId: string,
  ): { parent: FileSystemDirectoryHandle; rootKey: string } | undefined {
    return this.videoIdToDir.get(videoId);
  }

  static getRootKeyForVideo(videoId: string): string | undefined {
    return this.videoIdToDir.get(videoId)?.rootKey;
  }

  static clear(): void {
    this.rootKeyToHandle.clear();
    this.videoIdToDir.clear();
    this.lastRootKey = null;
  }

  private static async ensurePermission(
    handle: FileSystemHandle,
    mode: 'read' | 'readwrite' = 'readwrite',
  ): Promise<boolean> {
    try {
      if ((await (handle as any).queryPermission?.({ mode })) === 'granted') return true;
      const perm = await (handle as any).requestPermission?.({ mode });
      return perm === 'granted';
    } catch (_e) {
      return true; // Best effort
    }
  }

  static async getSubdirectoryHandle(
    rootKey: string,
    relativeDirPath: string,
    create = false,
  ): Promise<FileSystemDirectoryHandle> {
    const root = this.rootKeyToHandle.get(rootKey);
    if (!root) throw new Error('Root directory not found in this session. Rescan the directory.');
    await this.ensurePermission(root, 'readwrite');
    let current = root;
    const segments = relativeDirPath.split('/').filter(Boolean);
    for (const seg of segments) {
      current = (await current.getDirectoryHandle(seg, {
        create,
      })) as unknown as FileSystemDirectoryHandle;
    }
    return current;
  }

  static async ensureDirectory(
    rootKey: string,
    relativeDirPath: string,
  ): Promise<FileSystemDirectoryHandle> {
    return this.getSubdirectoryHandle(rootKey, relativeDirPath, true);
  }

  static async getParentDirectoryForPath(
    rootKey: string,
    relativePath: string,
    create = false,
  ): Promise<{ parent: FileSystemDirectoryHandle; name: string }> {
    const norm = relativePath.replace(/\\/g, '/');
    const idx = norm.lastIndexOf('/');
    const dirPath = idx >= 0 ? norm.slice(0, idx) : '';
    const name = idx >= 0 ? norm.slice(idx + 1) : norm;
    const parent = dirPath
      ? await this.getSubdirectoryHandle(rootKey, dirPath, create)
      : (this.rootKeyToHandle.get(rootKey) as FileSystemDirectoryHandle);
    return { parent, name };
  }
}

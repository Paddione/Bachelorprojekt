// Realistic File System Access API mocks for deterministic testing

export interface MockFileSystemEntry {
  name: string;
  type: 'file' | 'directory';
  content?: string | Uint8Array;
  children?: Record<string, MockFileSystemEntry>;
  lastModified?: number;
  size?: number;
}

export class MockFileSystemWritableFileStream {
  private chunks: (string | ArrayBuffer | ArrayBufferView | Blob)[] = [];
  private closed = false;
  readonly locked = false;

  write(data: string | ArrayBuffer | ArrayBufferView | Blob): Promise<void> {
    if (this.closed) {
      return Promise.reject(new DOMException('The stream is closed', 'InvalidStateError'));
    }
    this.chunks.push(data);
    return Promise.resolve();
  }

  seek(position: number): Promise<void> {
    // Mock implementation - no-op for testing
    return Promise.resolve();
  }

  truncate(size: number): Promise<void> {
    // Mock implementation - no-op for testing
    return Promise.resolve();
  }

  close(): Promise<void> {
    this.closed = true;
    return Promise.resolve();
  }

  abort(): Promise<void> {
    this.closed = true;
    return Promise.resolve();
  }

  getWriter(): WritableStreamDefaultWriter<any> {
    throw new Error('getWriter not implemented in mock');
  }

  getContent(): string {
    return this.chunks
      .map((chunk) => {
        if (typeof chunk === 'string') return chunk;
        if (chunk instanceof ArrayBuffer) return new TextDecoder().decode(chunk);
        if (chunk instanceof Uint8Array) return new TextDecoder().decode(chunk);
        if (chunk instanceof Blob) {
          // Synchronous blob reading for testing - not realistic but deterministic
          return '[Blob content]';
        }
        return chunk.toString();
      })
      .join('');
  }
}

export class MockFileSystemFileHandle implements FileSystemFileHandle {
  readonly kind = 'file' as const;

  constructor(
    public readonly name: string,
    private entry: MockFileSystemEntry,
    private filesystem: MockFileSystem,
  ) {}

  getFile(): Promise<File> {
    if (this.entry.type !== 'file') {
      return Promise.reject(new DOMException('Not a file', 'InvalidStateError'));
    }

    const content = this.entry.content || '';
    const size =
      this.entry.size ?? (typeof content === 'string' ? content.length : content.byteLength);
    const lastModified = this.entry.lastModified || Date.now();

    // Create a blob with the specified size by padding with zeros if needed
    let blobContent: BlobPart;
    if (typeof content === 'string') {
      const actualSize = content.length;
      blobContent = actualSize < size ? content + '\0'.repeat(size - actualSize) : content;
    } else {
      const actualSize = content.byteLength;
      if (actualSize < size) {
        const padded = new Uint8Array(size);
        padded.set(new Uint8Array(content));
        blobContent = padded;
      } else {
        blobContent = content;
      }
    }

    const blob = new Blob([blobContent], { type: 'video/mp4' });

    return Promise.resolve(
      new File([blob], this.name, {
        type: 'video/mp4',
        lastModified,
      }),
    );
  }

  createWritable(options?: FileSystemCreateWritableOptions): Promise<FileSystemWritableFileStream> {
    if (this.entry.type !== 'file') {
      return Promise.reject(new DOMException('Not a file', 'InvalidStateError'));
    }

    const writable = new MockFileSystemWritableFileStream();

    // Mock behavior: update entry content when stream closes
    const originalClose = writable.close.bind(writable);
    writable.close = () => {
      return originalClose().then(() => {
        this.entry.content = writable.getContent();
        this.entry.lastModified = Date.now();
      });
    };

    return Promise.resolve(writable as FileSystemWritableFileStream);
  }

  isSameEntry(other: FileSystemHandle): Promise<boolean> {
    return Promise.resolve(
      other instanceof MockFileSystemFileHandle &&
        other.name === this.name &&
        other.entry === this.entry,
    );
  }

  queryPermission(descriptor?: any): Promise<PermissionState> {
    return Promise.resolve('granted');
  }

  requestPermission(descriptor?: any): Promise<PermissionState> {
    return Promise.resolve('granted');
  }

  // Mock move method for testing
  move?: (name: string) => Promise<void> = (newName: string) => {
    this.filesystem.moveFile(this.name, newName, this.entry);
    (this as any).name = newName;
    return Promise.resolve();
  };
}

export class MockFileSystemDirectoryHandle implements FileSystemDirectoryHandle {
  readonly kind = 'directory' as const;

  constructor(
    public readonly name: string,
    private entry: MockFileSystemEntry,
    private filesystem: MockFileSystem,
  ) {}

  async *entries(): AsyncIterableIterator<[string, FileSystemHandle]> {
    if (this.entry.type !== 'directory' || !this.entry.children) {
      return;
    }

    for (const [name, child] of Object.entries(this.entry.children)) {
      yield [name, this.filesystem.createHandle(name, child)];
    }
  }

  async *keys(): AsyncIterableIterator<string> {
    const entriesIterator = this.entries();
    for await (const [key] of entriesIterator) {
      yield key;
    }
  }

  async *values(): AsyncIterableIterator<FileSystemHandle> {
    const entriesIterator = this.entries();
    for await (const [, value] of entriesIterator) {
      yield value;
    }
  }

  [Symbol.asyncIterator](): AsyncIterableIterator<[string, FileSystemHandle]> {
    return this.entries();
  }

  getFileHandle(name: string, options?: FileSystemGetFileOptions): Promise<FileSystemFileHandle> {
    if (!this.entry.children) {
      return Promise.reject(new DOMException('Not a directory', 'InvalidStateError'));
    }

    let child = this.entry.children[name];

    if (!child) {
      if (options?.create) {
        child = {
          name,
          type: 'file',
          content: '',
          lastModified: Date.now(),
          size: 0,
        };
        this.entry.children[name] = child;
      } else {
        return Promise.reject(new DOMException('File not found', 'NotFoundError'));
      }
    }

    if (child.type !== 'file') {
      return Promise.reject(new DOMException('Not a file', 'TypeMismatchError'));
    }

    return Promise.resolve(
      new MockFileSystemFileHandle(name, child, this.filesystem) as FileSystemFileHandle,
    );
  }

  getDirectoryHandle(
    name: string,
    options?: FileSystemGetDirectoryOptions,
  ): Promise<FileSystemDirectoryHandle> {
    if (!this.entry.children) {
      return Promise.reject(new DOMException('Not a directory', 'InvalidStateError'));
    }

    let child = this.entry.children[name];

    if (!child) {
      if (options?.create) {
        child = {
          name,
          type: 'directory',
          children: {},
        };
        this.entry.children[name] = child;
      } else {
        return Promise.reject(new DOMException('Directory not found', 'NotFoundError'));
      }
    }

    if (child.type !== 'directory') {
      return Promise.reject(new DOMException('Not a directory', 'TypeMismatchError'));
    }

    return Promise.resolve(
      new MockFileSystemDirectoryHandle(name, child, this.filesystem) as FileSystemDirectoryHandle,
    );
  }

  removeEntry(name: string, options?: FileSystemRemoveOptions): Promise<void> {
    if (!this.entry.children) {
      return Promise.reject(new DOMException('Not a directory', 'InvalidStateError'));
    }

    const child = this.entry.children[name];
    if (!child) {
      return Promise.reject(new DOMException('Entry not found', 'NotFoundError'));
    }

    if (child.type === 'directory' && child.children && Object.keys(child.children).length > 0) {
      if (!options?.recursive) {
        return Promise.reject(new DOMException('Directory not empty', 'InvalidModificationError'));
      }
    }

    delete this.entry.children[name];
    return Promise.resolve();
  }

  resolve(possibleDescendant: FileSystemHandle): Promise<string[] | null> {
    // Simplified implementation for testing
    if (
      possibleDescendant instanceof MockFileSystemFileHandle ||
      possibleDescendant instanceof MockFileSystemDirectoryHandle
    ) {
      return Promise.resolve([possibleDescendant.name]);
    }
    return Promise.resolve(null);
  }

  isSameEntry(other: FileSystemHandle): Promise<boolean> {
    return Promise.resolve(
      other instanceof MockFileSystemDirectoryHandle &&
        other.name === this.name &&
        other.entry === this.entry,
    );
  }

  queryPermission(descriptor?: any): Promise<PermissionState> {
    return Promise.resolve('granted');
  }

  requestPermission(descriptor?: any): Promise<PermissionState> {
    return Promise.resolve('granted');
  }
}

export class MockFileSystem {
  public root: MockFileSystemEntry;

  constructor(
    initialStructure: MockFileSystemEntry = { name: 'root', type: 'directory', children: {} },
  ) {
    this.root = initialStructure;
  }

  createHandle(name: string, entry: MockFileSystemEntry): FileSystemHandle {
    if (entry.type === 'file') {
      return new MockFileSystemFileHandle(name, entry, this);
    } else {
      return new MockFileSystemDirectoryHandle(name, entry, this);
    }
  }

  getRootHandle(): MockFileSystemDirectoryHandle {
    return new MockFileSystemDirectoryHandle(this.root.name, this.root, this);
  }

  // Helper methods for testing
  addFile(path: string, content: string | Uint8Array = '', size?: number): void {
    const parts = path.split('/').filter(Boolean);
    const fileName = parts.pop()!;
    let current = this.root;

    // Navigate/create directory structure
    for (const part of parts) {
      if (!current.children) {
        current.children = {};
      }
      if (!current.children[part]) {
        current.children[part] = { name: part, type: 'directory', children: {} };
      }
      current = current.children[part];
    }

    if (!current.children) {
      current.children = {};
    }

    current.children[fileName] = {
      name: fileName,
      type: 'file',
      content,
      size: size ?? (typeof content === 'string' ? content.length : content.byteLength),
      lastModified: Date.now(),
    };
  }

  addDirectory(path: string): void {
    const parts = path.split('/').filter(Boolean);
    let current = this.root;

    for (const part of parts) {
      if (!current.children) {
        current.children = {};
      }
      if (!current.children[part]) {
        current.children[part] = { name: part, type: 'directory', children: {} };
      }
      current = current.children[part];
    }
  }

  moveFile(oldName: string, newName: string, entry: MockFileSystemEntry): void {
    // This is a simplified implementation for testing
    // In reality, this would need to handle cross-directory moves
    entry.name = newName;
  }

  fileExists(path: string): boolean {
    const parts = path.split('/').filter(Boolean);
    let current = this.root;

    for (const part of parts) {
      if (!current.children || !current.children[part]) {
        return false;
      }
      current = current.children[part];
    }

    return current.type === 'file';
  }

  directoryExists(path: string): boolean {
    const parts = path.split('/').filter(Boolean);
    let current = this.root;

    for (const part of parts) {
      if (!current.children || !current.children[part]) {
        return false;
      }
      current = current.children[part];
    }

    return current.type === 'directory';
  }

  listFiles(path: string = ''): string[] {
    const parts = path.split('/').filter(Boolean);
    let current = this.root;

    for (const part of parts) {
      if (!current.children || !current.children[part]) {
        return [];
      }
      current = current.children[part];
    }

    if (!current.children) {
      return [];
    }

    return Object.entries(current.children)
      .filter(([, entry]) => entry.type === 'file')
      .map(([name]) => name);
  }
}

// Global mock installer
export function installFileSystemAccessAPIMocks(): MockFileSystem {
  const mockFS = new MockFileSystem();

  // Mock window.showDirectoryPicker
  (global as any).showDirectoryPicker = (): Promise<FileSystemDirectoryHandle> => {
    return Promise.resolve(mockFS.getRootHandle() as FileSystemDirectoryHandle);
  };

  // Mock window.showOpenFilePicker
  (global as any).showOpenFilePicker = (): Promise<FileSystemFileHandle[]> => {
    const files = mockFS.listFiles();
    return Promise.resolve(
      files.map((fileName) => {
        const entry = mockFS.root.children![fileName];
        return new MockFileSystemFileHandle(fileName, entry, mockFS) as FileSystemFileHandle;
      }),
    );
  };

  // Mock window.showSaveFilePicker
  (global as any).showSaveFilePicker = (): Promise<FileSystemFileHandle> => {
    const fileName = 'new-file.txt';
    mockFS.addFile(fileName, '');
    const entry = mockFS.root.children![fileName];
    return Promise.resolve(
      new MockFileSystemFileHandle(fileName, entry, mockFS) as FileSystemFileHandle,
    );
  };

  return mockFS;
}

// Cleanup function
export function cleanupFileSystemAccessAPIMocks(): void {
  delete (global as any).showDirectoryPicker;
  delete (global as any).showOpenFilePicker;
  delete (global as any).showSaveFilePicker;
}

// Test helper to create video files
export function createMockVideoStructure(): MockFileSystem {
  const fs = new MockFileSystem();

  // Add some mock video files
  fs.addDirectory('Videos');
  fs.addFile('Videos/sample1.mp4', 'mock video content 1', 1024 * 1024 * 100); // 100MB
  fs.addFile('Videos/sample2.avi', 'mock video content 2', 1024 * 1024 * 50); // 50MB
  fs.addFile('Videos/sample3.mkv', 'mock video content 3', 1024 * 1024 * 200); // 200MB

  fs.addDirectory('Videos/Subdirectory');
  fs.addFile('Videos/Subdirectory/nested.mp4', 'nested video', 1024 * 1024 * 75);

  return fs;
}

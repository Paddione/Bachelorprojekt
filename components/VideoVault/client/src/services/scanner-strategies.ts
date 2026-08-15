import type { MediaType, Audiobook, Ebook } from '../types/media';

export const VIDEO_EXTENSIONS = ['.mp4', '.avi', '.mov', '.mkv', '.wmv', '.webm', '.m4v'];
export const AUDIO_EXTENSIONS = ['.mp3', '.m4a', '.m4b', '.aac', '.flac', '.ogg', '.wma'];
export const EBOOK_EXTENSIONS = ['.epub', '.pdf', '.mobi', '.azw3', '.txt'];
export const EBOOK_METADATA_FILES = ['.opf'];
export const COVER_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];

export interface DiscoveredBook {
  path: string;
  parentDirHandle: FileSystemDirectoryHandle;
  files: Map<string, FileSystemFileHandle>;
  mediaType: 'audiobook' | 'ebook';
}

export class ScannerStrategies {
  static getFileExtension(filename: string): string {
    return filename.toLowerCase().substring(filename.lastIndexOf('.'));
  }

  static generateMediaId(type: MediaType, path: string): string {
    const input = `${type}-${path}`;
    try {
      const bytes = new TextEncoder().encode(input);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      return btoa(binary).replace(/[+/=]/g, '');
    } catch (_e) {
      let hash = 0;
      for (let i = 0; i < input.length; i++) {
        hash = ((hash << 5) - hash + input.charCodeAt(i)) | 0;
      }
      return Math.abs(hash).toString(36);
    }
  }

  static cleanTitle(name: string): string {
    return name
      .replace(/[-_]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  static extractChapterTitle(filename: string): string {
    const nameWithoutExt = filename.replace(/\.[^/.]+$/, '');
    const chapterMatch = nameWithoutExt.match(/(?:chapter|ch|part|track)?\s*(\d+)/i);
    if (chapterMatch) {
      return `Chapter ${parseInt(chapterMatch[1], 10)}`;
    }
    return this.cleanTitle(nameWithoutExt);
  }

  static naturalSort(a: string, b: string): number {
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
  }

  static async fileToDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  static async detectBookDirectory(
    handle: FileSystemDirectoryHandle,
    mediaTypes: MediaType[],
  ): Promise<'audiobook' | 'ebook' | null> {
    let hasAudioFiles = false;
    let hasEbookFiles = false;
    let hasOpf = false;

    const anyDir = handle as any;
    if (!anyDir || typeof anyDir.entries !== 'function') return null;

    for await (const [name, entryHandle] of anyDir.entries() as AsyncIterable<
      [string, FileSystemHandle]
    >) {
      if (entryHandle.kind !== 'file') continue;

      const ext = this.getFileExtension(name);

      if (AUDIO_EXTENSIONS.includes(ext)) {
        hasAudioFiles = true;
      }
      if (EBOOK_EXTENSIONS.includes(ext)) {
        hasEbookFiles = true;
      }
      if (EBOOK_METADATA_FILES.includes(ext)) {
        hasOpf = true;
      }
    }

    if ((hasEbookFiles || hasOpf) && mediaTypes.includes('ebook')) {
      return 'ebook';
    }

    if (hasAudioFiles && mediaTypes.includes('audiobook')) {
      return 'audiobook';
    }

    return null;
  }

  static async collectBookFiles(
    handle: FileSystemDirectoryHandle,
  ): Promise<Map<string, FileSystemFileHandle>> {
    const files = new Map<string, FileSystemFileHandle>();

    const anyDir = handle as any;
    if (!anyDir || typeof anyDir.entries !== 'function') return files;

    for await (const [name, entryHandle] of anyDir.entries() as AsyncIterable<
      [string, FileSystemHandle]
    >) {
      if (entryHandle.kind === 'file') {
        files.set(name, entryHandle as FileSystemFileHandle);
      }
    }

    return files;
  }

  static async processAudiobookDirectory(
    book: DiscoveredBook,
    rootKey: string,
  ): Promise<Audiobook | null> {
    const audioFiles: Array<{ name: string; handle: FileSystemFileHandle }> = [];
    let coverHandle: FileSystemFileHandle | null = null;

    for (const [name, handle] of book.files) {
      const ext = this.getFileExtension(name);
      if (AUDIO_EXTENSIONS.includes(ext)) {
        audioFiles.push({ name, handle });
      }
      if (COVER_EXTENSIONS.includes(ext) && !coverHandle) {
        const lowerName = name.toLowerCase();
        if (lowerName.includes('cover') || lowerName.includes('folder') || !coverHandle) {
          coverHandle = handle;
        }
      }
    }

    if (audioFiles.length === 0) return null;

    audioFiles.sort((a, b) => this.naturalSort(a.name, b.name));

    const pathParts = book.path.split('/').filter(Boolean);
    const title = pathParts[pathParts.length - 1] || 'Unknown';
    const author = pathParts.length > 1 ? pathParts[pathParts.length - 2] : 'Unknown Author';

    const chapters: Audiobook['chapters'] = [];
    let totalDuration = 0;
    let totalSize = 0;

    for (let i = 0; i < audioFiles.length; i++) {
      const { name, handle } = audioFiles[i];
      const file = await handle.getFile();

      const estimatedDuration = Math.floor(file.size / 8000);

      chapters.push({
        index: i,
        title: this.extractChapterTitle(name),
        path: `${book.path}${name}`,
        duration: estimatedDuration,
        startTime: totalDuration,
        fileSize: file.size,
      });

      totalDuration += estimatedDuration;
      totalSize += file.size;
    }

    let coverImage: string | undefined;
    if (coverHandle) {
      try {
        const coverFile = await coverHandle.getFile();
        coverImage = await this.fileToDataUrl(coverFile);
      } catch (e) {
        console.warn('Failed to read cover image:', e);
      }
    }

    let lastModified = new Date().toISOString();
    try {
      const lastFile = await audioFiles[audioFiles.length - 1].handle.getFile();
      lastModified = new Date(lastFile.lastModified).toISOString();
    } catch (_e) {}

    const audiobook: Audiobook = {
      type: 'audiobook',
      id: this.generateMediaId('audiobook', book.path),
      title: this.cleanTitle(title),
      author: this.cleanTitle(author),
      path: book.path,
      chapters,
      totalDuration,
      totalSize,
      coverImage,
      metadata: {},
      lastModified,
      rootKey,
    };

    return audiobook;
  }

  static async processEbookDirectory(
    book: DiscoveredBook,
    rootKey: string,
  ): Promise<Ebook | null> {
    const ebookFiles: Ebook['files'] = [];
    let coverHandle: FileSystemFileHandle | null = null;
    let opfHandle: FileSystemFileHandle | null = null;

    for (const [name, handle] of book.files) {
      const ext = this.getFileExtension(name);
      if (EBOOK_EXTENSIONS.includes(ext)) {
        const file = await handle.getFile();
        ebookFiles.push({
          format: ext.slice(1) as Ebook['files'][0]['format'],
          path: `${book.path}${name}`,
          fileSize: file.size,
        });
      }
      if (COVER_EXTENSIONS.includes(ext)) {
        const lowerName = name.toLowerCase();
        if (lowerName.includes('cover') || !coverHandle) {
          coverHandle = handle;
        }
      }
      if (ext === '.opf') {
        opfHandle = handle;
      }
    }

    if (ebookFiles.length === 0) return null;

    const pathParts = book.path.split('/').filter(Boolean);
    let title = pathParts[pathParts.length - 1] || 'Unknown';
    let author = pathParts.length > 1 ? pathParts[pathParts.length - 2] : 'Unknown Author';

    let metadata: Ebook['metadata'] = {};
    if (opfHandle) {
      try {
        const opfFile = await opfHandle.getFile();
        const opfContent = await opfFile.text();
        const parsedMetadata = this.parseOpfMetadata(opfContent);
        metadata = parsedMetadata;
        if (parsedMetadata.title) title = parsedMetadata.title;
        if (parsedMetadata.author) author = parsedMetadata.author;
      } catch (e) {
        console.warn('Failed to parse OPF metadata:', e);
      }
    }

    let coverImage: string | undefined;
    if (coverHandle) {
      try {
        const coverFile = await coverHandle.getFile();
        coverImage = await this.fileToDataUrl(coverFile);
      } catch (e) {
        console.warn('Failed to read cover image:', e);
      }
    }

    let lastModified = new Date().toISOString();
    for (const [name, handle] of book.files) {
      const ext = this.getFileExtension(name);
      if (EBOOK_EXTENSIONS.includes(ext)) {
        try {
          const file = await handle.getFile();
          const fileModified = new Date(file.lastModified);
          if (fileModified > new Date(lastModified)) {
            lastModified = fileModified.toISOString();
          }
        } catch (_e) {}
      }
    }

    const ebook: Ebook = {
      type: 'ebook',
      id: this.generateMediaId('ebook', book.path),
      title: this.cleanTitle(title),
      author: this.cleanTitle(author),
      path: book.path,
      files: ebookFiles,
      coverImage,
      metadata,
      lastModified,
      rootKey,
    };

    return ebook;
  }

  static parseOpfMetadata(opfContent: string): Ebook['metadata'] {
    const metadata: Ebook['metadata'] = {};

    try {
      const titleMatch = opfContent.match(/<dc:title[^>]*>([^<]+)<\/dc:title>/i);
      if (titleMatch) metadata.title = titleMatch[1].trim();

      const authorMatch = opfContent.match(/<dc:creator[^>]*>([^<]+)<\/dc:creator>/i);
      if (authorMatch) metadata.author = authorMatch[1].trim();

      const publisherMatch = opfContent.match(/<dc:publisher[^>]*>([^<]+)<\/dc:publisher>/i);
      if (publisherMatch) metadata.publisher = publisherMatch[1].trim();

      const dateMatch = opfContent.match(/<dc:date[^>]*>([^<]+)<\/dc:date>/i);
      if (dateMatch) metadata.publishDate = dateMatch[1].trim();

      const descMatch = opfContent.match(/<dc:description[^>]*>([^<]+)<\/dc:description>/i);
      if (descMatch) metadata.description = descMatch[1].trim();

      const langMatch = opfContent.match(/<dc:language[^>]*>([^<]+)<\/dc:language>/i);
      if (langMatch) metadata.language = langMatch[1].trim();

      const isbnMatch = opfContent.match(/<dc:identifier[^>]*isbn[^>]*>([^<]+)<\/dc:identifier>/i);
      if (isbnMatch) metadata.isbn = isbnMatch[1].trim();

      const calibreIdMatch = opfContent.match(
        /<dc:identifier[^>]*calibre[^>]*>([^<]+)<\/dc:identifier>/i,
      );
      if (calibreIdMatch) metadata.calibreId = calibreIdMatch[1].trim();

      const seriesMatch = opfContent.match(/name="calibre:series"\s+content="([^"]+)"/i);
      if (seriesMatch) metadata.series = seriesMatch[1];

      const seriesIndexMatch = opfContent.match(
        /name="calibre:series_index"\s+content="([^"]+)"/i,
      );
      if (seriesIndexMatch) metadata.seriesIndex = parseFloat(seriesIndexMatch[1]);

      const subjects: string[] = [];
      const subjectMatches = opfContent.matchAll(/<dc:subject[^>]*>([^<]+)<\/dc:subject>/gi);
      for (const match of subjectMatches) {
        subjects.push(match[1].trim());
      }
      if (subjects.length > 0) metadata.subjects = subjects;
    } catch (e) {
      console.warn('Error parsing OPF:', e);
    }

    return metadata;
  }
}

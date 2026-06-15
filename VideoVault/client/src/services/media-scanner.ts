/**
 * MediaScanner - Unified media scanning service
 * Detects media type and routes to appropriate scanner
 */

import type { MediaItem, MediaType, MediaScanResult, ScanError, VideoWithType } from '../types/media';
import type { Audiobook, Ebook } from '../types/media';
import { FileScanner } from './file-scanner';
import { DirectoryHandleRegistry } from './directory-handle-registry';
import { DirectoryDatabase } from './directory-database';

// File extension mappings
const VIDEO_EXTENSIONS = ['.mp4', '.avi', '.mov', '.mkv', '.wmv', '.webm', '.m4v'];
const AUDIO_EXTENSIONS = ['.mp3', '.m4a', '.m4b', '.aac', '.flac', '.ogg', '.wma'];
const EBOOK_EXTENSIONS = ['.epub', '.pdf', '.mobi', '.azw3', '.txt'];
const EBOOK_METADATA_FILES = ['.opf'];
const COVER_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];

export type MediaTypeFilter = MediaType | 'all';

export interface MediaScanProgress {
  current: number;
  total: number;
  mediaType: MediaType | null;
  phase: 'discovery' | 'processing';
}

export interface ScanOptions {
  mediaTypes?: MediaType[];
  progressCallback?: (progress: MediaScanProgress) => void;
  abortSignal?: AbortSignal;
}

/**
 * Entry in the filesystem that we've discovered
 */
interface DiscoveredEntry {
  fileHandle: FileSystemFileHandle;
  relativePath: string;
  parentDirHandle: FileSystemDirectoryHandle;
  mediaType: MediaType;
}

/**
 * Discovered book directory (for audiobooks and ebooks)
 */
interface DiscoveredBook {
  path: string;
  parentDirHandle: FileSystemDirectoryHandle;
  files: Map<string, FileSystemFileHandle>;
  mediaType: 'audiobook' | 'ebook';
}

export class MediaScanner {
  /**
   * Scan a directory for all media types
   */
  static async scanDirectory(
    directoryHandle: FileSystemDirectoryHandle,
    options: ScanOptions = {},
  ): Promise<MediaScanResult> {
    const { mediaTypes = ['video', 'audiobook', 'ebook'], progressCallback, abortSignal } = options;

    const result: MediaScanResult = {
      videos: [],
      audiobooks: [],
      ebooks: [],
      errors: [],
    };

    // Create a session root key
    const rootKey = `${(directoryHandle as any).name || 'root'}_${Date.now()}`;
    DirectoryHandleRegistry.registerRoot(rootKey, directoryHandle);

    // Report discovery phase
    progressCallback?.({
      current: 0,
      total: 0,
      mediaType: null,
      phase: 'discovery',
    });

    // Discover all media files
    const { entries, books, directories } = await this.discoverMedia(
      directoryHandle,
      mediaTypes,
      abortSignal,
    );

    if (abortSignal?.aborted) {
      return result;
    }

    // Persist directory structure
    await DirectoryDatabase.setRootDirectories(
      rootKey,
      Array.from(directories),
      (directoryHandle as any).name,
    );

    // Calculate totals
    const totalItems = entries.length + books.size;

    // Process standalone video files using existing FileScanner
    if (mediaTypes.includes('video')) {
      const videoEntries = entries.filter((e) => e.mediaType === 'video');
      if (videoEntries.length > 0) {
        let processed = 0;
        const videos = await this.processVideoEntries(
          videoEntries,
          rootKey,
          (current, total) => {
            processed = current;
            progressCallback?.({
              current: processed,
              total: totalItems,
              mediaType: 'video',
              phase: 'processing',
            });
          },
          abortSignal,
        );
        result.videos = videos;
      }
    }

    // Process audiobook directories
    if (mediaTypes.includes('audiobook')) {
      const audiobookDirs = Array.from(books.values()).filter((b) => b.mediaType === 'audiobook');
      for (const bookDir of audiobookDirs) {
        if (abortSignal?.aborted) break;
        try {
          const audiobook = await this.processAudiobookDirectory(bookDir, rootKey);
          if (audiobook) {
            result.audiobooks.push(audiobook);
          }
        } catch (error) {
          result.errors.push({
            path: bookDir.path,
            error: error instanceof Error ? error.message : String(error),
            mediaType: 'audiobook',
          });
        }
      }
    }

    // Process ebook directories
    if (mediaTypes.includes('ebook')) {
      const ebookDirs = Array.from(books.values()).filter((b) => b.mediaType === 'ebook');
      for (const bookDir of ebookDirs) {
        if (abortSignal?.aborted) break;
        try {
          const ebook = await this.processEbookDirectory(bookDir, rootKey);
          if (ebook) {
            result.ebooks.push(ebook);
          }
        } catch (error) {
          result.errors.push({
            path: bookDir.path,
            error: error instanceof Error ? error.message : String(error),
            mediaType: 'ebook',
          });
        }
      }
    }

    return result;
  }

  /**
   * Discover all media files and book directories in a directory tree
   */
  private static async discoverMedia(
    directoryHandle: FileSystemDirectoryHandle,
    mediaTypes: MediaType[],
    abortSignal?: AbortSignal,
    basePath: string = '',
  ): Promise<{
    entries: DiscoveredEntry[];
    books: Map<string, DiscoveredBook>;
    directories: Set<string>;
  }> {
    const entries: DiscoveredEntry[] = [];
    const books = new Map<string, DiscoveredBook>();
    const directories = new Set<string>();

    // Track files in current directory for book detection
    const currentDirFiles = new Map<string, FileSystemFileHandle>();
    const subdirs: Array<{
      handle: FileSystemDirectoryHandle;
      path: string;
    }> = [];

    const anyDir = directoryHandle as any;
    if (anyDir && typeof anyDir.entries === 'function') {
      for await (const [name, handle] of anyDir.entries() as AsyncIterable<
        [string, FileSystemHandle]
      >) {
        if (abortSignal?.aborted) break;

        if (handle.kind === 'file') {
          currentDirFiles.set(name, handle as FileSystemFileHandle);
          const ext = this.getFileExtension(name);

          // Standalone video files
          if (VIDEO_EXTENSIONS.includes(ext) && mediaTypes.includes('video')) {
            entries.push({
              fileHandle: handle as FileSystemFileHandle,
              relativePath: `${basePath}${name}`,
              parentDirHandle: directoryHandle,
              mediaType: 'video',
            });
          }
        } else if (handle.kind === 'directory') {
          const dirPath = `${basePath}${name}/`;
          directories.add(dirPath);
          subdirs.push({
            handle: handle as FileSystemDirectoryHandle,
            path: dirPath,
          });
        }
      }
    }

    // Detect if current directory is an author/book structure for audiobooks/ebooks
    // Pattern: Author/Book Title/files...
    for (const subdir of subdirs) {
      if (abortSignal?.aborted) break;

      // Check if this subdir contains book content
      const bookType = await this.detectBookDirectory(subdir.handle, mediaTypes);

      if (bookType) {
        // This is a book directory - collect its files
        const bookFiles = await this.collectBookFiles(subdir.handle);
        books.set(subdir.path, {
          path: subdir.path,
          parentDirHandle: subdir.handle,
          files: bookFiles,
          mediaType: bookType,
        });
      } else {
        // Recurse into subdirectory
        const sub = await this.discoverMedia(subdir.handle, mediaTypes, abortSignal, subdir.path);
        sub.entries.forEach((e) => entries.push(e));
        sub.books.forEach((b, k) => books.set(k, b));
        sub.directories.forEach((d) => directories.add(d));
      }
    }

    return { entries, books, directories };
  }

  /**
   * Detect if a directory is a book directory (audiobook or ebook)
   */
  private static async detectBookDirectory(
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

    // Ebook if has ebook files or OPF metadata
    if ((hasEbookFiles || hasOpf) && mediaTypes.includes('ebook')) {
      return 'ebook';
    }

    // Audiobook if has multiple audio files (chapters)
    if (hasAudioFiles && mediaTypes.includes('audiobook')) {
      return 'audiobook';
    }

    return null;
  }

  /**
   * Collect all files in a book directory
   */
  private static async collectBookFiles(
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

  /**
   * Process video file entries using existing FileScanner logic
   */
  private static async processVideoEntries(
    entries: DiscoveredEntry[],
    rootKey: string,
    progressCallback?: (current: number, total: number) => void,
    abortSignal?: AbortSignal,
  ): Promise<VideoWithType[]> {
    const videos: VideoWithType[] = [];
    let current = 0;
    const total = entries.length;

    const concurrency = this.determineConcurrency();
    let nextIndex = 0;
    const inFlight = new Set<Promise<void>>();

    const launchNext = () => {
      if (abortSignal?.aborted) return;
      if (nextIndex >= entries.length) return;
      const entry = entries[nextIndex++];

      const p = (async () => {
        try {
          const file = await entry.fileHandle.getFile();
          if (abortSignal?.aborted) return;

          // Use FileScanner's generateVideoMetadata
          const video = await FileScanner.generateVideoMetadata(
            file,
            entry.fileHandle,
            entry.relativePath,
            entry.parentDirHandle,
            rootKey,
          );

          if (abortSignal?.aborted) return;

          // Add type discriminator
          const videoWithType: VideoWithType = {
            ...video,
            type: 'video',
          };
          videos.push(videoWithType);
        } catch (error) {
          if (abortSignal?.aborted) return;
          console.warn(`Failed to process video ${entry.fileHandle.name}:`, error);
        } finally {
          if (!abortSignal?.aborted) {
            current++;
            progressCallback?.(current, total);
          }
        }
      })();

      inFlight.add(p);
      void p.finally(() => inFlight.delete(p));
    };

    for (let i = 0; i < concurrency && i < entries.length; i++) {
      launchNext();
    }

    while (!abortSignal?.aborted && (nextIndex < entries.length || inFlight.size > 0)) {
      if (inFlight.size === 0) break;
      await Promise.race(inFlight);
      while (!abortSignal?.aborted && inFlight.size < concurrency && nextIndex < entries.length) {
        launchNext();
      }
    }

    if (abortSignal?.aborted && inFlight.size > 0) {
      await Promise.allSettled(Array.from(inFlight));
    }

    return videos;
  }

  /**
   * Process an audiobook directory
   * Structure: Author/Book Title/Chapter1.mp3, Chapter2.mp3, ...
   */
  private static async processAudiobookDirectory(
    book: DiscoveredBook,
    rootKey: string,
  ): Promise<Audiobook | null> {
    const audioFiles: Array<{ name: string; handle: FileSystemFileHandle }> = [];
    let coverHandle: FileSystemFileHandle | null = null;

    // Collect audio files and cover
    for (const [name, handle] of book.files) {
      const ext = this.getFileExtension(name);
      if (AUDIO_EXTENSIONS.includes(ext)) {
        audioFiles.push({ name, handle });
      }
      if (COVER_EXTENSIONS.includes(ext) && !coverHandle) {
        // Prefer files named "cover" or "folder"
        const lowerName = name.toLowerCase();
        if (lowerName.includes('cover') || lowerName.includes('folder') || !coverHandle) {
          coverHandle = handle;
        }
      }
    }

    if (audioFiles.length === 0) return null;

    // Sort audio files naturally (Chapter 1, Chapter 2, etc.)
    audioFiles.sort((a, b) => this.naturalSort(a.name, b.name));

    // Parse path to get author and title
    // Expected format: Author/Book Title/ or just Book Title/
    const pathParts = book.path.split('/').filter(Boolean);
    const title = pathParts[pathParts.length - 1] || 'Unknown';
    const author = pathParts.length > 1 ? pathParts[pathParts.length - 2] : 'Unknown Author';

    // Process chapters
    const chapters: Audiobook['chapters'] = [];
    let totalDuration = 0;
    let totalSize = 0;

    for (let i = 0; i < audioFiles.length; i++) {
      const { name, handle } = audioFiles[i];
      const file = await handle.getFile();

      // For now, estimate duration from file size (will be improved with jsmediatags)
      // Average audiobook bitrate ~64kbps = 8KB/s
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

    // Get cover image as data URL
    let coverImage: string | undefined;
    if (coverHandle) {
      try {
        const coverFile = await coverHandle.getFile();
        coverImage = await this.fileToDataUrl(coverFile);
      } catch (e) {
        console.warn('Failed to read cover image:', e);
      }
    }

    // Get last modified from most recent chapter
    let lastModified = new Date().toISOString();
    try {
      const lastFile = await audioFiles[audioFiles.length - 1].handle.getFile();
      lastModified = new Date(lastFile.lastModified).toISOString();
    } catch (_e) {
      // Use current date
    }

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

  /**
   * Process an ebook directory
   * Structure: Author/Book Title/book.epub, book.pdf, cover.jpg, metadata.opf
   */
  private static async processEbookDirectory(
    book: DiscoveredBook,
    rootKey: string,
  ): Promise<Ebook | null> {
    const ebookFiles: Ebook['files'] = [];
    let coverHandle: FileSystemFileHandle | null = null;
    let opfHandle: FileSystemFileHandle | null = null;

    // Collect ebook files, cover, and metadata
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

    // Parse path to get author and title
    const pathParts = book.path.split('/').filter(Boolean);
    let title = pathParts[pathParts.length - 1] || 'Unknown';
    let author = pathParts.length > 1 ? pathParts[pathParts.length - 2] : 'Unknown Author';

    // Parse OPF metadata if available
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

    // Get cover image
    let coverImage: string | undefined;
    if (coverHandle) {
      try {
        const coverFile = await coverHandle.getFile();
        coverImage = await this.fileToDataUrl(coverFile);
      } catch (e) {
        console.warn('Failed to read cover image:', e);
      }
    }

    // Get last modified from ebook files
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
        } catch (_e) {
          // continue
        }
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

  /**
   * Parse OPF metadata file (Calibre format)
   */
  private static parseOpfMetadata(opfContent: string): Ebook['metadata'] {
    const metadata: Ebook['metadata'] = {};

    try {
      // Simple regex-based parsing (will be replaced with fast-xml-parser)
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

      // Calibre-specific metadata
      const calibreIdMatch = opfContent.match(
        /<dc:identifier[^>]*calibre[^>]*>([^<]+)<\/dc:identifier>/i,
      );
      if (calibreIdMatch) metadata.calibreId = calibreIdMatch[1].trim();

      // Series info from Calibre metadata
      const seriesMatch = opfContent.match(/name="calibre:series"\s+content="([^"]+)"/i);
      if (seriesMatch) metadata.series = seriesMatch[1];

      const seriesIndexMatch = opfContent.match(
        /name="calibre:series_index"\s+content="([^"]+)"/i,
      );
      if (seriesIndexMatch) metadata.seriesIndex = parseFloat(seriesIndexMatch[1]);

      // Subjects
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

  // Utility methods

  private static getFileExtension(filename: string): string {
    return filename.toLowerCase().substring(filename.lastIndexOf('.'));
  }

  private static generateMediaId(type: MediaType, path: string): string {
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

  private static cleanTitle(name: string): string {
    return name
      .replace(/[-_]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  private static extractChapterTitle(filename: string): string {
    // Remove extension
    const nameWithoutExt = filename.replace(/\.[^/.]+$/, '');

    // Try to extract chapter number
    const chapterMatch = nameWithoutExt.match(/(?:chapter|ch|part|track)?\s*(\d+)/i);
    if (chapterMatch) {
      return `Chapter ${parseInt(chapterMatch[1], 10)}`;
    }

    return this.cleanTitle(nameWithoutExt);
  }

  private static naturalSort(a: string, b: string): number {
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
  }

  private static async fileToDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  private static determineConcurrency(): number {
    try {
      const hc = typeof navigator !== 'undefined' ? (navigator as any).hardwareConcurrency : 4;
      const suggested = Math.max(2, Math.floor((hc || 4) / 2));
      return Math.min(6, suggested);
    } catch (_e) {
      return 4;
    }
  }
}

/**
 * MediaVault Unified Media Types
 * Supports videos, audiobooks, and ebooks with discriminated union types
 */

// Base types shared across all media
export type MediaType = 'video' | 'audiobook' | 'ebook';

// ===============================
// Audiobook Types
// ===============================

export interface AudiobookChapter {
  index: number;
  title: string;
  path: string;
  duration: number; // seconds
  startTime: number; // cumulative start time in seconds
  fileSize: number;
}

export interface AudiobookMetadata {
  narrator?: string;
  publisher?: string;
  publishDate?: string;
  isbn?: string;
  series?: string;
  seriesIndex?: number;
  description?: string;
  language?: string;
  sampleRate?: number;
  bitrate?: number;
}

export interface AudiobookProgress {
  chapterIndex: number;
  position: number; // seconds within chapter
  lastPlayed: string; // ISO timestamp
  completed: boolean;
}

export interface Audiobook {
  type: 'audiobook';
  id: string;
  title: string;
  author: string;
  path: string; // path to book folder
  chapters: AudiobookChapter[];
  totalDuration: number; // seconds
  totalSize: number; // bytes
  coverImage?: string; // path or dataUrl
  metadata: AudiobookMetadata;
  progress?: AudiobookProgress;
  lastModified: string;
  rootKey?: string;
}

// ===============================
// Ebook Types
// ===============================

export type EbookFormat = 'epub' | 'pdf' | 'mobi' | 'azw3' | 'txt';

export interface EbookFile {
  format: EbookFormat;
  path: string;
  fileSize: number;
}

export interface EbookMetadata {
  title?: string;
  author?: string;
  publisher?: string;
  publishDate?: string;
  isbn?: string;
  series?: string;
  seriesIndex?: number;
  description?: string;
  language?: string;
  pageCount?: number;
  subjects?: string[];
  // OPF-specific fields
  opfPath?: string;
  calibreId?: string;
  calibreTimestamp?: string;
}

export interface EbookProgress {
  format: EbookFormat; // which format was being read
  location?: string; // EPUB CFI or page number for PDF
  percentage: number; // 0-100
  lastRead: string; // ISO timestamp
  completed: boolean;
}

export interface Ebook {
  type: 'ebook';
  id: string;
  title: string;
  author: string;
  path: string; // path to book folder
  files: EbookFile[];
  coverImage?: string; // path or dataUrl
  metadata: EbookMetadata;
  progress?: EbookProgress;
  lastModified: string;
  rootKey?: string;
}

// ===============================
// Extended Video Type
// ===============================

// Re-export and extend Video for discriminated union
import type { Video as BaseVideo, VideoMetadata, VideoThumbnail, VideoCategories, CustomCategories } from './video';

export interface VideoWithType extends Omit<BaseVideo, 'metadata'> {
  type: 'video';
  metadata: VideoMetadata;
}

// ===============================
// Unified Media Types
// ===============================

export type MediaItem = VideoWithType | Audiobook | Ebook;

// Type guards
export function isVideo(item: MediaItem): item is VideoWithType {
  return item.type === 'video';
}

export function isAudiobook(item: MediaItem): item is Audiobook {
  return item.type === 'audiobook';
}

export function isEbook(item: MediaItem): item is Ebook {
  return item.type === 'ebook';
}

// ===============================
// Media Categories
// ===============================

// Video categories remain unchanged (VideoCategories from video.ts)

export interface AudiobookCategories {
  genre: string[];
  narrator: string[];
  language: string[];
  series: string[];
}

export interface EbookCategories {
  genre: string[];
  subject: string[];
  language: string[];
  series: string[];
  format: string[];
}

export type MediaCategories = VideoCategories | AudiobookCategories | EbookCategories;

// ===============================
// Media Filter State
// ===============================

export interface MediaFilterState {
  mediaTypes: MediaType[];
  authors: string[];
  narrators: string[];
  genres: string[];
  series: string[];
  formats: EbookFormat[];
  // Existing video filters
  selectedCategories: string[];
  searchQuery: string;
  dateRange: {
    startDate: string;
    endDate: string;
  };
  fileSizeRange: {
    min: number;
    max: number;
  };
  durationRange: {
    min: number;
    max: number;
  };
}

// ===============================
// Media Manager State
// ===============================

export interface MediaManagerState {
  // All media items
  videos: VideoWithType[];
  audiobooks: Audiobook[];
  ebooks: Ebook[];

  // Filtered results
  filteredMedia: MediaItem[];

  // Active media type filter
  activeMediaTypes: MediaType[];

  // Selection state
  selectedIds: Set<string>;
  currentItem: MediaItem | null;

  // Scan state
  isScanning: boolean;
  scanProgress: {
    current: number;
    total: number;
    mediaType: MediaType | null;
  };

  // Filter state
  filters: MediaFilterState;

  // Sort state
  sort: {
    field: MediaSortField;
    direction: 'asc' | 'desc';
  };

  // Available filter options (computed from library)
  availableAuthors: string[];
  availableNarrators: string[];
  availableGenres: string[];
  availableSeries: string[];
}

export type MediaSortField =
  | 'title'
  | 'author'
  | 'lastModified'
  | 'size'
  | 'duration'
  | 'progress';

// ===============================
// API Response Types
// ===============================

export interface MediaScanResult {
  videos: VideoWithType[];
  audiobooks: Audiobook[];
  ebooks: Ebook[];
  errors: ScanError[];
}

export interface ScanError {
  path: string;
  error: string;
  mediaType?: MediaType;
}

// ===============================
// Author/Series Aggregation
// ===============================

export interface Author {
  name: string;
  audiobooks: Audiobook[];
  ebooks: Ebook[];
  totalItems: number;
}

export interface Series {
  name: string;
  author: string;
  items: (Audiobook | Ebook)[];
  totalItems: number;
}

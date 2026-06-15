export interface VideoMetadata {
  duration: number;
  width: number;
  height: number;
  bitrate: number;
  codec: string;
  fps: number;
  aspectRatio: string;
}

export interface VideoThumbnail {
  dataUrl: string;
  generated: boolean;
  timestamp: string;
}

export interface VideoCategories {
  [type: string]: string[];
  age: string[];
  physical: string[];
  ethnicity: string[];
  relationship: string[];
  acts: string[];
  setting: string[];
  quality: string[];
  performer: string[];
}

export interface CustomCategories {
  [type: string]: string[];
}

export interface FilterPreset {
  name: string;
  categories: string[];
  searchQuery: string;
  dateRange: { startDate: string; endDate: string };
  fileSizeRange: { min: number; max: number };
  durationRange: { min: number; max: number };
  createdAt: string;
  updatedAt: string;
}

export interface VideoShape {
  type?: 'video'; // discriminator for unified MediaItem type
  id: string;
  filename: string;
  displayName: string;
  path: string;
  size: number;
  lastModified: string;
  categories: VideoCategories;
  customCategories: CustomCategories;
  metadata: VideoMetadata;
  thumbnail?: VideoThumbnail | null;
  rootKey?: string;
}

// ===============================
// Audiobook Types
// ===============================

export interface AudiobookChapter {
  index: number;
  title: string;
  path: string;
  duration: number;
  startTime: number;
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

export interface AudiobookShape {
  type: 'audiobook';
  id: string;
  title: string;
  author: string;
  path: string;
  chapters: AudiobookChapter[];
  totalDuration: number;
  totalSize: number;
  coverImage?: string;
  metadata: AudiobookMetadata;
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
  publisher?: string;
  publishDate?: string;
  isbn?: string;
  series?: string;
  seriesIndex?: number;
  description?: string;
  language?: string;
  pageCount?: number;
  subjects?: string[];
  opfPath?: string;
  calibreId?: string;
  calibreTimestamp?: string;
}

export interface EbookShape {
  type: 'ebook';
  id: string;
  title: string;
  author: string;
  path: string;
  files: EbookFile[];
  coverImage?: string;
  metadata: EbookMetadata;
  lastModified: string;
  rootKey?: string;
}

export type MediaType = 'video' | 'audiobook' | 'ebook';

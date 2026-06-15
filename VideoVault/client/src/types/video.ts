export interface VideoMetadata {
  duration: number; // seconds
  width: number;
  height: number;
  bitrate: number; // kbps
  codec: string;
  fps: number;
  aspectRatio: string;
}

export interface VideoThumbnail {
  dataUrl: string;
  generated: boolean;
  timestamp: string;
  thumbnails?: string[]; // Array of 3 thumbnail dataUrls for hover cycling
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

export interface Video {
  type?: 'video'; // discriminator for unified MediaItem type (optional for backwards compatibility)
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
  rootKey?: string; // scanned root identifier for FS operations
  hashFast?: string;
  hashPerceptual?: string;
}

export interface Category {
  type: string;
  value: string;
  count: number;
  isCustom: boolean;
  url?: string;
}

export interface FilterPreset {
  name: string;
  categories: string[];
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
  createdAt: string;
  updatedAt: string;
}

export interface VideoManagerState {
  videos: Video[];
  filteredVideos: Video[];
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
  isScanning: boolean;
  scanProgress: {
    current: number;
    total: number;
  };
  currentVideo: Video | null;
  availableCategories: Category[];
  knownTags: Category[];
  pinnedVideoId: string | null;
}

export type SortField = 'displayName' | 'lastModified' | 'size' | 'path' | 'categoryCount' | 'unassignedCount';
export type SortDirection = 'asc' | 'desc';

declare module './video' { }

// Extend after existing interfaces to avoid disrupting imports
export interface VideoManagerState {
  sort?: {
    field: SortField;
    direction: SortDirection;
  };
  isProgressiveLoading?: boolean;
}

// New filter types
export interface FileSizeFilter {
  label: string;
  min: number;
  max: number;
}

export interface DurationFilter {
  label: string;
  min: number;
  max: number;
}

export interface AdvancedFilters {
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

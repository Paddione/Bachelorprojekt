import { sql } from 'drizzle-orm';
import { pgTable, text, varchar, jsonb, bigint, timestamp, index, uniqueIndex, primaryKey, boolean } from 'drizzle-orm/pg-core';
import type { VideoShape, FilterPreset, VideoThumbnail } from '@shared/types';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';

export const users = pgTable('users', {
  id: varchar('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  username: text('username').notNull().unique(),
  password: text('password').notNull(),
  isAdmin: boolean('is_admin').default(false).notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Videos persisted for all users (shared library)
export const videos = pgTable(
  'videos',
  {
    id: varchar('id').primaryKey(),
    filename: text('filename').notNull(),
    displayName: text('display_name').notNull(),
    path: text('path').notNull(),
    size: bigint('size', { mode: 'number' }).notNull(),
    lastModified: timestamp('last_modified', { withTimezone: false }).notNull(),
    metadata: jsonb('metadata').$type<VideoShape['metadata']>().notNull(),
    categories: jsonb('categories').$type<VideoShape['categories']>().notNull(),
    customCategories: jsonb('custom_categories').$type<VideoShape['customCategories']>().notNull(),
    thumbnail: jsonb('thumbnail').$type<VideoThumbnail | null>(),
    rootKey: text('root_key'),
    hashFast: text('hash_fast'),
    hashPerceptual: text('hash_perceptual'),
    // New metadata columns (0002_thumbnail_storage migration)
    bitrate: bigint('bitrate', { mode: 'number' }),
    codec: varchar('codec', { length: 50 }),
    fps: text('fps').$type<number>(),
    aspectRatio: varchar('aspect_ratio', { length: 20 }),
    fileHash: text('file_hash'),
    metadataExtractedAt: timestamp('metadata_extracted_at', { withTimezone: false }),
    processingStatus: varchar('processing_status', { length: 20 }).default('pending'),
  },
  (table) => {
    return {
      idxVideosPath: index('idx_videos_path').on(table.path),
      idxVideosLastModified: index('idx_videos_last_modified').on(table.lastModified),
      idxVideosSize: index('idx_videos_size').on(table.size),
      idxVideosPathLastModified: index('idx_videos_path_last_modified').on(
        table.path,
        table.lastModified,
      ),
      idxVideosCategoriesGin: index('idx_videos_categories_gin').on(table.categories),
      idxVideosCustomCategoriesGin: index('idx_videos_custom_categories_gin').on(
        table.customCategories,
      ),
      idxVideosHashFast: index('idx_videos_hash_fast').on(table.hashFast),
      idxVideosHashPerceptual: index('idx_videos_hash_perceptual').on(table.hashPerceptual),
      idxVideosFileHash: uniqueIndex('idx_videos_file_hash').on(table.fileHash),
      idxVideosProcessingStatus: index('idx_videos_processing_status').on(table.processingStatus),
      idxVideosBitrate: index('idx_videos_bitrate').on(table.bitrate),
      idxVideosFps: index('idx_videos_fps').on(table.fps),
    };
  },
);

// Directory roots and their tracked directories
export const directoryRoots = pgTable('directory_roots', {
  rootKey: text('root_key').primaryKey(),
  name: text('name').notNull(),
  // Stored as array in JSONB for flexibility
  directories: jsonb('directories').$type<string[]>().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: false })
    .default(sql`now()`)
    .notNull(),
});

// App-level settings (e.g., last_root_key)
export const appSettings = pgTable('app_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: false })
    .default(sql`now()`)
    .notNull(),
});

// Filter presets (shared across users)
export const filterPresets = pgTable('filter_presets', {
  id: varchar('id').primaryKey(),
  name: text('name').notNull(),
  payload: jsonb('payload').$type<FilterPreset>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: false })
    .default(sql`now()`)
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: false })
    .default(sql`now()`)
    .notNull(),
});

// Client error logs (admin)
export const clientErrors = pgTable('client_errors', {
  id: varchar('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  errorId: text('error_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: false })
    .default(sql`now()`)
    .notNull(),
  message: text('message').notNull(),
  code: text('code').notNull(),
  severity: text('severity').notNull(),
  context: jsonb('context')
    .$type<Record<string, unknown> | null>()
    .default(sql`null`),
  userAgent: text('user_agent'),
  url: text('url'),
  stack: text('stack'),
  requestId: text('request_id'),
  ip: text('ip'),
});

export type DBVideo = typeof videos.$inferSelect;
export type InsertDBVideo = typeof videos.$inferInsert;
export type DirectoryRoot = typeof directoryRoots.$inferSelect;
export type InsertDirectoryRoot = typeof directoryRoots.$inferInsert;
export type AppSetting = typeof appSettings.$inferSelect;
export type InsertAppSetting = typeof appSettings.$inferInsert;
export type DBFilterPreset = typeof filterPresets.$inferSelect;
export type InsertDBFilterPreset = typeof filterPresets.$inferInsert;
export type DBClientError = typeof clientErrors.$inferSelect;
export type InsertDBClientError = typeof clientErrors.$inferInsert;

// Tag library (pre-defined tags with metadata)
export const tags = pgTable(
  'tags',
  {
    id: varchar('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    name: text('name').notNull(),
    type: text('type').default('general').notNull(),
    url: text('url'),
    count: bigint('count', { mode: 'number' }).default(0),
    createdAt: timestamp('created_at', { withTimezone: false })
      .default(sql`now()`)
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: false })
      .default(sql`now()`)
      .notNull(),
  },
  (table) => {
    return {
      idxTagsName: index('idx_tags_name').on(table.name),
      idxTagsType: index('idx_tags_type').on(table.type),
    };
  },
);

export type DBTag = typeof tags.$inferSelect;
export type InsertDBTag = typeof tags.$inferInsert;

export const tagSynonyms = pgTable('tag_synonyms', {
  source: text('source').primaryKey(),
  target: text('target').notNull(),
  createdAt: timestamp('created_at', { withTimezone: false })
    .default(sql`now()`)
    .notNull(),
});

export type DBTagSynonym = typeof tagSynonyms.$inferSelect;
export type InsertDBTagSynonym = typeof tagSynonyms.$inferInsert;

export const duplicateIgnores = pgTable(
  'duplicate_ignores',
  {
    video1: text('video1').notNull(),
    video2: text('video2').notNull(),
    createdAt: timestamp('created_at', { withTimezone: false })
      .default(sql`now()`)
      .notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.video1, t.video2] }),
  }),
);

export type DBDuplicateIgnore = typeof duplicateIgnores.$inferSelect;
export type InsertDBDuplicateIgnore = typeof duplicateIgnores.$inferInsert;

// ========================================
// Thumbnail Storage & Background Processing Infrastructure
// (Added in 0002_thumbnail_storage migration)
// ========================================

// Thumbnails and sprites stored as files with metadata in database
export const thumbnails = pgTable(
  'thumbnails',
  {
    id: varchar('id')
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    videoId: varchar('video_id').notNull(),
    filePath: text('file_path').notNull(),
    type: varchar('type', { length: 20 }).notNull(), // 'thumbnail' | 'sprite'
    width: bigint('width', { mode: 'number' }).notNull(),
    height: bigint('height', { mode: 'number' }).notNull(),
    format: varchar('format', { length: 10 }).notNull(), // 'jpeg' | 'webp' | 'png'
    fileSize: bigint('file_size', { mode: 'number' }).notNull(),
    quality: text('quality').$type<number | null>(), // JPEG/WebP quality 0.0-1.0
    frameCount: bigint('frame_count', { mode: 'number' }), // For sprites: number of frames
    tileLayout: varchar('tile_layout', { length: 20 }), // For sprites: grid layout e.g., '25x1'
    generatedBy: varchar('generated_by', { length: 20 }).notNull(), // 'server-ffmpeg' | 'client-webcodecs'
    generationParams: jsonb('generation_params').$type<Record<string, unknown> | null>(),
    createdAt: timestamp('created_at', { withTimezone: false })
      .default(sql`now()`)
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: false })
      .default(sql`now()`)
      .notNull(),
  },
  (table) => {
    return {
      idxThumbnailsVideoId: index('idx_thumbnails_video_id').on(table.videoId),
      idxThumbnailsType: index('idx_thumbnails_type').on(table.type),
      idxThumbnailsCreatedAt: index('idx_thumbnails_created_at').on(table.createdAt),
      idxThumbnailsFilePath: index('idx_thumbnails_file_path').on(table.filePath),
    };
  },
);

export type DBThumbnail = typeof thumbnails.$inferSelect;
export type InsertDBThumbnail = typeof thumbnails.$inferInsert;

// Scan state tracking for incremental directory scanning
export const scanState = pgTable(
  'scan_state',
  {
    id: varchar('id')
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    rootKey: text('root_key').notNull(),
    relativePath: text('relative_path').notNull(),
    fileHash: text('file_hash').notNull(),
    fileSize: bigint('file_size', { mode: 'number' }).notNull(),
    lastModified: timestamp('last_modified', { withTimezone: false }).notNull(),
    metadataExtracted: varchar('metadata_extracted', { length: 5 })
      .default('false')
      .notNull(),
    thumbnailGenerated: varchar('thumbnail_generated', { length: 5 })
      .default('false')
      .notNull(),
    spriteGenerated: varchar('sprite_generated', { length: 5 })
      .default('false')
      .notNull(),
    lastScannedAt: timestamp('last_scanned_at', { withTimezone: false })
      .default(sql`now()`)
      .notNull(),
  },
  (table) => {
    return {
      idxScanStateRootKey: index('idx_scan_state_root_key').on(table.rootKey),
      idxScanStateLastModified: index('idx_scan_state_last_modified').on(table.lastModified),
      idxScanStateFileHash: index('idx_scan_state_file_hash').on(table.fileHash),
    };
  },
);

export type DBScanState = typeof scanState.$inferSelect;
export type InsertDBScanState = typeof scanState.$inferInsert;

// Background job queue for thumbnail/sprite generation and metadata extraction
export const processingJobs = pgTable(
  'processing_jobs',
  {
    id: varchar('id')
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    type: varchar('type', { length: 50 }).notNull(), // 'thumbnail' | 'sprite' | 'metadata' | 'hash'
    videoId: varchar('video_id'),
    rootKey: text('root_key'),
    relativePath: text('relative_path'),
    priority: bigint('priority', { mode: 'number' }).default(5).notNull(),
    status: varchar('status', { length: 20 }).default('pending').notNull(), // 'pending' | 'processing' | 'completed' | 'failed'
    attempts: bigint('attempts', { mode: 'number' }).default(0).notNull(),
    maxAttempts: bigint('max_attempts', { mode: 'number' }).default(3).notNull(),
    payload: jsonb('payload').$type<Record<string, unknown> | null>(),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at', { withTimezone: false })
      .default(sql`now()`)
      .notNull(),
    startedAt: timestamp('started_at', { withTimezone: false }),
    completedAt: timestamp('completed_at', { withTimezone: false }),
  },
  (table) => {
    return {
      idxJobsVideoId: index('idx_jobs_video_id').on(table.videoId),
      idxJobsType: index('idx_jobs_type').on(table.type),
      idxJobsCreatedAt: index('idx_jobs_created_at').on(table.createdAt),
      idxJobsStatus: index('idx_jobs_status').on(table.status),
    };
  },
);

export type DBProcessingJob = typeof processingJobs.$inferSelect;
export type InsertDBProcessingJob = typeof processingJobs.$inferInsert;

// ========================================
// Audiobook and Ebook Support
// (Added in 0003_add_audiobooks_ebooks migration)
// ========================================

import type {
  AudiobookShape,
  AudiobookChapter,
  AudiobookMetadata,
  EbookShape,
  EbookFile,
  EbookMetadata,
} from '@shared/types';

// Audiobooks table
export const audiobooks = pgTable(
  'audiobooks',
  {
    id: varchar('id').primaryKey(),
    title: text('title').notNull(),
    author: text('author').notNull(),
    path: text('path').notNull(),
    totalDuration: bigint('total_duration', { mode: 'number' }).notNull(),
    totalSize: bigint('total_size', { mode: 'number' }).notNull(),
    coverImage: text('cover_image'),
    metadata: jsonb('metadata').$type<AudiobookMetadata>().notNull(),
    lastModified: timestamp('last_modified', { withTimezone: false }).notNull(),
    rootKey: text('root_key'),
    createdAt: timestamp('created_at', { withTimezone: false })
      .default(sql`now()`)
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: false })
      .default(sql`now()`)
      .notNull(),
  },
  (table) => {
    return {
      idxAudiobooksPath: index('idx_audiobooks_path').on(table.path),
      idxAudiobooksAuthor: index('idx_audiobooks_author').on(table.author),
      idxAudiobooksTitle: index('idx_audiobooks_title').on(table.title),
      idxAudiobooksLastModified: index('idx_audiobooks_last_modified').on(table.lastModified),
      idxAudiobooksRootKey: index('idx_audiobooks_root_key').on(table.rootKey),
    };
  },
);

export type DBAudiobook = typeof audiobooks.$inferSelect;
export type InsertDBAudiobook = typeof audiobooks.$inferInsert;

// Audiobook chapters table
export const audiobookChapters = pgTable(
  'audiobook_chapters',
  {
    id: varchar('id')
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    audiobookId: varchar('audiobook_id')
      .notNull()
      .references(() => audiobooks.id, { onDelete: 'cascade' }),
    index: bigint('index', { mode: 'number' }).notNull(),
    title: text('title').notNull(),
    path: text('path').notNull(),
    duration: bigint('duration', { mode: 'number' }).notNull(),
    startTime: bigint('start_time', { mode: 'number' }).notNull(),
    fileSize: bigint('file_size', { mode: 'number' }).notNull(),
  },
  (table) => {
    return {
      idxChaptersAudiobookId: index('idx_chapters_audiobook_id').on(table.audiobookId),
      idxChaptersIndex: index('idx_chapters_index').on(table.index),
    };
  },
);

export type DBAudiobookChapter = typeof audiobookChapters.$inferSelect;
export type InsertDBAudiobookChapter = typeof audiobookChapters.$inferInsert;

// Ebooks table
export const ebooks = pgTable(
  'ebooks',
  {
    id: varchar('id').primaryKey(),
    title: text('title').notNull(),
    author: text('author').notNull(),
    path: text('path').notNull(),
    coverImage: text('cover_image'),
    metadata: jsonb('metadata').$type<EbookMetadata>().notNull(),
    lastModified: timestamp('last_modified', { withTimezone: false }).notNull(),
    rootKey: text('root_key'),
    createdAt: timestamp('created_at', { withTimezone: false })
      .default(sql`now()`)
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: false })
      .default(sql`now()`)
      .notNull(),
  },
  (table) => {
    return {
      idxEbooksPath: index('idx_ebooks_path').on(table.path),
      idxEbooksAuthor: index('idx_ebooks_author').on(table.author),
      idxEbooksTitle: index('idx_ebooks_title').on(table.title),
      idxEbooksLastModified: index('idx_ebooks_last_modified').on(table.lastModified),
      idxEbooksRootKey: index('idx_ebooks_root_key').on(table.rootKey),
    };
  },
);

export type DBEbook = typeof ebooks.$inferSelect;
export type InsertDBEbook = typeof ebooks.$inferInsert;

// Ebook files table (multiple formats per book)
export const ebookFiles = pgTable(
  'ebook_files',
  {
    id: varchar('id')
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    ebookId: varchar('ebook_id')
      .notNull()
      .references(() => ebooks.id, { onDelete: 'cascade' }),
    format: varchar('format', { length: 10 }).notNull(), // 'epub' | 'pdf' | 'mobi' | 'azw3' | 'txt'
    path: text('path').notNull(),
    fileSize: bigint('file_size', { mode: 'number' }).notNull(),
  },
  (table) => {
    return {
      idxFilesEbookId: index('idx_files_ebook_id').on(table.ebookId),
      idxFilesFormat: index('idx_files_format').on(table.format),
    };
  },
);

export type DBEbookFile = typeof ebookFiles.$inferSelect;
export type InsertDBEbookFile = typeof ebookFiles.$inferInsert;

// Media progress tracking (unified for all media types)
export const mediaProgress = pgTable(
  'media_progress',
  {
    id: varchar('id')
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    mediaType: varchar('media_type', { length: 20 }).notNull(), // 'video' | 'audiobook' | 'ebook'
    mediaId: varchar('media_id').notNull(),
    userId: varchar('user_id'), // optional user association
    // Audiobook progress
    chapterIndex: bigint('chapter_index', { mode: 'number' }),
    position: bigint('position', { mode: 'number' }), // seconds for audiobook, percentage * 100 for ebook
    // Ebook progress
    format: varchar('format', { length: 10 }), // which format was being read
    location: text('location'), // EPUB CFI or page number
    // Video progress
    watchedSeconds: bigint('watched_seconds', { mode: 'number' }),
    // Common fields
    percentage: bigint('percentage', { mode: 'number' }).default(0), // 0-100
    completed: varchar('completed', { length: 5 }).default('false').notNull(),
    lastAccessed: timestamp('last_accessed', { withTimezone: false })
      .default(sql`now()`)
      .notNull(),
    createdAt: timestamp('created_at', { withTimezone: false })
      .default(sql`now()`)
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: false })
      .default(sql`now()`)
      .notNull(),
  },
  (table) => {
    return {
      idxProgressMediaType: index('idx_progress_media_type').on(table.mediaType),
      idxProgressMediaId: index('idx_progress_media_id').on(table.mediaId),
      idxProgressUserId: index('idx_progress_user_id').on(table.userId),
      idxProgressLastAccessed: index('idx_progress_last_accessed').on(table.lastAccessed),
    };
  },
);

export type DBMediaProgress = typeof mediaProgress.$inferSelect;
export type InsertDBMediaProgress = typeof mediaProgress.$inferInsert;
// Session table for express-session (managed by connect-pg-simple)
export const session = pgTable('session', {
  sid: varchar('sid').primaryKey(),
  sess: jsonb('sess').notNull(),
  expire: timestamp('expire', { precision: 6 }).notNull(),
}, (table) => ({
  idxSessionExpire: index('IDX_session_expire').on(table.expire),
}));

export type DBSession = typeof session.$inferSelect;
export type InsertDBSession = typeof session.$inferInsert;

import { Video, VideoCategories, CustomCategories } from '@/types/video';
import { FileHandleRegistry } from './file-handle-registry';
import { DirectoryHandleRegistry } from './directory-handle-registry';
import { FileScanner } from './file-scanner';
import { CategoryNormalizer } from './category-normalizer';

export type SplitErrorCode =
  | 'missing_handle'
  | 'missing_directory'
  | 'invalid_split'
  | 'ffmpeg_failed'
  | 'permission_denied'
  | 'conflict';

export interface SplitSegmentInput {
  displayName: string;
  filename: string;
  categories: VideoCategories;
  customCategories: CustomCategories;
}

export interface SplitVideoOptions {
  splitTimeSeconds: number;
  first: SplitSegmentInput;
  second: SplitSegmentInput;
  onProgress?: (stage: string) => void;
}

export type SplitVideoResult =
  | { success: true; segments: [Video, Video] }
  | { success: false; message: string; code?: SplitErrorCode };

type FFmpegInstance = import('@ffmpeg/ffmpeg').FFmpeg;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
let ffmpegInstance: FFmpegInstance | null = null;

const FFMPEG_STAGE = {
  LOADING: 'loading_ffmpeg',
  PREP: 'preparing_input',
  SPLIT: 'splitting',
  WRITING: 'writing_files',
  HYDRATING: 'hydrating_metadata',
};

function ensureExtension(name: string, ext: string): string {
  const trimmed = name.trim().replace(/[/\\]/g, '');
  if (!trimmed.toLowerCase().endsWith(ext.toLowerCase())) {
    const sanitizedExt = ext.startsWith('.') ? ext : `.${ext}`;
    return `${trimmed}${sanitizedExt}`;
  }
  return trimmed;
}

function formatSeconds(seconds: number): string {
  return seconds.toFixed(2);
}

function deepCloneCategories(categories: VideoCategories): VideoCategories {
  return {
    age: [...(categories.age || [])],
    physical: [...(categories.physical || [])],
    ethnicity: [...(categories.ethnicity || [])],
    relationship: [...(categories.relationship || [])],
    acts: [...(categories.acts || [])],
    setting: [...(categories.setting || [])],
    quality: [...(categories.quality || [])],
    performer: [...(categories.performer || [])],
  };
}

async function ensurePermission(
  handle: FileSystemHandle,
  mode: 'read' | 'readwrite' = 'readwrite',
): Promise<boolean> {
  try {
    // @ts-expect-error - queryPermission is not in standard FileSystemHandle types but exists in browsers
    const current = await handle.queryPermission?.({ mode });
    if (current === 'granted') return true;
    // @ts-expect-error - requestPermission is not in standard FileSystemHandle types but exists in browsers
    const requested = await handle.requestPermission?.({ mode });
    return requested === 'granted';
  } catch {
    return true;
  }
}

async function getFFmpeg(onProgress?: (stage: string) => void): Promise<FFmpegInstance> {
  if (ffmpegInstance) return ffmpegInstance;
  onProgress?.(FFMPEG_STAGE.LOADING);
  const { FFmpeg } = await import('@ffmpeg/ffmpeg');
  const { toBlobURL } = await import('@ffmpeg/util');
  const ffmpeg = new FFmpeg();
  const coreURL = await toBlobURL('/ffmpeg/ffmpeg-core.js', 'text/javascript');
  const wasmURL = await toBlobURL('/ffmpeg/ffmpeg-core.wasm', 'application/wasm');
  await ffmpeg.load({ coreURL, wasmURL });
  ffmpegInstance = ffmpeg as FFmpegInstance;
  return ffmpegInstance;
}

async function writeOutputFile(
  parent: FileSystemDirectoryHandle,
  filename: string,
  data: Uint8Array,
  mimeType: string,
): Promise<FileSystemFileHandle> {
  const destHandle = await parent.getFileHandle(filename, { create: true });
  // FileSystemWritableFileStream is not fully typed in lib.dom.d.ts yet
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
  const writable = await (destHandle as any).createWritable();
  // Create a new Uint8Array to ensure proper ArrayBuffer type compatibility
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
  await writable.write(new Blob([new Uint8Array(data)], { type: mimeType || 'video/mp4' }));
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
  await writable.close();
  return destHandle;
}

async function detectConflicts(
  parent: FileSystemDirectoryHandle,
  filenames: string[],
): Promise<string | null> {
  for (const name of filenames) {
    const existing = await parent.getFileHandle(name, { create: false }).catch(() => null);
    if (existing) return name;
  }
  return null;
}

export class VideoSplitter {
  static async splitVideo(video: Video, options: SplitVideoOptions): Promise<SplitVideoResult> {
    const fileHandle = FileHandleRegistry.get(video.id);
    if (!fileHandle) {
      return {
        success: false,
        message: 'No file handle available. Rescan the root and try again.',
        code: 'missing_handle',
      };
    }
    const parentInfo = DirectoryHandleRegistry.getParentForFile(video.id);
    if (!parentInfo) {
      return {
        success: false,
        message: 'No directory handle for this video in the current session.',
        code: 'missing_directory',
      };
    }

    const duration = video.metadata?.duration || 0;
    if (!duration || options.splitTimeSeconds <= 0 || options.splitTimeSeconds >= duration) {
      return {
        success: false,
        message: 'Choose a split time inside the video duration.',
        code: 'invalid_split',
      };
    }

    const splitSeconds = Math.max(0.1, Math.min(duration - 0.1, options.splitTimeSeconds));
    const extMatch = video.filename.match(/\.[^./\\]+$/);
    const extension = extMatch ? extMatch[0] : '.mp4';
    const firstFilename = ensureExtension(options.first.filename, extension);
    const secondFilename = ensureExtension(options.second.filename, extension);
    if (firstFilename === secondFilename) {
      return { success: false, message: 'Output filenames must be different.', code: 'conflict' };
    }

    const hasPermission = await ensurePermission(parentInfo.parent, 'readwrite');
    if (!hasPermission) {
      return {
        success: false,
        message: 'File system permission denied for this directory.',
        code: 'permission_denied',
      };
    }

    const conflictName = await detectConflicts(parentInfo.parent, [firstFilename, secondFilename]);
    if (conflictName) {
      return {
        success: false,
        message: `A file named "${conflictName}" already exists in this directory.`,
        code: 'conflict',
      };
    }

    const ffmpeg = await getFFmpeg(options.onProgress);
    const { fetchFile } = await import('@ffmpeg/util');

    const inputName = `input${extension}`;
    const part1Name = `part1${extension}`;
    const part2Name = `part2${extension}`;

    try {
      options.onProgress?.(FFMPEG_STAGE.PREP);
      const sourceFile = await fileHandle.getFile();
      await ffmpeg.writeFile(inputName, await fetchFile(sourceFile));

      options.onProgress?.(FFMPEG_STAGE.SPLIT);
      const splitValue = formatSeconds(splitSeconds);
      const code1 = await ffmpeg.exec([
        '-i',
        inputName,
        '-t',
        splitValue,
        '-c',
        'copy',
        '-avoid_negative_ts',
        'make_zero',
        part1Name,
      ]);
      if (code1 !== 0) {
        throw Object.assign(new Error('Failed to create the first segment'), {
          code: 'ffmpeg_failed' as SplitErrorCode,
        });
      }
      const code2 = await ffmpeg.exec([
        '-i',
        inputName,
        '-ss',
        splitValue,
        '-c',
        'copy',
        '-avoid_negative_ts',
        'make_zero',
        part2Name,
      ]);
      if (code2 !== 0) {
        throw Object.assign(new Error('Failed to create the second segment'), {
          code: 'ffmpeg_failed' as SplitErrorCode,
        });
      }

      options.onProgress?.(FFMPEG_STAGE.WRITING);
      const part1Data = await ffmpeg.readFile(part1Name);
      const part2Data = await ffmpeg.readFile(part2Name);

      const created: Array<{ handle: FileSystemFileHandle; name: string }> = [];
      try {
        const part1Handle = await writeOutputFile(
          parentInfo.parent,
          firstFilename,
          part1Data as Uint8Array,
          sourceFile.type || 'video/mp4',
        );
        created.push({ handle: part1Handle, name: firstFilename });
        const part2Handle = await writeOutputFile(
          parentInfo.parent,
          secondFilename,
          part2Data as Uint8Array,
          sourceFile.type || 'video/mp4',
        );
        created.push({ handle: part2Handle, name: secondFilename });

        options.onProgress?.(FFMPEG_STAGE.HYDRATING);
        const parentPath = video.path.includes('/')
          ? video.path.slice(0, video.path.lastIndexOf('/') + 1)
          : '';
        const firstPath = `${parentPath}${firstFilename}`;
        const secondPath = `${parentPath}${secondFilename}`;

        const [firstFile, secondFile] = await Promise.all([
          part1Handle.getFile(),
          part2Handle.getFile(),
        ]);

        const firstVideo = await FileScanner.generateVideoMetadata(
          firstFile,
          part1Handle,
          firstPath,
          parentInfo.parent,
          parentInfo.rootKey,
        );

        const secondVideo = await FileScanner.generateVideoMetadata(
          secondFile,
          part2Handle,
          secondPath,
          parentInfo.parent,
          parentInfo.rootKey,
        );

        // Apply user-specified display names and tags
        const normalizedFirstCategories = CategoryNormalizer.normalizeStandardCategories(
          deepCloneCategories(options.first.categories),
        );
        const normalizedSecondCategories = CategoryNormalizer.normalizeStandardCategories(
          deepCloneCategories(options.second.categories),
        );
        const normalizedFirstCustom = CategoryNormalizer.normalizeCustomCategories(
          options.first.customCategories,
        );
        const normalizedSecondCustom = CategoryNormalizer.normalizeCustomCategories(
          options.second.customCategories,
        );

        const taggedFirst: Video = {
          ...firstVideo,
          displayName: options.first.displayName.trim() || firstVideo.displayName,
          categories: normalizedFirstCategories,
          customCategories: normalizedFirstCustom,
        };
        const taggedSecond: Video = {
          ...secondVideo,
          displayName: options.second.displayName.trim() || secondVideo.displayName,
          categories: normalizedSecondCategories,
          customCategories: normalizedSecondCustom,
        };

        return { success: true, segments: [taggedFirst, taggedSecond] };
      } catch (writeErr) {
        // Attempt to clean up partially created files
        await Promise.all(
          created.map(async ({ name }) => {
            try {
              await parentInfo.parent.removeEntry(name);
            } catch {}
          }),
        );
        throw writeErr;
      }
    } catch (err: unknown) {
      const error = err as { message?: string; code?: SplitErrorCode };
      const message = error?.message || 'Unable to split video.';
      const code: SplitErrorCode | undefined = error?.code;
      return { success: false, message, code: code || 'ffmpeg_failed' };
    } finally {
      try {
        await ffmpeg.deleteFile(inputName);
      } catch {}
      try {
        await ffmpeg.deleteFile(part1Name);
      } catch {}
      try {
        await ffmpeg.deleteFile(part2Name);
      } catch {}
    }
  }
}

import { useState, useCallback, useMemo, useEffect } from 'react';
import { Video, VideoCategories, CustomCategories, Category } from '@/types/video';
import { buildNameFromCategories, getFilenameWithOriginalExt } from '@/services/rename-engine';
import { CategoryNormalizer } from '@/services/category-normalizer';

export interface FocusModeState {
  video: Video | null;
  pendingCategories: VideoCategories;
  pendingCustomCategories: CustomCategories;
  pendingDisplayName: string;
  pendingFilename: string;
  isDirty: boolean;
  isLoading: boolean;
  error: string | null;
}

export interface UseFocusModeOptions {
  videos: Video[];
  filteredVideos: Video[];
  availableCategories: Category[];
  initialVideoId?: string;
  onUpdateCategories: (
    videoId: string,
    categories: Partial<{ categories: VideoCategories; customCategories: CustomCategories }>,
  ) => void;
  onRename: (
    videoId: string,
    newBaseName: string,
    applyTo: 'displayName' | 'filename' | 'both',
  ) => Promise<{ success: boolean; message?: string }>;
}

export interface UseFocusModeReturn {
  state: FocusModeState;
  // Navigation
  currentIndex: number;
  totalCount: number;
  canGoPrev: boolean;
  canGoNext: boolean;
  goToPrev: () => void;
  goToNext: () => void;
  goToVideo: (videoId: string) => void;
  // Category management
  addCategory: (type: string, value: string, isCustom?: boolean) => void;
  removeCategory: (type: string, value: string, isCustom?: boolean) => void;
  // Rename management
  setDisplayName: (name: string) => void;
  setFilename: (name: string) => void;
  generateNameFromCategories: () => void;
  // Save/discard
  save: () => Promise<{ success: boolean; message?: string }>;
  discard: () => void;
  // Helpers
  getAvailableValuesForType: (type: string, isCustom?: boolean) => string[];
  getPopularValuesForType: (type: string, isCustom?: boolean) => string[];
}

const STANDARD_CATEGORY_TYPES = [
  'age',
  'physical',
  'ethnicity',
  'relationship',
  'acts',
  'setting',
  'quality',
  'performer',
] as const;

const createEmptyCategories = (): VideoCategories => ({
  age: [],
  physical: [],
  ethnicity: [],
  relationship: [],
  acts: [],
  setting: [],
  quality: [],
  performer: [],
});

export function useFocusMode({
  videos,
  filteredVideos,
  availableCategories,
  initialVideoId,
  onUpdateCategories,
  onRename,
}: UseFocusModeOptions): UseFocusModeReturn {
  const [currentVideoId, setCurrentVideoId] = useState<string | null>(initialVideoId || null);
  const [pendingCategories, setPendingCategories] = useState<VideoCategories>(createEmptyCategories());
  const [pendingCustomCategories, setPendingCustomCategories] = useState<CustomCategories>({});
  const [pendingDisplayName, setPendingDisplayName] = useState('');
  const [pendingFilename, setPendingFilename] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Find current video
  const currentVideo = useMemo(
    () => videos.find((v) => v.id === currentVideoId) || null,
    [videos, currentVideoId],
  );

  // Find index in filtered list for navigation
  const currentIndex = useMemo(
    () => (currentVideoId ? filteredVideos.findIndex((v) => v.id === currentVideoId) : -1),
    [filteredVideos, currentVideoId],
  );

  const totalCount = filteredVideos.length;
  const canGoPrev = currentIndex > 0;
  const canGoNext = currentIndex < totalCount - 1 && currentIndex >= 0;

  // Sync state when video changes
  useEffect(() => {
    if (currentVideo) {
      setPendingCategories({ ...currentVideo.categories });
      setPendingCustomCategories({ ...currentVideo.customCategories });
      setPendingDisplayName(currentVideo.displayName);
      setPendingFilename(currentVideo.filename);
      setError(null);
    } else {
      setPendingCategories(createEmptyCategories());
      setPendingCustomCategories({});
      setPendingDisplayName('');
      setPendingFilename('');
    }
  }, [currentVideo]);

  // Calculate if dirty
  const isDirty = useMemo(() => {
    if (!currentVideo) return false;

    // Check display name
    if (pendingDisplayName !== currentVideo.displayName) return true;

    // Check filename (base name only)
    const currentBase = currentVideo.filename.replace(/\.[^./\\]+$/, '');
    const pendingBase = pendingFilename.replace(/\.[^./\\]+$/, '');
    if (pendingBase !== currentBase) return true;

    // Check categories
    for (const type of STANDARD_CATEGORY_TYPES) {
      const current = currentVideo.categories[type] || [];
      const pending = pendingCategories[type] || [];
      if (current.length !== pending.length) return true;
      const currentSet = new Set(current.map((v) => v.toLowerCase()));
      const pendingSet = new Set(pending.map((v) => v.toLowerCase()));
      for (const v of currentSet) {
        if (!pendingSet.has(v)) return true;
      }
    }

    // Check custom categories
    const currentCustomKeys = Object.keys(currentVideo.customCategories);
    const pendingCustomKeys = Object.keys(pendingCustomCategories);
    if (currentCustomKeys.length !== pendingCustomKeys.length) return true;
    for (const key of currentCustomKeys) {
      const current = currentVideo.customCategories[key] || [];
      const pending = pendingCustomCategories[key] || [];
      if (current.length !== pending.length) return true;
      const currentSet = new Set(current.map((v) => v.toLowerCase()));
      const pendingSet = new Set(pending.map((v) => v.toLowerCase()));
      for (const v of currentSet) {
        if (!pendingSet.has(v)) return true;
      }
    }

    return false;
  }, [currentVideo, pendingCategories, pendingCustomCategories, pendingDisplayName, pendingFilename]);

  // Navigation
  const goToPrev = useCallback(() => {
    if (!canGoPrev) return;
    const prevVideo = filteredVideos[currentIndex - 1];
    if (prevVideo) setCurrentVideoId(prevVideo.id);
  }, [canGoPrev, currentIndex, filteredVideos]);

  const goToNext = useCallback(() => {
    if (!canGoNext) return;
    const nextVideo = filteredVideos[currentIndex + 1];
    if (nextVideo) setCurrentVideoId(nextVideo.id);
  }, [canGoNext, currentIndex, filteredVideos]);

  const goToVideo = useCallback((videoId: string) => {
    setCurrentVideoId(videoId);
  }, []);

  // Category management
  const addCategory = useCallback(
    (type: string, value: string, isCustom = false) => {
      const normalizedValue = CategoryNormalizer.normalizeValue(value);
      if (!normalizedValue) return;

      if (isCustom) {
        setPendingCustomCategories((prev) => {
          const existing = prev[type] || [];
          if (CategoryNormalizer.isDuplicateIgnoreCase(existing, normalizedValue)) {
            return prev;
          }
          return {
            ...prev,
            [type]: CategoryNormalizer.normalizeArray([...existing, normalizedValue]),
          };
        });
      } else {
        setPendingCategories((prev) => {
          const existing = prev[type as keyof VideoCategories] || [];
          if (CategoryNormalizer.isDuplicateIgnoreCase(existing, normalizedValue)) {
            return prev;
          }
          return {
            ...prev,
            [type]: CategoryNormalizer.normalizeArray([...existing, normalizedValue]),
          };
        });
      }
    },
    [],
  );

  const removeCategory = useCallback(
    (type: string, value: string, isCustom = false) => {
      const normalizedValue = CategoryNormalizer.normalizeValue(value);

      if (isCustom) {
        setPendingCustomCategories((prev) => {
          const existing = prev[type] || [];
          const filtered = existing.filter(
            (v) => CategoryNormalizer.normalizeValue(v) !== normalizedValue,
          );
          if (filtered.length === 0) {
            const { [type]: _, ...rest } = prev;
            return rest;
          }
          return { ...prev, [type]: filtered };
        });
      } else {
        setPendingCategories((prev) => {
          const existing = prev[type as keyof VideoCategories] || [];
          const filtered = existing.filter(
            (v) => CategoryNormalizer.normalizeValue(v) !== normalizedValue,
          );
          return { ...prev, [type]: filtered };
        });
      }
    },
    [],
  );

  // Rename management
  const setDisplayName = useCallback((name: string) => {
    setPendingDisplayName(name);
  }, []);

  const setFilename = useCallback((name: string) => {
    setPendingFilename(name);
  }, []);

  const generateNameFromCategories = useCallback(() => {
    if (!currentVideo) return;

    // Create a temporary video object with pending categories to generate name
    const tempVideo: Video = {
      ...currentVideo,
      categories: pendingCategories,
      customCategories: pendingCustomCategories,
    };

    const generatedName = buildNameFromCategories(tempVideo);
    if (generatedName) {
      setPendingDisplayName(generatedName);
      // Also update filename with original extension
      const ext = currentVideo.filename.match(/\.[^./\\]+$/)?.[0] || '';
      setPendingFilename(generatedName + ext);
    }
  }, [currentVideo, pendingCategories, pendingCustomCategories]);

  // Save/discard
  const save = useCallback(async (): Promise<{ success: boolean; message?: string }> => {
    if (!currentVideo || !isDirty) {
      return { success: true };
    }

    setIsLoading(true);
    setError(null);

    try {
      // Update categories
      onUpdateCategories(currentVideo.id, {
        categories: pendingCategories,
        customCategories: pendingCustomCategories,
      });

      // Check if rename is needed
      const displayNameChanged = pendingDisplayName !== currentVideo.displayName;
      const filenameChanged =
        pendingFilename.replace(/\.[^./\\]+$/, '') !==
        currentVideo.filename.replace(/\.[^./\\]+$/, '');

      if (displayNameChanged || filenameChanged) {
        let applyTo: 'displayName' | 'filename' | 'both' = 'both';
        if (displayNameChanged && !filenameChanged) {
          applyTo = 'displayName';
        } else if (!displayNameChanged && filenameChanged) {
          applyTo = 'filename';
        }

        const baseName = pendingFilename.replace(/\.[^./\\]+$/, '');
        const renameResult = await onRename(currentVideo.id, baseName, applyTo);

        if (!renameResult.success) {
          setError(renameResult.message || 'Rename failed');
          setIsLoading(false);
          return renameResult;
        }
      }

      setIsLoading(false);
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Save failed';
      setError(message);
      setIsLoading(false);
      return { success: false, message };
    }
  }, [
    currentVideo,
    isDirty,
    pendingCategories,
    pendingCustomCategories,
    pendingDisplayName,
    pendingFilename,
    onUpdateCategories,
    onRename,
  ]);

  const discard = useCallback(() => {
    if (currentVideo) {
      setPendingCategories({ ...currentVideo.categories });
      setPendingCustomCategories({ ...currentVideo.customCategories });
      setPendingDisplayName(currentVideo.displayName);
      setPendingFilename(currentVideo.filename);
      setError(null);
    }
  }, [currentVideo]);

  // Helpers for getting available values
  const getAvailableValuesForType = useCallback(
    (type: string, isCustom = false): string[] => {
      const values: string[] = [];
      const seen = new Set<string>();

      availableCategories
        .filter((c) => c.isCustom === isCustom && c.type === type)
        .forEach((c) => {
          const normalized = CategoryNormalizer.normalizeValue(c.value);
          if (normalized && !seen.has(normalized.toLowerCase())) {
            seen.add(normalized.toLowerCase());
            values.push(normalized);
          }
        });

      return values.sort((a, b) => a.localeCompare(b));
    },
    [availableCategories],
  );

  const getPopularValuesForType = useCallback(
    (type: string, isCustom = false): string[] => {
      const values = availableCategories
        .filter((c) => c.isCustom === isCustom && c.type === type)
        .sort((a, b) => (b.count || 0) - (a.count || 0))
        .slice(0, 10)
        .map((c) => CategoryNormalizer.normalizeValue(c.value))
        .filter((v): v is string => !!v);

      // Deduplicate
      const seen = new Set<string>();
      return values.filter((v) => {
        const lower = v.toLowerCase();
        if (seen.has(lower)) return false;
        seen.add(lower);
        return true;
      });
    },
    [availableCategories],
  );

  return {
    state: {
      video: currentVideo,
      pendingCategories,
      pendingCustomCategories,
      pendingDisplayName,
      pendingFilename,
      isDirty,
      isLoading,
      error,
    },
    currentIndex,
    totalCount,
    canGoPrev,
    canGoNext,
    goToPrev,
    goToNext,
    goToVideo,
    addCategory,
    removeCategory,
    setDisplayName,
    setFilename,
    generateNameFromCategories,
    save,
    discard,
    getAvailableValuesForType,
    getPopularValuesForType,
  };
}

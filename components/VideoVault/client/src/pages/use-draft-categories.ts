import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Video, VideoCategories, CustomCategories } from '@/types/video';
import { STANDARD_TYPES } from './categorize-queries';

export function useDraftCategories(video: Video | null,
  flush: (videoId: string, cats: VideoCategories, custom: CustomCategories) => void) {
  const [draftCats, setDraftCats] = useState<VideoCategories | null>(null);
  const [draftCustom, setDraftCustom] = useState<CustomCategories | null>(null);
  const lastFlushedId = useRef<string | null>(null);
  const currentVideoId = video?.id ?? null;

  const flushDraft = useCallback(() => {
    if (!currentVideoId || !draftCats || !draftCustom) return;
    if (lastFlushedId.current === currentVideoId) return;
    flush(currentVideoId, draftCats, draftCustom);
    lastFlushedId.current = currentVideoId;
  }, [currentVideoId, draftCats, draftCustom, flush]);

  useEffect(() => {
    if (lastFlushedId.current && lastFlushedId.current !== currentVideoId && draftCats && draftCustom) {
      flush(lastFlushedId.current, draftCats, draftCustom);
    }
    if (video) {
      setDraftCats({ ...video.categories });
      setDraftCustom({ ...video.customCategories });
    } else {
      setDraftCats(null);
      setDraftCustom(null);
    }
    lastFlushedId.current = null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentVideoId]);

  const isDirty = useMemo(() => {
    if (!video || !draftCats || !draftCustom) return false;
    return JSON.stringify(draftCats) !== JSON.stringify(video.categories)
      || JSON.stringify(draftCustom) !== JSON.stringify(video.customCategories);
  }, [video, draftCats, draftCustom]);

  const mutate = useCallback((type: string, value: string, add: boolean) => {
    lastFlushedId.current = null;
    if (STANDARD_TYPES.includes(type)) {
      setDraftCats((prev) => {
        if (!prev) return prev;
        const existing = (prev[type] as string[]) || [];
        if (add && existing.includes(value)) return prev;
        return { ...prev, [type]: add ? [...existing, value] : existing.filter((v) => v !== value) };
      });
    } else {
      setDraftCustom((prev) => {
        if (!prev) return prev;
        const existing = prev[type] || [];
        if (add) {
          if (existing.includes(value)) return prev;
          return { ...prev, [type]: [...existing, value] };
        }
        const filtered = existing.filter((v) => v !== value);
        const next = { ...prev };
        if (filtered.length === 0) delete next[type];
        else next[type] = filtered;
        return next;
      });
    }
  }, []);

  const setAll = useCallback((cats: VideoCategories, custom: CustomCategories) => {
    setDraftCats({ ...cats });
    setDraftCustom({ ...custom });
    lastFlushedId.current = null;
  }, []);

  return {
    categories: draftCats, customCategories: draftCustom, isDirty,
    addCategory: (t: string, v: string) => mutate(t, v, true),
    removeCategory: (t: string, v: string) => mutate(t, v, false),
    setAll, flushDraft,
  };
}

export type DraftCategories = ReturnType<typeof useDraftCategories>;

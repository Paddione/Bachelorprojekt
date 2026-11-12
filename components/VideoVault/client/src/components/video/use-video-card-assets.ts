import { useEffect, useMemo } from 'react';
import type { Video } from '@/types/video';
import { ThumbnailGenerator } from '@/services/thumbnail-generator';
import { SpriteCache } from '@/services/sprite-cache';
import { getSpriteMeta, setSpriteMeta } from '@/services/sprite-indexeddb';
import { getThumbnailSrc, getSpriteSrc } from '@/lib/video-urls';

export type SetSprite = (url: string, cols: number, fw: number, fh: number) => void;

async function runProgressiveGen(video: Video, serverThumbUrl: string,
  onThumb: (u: string) => void, onSprite: (u: string) => void, alive: () => boolean): Promise<void> {
  if (serverThumbUrl) return;
  if ((video.thumbnail?.dataUrl ?? '').trim() !== '' || !alive()) return;
  try {
    const opts = { quality: 'auto', speed: 'auto', progressive: true } as const;
    await ThumbnailGenerator.generateProgressiveForVideo(video.id, video.filename, opts, (update) => {
      if (!alive()) return;
      if (update.low) onThumb(update.low.dataUrl);
      if (update.high) onThumb(update.high.dataUrl);
      if (update.spriteSheet) onSprite(update.spriteSheet);
    });
  } catch { /* placeholder shown instead */ }
}

function spriteFromImage(url: string, frameW: number, persist: boolean, videoId: string, setSprite: SetSprite): void {
  const img = new Image();
  img.onload = async () => {
    const cols = Math.max(1, Math.floor(img.naturalWidth / frameW));
    setSprite(url, cols, frameW, img.naturalHeight);
    if (persist) {
      try { await setSpriteMeta(videoId, { cols, frameWidth: frameW, frameHeight: img.naturalHeight }); } catch { /* noop */ }
    }
  };
  img.src = url;
}

export interface SpriteSetters {
  setSheet: (u: string | null) => void;
  setCols: (n: number) => void;
  setFrameWidth: (n: number) => void;
}

export function useVideoCardAssets(video: Video, isVisible: boolean, localThumb: string,
  setLocalThumb: (u: string) => void, spriteSheetUrl: string | null, setSprite: SetSprite,
  setGenerated: (t: string[]) => void, sp: SpriteSetters): void {
  const serverThumbUrl = useMemo(() => getThumbnailSrc(video), [video]);
  const serverSpriteUrl = useMemo(() => getSpriteSrc(video), [video]);

  useEffect(() => {
    let mounted = true;
    if (!isVisible) return () => { mounted = false; };
    if (serverThumbUrl && !localThumb) {
      const img = new Image();
      img.onload = () => { if (mounted) setLocalThumb(serverThumbUrl); };
      img.src = serverThumbUrl;
    }
    if (serverSpriteUrl && !spriteSheetUrl) {
      const img = new Image();
      img.onload = () => {
        if (!mounted) return;
        const cols = Math.max(1, Math.round(img.naturalWidth / 160));
        setSprite(serverSpriteUrl, cols, Math.max(1, Math.round(img.naturalWidth / cols)), img.naturalHeight);
      };
      img.src = serverSpriteUrl;
    }
    return () => { mounted = false; };
  }, [video.id, serverThumbUrl, serverSpriteUrl, isVisible, localThumb, spriteSheetUrl, setSprite, setLocalThumb]);

  useEffect(() => {
    let alive = true;
    const thumbUrl = getThumbnailSrc(video);
    if (thumbUrl === undefined) return;
    const url: string = thumbUrl;
    void runProgressiveGen(video, url,
      (u) => { if (alive) setLocalThumb(u); },
      (u) => { if (alive) spriteFromImage(u, 64, true, video.id, setSprite); },
      () => alive);
    return () => { alive = false; };
  }, [video, setLocalThumb, setSprite]);

  useEffect(() => {
    const th = video.thumbnail?.thumbnails;
    setGenerated(Array.isArray(th) ? th : []);
  }, [video, setGenerated]);

  useEffect(() => {
    const applyMeta = (cols?: number, fw?: number) => {
      if (cols) sp.setCols(cols);
      if (fw) sp.setFrameWidth(fw);
    };
    const cached = SpriteCache.get(video.id);
    if (cached) {
      if (cached.dataUrl && !spriteSheetUrl) sp.setSheet(cached.dataUrl);
      if (cached.meta?.cols) applyMeta(cached.meta.cols, cached.meta.frameWidth);
      return;
    }
    void (async () => {
      try {
        const meta = await getSpriteMeta(video.id);
        if (meta) applyMeta(meta.cols, meta.frameWidth);
      } catch { /* noop */ }
    })();
  }, [video.id]);
}

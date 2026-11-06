import { useEffect, useMemo, useRef, useState } from 'react';
import { Video } from '@/types/video';
import { VideoThumbnailService } from '@/services/video-thumbnail';
import { SpriteCache } from '@/services/sprite-cache';
import { getVideoSrc } from '@/lib/video-urls';
import { useVideoCardAssets } from './use-video-card-assets';

export interface VideoCardMedia {
  imageError: boolean;
  setImageError: (v: boolean) => void;
  isHovering: boolean;
  setIsHovering: (v: boolean) => void;
  hoverFrames: string[];
  generatedThumbnails: string[];
  hoverIndex: number;
  spriteSheetUrl: string | null;
  spriteCols: number;
  spriteFrameWidth: number;
  spriteFrameCount: number;
  previewUrl: string;
  previewStartTime: number;
  previewRef: React.RefObject<HTMLVideoElement | null>;
  cardRef: React.RefObject<HTMLDivElement | null>;
  thumbSrc: string;
  hasThumb: boolean;
}

function initialThumb(video: Video): string {
  const d = video.thumbnail?.dataUrl ?? '';
  if (video.thumbnail?.generated && d && !d.startsWith('file://')) return d;
  return '';
}

function useHoverCycle(active: boolean, count: number,
  previewRef: React.RefObject<HTMLVideoElement | null>,
  previewStartTime: number, setHoverIndex: (f: (i: number) => number) => void): void {
  useEffect(() => {
    const el = previewRef.current;
    if (!active) {
      if (el && !el.paused) {
        el.pause();
        try { el.currentTime = previewStartTime > 0 ? previewStartTime : 0; } catch { /* noop */ }
      }
      setHoverIndex(() => 0);
      return;
    }
    if (count > 0) {
      const t = window.setInterval(() => setHoverIndex((i) => (i + 1) % Math.max(1, count)), 300);
      try { el?.pause(); } catch { /* noop */ }
      return () => window.clearInterval(t);
    }
    if (el && el.readyState >= 2) {
      const p = el.play();
      if (p !== undefined) p.catch(() => { /* autoplay blocked */ });
    }
    return undefined;
  }, [active, count, previewRef, previewStartTime, setHoverIndex]);
}

export function useVideoCardMedia(video: Video, isVisible: boolean): VideoCardMedia {
  const [imageError, setImageError] = useState(false);
  const [localThumb, setLocalThumb] = useState(() => initialThumb(video));
  const [isHovering, setIsHovering] = useState(false);
  const [hoverFrames, setHoverFrames] = useState<string[]>([]);
  const [generatedThumbnails, setGeneratedThumbnails] = useState<string[]>([]);
  const [hoverIndex, setHoverIndex] = useState(0);
  const [spriteSheetUrl, setSpriteSheetUrl] = useState<string | null>(null);
  const [spriteCols, setSpriteCols] = useState(0);
  const [spriteFrameWidth, setSpriteFrameWidth] = useState(64);
  const previewRef = useRef<HTMLVideoElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);

  const previewUrl: string = useMemo(() => getVideoSrc(video) ?? '', [video]);
  const previewStartTime = useMemo(() => {
    const d = video.metadata?.duration || 0;
    if (!Number.isFinite(d) || d <= 0) return 0;
    return Math.max(Math.min(1, Math.max(0.1, d * 0.05)), Math.min(d * 0.5, Math.max(0, d - 1)));
  }, [video]);
  const spriteFrameCount = useMemo(() => (spriteCols > 0 ? Math.min(spriteCols, 10) : 0), [spriteCols]);

  const setSprite = (url: string, cols: number, fw: number, fh: number) => {
    setSpriteSheetUrl(url);
    setSpriteCols(cols);
    setSpriteFrameWidth(fw);
    SpriteCache.set(video.id, { cols, frameWidth: fw, frameHeight: fh }, url, 2);
  };

  useVideoCardAssets(video, isVisible, localThumb, setLocalThumb, spriteSheetUrl,
    setSprite, setGeneratedThumbnails,
    { setSheet: setSpriteSheetUrl, setCols: setSpriteCols, setFrameWidth: setSpriteFrameWidth });

  const cycling = isHovering && (hoverFrames.length > 0 || generatedThumbnails.length > 0 || spriteFrameCount > 0);
  const cycleCount = hoverFrames.length > 0 ? hoverFrames.length
    : generatedThumbnails.length > 0 ? generatedThumbnails.length : spriteFrameCount;
  useHoverCycle(isHovering, cycling ? cycleCount : 0, previewRef, previewStartTime, setHoverIndex);

  useEffect(() => {
    if (!isHovering || !isVisible || hoverFrames.length > 0) return;
    let cancelled = false;
    const t = window.setTimeout(() => {
      void VideoThumbnailService.tryReadExternalThumbnailsForVideo(video.id, video.filename)
        .then((frames) => {
          if (!cancelled && frames && frames.length > 0) {
            setHoverFrames(Array.from(new Set(frames)).slice(0, 3));
            setHoverIndex(0);
          }
        })
        .catch(() => { /* noop */ });
    }, 200);
    return () => { cancelled = true; window.clearTimeout(t); };
  }, [isHovering, isVisible, hoverFrames.length, video]);

  useEffect(() => {
    if (cardRef.current) {
      (cardRef.current as unknown as { focusCard: () => void }).focusCard = () => cardRef.current?.focus();
    }
  }, []);

  const raw = video.thumbnail?.dataUrl ?? '';
  const thumbSrc = localThumb || (!raw.startsWith('file://') ? raw : '');
  return {
    imageError, setImageError, isHovering, setIsHovering, hoverFrames,
    generatedThumbnails, hoverIndex, spriteSheetUrl, spriteCols,
    spriteFrameWidth, spriteFrameCount, previewUrl, previewStartTime,
    previewRef, cardRef, thumbSrc, hasThumb: thumbSrc.trim() !== '',
  };
}

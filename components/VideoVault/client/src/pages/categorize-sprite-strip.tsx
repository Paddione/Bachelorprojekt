import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Video } from '@/types/video';
import { getSpriteSrc } from '@/lib/video-urls';
import { formatTime } from './categorize-queries';

const FRAME_COUNT = 25;

function useSpriteReady(spriteSrc: string | undefined): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!spriteSrc) return;
    const img = new Image();
    img.onload = () => setReady(true);
    img.onerror = () => setReady(false);
    img.src = spriteSrc;
  }, [spriteSrc]);
  return ready;
}

function Markers({ duration }: { duration: number }) {
  const interval = Math.max(1, Math.floor(FRAME_COUNT / 10));
  const markers: { frame: number; time: number; position: number }[] = [];
  for (let i = 0; i < FRAME_COUNT; i += interval) {
    markers.push({ frame: i, time: (i / FRAME_COUNT) * duration, position: (i / FRAME_COUNT) * 100 });
  }
  return (
    <div className="relative w-full h-5 mt-1">
      {markers.map((m) => (
        <span key={m.frame} className="absolute text-[10px] text-muted-foreground -translate-x-1/2" style={{ left: `${m.position}%` }}>
          {formatTime(m.time)}
        </span>
      ))}
      <span className="absolute right-0 text-[10px] text-muted-foreground">{formatTime(duration)}</span>
    </div>
  );
}

export function SpriteStrip({ video, currentTime, duration, onSeek }: {
  video: Video; currentTime: number; duration: number; onSeek: (time: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const spriteSrc = useMemo(() => getSpriteSrc(video), [video]);
  const ready = useSpriteReady(spriteSrc);
  const [isDragging, setIsDragging] = useState(false);
  const [hoverX, setHoverX] = useState<number | null>(null);

  const seekFromEvent = useCallback((clientX: number) => {
    const el = containerRef.current;
    if (!el || duration <= 0) return;
    const rect = el.getBoundingClientRect();
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    onSeek((x / rect.width) * duration);
  }, [duration, onSeek]);

  useEffect(() => {
    if (!isDragging) return;
    const move = (e: MouseEvent) => seekFromEvent(e.clientX);
    const up = () => setIsDragging(false);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
  }, [isDragging, seekFromEvent]);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const width = containerRef.current?.getBoundingClientRect().width ?? 1;
  const hoverFrame = hoverX !== null ? Math.min(FRAME_COUNT - 1, Math.floor((hoverX / width) * FRAME_COUNT)) : -1;

  if (!spriteSrc || !ready) {
    return (
      <div className="w-full px-4 py-2 bg-black/40">
        <div className="relative h-8 bg-muted rounded overflow-hidden cursor-pointer" onMouseDown={(e) => seekFromEvent(e.clientX)}>
          <div className="absolute top-0 left-0 h-full bg-primary/30 transition-all" style={{ width: `${progress}%` }} />
        </div>
        <div className="flex justify-between text-xs text-muted-foreground mt-1">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full px-2 py-2 bg-black/40 backdrop-blur-sm select-none">
      <div ref={containerRef}
        className={`relative w-full overflow-hidden rounded ${isDragging ? 'cursor-grabbing' : 'cursor-pointer'}`}
        style={{ height: 80 }}
        onMouseDown={(e) => { setIsDragging(true); seekFromEvent(e.clientX); }}
        onMouseMove={(e) => setHoverX(e.clientX - (containerRef.current?.getBoundingClientRect().left ?? 0))}
        onMouseLeave={() => setHoverX(null)}>
        <div className="flex w-full h-full">
          {Array.from({ length: FRAME_COUNT }).map((_, i) => (
            <div key={i} className="flex-1 h-full overflow-hidden relative" style={{ minWidth: 0 }}>
              <div className="absolute h-full" style={{
                width: `${FRAME_COUNT * 100}%`, left: `${-i * 100}%`,
                backgroundImage: `url(${spriteSrc})`,
                backgroundSize: `${FRAME_COUNT * 100}% 100%`,
                backgroundPosition: `${(i / (FRAME_COUNT - 1)) * 100}% 0`,
              }} />
            </div>
          ))}
        </div>
        <div className="absolute top-0 left-0 h-full bg-primary/20 pointer-events-none" style={{ width: `${progress}%` }} />
        <div className="absolute top-0 h-full w-0.5 bg-primary shadow-glow-cyan pointer-events-none" style={{ left: `${progress}%` }} />
        {hoverX !== null && !isDragging && (
          <div className="absolute top-0 h-full w-px bg-white/50 pointer-events-none" style={{ left: hoverX }} />
        )}
        {hoverX !== null && hoverFrame >= 0 && !isDragging && (
          <div className="absolute bottom-full mb-2 -translate-x-1/2 pointer-events-none z-20"
            style={{ left: Math.max(60, Math.min(hoverX, width - 60)) }}>
            <div className="rounded overflow-hidden border border-white/20 shadow-lg bg-black">
              <div style={{
                width: 120, height: 68, backgroundImage: `url(${spriteSrc})`,
                backgroundSize: `${FRAME_COUNT * 120}px 68px`, backgroundPosition: `${-hoverFrame * 120}px 0`,
              }} />
              <div className="text-[10px] text-center text-white/70 py-0.5 bg-black/80">
                {formatTime((hoverX / width) * duration)}
              </div>
            </div>
          </div>
        )}
      </div>
      <Markers duration={duration} />
    </div>
  );
}

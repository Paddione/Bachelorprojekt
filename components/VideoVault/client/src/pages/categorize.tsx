import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useLocation, useRoute } from 'wouter';
import { useVideoManager } from '@/hooks/use-video-manager';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Video, VideoCategories, CustomCategories } from '@/types/video';
import { getVideoSrc, getSpriteSrc } from '@/lib/video-urls';
import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  ChevronRight,
  X,
  Plus,
  Copy,
  Check,
  FileVideo,
  Clock,
  Monitor,
  Save,
  User,
  Settings2,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// Color palette for each standard category type
const CATEGORY_COLORS: Record<string, { bg: string; border: string; text: string; badge: string; ring: string }> = {
  age:          { bg: 'bg-blue-500/10',   border: 'border-blue-500/30',   text: 'text-blue-400',   badge: 'bg-blue-500/20 text-blue-300 border-blue-500/40',   ring: '#3b82f6' },
  physical:     { bg: 'bg-pink-500/10',   border: 'border-pink-500/30',   text: 'text-pink-400',   badge: 'bg-pink-500/20 text-pink-300 border-pink-500/40',   ring: '#ec4899' },
  ethnicity:    { bg: 'bg-amber-500/10',  border: 'border-amber-500/30',  text: 'text-amber-400',  badge: 'bg-amber-500/20 text-amber-300 border-amber-500/40', ring: '#f59e0b' },
  relationship: { bg: 'bg-purple-500/10', border: 'border-purple-500/30', text: 'text-purple-400', badge: 'bg-purple-500/20 text-purple-300 border-purple-500/40', ring: '#a855f7' },
  acts:         { bg: 'bg-red-500/10',    border: 'border-red-500/30',    text: 'text-red-400',    badge: 'bg-red-500/20 text-red-300 border-red-500/40',       ring: '#ef4444' },
  setting:      { bg: 'bg-green-500/10',  border: 'border-green-500/30',  text: 'text-green-400',  badge: 'bg-green-500/20 text-green-300 border-green-500/40', ring: '#22c55e' },
  quality:      { bg: 'bg-cyan-500/10',   border: 'border-cyan-500/30',   text: 'text-cyan-400',   badge: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',   ring: '#06b6d4' },
  performer:    { bg: 'bg-orange-500/10', border: 'border-orange-500/30', text: 'text-orange-400', badge: 'bg-orange-500/20 text-orange-300 border-orange-500/40', ring: '#f97316' },
};

const DEFAULT_COLOR = { bg: 'bg-slate-500/10', border: 'border-slate-500/30', text: 'text-slate-400', badge: 'bg-slate-500/20 text-slate-300 border-slate-500/40', ring: '#64748b' };

const STANDARD_TYPES = ['age', 'physical', 'ethnicity', 'relationship', 'acts', 'setting', 'quality', 'performer'];

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

// --- Completion Ring: small SVG donut showing categorization progress ---
function CompletionRing({ filled, total }: { filled: number; total: number }) {
  const pct = total > 0 ? filled / total : 0;
  const radius = 14;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - pct);

  return (
    <div className="relative flex items-center gap-1.5" title={`${filled}/${total} category types assigned`}>
      <svg width="34" height="34" className="-rotate-90">
        <circle cx="17" cy="17" r={radius} fill="none" stroke="currentColor" strokeWidth="3" className="text-muted/30" />
        <circle
          cx="17" cy="17" r={radius} fill="none"
          stroke={pct >= 1 ? '#22c55e' : '#3b82f6'}
          strokeWidth="3" strokeDasharray={circumference} strokeDashoffset={offset}
          strokeLinecap="round" className="transition-all duration-500"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-muted-foreground">{filled}</span>
    </div>
  );
}

// --- Sprite Strip with drag scrubbing + hover preview ---
function SpriteStrip({
  video, currentTime, duration, onSeek,
}: {
  video: Video; currentTime: number; duration: number; onSeek: (time: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const spriteSrc = useMemo(() => getSpriteSrc(video), [video]);
  const [spriteLoaded, setSpriteLoaded] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [hoverX, setHoverX] = useState<number | null>(null);
  const frameCount = 25;

  useEffect(() => {
    if (!spriteSrc) return;
    const img = new Image();
    img.onload = () => setSpriteLoaded(true);
    img.onerror = () => setSpriteLoaded(false);
    img.src = spriteSrc;
  }, [spriteSrc]);

  const seekFromEvent = useCallback(
    (e: React.MouseEvent<HTMLDivElement> | MouseEvent) => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
      onSeek((x / rect.width) * duration);
    },
    [duration, onSeek],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => { setIsDragging(true); seekFromEvent(e); },
    [seekFromEvent],
  );

  useEffect(() => {
    if (!isDragging) return;
    const handleMove = (e: MouseEvent) => seekFromEvent(e);
    const handleUp = () => setIsDragging(false);
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => { window.removeEventListener('mousemove', handleMove); window.removeEventListener('mouseup', handleUp); };
  }, [isDragging, seekFromEvent]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const el = containerRef.current;
    if (!el) return;
    setHoverX(e.clientX - el.getBoundingClientRect().left);
  }, []);

  if (!spriteSrc || !spriteLoaded) {
    return (
      <div className="w-full px-4 py-2 bg-black/40">
        <div className="relative h-8 bg-muted rounded overflow-hidden cursor-pointer" onMouseDown={handleMouseDown}>
          <div className="absolute top-0 left-0 h-full bg-primary/30 transition-all" style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }} />
        </div>
        <div className="flex justify-between text-xs text-muted-foreground mt-1">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>
    );
  }

  const spriteHeight = 80;
  const markerInterval = Math.max(1, Math.floor(frameCount / 10));
  const markers: { frame: number; time: number; position: number }[] = [];
  for (let i = 0; i < frameCount; i += markerInterval) {
    markers.push({ frame: i, time: (i / frameCount) * duration, position: (i / frameCount) * 100 });
  }
  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;
  const containerWidth = containerRef.current?.getBoundingClientRect().width ?? 1;
  const hoverFrameIndex = hoverX !== null ? Math.min(frameCount - 1, Math.floor((hoverX / containerWidth) * frameCount)) : -1;
  const hoverTime = hoverX !== null ? (hoverX / containerWidth) * duration : 0;

  return (
    <div className="w-full px-2 py-2 bg-black/40 backdrop-blur-sm select-none">
      <div
        ref={containerRef}
        className={`relative w-full overflow-hidden rounded ${isDragging ? 'cursor-grabbing' : 'cursor-pointer'}`}
        style={{ height: spriteHeight }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverX(null)}
      >
        <div className="flex w-full h-full">
          {Array.from({ length: frameCount }).map((_, i) => (
            <div key={i} className="flex-1 h-full overflow-hidden relative" style={{ minWidth: 0 }}>
              <div className="absolute h-full" style={{
                width: `${frameCount * 100}%`, left: `${-i * 100}%`,
                backgroundImage: `url(${spriteSrc})`,
                backgroundSize: `${frameCount * 100}% 100%`,
                backgroundPosition: `${(i / (frameCount - 1)) * 100}% 0`,
              }} />
            </div>
          ))}
        </div>
        <div className="absolute top-0 left-0 h-full bg-primary/20 pointer-events-none" style={{ width: `${progressPercent}%` }} />
        <div className="absolute top-0 h-full w-0.5 bg-primary shadow-glow-cyan pointer-events-none" style={{ left: `${progressPercent}%` }} />
        {hoverX !== null && !isDragging && (
          <div className="absolute top-0 h-full w-px bg-white/50 pointer-events-none" style={{ left: hoverX }} />
        )}
        {hoverX !== null && hoverFrameIndex >= 0 && !isDragging && (
          <div className="absolute bottom-full mb-2 -translate-x-1/2 pointer-events-none z-20"
            style={{ left: Math.max(60, Math.min(hoverX, containerWidth - 60)) }}>
            <div className="rounded overflow-hidden border border-white/20 shadow-lg bg-black">
              <div style={{
                width: 120, height: 68,
                backgroundImage: `url(${spriteSrc})`,
                backgroundSize: `${frameCount * 120}px 68px`,
                backgroundPosition: `${-hoverFrameIndex * 120}px 0`,
              }} />
              <div className="text-[10px] text-center text-white/70 py-0.5 bg-black/80">{formatTime(hoverTime)}</div>
            </div>
          </div>
        )}
      </div>
      <div className="relative w-full h-5 mt-1">
        {markers.map((m) => (
          <span key={m.frame} className="absolute text-[10px] text-muted-foreground -translate-x-1/2" style={{ left: `${m.position}%` }}>
            {formatTime(m.time)}
          </span>
        ))}
        <span className="absolute right-0 text-[10px] text-muted-foreground">{formatTime(duration)}</span>
      </div>
    </div>
  );
}

// --- Actor / Performer field with autocomplete ---
function ActorField({
  assignedActors,
  allKnownActors,
  onAdd,
  onRemove,
}: {
  assignedActors: string[];
  allKnownActors: string[];
  onAdd: (name: string) => void;
  onRemove: (name: string) => void;
}) {
  const [input, setInput] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const suggestions = useMemo(() => {
    if (!input.trim()) return [];
    const q = input.toLowerCase();
    return allKnownActors
      .filter((a) => a.toLowerCase().includes(q) && !assignedActors.includes(a))
      .slice(0, 8);
  }, [input, allKnownActors, assignedActors]);

  const handleAdd = (name: string) => {
    const val = name.trim().toLowerCase();
    if (val && !assignedActors.includes(val)) {
      onAdd(val);
    }
    setInput('');
    setShowSuggestions(false);
    inputRef.current?.focus();
  };

  // Close suggestions on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="rounded-lg border border-orange-500/40 bg-orange-500/5 mb-4 p-3" ref={containerRef}>
      <div className="flex items-center gap-2 mb-2">
        <User className="h-4 w-4 text-orange-400" />
        <span className="text-sm font-medium text-orange-400">Actors / Performers</span>
        {assignedActors.length > 0 && (
          <Badge variant="outline" className="text-xs bg-orange-500/20 text-orange-300 border-orange-500/40">
            {assignedActors.length}
          </Badge>
        )}
      </div>

      {/* Assigned actor chips */}
      {assignedActors.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {assignedActors.map((actor) => (
            <button
              key={actor}
              onClick={() => onRemove(actor)}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md border text-xs font-medium cursor-pointer transition-colors hover:bg-destructive/20 bg-orange-500/20 text-orange-300 border-orange-500/40"
              title={`Click to remove ${actor}`}
            >
              {actor}
              <X className="h-3 w-3 opacity-60" />
            </button>
          ))}
        </div>
      )}

      {/* Autocomplete input */}
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => { setInput(e.target.value); setShowSuggestions(true); }}
          onFocus={() => setShowSuggestions(true)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter' && input.trim()) {
              // If there are suggestions and the input matches one, use it; otherwise add as-is
              if (suggestions.length > 0) handleAdd(suggestions[0]);
              else handleAdd(input);
            }
            if (e.key === 'Escape') { setShowSuggestions(false); inputRef.current?.blur(); }
          }}
          placeholder="Type actor name..."
          className="w-full h-8 px-3 text-sm bg-background/50 border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-orange-500/50"
        />

        {/* Suggestions dropdown */}
        {showSuggestions && suggestions.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-popover border border-border rounded-md shadow-lg z-30 max-h-48 overflow-y-auto">
            {suggestions.map((s) => (
              <button
                key={s}
                className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
                onMouseDown={(e) => { e.preventDefault(); handleAdd(s); }}
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// --- Category Group component ---
function CategoryGroup({
  type, index, assignedValues, availableValues, onAdd, onRemove, isExpanded, onToggle,
}: {
  type: string; index: number; assignedValues: string[]; availableValues: string[];
  onAdd: (value: string) => void; onRemove: (value: string) => void;
  isExpanded: boolean; onToggle: () => void;
}) {
  const [customInput, setCustomInput] = useState('');
  const colors = CATEGORY_COLORS[type] || DEFAULT_COLOR;
  const hasAssigned = assignedValues.length > 0;
  const unassigned = availableValues.filter((v) => v !== 'unassigned' && !assignedValues.includes(v));

  const handleAddCustom = () => {
    const val = customInput.trim().toLowerCase();
    if (val && !assignedValues.includes(val)) { onAdd(val); setCustomInput(''); }
  };

  return (
    <div className={`rounded-lg border ${colors.border} ${colors.bg} mb-2 transition-colors ${hasAssigned ? '' : 'opacity-70'}`}>
      <button className={`w-full flex items-center justify-between px-3 py-2 ${colors.text} font-medium text-sm capitalize`} onClick={onToggle}>
        <span className="flex items-center gap-2">
          {hasAssigned ? <Check className="h-3.5 w-3.5 text-green-400" /> : <span className="h-3.5 w-3.5 rounded-full border border-current opacity-40 inline-block" />}
          <span>{type}</span>
          <kbd className="text-[10px] opacity-40 font-mono ml-1">{index + 1}</kbd>
        </span>
        <div className="flex items-center gap-2">
          {assignedValues.length > 0 && <Badge variant="outline" className={`text-xs ${colors.badge}`}>{assignedValues.length}</Badge>}
          {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </div>
      </button>
      {isExpanded && (
        <div className="px-3 pb-3 space-y-2">
          {assignedValues.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {assignedValues.map((value) => (
                <DropdownMenu key={value}>
                  <DropdownMenuTrigger asChild>
                    <button className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border text-xs font-medium cursor-pointer transition-colors hover:opacity-80 ${colors.badge}`}>{value}</button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-48">
                    <DropdownMenuItem onClick={() => onRemove(value)} className="text-destructive">
                      <X className="mr-2 h-3.5 w-3.5" />Remove "{value}"
                    </DropdownMenuItem>
                    {unassigned.length > 0 && (
                      <>
                        <div className="px-2 py-1.5 text-xs text-muted-foreground">Replace with:</div>
                        {unassigned.slice(0, 10).map((alt) => (
                          <DropdownMenuItem key={alt} onClick={() => { onRemove(value); onAdd(alt); }}>{alt}</DropdownMenuItem>
                        ))}
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              ))}
            </div>
          )}
          {unassigned.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className={`h-7 text-xs gap-1 ${colors.text}`}>
                  <Plus className="h-3 w-3" />Add {type}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto w-48">
                {unassigned.map((val) => (
                  <DropdownMenuItem key={val} onClick={() => onAdd(val)}>{val}</DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <div className="flex gap-1">
            <input
              type="text" value={customInput}
              onChange={(e) => setCustomInput(e.target.value)}
              onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') handleAddCustom(); }}
              placeholder={`New ${type}...`}
              className="flex-1 h-7 px-2 text-xs bg-background/50 border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-primary"
            />
            {customInput.trim() && (
              <Button variant="ghost" size="sm" className="h-7 px-2" onClick={handleAddCustom}><Plus className="h-3 w-3" /></Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// --- Draft categories hook: accumulate edits locally, flush on save/navigate ---
function useDraftCategories(video: Video | null, flush: (videoId: string, cats: VideoCategories, custom: CustomCategories) => void) {
  const [draftCats, setDraftCats] = useState<VideoCategories | null>(null);
  const [draftCustom, setDraftCustom] = useState<CustomCategories | null>(null);
  const lastFlushedId = useRef<string | null>(null);

  // When the video changes, flush pending draft for the *previous* video, then reset
  const currentVideoId = video?.id ?? null;

  // Flush the current draft to the store
  const flushDraft = useCallback(() => {
    if (!currentVideoId || !draftCats || !draftCustom) return;
    if (lastFlushedId.current === currentVideoId) return; // already flushed
    flush(currentVideoId, draftCats, draftCustom);
    lastFlushedId.current = currentVideoId;
  }, [currentVideoId, draftCats, draftCustom, flush]);

  // Reset draft when video changes (and flush previous)
  useEffect(() => {
    // Flush previous draft before resetting
    if (lastFlushedId.current !== currentVideoId && draftCats && draftCustom && lastFlushedId.current) {
      flush(lastFlushedId.current, draftCats, draftCustom);
    }
    // Initialize draft from new video
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

  // Flush on unmount (e.g., navigating away from categorize page)
  useEffect(() => {
    return () => {
      // Can't use state in cleanup, so we use a ref trick
    };
  }, []);

  const isDirty = useMemo(() => {
    if (!video || !draftCats || !draftCustom) return false;
    return (
      JSON.stringify(draftCats) !== JSON.stringify(video.categories) ||
      JSON.stringify(draftCustom) !== JSON.stringify(video.customCategories)
    );
  }, [video, draftCats, draftCustom]);

  const addCategory = useCallback((type: string, value: string) => {
    const isStandard = STANDARD_TYPES.includes(type);
    if (isStandard) {
      setDraftCats((prev) => {
        if (!prev) return prev;
        const existing = (prev[type] as string[]) || [];
        if (existing.includes(value)) return prev;
        return { ...prev, [type]: [...existing, value] };
      });
    } else {
      setDraftCustom((prev) => {
        if (!prev) return prev;
        const existing = prev[type] || [];
        if (existing.includes(value)) return prev;
        return { ...prev, [type]: [...existing, value] };
      });
    }
    lastFlushedId.current = null; // mark dirty
  }, []);

  const removeCategory = useCallback((type: string, value: string) => {
    const isStandard = STANDARD_TYPES.includes(type);
    if (isStandard) {
      setDraftCats((prev) => {
        if (!prev) return prev;
        return { ...prev, [type]: ((prev[type] as string[]) || []).filter((v) => v !== value) };
      });
    } else {
      setDraftCustom((prev) => {
        if (!prev) return prev;
        const filtered = (prev[type] || []).filter((v) => v !== value);
        const next = { ...prev };
        if (filtered.length === 0) delete next[type];
        else next[type] = filtered;
        return next;
      });
    }
    lastFlushedId.current = null;
  }, []);

  const setAll = useCallback((cats: VideoCategories, custom: CustomCategories) => {
    setDraftCats({ ...cats });
    setDraftCustom({ ...custom });
    lastFlushedId.current = null;
  }, []);

  return {
    categories: draftCats,
    customCategories: draftCustom,
    isDirty,
    addCategory,
    removeCategory,
    setAll,
    flushDraft,
  };
}

// --- Main Categorize Page ---
export default function CategorizePage() {
  const [, params] = useRoute('/categorize/:videoId');
  const [, setLocation] = useLocation();
  const { state, actions } = useVideoManager();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(STANDARD_TYPES));
  const [copiedFlash, setCopiedFlash] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const prevVideoRef = useRef<Video | null>(null);

  const videoId = params?.videoId;
  const video = useMemo(
    () => state.videos.find((v) => v.id === videoId) ?? null,
    [state.videos, videoId],
  );
  const videoSrc = useMemo(() => (video ? getVideoSrc(video) : undefined), [video]);

  // Flush handler: write draft to the global video manager store
  const flushToStore = useCallback(
    (id: string, cats: VideoCategories, custom: CustomCategories) => {
      actions.updateVideoCategories(id, { categories: cats, customCategories: custom });
    },
    [actions],
  );

  const draft = useDraftCategories(video, flushToStore);

  // Track previous video for "copy from previous"
  const prevVideoIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (videoId && videoId !== prevVideoIdRef.current) {
      if (prevVideoIdRef.current) {
        prevVideoRef.current = state.videos.find((v) => v.id === prevVideoIdRef.current) ?? null;
      }
      prevVideoIdRef.current = videoId;
    }
  }, [videoId, state.videos]);

  // Build available values per category type
  const availableByType = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const cat of state.availableCategories) {
      if (cat.value === 'unassigned') continue;
      if (!map[cat.type]) map[cat.type] = [];
      if (!map[cat.type].includes(cat.value)) map[cat.type].push(cat.value);
    }
    for (const t of STANDARD_TYPES) {
      if (!map[t]) map[t] = [];
    }
    return map;
  }, [state.availableCategories]);

  // Assigned values from draft
  const assignedByType = useMemo(() => {
    const map: Record<string, string[]> = {};
    if (draft.categories) {
      for (const t of STANDARD_TYPES) {
        map[t] = (draft.categories[t] as string[]) || [];
      }
    }
    if (draft.customCategories) {
      for (const [t, values] of Object.entries(draft.customCategories)) {
        map[t] = values;
      }
    }
    return map;
  }, [draft.categories, draft.customCategories]);

  // All category types (exclude performer — shown separately as ActorField)
  const allTypes = useMemo(() => {
    const types = new Set<string>(STANDARD_TYPES.filter((t) => t !== 'performer'));
    if (draft.customCategories) Object.keys(draft.customCategories).forEach((t) => types.add(t));
    Object.keys(availableByType).forEach((t) => {
      if (t !== 'performer') types.add(t);
    });
    return Array.from(types);
  }, [draft.customCategories, availableByType]);

  // All known actor/performer names across the library (for autocomplete)
  const allKnownActors = useMemo(() => {
    const actors = new Set<string>();
    for (const v of state.videos) {
      for (const name of (v.categories.performer || [])) {
        actors.add(name);
      }
    }
    return Array.from(actors).sort();
  }, [state.videos]);

  // Completion stats
  const completionStats = useMemo(() => {
    const filled = STANDARD_TYPES.filter((t) => (assignedByType[t]?.length ?? 0) > 0).length;
    return { filled, total: STANDARD_TYPES.length };
  }, [assignedByType]);

  // Navigation
  const currentIndex = useMemo(
    () => state.filteredVideos.findIndex((v) => v.id === videoId),
    [state.filteredVideos, videoId],
  );

  const goPrev = useCallback(() => {
    if (currentIndex <= 0) return;
    draft.flushDraft(); // auto-save before navigating
    setLocation(`/categorize/${state.filteredVideos[currentIndex - 1].id}`);
  }, [currentIndex, state.filteredVideos, setLocation, draft]);

  const goNext = useCallback(() => {
    if (currentIndex >= state.filteredVideos.length - 1) return;
    draft.flushDraft(); // auto-save before navigating
    setLocation(`/categorize/${state.filteredVideos[currentIndex + 1].id}`);
  }, [currentIndex, state.filteredVideos, setLocation, draft]);

  const handleSave = useCallback(() => {
    draft.flushDraft();
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1500);
  }, [draft]);

  const handleCopyFromPrevious = useCallback(() => {
    if (!prevVideoRef.current) return;
    const prev = prevVideoRef.current;
    draft.setAll({ ...prev.categories }, { ...prev.customCategories });
    setCopiedFlash(true);
    setTimeout(() => setCopiedFlash(false), 1500);
  }, [draft]);

  const handleBackToLibrary = useCallback(() => {
    draft.flushDraft();
    setLocation('/');
  }, [draft, setLocation]);

  const handleSeek = useCallback((time: number) => {
    if (videoRef.current) videoRef.current.currentTime = time;
  }, []);

  const toggleGroup = useCallback((type: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type); else next.add(type);
      return next;
    });
  }, []);

  // Video time tracking
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    const onTimeUpdate = () => setCurrentTime(el.currentTime);
    const onLoaded = () => setDuration(el.duration || 0);
    el.addEventListener('timeupdate', onTimeUpdate);
    el.addEventListener('loadedmetadata', onLoaded);
    return () => { el.removeEventListener('timeupdate', onTimeUpdate); el.removeEventListener('loadedmetadata', onLoaded); };
  }, [videoSrc]);

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      switch (e.key) {
        case 'ArrowLeft': e.preventDefault(); goPrev(); break;
        case 'ArrowRight': e.preventDefault(); goNext(); break;
        case 'Escape': handleBackToLibrary(); break;
        case 's':
          if (e.ctrlKey || e.metaKey) { e.preventDefault(); handleSave(); }
          break;
        default: {
          const num = parseInt(e.key, 10);
          if (num >= 1 && num <= 8 && num <= allTypes.length) { e.preventDefault(); toggleGroup(allTypes[num - 1]); }
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [goPrev, goNext, handleBackToLibrary, handleSave, allTypes, toggleGroup]);

  // Auto-save on page unload
  useEffect(() => {
    const handler = () => draft.flushDraft();
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [draft]);

  if (!video) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">Video not found</p>
          <Button onClick={() => setLocation('/')}>Back to Library</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b bg-card/80 backdrop-blur-sm shrink-0">
        <Button variant="ghost" size="sm" onClick={handleBackToLibrary}>
          <ArrowLeft className="h-4 w-4 mr-1" />Library
        </Button>

        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-medium truncate">{video.displayName}</h2>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{formatTime(video.metadata?.duration || 0)}</span>
            <span className="flex items-center gap-1"><Monitor className="h-3 w-3" />{video.metadata?.width}x{video.metadata?.height}</span>
            <span className="flex items-center gap-1"><FileVideo className="h-3 w-3" />{formatFileSize(video.size)}</span>
            <span>{currentIndex + 1} / {state.filteredVideos.length}</span>
          </div>
        </div>

        <CompletionRing filled={completionStats.filled} total={completionStats.total} />

        {/* Save button — only enabled when draft has unsaved changes */}
        <Button
          variant={draft.isDirty ? 'default' : 'outline'}
          size="sm"
          onClick={handleSave}
          disabled={!draft.isDirty}
          className={`text-xs gap-1.5 transition-colors ${savedFlash ? 'bg-green-500/20 border-green-500/50 text-green-400' : ''} ${draft.isDirty ? 'shadow-glow-cyan' : ''}`}
          title="Save changes (Ctrl+S)"
        >
          {savedFlash ? <Check className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
          {savedFlash ? 'Saved' : draft.isDirty ? 'Save' : 'Saved'}
        </Button>

        {prevVideoRef.current && (
          <Button
            variant="outline" size="sm" onClick={handleCopyFromPrevious}
            className={`text-xs gap-1.5 transition-colors ${copiedFlash ? 'bg-green-500/20 border-green-500/50 text-green-400' : ''}`}
            title={`Copy categories from: ${prevVideoRef.current.displayName}`}
          >
            {copiedFlash ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copiedFlash ? 'Copied' : 'Copy prev'}
          </Button>
        )}

        <div className="flex gap-1">
          <Button variant="outline" size="sm" onClick={goPrev} disabled={currentIndex <= 0} title="Previous (Left arrow)">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={goNext} disabled={currentIndex >= state.filteredVideos.length - 1} title="Next (Right arrow)">
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left panel: Category editor */}
        <div className="w-80 lg:w-96 shrink-0 border-r overflow-y-auto p-3 bg-card/30">
          {/* Actor / Performer field — prominent at the top */}
          <ActorField
            assignedActors={assignedByType['performer'] || []}
            allKnownActors={allKnownActors}
            onAdd={(name) => draft.addCategory('performer', name)}
            onRemove={(name) => draft.removeCategory('performer', name)}
          />

          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Categories</h3>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground/50">Keys 1-8 toggle</span>
              <Button
                variant="ghost" size="sm"
                className="h-6 px-2 text-[10px] text-muted-foreground/50 hover:text-muted-foreground"
                onClick={() => { draft.flushDraft(); setLocation('/categories/manage'); }}
                title="Manage categories"
              >
                <Settings2 className="h-3 w-3 mr-1" />Manage
              </Button>
            </div>
          </div>
          {allTypes.map((type, i) => (
            <CategoryGroup
              key={type} type={type} index={i}
              assignedValues={assignedByType[type] || []}
              availableValues={availableByType[type] || []}
              onAdd={(value) => draft.addCategory(type, value)}
              onRemove={(value) => draft.removeCategory(type, value)}
              isExpanded={expandedGroups.has(type)}
              onToggle={() => toggleGroup(type)}
            />
          ))}
        </div>

        {/* Right panel: Video */}
        <div className="flex-1 flex items-center justify-center bg-black/90 min-w-0">
          {videoSrc ? (
            <video ref={videoRef} src={videoSrc} controls className="max-w-full max-h-full object-contain" autoPlay={false} />
          ) : (
            <div className="text-muted-foreground text-sm">Video source unavailable — rescan to restore file handles</div>
          )}
        </div>
      </div>

      {/* Bottom: Sprite strip */}
      <div className="shrink-0 border-t">
        <SpriteStrip video={video} currentTime={currentTime} duration={duration || video.metadata?.duration || 0} onSeek={handleSeek} />
      </div>

      {/* Unsaved changes indicator */}
      {draft.isDirty && (
        <div className="absolute bottom-28 right-4 bg-primary/90 text-primary-foreground text-xs px-3 py-1.5 rounded-full shadow-lg animate-pulse">
          Unsaved changes
        </div>
      )}
    </div>
  );
}

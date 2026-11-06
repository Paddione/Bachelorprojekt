import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useRoute } from 'wouter';
import { useVideoManager } from '@/hooks/use-video-manager';
import { Button } from '@/components/ui/button';
import { Video, VideoCategories, CustomCategories } from '@/types/video';
import { getVideoSrc } from '@/lib/video-urls';
import { Settings2 } from 'lucide-react';
import { useDraftCategories, DraftCategories } from './use-draft-categories';
import { ActorField } from './categorize-actor-field';
import { CategoryGroup } from './categorize-widgets';
import { TopBar } from './categorize-topbar';
import { SpriteStrip } from './categorize-sprite-strip';
import {
  STANDARD_TYPES, buildAvailableByType, buildAssignedByType, buildAllTypes,
  collectKnownActors,
} from './categorize-queries';

function EditorPanel({ draft, assigned, available, allTypes, actors, expanded, onToggle, onManage }: {
  draft: DraftCategories; assigned: Record<string, string[]>; available: Record<string, string[]>;
  allTypes: string[]; actors: string[]; expanded: Set<string>; onToggle: (t: string) => void; onManage: () => void;
}) {
  return (
    <div className="w-80 lg:w-96 shrink-0 border-r overflow-y-auto p-3 bg-card/30">
      <ActorField assignedActors={assigned['performer'] || []} allKnownActors={actors}
        onAdd={(n) => draft.addCategory('performer', n)} onRemove={(n) => draft.removeCategory('performer', n)} />
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Categories</h3>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground/50">Keys 1-8 toggle</span>
          <Button variant="ghost" size="sm" onClick={onManage} title="Manage categories"
            className="h-6 px-2 text-[10px] text-muted-foreground/50 hover:text-muted-foreground">
            <Settings2 className="h-3 w-3 mr-1" />Manage
          </Button>
        </div>
      </div>
      {allTypes.map((type, i) => (
        <CategoryGroup key={type} type={type} index={i}
          assignedValues={assigned[type] || []} availableValues={available[type] || []}
          onAdd={(v) => draft.addCategory(type, v)} onRemove={(v) => draft.removeCategory(type, v)}
          isExpanded={expanded.has(type)} onToggle={() => onToggle(type)} />
      ))}
    </div>
  );
}

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
  const prevVideoIdRef = useRef<string | null>(null);

  const videoId = params?.videoId;
  const video = useMemo(() => state.videos.find((v) => v.id === videoId) ?? null, [state.videos, videoId]);
  const videoSrc = useMemo(() => (video ? getVideoSrc(video) : undefined), [video]);
  const flushToStore = useCallback((id: string, cats: VideoCategories, custom: CustomCategories) => {
    actions.updateVideoCategories(id, { categories: cats, customCategories: custom });
  }, [actions]);
  const draft = useDraftCategories(video, flushToStore);

  useEffect(() => {
    if (videoId && videoId !== prevVideoIdRef.current) {
      if (prevVideoIdRef.current) prevVideoRef.current = state.videos.find((v) => v.id === prevVideoIdRef.current) ?? null;
      prevVideoIdRef.current = videoId;
    }
  }, [videoId, state.videos]);

  const available = useMemo(() => buildAvailableByType(state.availableCategories), [state.availableCategories]);
  const assigned = useMemo(() => buildAssignedByType(draft.categories, draft.customCategories), [draft]);
  const allTypes = useMemo(() => buildAllTypes(draft.customCategories, available), [draft, available]);
  const actors = useMemo(() => collectKnownActors(state.videos), [state.videos]);
  const currentIndex = useMemo(() => state.filteredVideos.findIndex((v) => v.id === videoId), [state.filteredVideos, videoId]);

  const goPrev = useCallback(() => {
    if (currentIndex <= 0) return;
    draft.flushDraft();
    setLocation(`/categorize/${state.filteredVideos[currentIndex - 1].id}`);
  }, [currentIndex, state.filteredVideos, setLocation, draft]);
  const goNext = useCallback(() => {
    if (currentIndex >= state.filteredVideos.length - 1) return;
    draft.flushDraft();
    setLocation(`/categorize/${state.filteredVideos[currentIndex + 1].id}`);
  }, [currentIndex, state.filteredVideos, setLocation, draft]);
  const goLibrary = useCallback(() => { draft.flushDraft(); setLocation('/'); }, [draft, setLocation]);
  const handleSave = useCallback(() => {
    draft.flushDraft();
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1500);
  }, [draft]);
  const copyPrev = useCallback(() => {
    if (!prevVideoRef.current) return;
    const prev = prevVideoRef.current;
    draft.setAll({ ...prev.categories }, { ...prev.customCategories });
    setCopiedFlash(true);
    setTimeout(() => setCopiedFlash(false), 1500);
  }, [draft]);
  const toggleGroup = useCallback((type: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type); else next.add(type);
      return next;
    });
  }, []);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    const onTime = () => setCurrentTime(el.currentTime);
    const onLoaded = () => setDuration(el.duration || 0);
    el.addEventListener('timeupdate', onTime);
    el.addEventListener('loadedmetadata', onLoaded);
    return () => { el.removeEventListener('timeupdate', onTime); el.removeEventListener('loadedmetadata', onLoaded); };
  }, [videoSrc]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); goPrev(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); goNext(); }
      else if (e.key === 'Escape') goLibrary();
      else if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); handleSave(); }
      else {
        const num = parseInt(e.key, 10);
        if (num >= 1 && num <= 8 && num <= allTypes.length) { e.preventDefault(); toggleGroup(allTypes[num - 1]); }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [goPrev, goNext, goLibrary, handleSave, allTypes, toggleGroup]);

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
      <TopBar video={video} index={currentIndex} total={state.filteredVideos.length} draft={draft}
        copied={copiedFlash} saved={savedFlash} prevName={prevVideoRef.current?.displayName ?? null}
        onBack={goLibrary} onSave={handleSave} onCopy={copyPrev} onPrev={goPrev} onNext={goNext} />
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <EditorPanel draft={draft} assigned={assigned} available={available} allTypes={allTypes}
          actors={actors} expanded={expandedGroups} onToggle={toggleGroup}
          onManage={() => { draft.flushDraft(); setLocation('/categories/manage'); }} />
        <div className="flex-1 flex items-center justify-center bg-black/90 min-w-0">
          {videoSrc ? (
            <video ref={videoRef} src={videoSrc} controls className="max-w-full max-h-full object-contain" autoPlay={false} />
          ) : (
            <div className="text-muted-foreground text-sm">Video source unavailable — rescan to restore file handles</div>
          )}
        </div>
      </div>
      <div className="shrink-0 border-t">
        <SpriteStrip video={video} currentTime={currentTime} duration={duration || video.metadata?.duration || 0}
          onSeek={(t) => { if (videoRef.current) videoRef.current.currentTime = t; }} />
      </div>
      {draft.isDirty && (
        <div className="absolute bottom-28 right-4 bg-primary/90 text-primary-foreground text-xs px-3 py-1.5 rounded-full shadow-lg animate-pulse">
          Unsaved changes
        </div>
      )}
    </div>
  );
}

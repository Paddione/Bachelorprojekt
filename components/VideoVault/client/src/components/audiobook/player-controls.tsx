import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Rewind, FastForward, Gauge } from 'lucide-react';
import { SKIP_SECONDS, formatPlayerTime } from './use-audiobook-player';

interface Props {
  isPlaying: boolean; isLoading: boolean; currentTime: number; duration: number;
  currentChapterIndex: number; totalChapters: number;
  volume: number; setVolume: (v: number) => void;
  isMuted: boolean; setIsMuted: (v: boolean) => void;
  playbackSpeed: number; onCycleSpeed: () => void;
  onToggle: () => void; onSeek: (t: number) => void; onSkip: (s: number) => void;
  onGoToChapter: (i: number) => void;
}

export function PlayerControls(p: Props) {
  return (
    <>
      <div className="space-y-1">
        <Slider value={[p.currentTime]} max={p.duration || 100} step={1} onValueChange={([v]) => p.onSeek(v)} className="cursor-pointer" />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{formatPlayerTime(p.currentTime)}</span>
          <span>{formatPlayerTime(p.duration)}</span>
        </div>
      </div>
      <div className="flex items-center justify-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => p.onGoToChapter(p.currentChapterIndex - 1)} disabled={p.currentChapterIndex === 0} title="Previous chapter">
          <SkipBack className="h-5 w-5" />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => p.onSkip(-SKIP_SECONDS)} title={`Rewind ${SKIP_SECONDS}s`}>
          <Rewind className="h-5 w-5" />
        </Button>
        <Button size="lg" className="rounded-full h-14 w-14 bg-purple-600 hover:bg-purple-700" onClick={p.onToggle} disabled={p.isLoading}>
          {p.isLoading ? (
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white" />
          ) : p.isPlaying ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6 ml-1" />}
        </Button>
        <Button variant="ghost" size="icon" onClick={() => p.onSkip(SKIP_SECONDS)} title={`Forward ${SKIP_SECONDS}s`}>
          <FastForward className="h-5 w-5" />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => p.onGoToChapter(p.currentChapterIndex + 1)} disabled={p.currentChapterIndex >= p.totalChapters - 1} title="Next chapter">
          <SkipForward className="h-5 w-5" />
        </Button>
      </div>
      <div className="flex items-center justify-between">
        <Button variant="outline" size="sm" onClick={p.onCycleSpeed} className="text-xs gap-1" title="Playback speed">
          <Gauge className="h-3 w-3" />{p.playbackSpeed}x
        </Button>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => p.setIsMuted(!p.isMuted)} title={p.isMuted ? 'Unmute' : 'Mute'}>
            {p.isMuted || p.volume === 0 ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </Button>
          <Slider
            value={[p.isMuted ? 0 : p.volume]} max={1} step={0.01}
            onValueChange={([v]) => { p.setVolume(v); p.setIsMuted(false); }}
            className="w-24"
          />
        </div>
      </div>
    </>
  );
}
